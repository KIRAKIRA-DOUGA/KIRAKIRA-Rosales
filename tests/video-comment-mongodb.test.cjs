const test = require('node:test');
const assert = require('node:assert/strict');
const { execFile } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { promisify } = require('node:util');
const mongoose = require('mongoose');
const { loadService } = require('./helpers/load-service.cjs');

const uri = process.env.COMMENT_VOTE_TEST_URI;
test('MongoDB 实测：部署迁移、并发状态和评论列表', { skip: !uri }, async t => {
	const name = 'kk_comment_vote_test_' + randomUUID().replaceAll('-', '');
	await mongoose.connect(uri, { dbName: name, readPreference: 'secondaryPreferred', monitorCommands: true });
	const db = mongoose.connection.db;
	t.after(async () => { try { await db.dropDatabase(); } finally { await mongoose.disconnect(); } });
	const comments = db.collection('video-comments');
	const records = db.collection('video-comment-votes');
	const { ObjectId } = mongoose.Types;
	const { migrateCommentVotes } = await import('../migrations/pr-119.mjs');
	const runNode = promisify(execFile);
	const runMigration = databaseName => runNode(process.execPath, [require.resolve('../migrations/pr-119.mjs')], {
		env: { ...process.env, COMMENT_VOTE_MIGRATION_URI: uri, MONGODB_NAME: databaseName },
	});
	const schema = await import('../dist/dbPool/schema/VideoCommentSchema.js');
	const pool = await import('../dist/dbPool/DbClusterPool.js');
	const workers = await Promise.all([0, 1].map(i => import('../dist/service/CommentVoteMutation.js?worker=' + i)));
	const vote = (worker, id, uid, direction, active = true) => workers[worker].mutateCommentVote(1, id.toString(), uid, 'uuid-' + uid, direction, active);
	const newComment = () => {
		const _id = new ObjectId();
		return { _id, videoId: 1, commentRoute: '1.' + _id, upvoteCount: 0, downvoteCount: 0, commentIndex: 1 };
	};
	const legacy = (comment, uid, extra) => ({
		videoId: 1, commentId: comment._id.toString(), uid, UUID: 'uuid-' + uid,
		invalidFlag: false, deleteFlag: false, editDateTime: 1, ...extra,
	});
	const counts = async id => {
		const comment = await comments.findOne({ _id: id });
		return [comment.upvoteCount, comment.downvoteCount];
	};

	const migrated = newComment();
	const stale = newComment();
	await t.test('旧数据合并、归零和重复执行均安全', async () => {
		await comments.insertMany([migrated, { ...stale, upvoteCount: 99 }, ...Array.from({ length: 505 }, newComment)]);
		await db.collection('video-comment-upvotes').insertMany([
			legacy(migrated, 1, { commentId: migrated._id.toString().toUpperCase() }),
			legacy(migrated, 1, { editDateTime: 2 }),
			legacy(migrated, 2, { _id: new ObjectId('100000000000000000000001') }),
			legacy(migrated, 3, { deleteFlag: true }), legacy(migrated, 4, { invalidFlag: true }),
			legacy(migrated, 7, { videoId: 99 }), legacy(newComment(), 8),
			legacy(migrated, 9),
		]);
		await db.collection('video-comment-downvotes').insertMany([
			legacy(migrated, 1, { editDateTime: 3 }),
			legacy(migrated, 2, { _id: new ObjectId('200000000000000000000001') }),
		]);
		// 模拟前一次在写入部分新记录后中断。
		await records.insertOne({ commentId: migrated._id.toString(), uid: 1, UUID: 'uuid-1', direction: 'upvote' });
		await db.collection('video-upvotes').insertOne({ videoId: 2, UUID: 'user', uid: 1, invalidFlag: false, editDateTime: 1 });
		const migratedBoth = await runMigration(name);
		assert.ok(migratedBoth.stdout.includes(name + ' 评论赞踩记录迁移完成'));
		assert.ok(migratedBoth.stdout.includes(name + ' 视频赞踩记录迁移完成'));
		assert.equal(await db.collection('video-votes').countDocuments({ videoId: 2, UUID: 'user', direction: 'upvote' }), 1);
		assert.deepEqual(await counts(migrated._id), [1, 2]);
		assert.deepEqual(await counts(stale._id), [0, 0]);
		assert.equal(await records.countDocuments(), 3);
		const indexes = await records.indexes();
		assert.ok(indexes.some(i => i.unique && i.key.commentId && i.key.uid));
		await assert.rejects(records.insertOne({ commentId: migrated._id.toString(), uid: 1, direction: 'upvote' }), e => e.code === 11000);
		await vote(0, migrated._id, 9, 'upvote', false);
		assert.equal(await migrateCommentVotes(db), false);
		assert.equal(await records.countDocuments({ uid: 9 }), 0);
		assert.deepEqual(await counts(migrated._id), [0, 2]);
	});

	await t.test('旧库仅有点踩表时仍能迁移，空数据库可先建立所需索引', async () => {
		const client = mongoose.connection.getClient();
		for (const hasDownvote of [false, true]) {
			const isolated = client.db(name + (hasDownvote ? '_down' : '_empty'));
			try {
				const comment = newComment();
				if (hasDownvote) {
					await isolated.collection('video-comments').insertOne(comment);
					await isolated.collection('video-comment-downvotes').insertOne(legacy(comment, 2));
				}
				assert.equal(await migrateCommentVotes(isolated), true);
				assert.equal(await isolated.collection('video-comment-votes').countDocuments(), Number(hasDownvote));
				if (hasDownvote) assert.equal((await isolated.collection('video-comments').findOne({ _id: comment._id })).downvoteCount, 1);
			} finally {
				await isolated.dropDatabase();
			}
		}
	});

	await t.test('PR 迁移命令可以从第二步中断处继续，重跑保留用户已取消的状态', async () => {
		const isolated = mongoose.connection.getClient().db(name + '_release');
		try {
			const comment = newComment();
			await isolated.collection('video-comments').insertOne(comment);
			await isolated.collection('video-comment-upvotes').insertOne(legacy(comment, 1));
			await isolated.collection('video-upvotes').insertOne({ videoId: 7, UUID: 'user', uid: 1, invalidFlag: false, editDateTime: 1 });
			const videos = isolated.collection('video-votes');
			// 第二步建唯一索引时会遇到重复记录，第一步的完成标记应当已经落库。
			await videos.insertMany([{ videoId: 8, UUID: 'duplicate' }, { videoId: 8, UUID: 'duplicate' }]);
			await assert.rejects(runMigration(isolated.databaseName), error => error.stdout.includes('评论赞踩记录迁移完成') && error.stderr.includes('E11000'));
			const markers = isolated.collection('schema-migrations');
			assert.ok(await markers.findOne({ _id: 'single-comment-vote-v1' }));
			assert.equal(await markers.findOne({ _id: 'single-video-vote-v1' }), null);
			const comments = isolated.collection('video-comment-votes');
			assert.equal((await comments.deleteOne({ uid: 1 })).deletedCount, 1);
			await videos.deleteMany({ UUID: 'duplicate' });

			const resumed = await runMigration(isolated.databaseName);
			assert.match(resumed.stdout, /评论赞踩记录已迁移/);
			assert.match(resumed.stdout, /视频赞踩记录迁移完成/);
			assert.equal(await comments.countDocuments(), 0);
			assert.equal((await videos.deleteOne({ videoId: 7, UUID: 'user' })).deletedCount, 1);
			const repeated = await runMigration(isolated.databaseName);
			assert.match(repeated.stdout, /视频赞踩记录已迁移/);
			assert.equal(await videos.countDocuments(), 0);
		} finally {
			await isolated.dropDatabase();
		}
	});

	await t.test('两个服务实例并发对同一评论点赞和点踩，缓存由合并写入更新', async () => {
		const commands = [];
		const client = mongoose.connection.getClient();
		const onCommand = ({ command }) => commands.push(command);
		client.on('commandStarted', onCommand);
		try {
			for (let round = 0; round < 5; round++) {
				const comment = newComment();
				await comments.insertOne(comment);
				const results = await Promise.all(Array.from({ length: 16 }, (_, uid) => vote(uid % 2, comment._id, uid, uid % 4 < 2 ? 'downvote' : 'upvote')));
				assert.ok(results.every(Boolean));
				assert.equal(await records.countDocuments({ commentId: comment._id.toString() }), 16);
				assert.deepEqual(await counts(comment._id), [8, 8]);
			}
			const increments = commands.filter(c => c.findAndModify === 'video-comments' && c.update?.$inc).length;
			assert.ok(increments < 80);
			assert.ok(!commands.some(c => c.startTransaction || c.commitTransaction));
			t.diagnostic('80 次有效操作，评论计数写入 ' + increments + ' 次');
		} finally {
			client.off('commandStarted', onCommand);
		}
	});

	await t.test('两个实例连续升降到 233 时各自按该方向的全部明细校准', async () => {
		const comment = newComment();
		comment.upvoteCount = 232;
		comment.downvoteCount = 234;
		await comments.insertOne(comment);
		const existing = (uid, direction) => ({ commentId: comment._id.toString(), uid, UUID: 'uuid-' + uid, direction });
		await records.insertMany([
			...Array.from({ length: 300 }, (_, uid) => existing(uid + 1, 'upvote')),
			...Array.from({ length: 233 }, (_, uid) => existing(uid + 1001, 'downvote')),
		]);
		const queries = [];
		const client = mongoose.connection.getClient();
		const watch = ({ command }) => {
			if (command.aggregate === 'video-comment-votes') queries.push(command.pipeline);
		};
		client.on('commandStarted', watch);
		try {
			await vote(0, comment._id, 2000, 'upvote');
			assert.deepEqual(await counts(comment._id), [301, 234]);
			await vote(1, comment._id, 1001, 'downvote', false);
			assert.deepEqual(await counts(comment._id), [301, 232]);
			await vote(0, comment._id, 1001, 'downvote');
			assert.deepEqual(await counts(comment._id), [301, 233]);
			assert.equal(await vote(1, comment._id, 1001, 'downvote'), false);
			assert.deepEqual(queries.map(p => p[0].$match.direction), ['upvote', 'downvote', 'downvote']);
			assert.ok(queries.every(p => p.every(stage => stage.$limit === undefined)));
		} finally {
			client.off('commandStarted', watch);
		}
	});

	await t.test('同一用户的并发切换、重复请求和旧方向的取消', async () => {
		const comment = newComment();
		await comments.insertOne(comment);
		await Promise.all(Array.from({ length: 16 }, (_, i) => vote(i % 2, comment._id, 7, i % 2 ? 'upvote' : 'downvote')));
		const where = { commentId: comment._id.toString(), uid: 7 };
		assert.equal(await records.countDocuments(where), 1);
		const { direction } = await records.findOne(where);
		const other = direction === 'upvote' ? 'downvote' : 'upvote';
		assert.equal(await vote(1, comment._id, 7, other, false), false);
		assert.equal(await vote(0, comment._id, 7, direction), false);
		assert.deepEqual(await counts(comment._id), direction === 'upvote' ? [1, 0] : [0, 1]);
		for (let cycle = 0; cycle < 20; cycle++) {
			await vote(0, comment._id, 7, 'upvote');
			await vote(1, comment._id, 7, 'upvote', false);
		}
		assert.equal(await records.countDocuments(where), 0);
		assert.deepEqual(await counts(comment._id), [0, 0]);
	});

	await t.test('登录用户与游客从普通列表接口读取缓存和自己的状态', async () => {
		const comment = newComment();
		comment.videoId = 2;
		await comments.insertOne(comment);
		await workers[0].mutateCommentVote(2, comment._id.toString(), 7, 'uuid-7', 'downvote', true);
		const service = loadService('src/service/VideoCommentService.ts', {
			mongoose, '../dbPool/DbClusterPool.js': pool, '../dbPool/schema/VideoCommentSchema.js': schema,
			'./SequenceValueService.js': {}, './VideoService.js': {}, './CommentVoteMutation.js': workers[0],
			'./BlockService.js': { buildBlockListMongooseFilter: async () => ({ filter: [], additionalFields: {} }) },
			'./UserService.js': { checkUserTokenByUuidService: async () => ({ success: true }) },
			'./loggingService.js': { logging() {} },
		});
		for (const [uuid, token, expected] of [['uuid-7', 'token', true], ['uuid-8', 'token', false], [undefined, undefined, false]]) {
			const res = await service.getVideoCommentListByKvidService({ videoId: 2, pagination: { page: 1, pageSize: 10 } }, 7, uuid, token);
			assert.equal(res.success, true);
			assert.equal(res.videoCommentList.length, 1);
			const row = res.videoCommentList[0];
			assert.deepEqual([row.isUpvote, row.isDownvote, row.upvoteCount, row.downvoteCount], [false, expected, 0, 1]);
		}
	});
});
