const test = require('node:test');
const assert = require('node:assert/strict');
const { loadService } = require('./helpers/load-service.cjs');
const schema = collectionName => ({ collectionName, schemaInstance: {} });
const copy = value => JSON.parse(JSON.stringify(value));
const matches = (row, where) => Object.entries(where).every(([key, value]) => {
	if (key === 'videoTagList') return value.$all.every(item => row.videoTagList.some(tag => tag.tagId === item.$elemMatch.tagId));
	return row[key] === value;
});

function videoFixture() {
	const rows = [
		{ videoId: 1, pendingReview: true, title: 'pending', videoPart: [{ id: 1, link: 'private', videoPartTitle: 'part' }] },
		{ videoId: 2, pendingReview: false, title: 'approved', videoPart: [{ id: 1, link: 'public', videoPartTitle: 'part' }] },
	].map(row => ({ ...row, uploaderId: 10, uploaderInfo: { uid: 10 }, videoTagList: [{ tagId: 1 }], videoCategory: 'anime' }));
	const controls = { failIndex: false, failUpdate: false, indexCalls: [], publicFilters: [] };
	const esClient = { async index(data) {
		controls.indexCalls.push(copy(data));
		if (controls.failIndex) throw new Error('index unavailable');
		return { result: 'created' };
	} };
	const dependencies = {
		mongoose: { startSession: async () => ({ startTransaction() {}, commitTransaction: async () => {}, endSession() {}, inTransaction: () => true, abortTransaction: async () => {} }) },
		'../cloudflare/index.js': {}, '../common/RandomTool.js': {},
		'../common/ObjectTool.js': { isEmptyObject: value => !value || Object.keys(value).length === 0 },
		'../dbPool/schema/UserSchema.js': { UserInfoSchema: schema('user-info') },
		'../dbPool/schema/VideoSchema.js': { VideoSchema: schema('video') },
		'../dbPool/schema/FeedSchema.js': {}, '../dbPool/schema/VideoWatchRecordSchema.js': {},
		'../elasticsearchPool/template/VideoDocument.js': { VideoDocument: { indexName: 'videos', schema: { title: String } } },
		'../elasticsearchPool/ElasticsearchClusterPool.js': {
			searchDataFromElasticsearchCluster: async () => ({ success: true, result: [
				{ kvid: 1, title: 'pending secret' }, { kvid: 2, title: 'approved' },
				{ kvid: 2, title: 'old duplicate' }, { kvid: 99, title: 'deleted secret' },
			] }),
		},
		'./BrowsingHistoryService.js': {}, './VideoVoteService.js': {}, '../common/DateTool.js': {},
		'./SequenceValueService.js': { getNextSequenceValueEjectService: async () => ({ success: true, sequenceValue: 3 }) },
		'./UserService.js': { checkUserTokenService: async () => ({ success: true }), checkUserTokenByUuidService: async () => ({ success: false }), getUserUuid: async () => 'uuid' },
		'./BlockService.js': { buildBlockListMongooseFilter: async () => ({ filter: [], additionalFields: {} }) },
		'./loggingService.js': { logging() {} },
		'../dbPool/DbClusterPool.js': {
			selectDataByAggregateFromMongoDB: async (_schema, _collection, pipeline) => {
				const where = pipeline.find(stage => stage.$match)?.$match ?? {};
				controls.publicFilters.push(copy(where));
				return { success: true, result: copy(rows.filter(row => matches(row, where))) };
			},
			selectDataFromMongoDB: async where => ({ success: true, result: copy(rows.filter(row => matches(row, where))) }),
			insertData2MongoDB: async row => { rows.push(copy(row)); return { success: true }; },
			findOneAndUpdateData4MongoDB: async (where, update, _schema, _name, _options, upsert) => {
				assert.equal(upsert, false, 'approval must not manufacture a video');
				if (controls.failUpdate) throw new Error('database unavailable');
				const row = rows.find(row => matches(row, where));
				if (!row) return { success: false };
				Object.assign(row, update);
				return { success: true, result: copy(row) };
			},
		},
	};
	return { service: loadService('src/service/VideoService.ts', dependencies), rows, controls, esClient };
}

test('pending videos are absent from anonymous details, home, user, tag and existence queries', async () => {
	const { service, controls } = videoFixture();
	assert.equal((await service.getVideoByKvidService({ videoId: 1 })).success, false);
	assert.equal((await service.getVideoByKvidService({ videoId: 2 })).video.videoPart[0].link, 'public');
	assert.equal((await service.checkVideoExistByKvidService({ videoId: 1 })).exist, false);
	for (const result of [
		await service.getThumbVideoService(),
		await service.getVideoByUidRequestService({ uid: 10 }),
		await service.searchVideoByVideoTagIdService({ tagId: [1] }),
	]) {
		assert.equal(result.success, true);
		assert.deepEqual(Array.from(result.videos, row => row.videoId), [2]);
	}
	assert.ok(controls.publicFilters.every(where => where.pendingReview === false));
});

