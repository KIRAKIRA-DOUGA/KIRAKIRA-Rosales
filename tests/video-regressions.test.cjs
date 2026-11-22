const test = require('node:test');
const assert = require('node:assert/strict');
const { loadService } = require('./helpers/load-service.cjs');
const schema = collectionName => ({ collectionName, schemaInstance: {} });
const copy = value => JSON.parse(JSON.stringify(value));
const matches = (row, where) => Object.entries(where).every(([key, value]) => {
	if (value?.$in) return value.$in.includes(row[key]);
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
		'../common/MongoDBSessionTool.js': {
			createAndStartSession: async () => ({ active: true }),
			abortAndEndSession: async session => { session.active = false; },
			commitAndEndSession: async session => { session.active = false; return true; },
		},
		'../dbPool/schema/VideoVoteSchema.js': { VideoVoteSchema: schema('video-votes') },
		'../cloudflare/index.js': {}, '../common/RandomTool.js': {},
		'../common/ObjectTool.js': { isEmptyObject: value => !value || Object.keys(value).length === 0 },
		'../dbPool/schema/UserSchema.js': { UserInfoSchema: schema('user-info') },
		'../dbPool/schema/VideoSchema.js': { VideoSchema: schema('video'), RemovedVideoSchema: schema('removed-video') },
		'../dbPool/schema/FeedSchema.js': {}, '../dbPool/schema/VideoWatchRecordSchema.js': {},
		'../elasticsearchPool/template/VideoDocument.js': { VideoDocument: { indexName: 'videos', schema: { title: String } } },
		'../elasticsearchPool/ElasticsearchClusterPool.js': {
			insertData2ElasticsearchCluster: loadService('src/elasticsearchPool/ElasticsearchClusterPool.ts', {
				'@elastic/elasticsearch': {},
				'../common/ObjectTool.js': { isEmptyObject: value => !value || Object.keys(value).length === 0 },
				'../service/loggingService.js': { logging() {} },
			}).insertData2ElasticsearchCluster,
			deleteDataFromElasticsearchCluster: async () => true,
			searchDataFromElasticsearchCluster: async () => ({ success: true, result: [
				{ kvid: 1, title: 'pending secret' }, { kvid: 2, title: 'approved' },
				{ kvid: 2, title: 'old duplicate' }, { kvid: 99, title: 'deleted secret' },
			] }),
		},
		'./BrowsingHistoryService.js': {}, '../common/DateTool.js': {},
		'./SequenceValueService.js': { getNextSequenceValueEjectService: async () => ({ success: true, sequenceValue: 3 }) },
		'./UserService.js': { checkUserTokenService: async () => ({ success: true }), checkUserTokenByUuidService: async () => ({ success: false }), getUserUuid: async () => 'uuid' },
		'./BlockService.js': { buildBlockListMongooseFilter: async () => ({ filter: [], additionalFields: {} }) },
		'./loggingService.js': { logging() {} },
		'../dbPool/DbClusterPool.js': {
			selectDataByAggregateFromMongoDB: async (_schema, _collection, pipeline) => {
				const where = pipeline.find(stage => stage.$match)?.$match ?? {};
				controls.publicFilters.push(copy(where));
				if (controls.failRead === 'throw') throw new Error('模拟数据库读取失败');
				if (controls.failRead === 'result') return { success: false };
				return { success: true, result: copy(rows.filter(row => matches(row, where))) };
			},
			selectDataFromMongoDB: async where => ({ success: true, result: copy(rows.filter(row => matches(row, where))) }),
			insertData2MongoDB: async (row, _schema, collection, options) => {
				if (collection === 'removed-video') {
					assert.ok(options.session.active); controls.archived = copy(row);
				} else rows.push(copy(row));
				return { success: true };
			},
			deleteOneDataFromMongoDB: async (where, _schema, _collection, options) => {
				assert.ok(options.session.active);
				const i = rows.findIndex(row => matches(row, where));
				if (i >= 0) rows.splice(i, 1);
				return { success: true, result: { deletedCount: Number(i >= 0) } };
			},
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
	assert.ok(controls.indexCalls.every(call => call.id === '1' && call.refresh === true));
	assert.equal((await service.approvePendingReviewVideoService({ videoId: 99 }, 10, 'token', esClient)).success, false);
	assert.equal(rows.some(row => row.videoId === 99), false);
});

test('搜索区分真实空结果和读取错误，保持索引中的顺序', async () => {
	const { service, rows, controls, esClient } = videoFixture();
	const search = () => service.searchVideoByKeywordService({ keyword: 'video' }, esClient);
	rows[0].pendingReview = false;
	rows.reverse();
	assert.deepEqual(Array.from((await search()).videos, row => row.videoId), [1, 2]);
	assert.equal(controls.publicFilters.length, 1);
	for (const mode of ['throw', 'result']) {
		controls.failRead = mode;
		assert.equal((await search()).success, false);
	}
	controls.failRead = false;
	rows.length = 0;
	const empty = await search();
	assert.equal(empty.success, true);
	assert.equal(empty.videosCount, 0);
});

test('删除视频归档数据库原记录中的字段和分 P 编辑时间', async () => {
	const { service, rows, controls, esClient } = videoFixture();
	rows[1].originalLink = '原始链接';
	rows[1].videoPart[0].editDateTime = 111;
	const result = await service.deleteVideoByKvidService({ videoId: 2 }, 10, 'token', esClient);
	assert.equal(result.success, true);
	assert.equal(controls.archived.originalLink, '原始链接');
	assert.equal(controls.archived.videoPart[0].editDateTime, 111);
	assert.equal(controls.archived._operatorUid_, 10);
	assert.equal(rows.some(row => row.videoId === 2), false);
});

function videoVoteFixture() {
	const rows = [];
	const service = loadService('src/service/VideoVoteService.ts', {
		'./loggingService.js': { logging() {} },
		'./UserService.js': { checkUserTokenByUuidService: async () => ({ success: true }), getUserUid: async () => 1 },
		'../dbPool/schema/VideoVoteSchema.js': { VideoVoteSchema: schema('video-votes') },
		'../dbPool/DbClusterPool.js': {
			findOneAndUpdateData4MongoDB: async (where, update, _schema, _collection, options) => {
				assert.equal(options.returnDocument, 'before');
				const row = rows.find(row => matches(row, where));
				const old = row && { ...row };
				if (row) Object.assign(row, update); else rows.push({ ...where, ...update });
				return { success: true, result: old };
			},
			deleteOneDataFromMongoDB: async where => {
				const i = rows.findIndex(row => matches(row, where));
				if (i >= 0) rows.splice(i, 1);
				return { success: true, result: { deletedCount: Number(i >= 0) } };
			},
			countDataFromMongoDB: async where => ({ success: true, result: rows.filter(row => matches(row, where)).length }),
		},
	});
	return { rows, call: (action, direction) => service[action + 'Video' + direction + 'voteService']({ videoId: 1 }, 'uuid', 'token') };
}

for (const first of ['Up', 'Down']) {
	test('视频连续切换方向，每个用户只计入最后的选择 ' + first, async () => {
		const { rows, call } = videoVoteFixture();
		const other = first === 'Up' ? 'Down' : 'Up';
		for (const direction of [first, other, first]) {
			const result = await call('emit', direction);
			assert.equal(result.success, true);
			assert.equal(result['video' + direction + 'voteCount'], 1);
			assert.equal(rows.length, 1);
		}
		assert.equal((await call('emit', first)).success, false);
		assert.equal((await call('cancel', other)).success, false);
		assert.equal(rows[0].direction, first.toLowerCase() + 'vote');
		assert.equal((await call('cancel', first)).success, true);
		assert.equal(rows.length, 0);
	});
}
