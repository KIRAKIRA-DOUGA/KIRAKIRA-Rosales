const test = require('node:test');
const assert = require('node:assert/strict');
const { MongoServerError } = require('mongodb');
const { loadService } = require('./helpers/load-service.cjs');

const beforeMidnight = new Date(2025, 5, 20, 23, 59, 59, 999).getTime();
const videoId = 8;
const schema = collectionName => ({ collectionName, schemaInstance: {} });
const sameDay = (record, key) =>
	record.UUID === key.UUID && record.videoId === key.videoId && record.watchDate === key.watchDate;

function watchFixture() {
	const video = { videoId, watchedCount: 100, uploaderInfo: { uid: 10 } };
	const controls = {
		now: beforeMidnight, published: true, updateFailure: null, closeFailure: null,
		conflicts: 0, sessions: 0, ended: 0, errors: [],
	};
	const watchRecords = [];
	const matchesPublishedVideo = where => controls.published && where.videoId === videoId && where.pendingReview === false;
	const getTransaction = options => {
		assert.ok(options?.session, 'operation must use the watch transaction');
		assert.equal(options.preserveError, true);
		return options.session;
	};
	const db = {
		selectDataByAggregateFromMongoDB: async (_schema, _collection, pipeline) => ({
			// Simulate a detail read from a replica that still has the initial count.
			success: true, result: matchesPublishedVideo(pipeline[0].$match) ? [structuredClone(video)] : [],
		}),
		selectDataFromMongoDB: async (where, _projection, _schema, collection, options) => {
			if (collection !== 'video') return { success: true, result: [] };
			const { count } = getTransaction(options);
			return { success: true, result: matchesPublishedVideo(where) ? [{ watchedCount: count }] : [] };
		},
		insertIfNotExist: async (where, record, _schema, _collection, options) => {
			const session = getTransaction(options);
			assert.deepEqual({ ...where }, { UUID: record.UUID, videoId, watchDate: record.watchDate });
			const matched = session.records.some(existing => sameDay(existing, where));
			if (!matched) session.inserted = record;
			return { success: !matched, result: { acknowledged: true, matchedCount: Number(matched) } };
		},
		findOneAndUpdateWithOperators4MongoDB: async (where, update, _schema, _collection, options) => {
			const session = getTransaction(options);
			assert.ok(session.inserted, 'the counter requires a newly inserted watch');
			assert.deepEqual({ ...update.$inc }, { watchedCount: 1 });
			if (controls.updateFailure) throw controls.updateFailure;
			if (!matchesPublishedVideo(where)) return { success: false };
			session.count++;
			return { success: true, result: { watchedCount: session.count } };
		},
	};
	let committedCount = video.watchedCount;
	const mongoose = {
		mongo: { MongoServerError },
		async startSession() {
			controls.sessions++;
			return {
				async withTransaction(callback, options) {
					assert.equal(options.readPreference, 'primary');
					this.records = watchRecords.slice();
					this.count = committedCount;
					this.inserted = undefined;
					const result = await callback();
					if (this.inserted) {
						// 并发快照可能没读到另一个请求已提交的当日唯一键。
						if (watchRecords.some(record => sameDay(record, this.inserted))) {
							controls.conflicts++;
							throw new MongoServerError({ code: 11000, keyPattern: { UUID: 1, videoId: 1, watchDate: 1 } });
						}
						watchRecords.push(this.inserted);
						committedCount = this.count;
					}
					return result;
				},
				async endSession() {
					controls.ended++;
					if (controls.closeFailure) throw controls.closeFailure;
				},
			};
		},
	};
	const { getVideoByKvidService } = loadService('src/service/VideoService.ts', {
		mongoose,
		'../cloudflare/index.js': {},
		'../common/DateTool.js': loadService('src/common/DateTool.ts'),
		'../common/ObjectTool.js': {},
		'../common/RandomTool.js': {},
		'../dbPool/DbClusterPool.js': db,
		'../dbPool/schema/FeedSchema.js': { FollowingSchema: schema('following') },
		'../dbPool/schema/UserSchema.js': {},
		'../dbPool/schema/VideoSchema.js': { VideoSchema: schema('video') },
		'../dbPool/schema/VideoWatchRecordSchema.js': { VideoWatchRecordSchema: schema('video-watch-record') },
		'../elasticsearchPool/ElasticsearchClusterPool.js': {},
		'../elasticsearchPool/template/VideoDocument.js': {},
		'./BlockService.js': { checkBlockUserService: async () => ({}), checkIsBlockedByOtherUserService: async () => ({}) },
		'./BrowsingHistoryService.js': { createOrUpdateBrowsingHistoryService: async () => {} },
		'./SequenceValueService.js': {},
		'./UserService.js': {
			checkUserTokenByUuidService: async (uuid, token) => ({ success: !!uuid && token === 'token' }),
			getUserUid: async uuid => uuid === 'viewer' ? 1 : 2,
		},
		'./VideoVoteService.js': {
			checkUserHasDownvoted: async () => false, checkUserHasUpvoted: async () => false,
			getVideoDownvoteCount: async () => 0, getVideoUpvoteCount: async () => 0,
		},
		'./loggingService.js': { logging: (_level, message, error) => controls.errors.push(error ?? message) },
	}, { Date: class extends Date { constructor() { super(controls.now); } } });
	return {
		view: (uuid = 'viewer', token = 'token') => getVideoByKvidService({ videoId }, uuid, token),
		controls, watchRecords, count: () => committedCount,
	};
}

