const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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
	const { migrateCommentVotes } = await import('../scripts/migrate-comment-votes.mjs');
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
		assert.equal(await migrateCommentVotes(db), true);
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

	await t.test('主库按方向校准，两个实例共享 30 秒上限，查询最多读取 201 条', async () => {
		const comment = newComment();
		comment.upvoteCount = 4;
		comment.downvoteCount = 250;
		await comments.insertOne(comment);
		const queries = [];
		const client = mongoose.connection.getClient();
		const watch = ({ command }) => {
			if (command.aggregate === 'video-comment-votes') queries.push(command.pipeline);
		};
		client.on('commandStarted', watch);
		try {
			await vote(0, comment._id, 11, 'upvote');
			assert.deepEqual(await counts(comment._id), [1, 250]);
			const firstCheck = (await comments.findOne({ _id: comment._id })).voteRecountAt;
			assert.ok(firstCheck > 0);
			await vote(1, comment._id, 11, 'upvote', false);
			await vote(1, comment._id, 12, 'upvote');
			assert.equal(queries.length, 1);
			assert.equal((await comments.findOne({ _id: comment._id })).voteRecountAt, firstCheck);
			await comments.updateOne({ _id: comment._id }, { $set: { voteRecountAt: 0, upvoteCount: 6 } });
			await vote(0, comment._id, 12, 'upvote', false);
			assert.deepEqual(await counts(comment._id), [0, 250]);
			assert.equal(queries.length, 2);
			assert.ok(queries.every(p => p.some(stage => stage.$limit === 201) && p[0].$match.direction === 'upvote'));
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