test('search suppresses stale pending/deleted hits and de-duplicates historical index documents', async () => {
	const { service, esClient } = videoFixture();
	const result = await service.searchVideoByKeywordService({ keyword: 'video' }, esClient);
	assert.equal(result.success, true);
	assert.equal(result.videosCount, 1);
	assert.deepEqual(Array.from(result.videos, row => row.videoId), [2]);
	assert.equal(JSON.stringify(result).includes('secret'), false);
});

test('upload remains pending without indexing; administrator queue supplies the authorized preview', async () => {
	const { service, rows, controls } = videoFixture();
	const result = await service.updateVideoService({
		title: 'new', image: 'cover', uploaderId: 10, duration: 10, copyright: 'original',
		videoCategory: 'anime', pushToFeed: true, ensureOriginal: true, videoTagList: [],
		videoPart: [{ id: 1, link: 'new-private', videoPartTitle: 'part' }],
	}, 10, 'token');
	assert.equal(result.success, true);
	assert.equal(rows.find(row => row.videoId === 3).pendingReview, true);
	assert.equal(controls.indexCalls.length, 0);
	const pending = await service.getPendingReviewVideoService(10, 'token');
	assert.deepEqual(Array.from(pending.videos, row => row.videoId), [1, 3]);
	assert.equal(pending.videos[0].videoPart[0].link, 'private');
});

test('approval fails closed, can retry indexing and DB failures, and never upserts missing videos', async () => {
	const { service, rows, controls, esClient } = videoFixture();
	controls.failIndex = true;
	assert.equal((await service.approvePendingReviewVideoService({ videoId: 1 }, 10, 'token', esClient)).success, false);
	assert.equal(rows[0].pendingReview, true);
	controls.failIndex = false; controls.failUpdate = true;
	assert.equal((await service.approvePendingReviewVideoService({ videoId: 1 }, 10, 'token', esClient)).success, false);
	assert.equal(rows[0].pendingReview, true);
	assert.equal((await service.getVideoByKvidService({ videoId: 1 })).success, false);
	controls.failUpdate = false;
	assert.equal((await service.approvePendingReviewVideoService({ videoId: 1 }, 10, 'token', esClient)).success, true);
	assert.equal(rows[0].pendingReview, false);
	assert.equal((await service.getVideoByKvidService({ videoId: 1 })).success, true);
	assert.deepEqual(Array.from((await service.searchVideoByKeywordService({ keyword: 'video' }, esClient)).videos, row => row.videoId), [1, 2]);
	assert.ok(controls.indexCalls.every(call => call.id === '1'));
	assert.equal((await service.approvePendingReviewVideoService({ videoId: 99 }, 10, 'token', esClient)).success, false);
	assert.equal(rows.some(row => row.videoId === 99), false);
});

for (const direction of ['Up', 'Down']) {
	test(`first video ${direction.toLowerCase()}vote creates one vote, and reactivation reuses it`, async () => {
		const rows = [];
		const service = loadService('src/service/VideoVoteService.ts', {
			'./loggingService.js': { logging() {} },
			'./UserService.js': { checkUserTokenByUuidService: async () => ({ success: true }), getUserUid: async () => 1 },
			'../dbPool/schema/VideoVoteSchema.js': { VideoUpvoteSchema: schema('up'), VideoDownvoteSchema: schema('down') },
			'../dbPool/DbClusterPool.js': {
				selectDataFromMongoDB: async (where, _select, _schema, collection) => ({ success: true, result: copy(rows.filter(row => row.collection === collection && matches(row, where))) }),
				insertData2MongoDB: async (row, _schema, collection) => { rows.push({ ...copy(row), collection, _id: 'vote' }); return { success: true }; },
				updateData4MongoDB: async (where, update) => { Object.assign(rows.find(row => matches(row, where)), update); return { success: true }; },
				selectDataByAggregateFromMongoDB: async (_schema, collection) => ({ success: true, result: [{ totalCount: rows.filter(row => row.collection === collection && !row.invalidFlag).length }] }),
			},
		});
		const cast = () => service[`emitVideo${direction}voteService`]({ videoId: 1 }, 'uuid', 'token');
		assert.equal((await cast()).success, true);
		assert.equal(rows.length, 1);
		assert.equal((await cast()).success, false);
		assert.equal((await service[`cancelVideo${direction}voteService`]({ videoId: 1 }, 'uuid', 'token')).success, true);
		assert.equal((await cast()).success, true);
		assert.equal(rows.length, 1);
	});
}
