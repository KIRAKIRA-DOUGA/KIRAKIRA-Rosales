const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const mongoose = require('mongoose');
const { loadService } = require('./helpers/load-service.cjs');

const uri = process.env.COMMENT_VOTE_TEST_URI;
test('视频赞踩迁移与并发切换在 MongoDB 中保持唯一', { skip: !uri }, async t => {
	const dbName = 'kk_video_vote_test_' + randomUUID().replaceAll('-', '');
	await mongoose.connect(uri, { dbName });
	const db = mongoose.connection.db;
	t.after(async () => {
		try { await db.dropDatabase(); } finally { await mongoose.disconnect(); }
	});
	const { migrateVideoVotes } = await import('../migrations/pr-119.mjs');
	const schema = await import('../dist/dbPool/schema/VideoVoteSchema.js');
	const pool = await import('../dist/dbPool/DbClusterPool.js');
	const records = db.collection(schema.VideoVoteSchema.collectionName);
	const users = { checkUserTokenByUuidService: async () => ({ success: true }), getUserUid: async () => 1 };
	const dependencies = {
		'../dbPool/DbClusterPool.js': pool, '../dbPool/schema/VideoVoteSchema.js': schema,
		'./UserService.js': users, './loggingService.js': { logging() {} },
	};
	const service = loadService('src/service/VideoVoteService.ts', dependencies);
	const call = (method, videoId = 1) => service[method]({ videoId }, 'user', 'token');

	const old = { videoId: 1, UUID: 'user', uid: 1, invalidFlag: false };
	await db.collection('video-upvotes').insertMany([
		{ ...old, editDateTime: 5 }, { ...old, videoId: 2, invalidFlag: true },
		{ ...old, videoId: 3, _id: new mongoose.Types.ObjectId('100000000000000000000001'), editDateTime: 10 },
	]);
	await db.collection('video-downvotes').insertMany([
		{ ...old, downvoteTime: 7 },
		{ ...old, videoId: 3, _id: new mongoose.Types.ObjectId('200000000000000000000001'), editDateTime: 10 },
	]);
	assert.equal(await migrateVideoVotes(db), true);
	assert.equal(await records.countDocuments(), 2);
	assert.equal((await records.findOne({ videoId: 1 })).direction, 'downvote');
	assert.equal((await records.findOne({ videoId: 3 })).direction, 'downvote');
	assert.equal((await call('cancelVideoDownvoteService')).success, true);
	assert.equal(await migrateVideoVotes(db), false);
	assert.equal(await records.countDocuments({ videoId: 1 }), 0);

	const parallel = await Promise.all(Array.from({ length: 24 }, (_, i) => call(i % 2 ? 'emitVideoUpvoteService' : 'emitVideoDownvoteService')));
	assert.ok(parallel.some(result => result.success));
	assert.equal(await records.countDocuments({ videoId: 1 }), 1);
	const current = (await records.findOne({ videoId: 1 })).direction;
	const staleCancel = current === 'upvote' ? 'cancelVideoDownvoteService' : 'cancelVideoUpvoteService';
	assert.equal((await call(staleCancel)).success, false);
	assert.equal((await records.findOne({ videoId: 1 })).direction, current);
	for (const direction of ['Up', 'Down', 'Up']) {
		await call('emitVideo' + direction + 'voteService', 4);
		assert.equal(await records.countDocuments({ videoId: 4 }), 1);
	}
	assert.equal((await records.findOne({ videoId: 4 })).direction, 'upvote');

	const video = await import('../dist/dbPool/schema/VideoSchema.js');
	// 复用已连接的临时库，执行应用启动时的真实模型注册和索引初始化。
	const startup = loadService('src/dbPool/DbClusterPool.ts', {
		mongodb: require('mongodb'),
		mongoose: { set: mongoose.set.bind(mongoose), model: mongoose.model.bind(mongoose), connect: async () => mongoose },
		'./schema/SequenceSchema.js': await import('../dist/dbPool/schema/SequenceSchema.js'),
		'./schema/UserSchema.js': await import('../dist/dbPool/schema/UserSchema.js'),
		'./schema/VideoCommentSchema.js': await import('../dist/dbPool/schema/VideoCommentSchema.js'),
		'./schema/VideoVoteSchema.js': schema, './schema/VideoSchema.js': video,
		'../service/loggingService.js': { logging() {} },
	}, { process: {
		env: { MONGODB_CLUSTER_HOST: 'localhost', MONGODB_NAME: dbName, MONGODB_USERNAME: 'test', MONGODB_PASSWORD: 'test' },
		exit() { throw new Error('测试库模型初始化失败'); },
	} });
	await startup.connectMongoDBCluster();
	for (const name of ['videos', 'removed-videos']) {
		const indexes = await db.collection(name).indexes();
		assert.ok(indexes.some(index => index.key.videoId === 1 && index.unique), name);
	}
	const serviceErrors = [];
	const videoService = loadService('src/service/VideoService.ts', {
		mongoose, '../cloudflare/index.js': {}, '../common/RandomTool.js': {}, '../common/MongoDBSessionTool.js': await import('../dist/common/MongoDBSessionTool.js'),
		'../common/ObjectTool.js': { isEmptyObject: value => !Object.keys(value).length },
		'../dbPool/schema/UserSchema.js': {}, '../dbPool/schema/FeedSchema.js': {}, '../dbPool/schema/VideoWatchRecordSchema.js': {},
		'../dbPool/DbClusterPool.js': pool, '../dbPool/schema/VideoSchema.js': video, '../dbPool/schema/VideoVoteSchema.js': schema,
		'../elasticsearchPool/template/VideoDocument.js': { VideoDocument: { indexName: 'test', schema: {} } },
		'../elasticsearchPool/ElasticsearchClusterPool.js': {
			searchDataFromElasticsearchCluster: async () => ({ success: true, result: [3, 1, 4, 2, 1].map(kvid => ({ kvid })) }),
			deleteDataFromElasticsearchCluster: async () => true,
		},
		'./BrowsingHistoryService.js': {}, '../common/DateTool.js': {}, './SequenceValueService.js': {},
		'./UserService.js': { checkUserTokenService: async () => ({ success: true }), getUserUuid: async () => 'admin' },
		'./BlockService.js': {}, './loggingService.js': { logging(_level, _message, error) { if (error) serviceErrors.push(error); } },
	});

	await t.test('索引命中按顺序返回数据库中的公开视频及作者', async () => {
		await db.collection('videos').insertMany([
			{ videoId: 2, uploaderUUID: 'author', title: '乙', pendingReview: false },
			{ videoId: 3, uploaderUUID: 'author', title: '待审核', pendingReview: true },
			{ videoId: 1, uploaderUUID: 'author', title: '甲', pendingReview: false },
		]);
		await db.collection('user-infos').insertOne({ UUID: 'author', username: '作者' });
		const result = await videoService.searchVideoByKeywordService({ keyword: '视频' }, { connected: true });
		assert.equal(result.success, true);
		assert.deepEqual(Array.from(result.videos, item => [item.videoId, item.uploader]), [[1, '作者'], [2, '作者']]);
	});

	await t.test('删除时原始字段随事务归档', async () => {
		const original = {
			videoId: 10, uploaderUUID: 'author', uploaderId: 7, title: '归档视频', pendingReview: false,
			videoPart: [{ id: 1, videoPartTitle: '第一段', link: 'part-1', editDateTime: 100 }],
			image: 'cover', uploadDate: 100, watchedCount: 3, duration: 30, videoCategory: '讨论',
			copyright: '原作', originalAuthor: '原作者', originalLink: 'source', pushToFeed: false,
			ensureOriginal: false, videoTagList: [], editDateTime: 200,
		};
		await db.collection('videos').insertOne(original);
		const removed = await videoService.deleteVideoByKvidService({ videoId: 10 }, 9, 'token', { connected: true });
		assert.equal(removed.success, true, serviceErrors.map(e => (e?.error?.error ?? e?.error ?? e).message).join(', ') || removed.message);
		const archive = await db.collection('removed-videos').findOne({ videoId: 10 });
		assert.equal(archive._operatorUid_, 9);
		assert.equal(archive.originalLink, 'source');
		assert.equal(archive.videoPart[0].editDateTime, 100);
		assert.equal(await db.collection('videos').countDocuments({ videoId: 10 }), 0);
	});
});