test('video details count the first signed-in view per server-local day', async () => {
	const { view, controls, watchRecords, count } = watchFixture();
	const firstWatchTime = beforeMidnight - 60000;
	controls.now = firstWatchTime;
	assert.equal((await view()).video.watchedCount, 101);
	controls.now = beforeMidnight;
	assert.equal((await view()).video.watchedCount, 101);
	assert.equal(watchRecords.length, 1);
	assert.equal(watchRecords[0].watchDate, '2025-06-20');
	assert.equal(watchRecords[0].watchDateTime, firstWatchTime);

	const afterMidnight = beforeMidnight + 1;
	controls.now = afterMidnight;
	assert.equal((await view()).video.watchedCount, 102);
	assert.equal(count(), 102);
	assert.equal(watchRecords[1].watchDate, '2025-06-21');
	assert.equal(watchRecords[1].watchDateTime, afterMidnight);
	assert.deepEqual(controls.errors, []);
	assert.equal(controls.sessions, controls.ended);
});

test('concurrent video details recover from a daily key collision and return the committed count', async () => {
	const { view, controls, watchRecords, count } = watchFixture();
	const responses = await Promise.all(Array.from({ length: 8 }, () => view()));
	assert.ok(responses.every(response => response.video?.watchedCount === 101));
	assert.ok(controls.conflicts > 0);
	assert.deepEqual(controls.errors, []);
	assert.equal(watchRecords.length, 1);
	assert.equal(count(), 101);
	assert.equal(controls.sessions, controls.ended);
});

test('a failed counter write discards the staged watch so a retry counts exactly once', async () => {
	const { view, controls, watchRecords, count } = watchFixture();
	const failure = new Error('simulated counter write failure');
	controls.updateFailure = failure;
	assert.equal((await view()).video.watchedCount, 100);
	assert.deepEqual(controls.errors, [failure]);
	assert.equal(watchRecords.length, 0);
	assert.equal(count(), 100);

	controls.updateFailure = null;
	assert.equal((await view()).video.watchedCount, 101);
	assert.equal((await view()).video.watchedCount, 101);
	assert.equal(watchRecords.length, 1);
	assert.equal(count(), 101);
	assert.equal(controls.sessions, controls.ended);
});

test('session close failures preserve the committed count and the original write error', async () => {
	const { view, controls, watchRecords, count } = watchFixture();
	const closeFailure = new Error('session cleanup failed');
	controls.closeFailure = closeFailure;
	assert.equal((await view()).video.watchedCount, 101);
	assert.equal(watchRecords.length, 1);
	assert.equal(count(), 101);
	assert.deepEqual(controls.errors, [closeFailure]);

	controls.now = beforeMidnight + 1;
	const writeFailure = new Error('counter write failed');
	controls.updateFailure = writeFailure;
	assert.equal((await view()).video.watchedCount, 100);
	assert.equal(count(), 101);
	assert.equal(watchRecords.length, 1);
	assert.deepEqual(controls.errors, [closeFailure, closeFailure, writeFailure]);
	assert.equal(controls.sessions, controls.ended);
});

test('another signed-in viewer counts separately for the same video and date', async () => {
	const { view, watchRecords, count } = watchFixture();
	assert.equal((await view()).video.watchedCount, 101);
	assert.equal((await view('other')).video.watchedCount, 102);
	assert.equal((await view('other')).video.watchedCount, 102);
	assert.equal(watchRecords.length, 2);
	assert.equal(count(), 102);
});

test('anonymous and unpublished video details do not count watches', async () => {
	const { view, controls, watchRecords, count } = watchFixture();
	assert.equal((await view('viewer', '')).video.watchedCount, 100);
	controls.published = false;
	assert.equal((await view()).success, false);
	assert.equal(watchRecords.length, 0);
	assert.equal(count(), 100);
});
