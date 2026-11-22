const test = require('node:test');
const assert = require('node:assert/strict');
const { loadService } = require('./helpers/load-service.cjs');

const commentId = '0123456789abcdef01234567';
const schemas = {
	VideoCommentSchema: { collectionName: 'comments', schemaInstance: {} },
	VideoCommentVoteSchema: { collectionName: 'votes', schemaInstance: {} },
};

function fixture() {
	const records = new Map();
	const comment = { upvoteCount: 0, downvoteCount: 0, voteRevision: 0 };
	const controls = { counts: [], writes: 0, logs: [] };
	const db = {
		async selectDataFromMongoDB(where) {
			return { result: where._id === commentId && where.videoId === 1 ? [{ _id: commentId, ...comment }] : [] };
		},
		async findOneAndUpdateData4MongoDB(where, update, _schema, _name, options) {
			assert.equal(options.returnDocument, 'before');
			if (controls.recordError) throw controls.recordError;
			const old = records.get(where.uid);
			records.set(where.uid, update.direction);
			return { success: true, result: old && { direction: old } };
		},
		async deleteOneDataFromMongoDB(where) {
			const matched = records.get(where.uid) === where.direction;
			if (matched) records.delete(where.uid);
			return { result: { deletedCount: Number(matched) } };
		},
		async findOneAndUpdateWithOperators4MongoDB(where, update) {
			if (where.voteRevision !== undefined && where.voteRevision !== comment.voteRevision) return { success: false };
			if (update.$inc.upvoteCount !== undefined) {
				controls.writes++;
				if (controls.incrementError) throw controls.incrementError;
			}
			for (const [field, delta] of Object.entries(update.$inc)) comment[field] += delta;
			if (controls.replyLost && !update.$set) throw controls.replyLost;
			Object.assign(comment, update.$set);
			return { success: true, result: { ...comment } };
		},
		async countDataFromMongoDB({ direction }, _schema, _name, options) {
			assert.equal(options.readPreference, 'primary');
			assert.equal(options.limit, undefined);
			controls.counts.push(direction);
			const count = [...records.values()].filter(value => value === direction).length;
			if (controls.afterCount) await controls.afterCount();
			return { result: count };
		},
	};
	const { mutateCommentVote } = loadService('src/service/CommentVoteMutation.ts', {
		'../dbPool/DbClusterPool.js': db,
		'../dbPool/schema/VideoCommentSchema.js': schemas,
		'./loggingService.js': { logging: (...args) => controls.logs.push(args) },
	});
	const vote = (uid, direction, active = true, id = commentId, videoId = 1) => mutateCommentVote(videoId, id, uid, 'uuid-' + uid, direction, active);
	return { vote, records, comment, controls };
}

test('重复设置幂等，过期的取消点赞不能删除后来设置的点踩', async () => {
	const f = fixture();
	assert.equal(await f.vote(1, 'upvote', true, commentId.toUpperCase()), true);
	assert.equal(await f.vote(1, 'upvote'), false);
	assert.equal(await f.vote(1, 'downvote'), true);
	assert.equal(await f.vote(1, 'upvote', false), false);
	assert.deepEqual([...f.records.values()], ['downvote']);
	assert.equal(f.comment.upvoteCount, 0);
	assert.equal(f.comment.downvoteCount, 1);
	assert.equal(await f.vote(1, 'downvote', false), true);
	assert.equal(await f.vote(1, 'downvote', false), false);
	assert.equal(f.records.size, 0);
	assert.equal(f.controls.writes, 3);
});

test('并发请求保留每个人的状态，并把同一评论的多个增减合并写入', async () => {
	const f = fixture();
	const results = await Promise.all(Array.from({ length: 48 }, (_, uid) => f.vote(uid, uid % 2 ? 'downvote' : 'upvote')));
	assert.ok(results.every(Boolean));
	assert.equal(f.records.size, 48);
	assert.equal(f.comment.upvoteCount, 24);
	assert.equal(f.comment.downvoteCount, 24);
	assert.ok(f.controls.writes < results.length);
	assert.deepEqual(f.controls.counts.sort(), ['downvote', 'upvote']);
});

test('赞数和踩数升降到任一斐波那契数都会按明细核对', async () => {
	const checkpoints = [0, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987, 1597, 121393, 12_586_269_025];
	for (const direction of ['upvote', 'downvote']) {
		const field = direction === 'upvote' ? 'upvoteCount' : 'downvoteCount';
		for (const total of [...checkpoints, 4, 6, 145, 199, 200, 201, 232, 234, 12_586_269_026]) {
			for (const delta of [-1, 1]) {
				if (total - delta < 0) continue;
				const f = fixture();
				const before = total - delta;
				f.comment[field] = before;
				if (delta < 0) f.records.set(1, direction);
				await f.vote(1, direction, delta > 0);
				const trigger = checkpoints.includes(total);
				assert.deepEqual(f.controls.counts, trigger ? [direction] : [], direction + ' ' + before + ' → ' + total);
				assert.equal(f.comment[field], trigger ? f.records.size : total);
			}
		}
	}
});

test('合并增减只在达到或跨过阈值时按方向校准一次', async () => {
	for (const direction of ['upvote', 'downvote']) {
		const field = direction === 'upvote' ? 'upvoteCount' : 'downvoteCount';
		for (const [before, after, recount] of [[4, 6, true], [6, 4, true], [5, 7, false], [8, 6, false], [232, 234, true], [378, 376, true]]) {
			const f = fixture();
			f.comment[field] = before;
			for (let uid = 0; uid < before; uid++) f.records.set(uid, direction);
			const adding = after > before;
			await Promise.all(Array.from({ length: Math.abs(after - before) }, (_, i) =>
				f.vote(adding ? before + i : i, direction, adding)));
			assert.equal(f.controls.writes, 1);
			assert.equal(f.comment[field], after);
			assert.deepEqual(f.controls.counts, recount ? [direction] : []);
		}
	}
});

test('重复点赞在阈值上也保持幂等', async () => {
	const f = fixture();
	f.records.set(1, 'upvote');
	f.comment.upvoteCount = 1;
	assert.equal(await f.vote(1, 'upvote'), false);
	assert.deepEqual(f.controls.counts, []);
	assert.equal(f.comment.upvoteCount, 1);
	assert.equal(f.controls.writes, 0);
});

test('连续达到阈值每次都能核对，低赞数误差可以向上或向下修正', async () => {
	const f = fixture();
	f.comment.upvoteCount = 4;
	await f.vote(1, 'upvote');
	assert.equal(f.comment.upvoteCount, 1);
	f.records.set(2, 'upvote');
	f.records.set(3, 'upvote');
	await f.vote(1, 'upvote', false);
	assert.equal(f.comment.upvoteCount, 2);
	await f.vote(1, 'upvote');
	assert.equal(f.comment.upvoteCount, 3);
	assert.deepEqual(f.controls.counts, ['upvote', 'upvote', 'upvote']);
});

test('赞和踩独立判断，跨过 233 时统计该方向的全部明细', async () => {
	const f = fixture();
	f.comment.upvoteCount = 232;
	f.comment.downvoteCount = 400;
	for (let uid = 1; uid <= 400; uid++) f.records.set(uid, 'downvote');
	for (let uid = 401; uid <= 1000; uid++) f.records.set(uid, 'upvote');
	await f.vote(1, 'upvote');
	assert.deepEqual(f.controls.counts, ['upvote']);
	assert.equal(f.comment.upvoteCount, 601);
	assert.equal(f.comment.downvoteCount, 399);
});

test('校准期间其他实例更改了计数，即使数字回到原值，旧统计也不能覆盖新版本', async () => {
	const f = fixture();
	f.comment.upvoteCount = 4;
	f.controls.afterCount = () => { f.comment.voteRevision += 2; };
	await f.vote(1, 'upvote');
	assert.equal(f.comment.upvoteCount, 5);
	assert.equal(f.comment.voteRevision, 3);
});

test('错误的视频、评论 ID 或记录写入失败不会改动计数，计数写入失败保留已保存的状态', async () => {
	const f = fixture();
	await assert.rejects(f.vote(1, 'upvote', true, commentId, 2));
	await assert.rejects(f.vote(1, 'upvote', true, 'bad'));
	f.controls.recordError = new Error('记录写入失败');
	await assert.rejects(f.vote(1, 'upvote'), e => e === f.controls.recordError);
	assert.equal(f.controls.writes, 0);
	f.controls.recordError = undefined;
	f.controls.incrementError = new Error('计数写入失败');
	assert.equal(await f.vote(1, 'upvote'), true);
	assert.equal(f.records.get(1), 'upvote');
	assert.equal(f.controls.logs.length, 1);
	assert.equal(f.comment.upvoteCount, 1);
	f.controls.incrementError = undefined;
	assert.equal(await f.vote(1, 'upvote'), false);
	assert.equal(f.comment.upvoteCount, 1);
	await f.vote(2, 'upvote');
	assert.equal(f.comment.upvoteCount, 2);
});

test('增量已写入但响应丢失时只核对明细，保存的赞仍是一个', async () => {
	const f = fixture();
	f.controls.replyLost = new Error('响应丢失');
	assert.equal(await f.vote(1, 'upvote'), true);
	assert.equal(f.comment.upvoteCount, 1);
	assert.equal(f.controls.writes, 1);
	assert.deepEqual(f.controls.counts, ['upvote']);
});

test('四个公开接口都将重复操作视为成功，无效参数或异常仍是失败', async () => {
	const calls = [];
	const service = loadService('src/service/VideoCommentService.ts', {
		mongoose: {}, '../dbPool/DbClusterPool.js': {}, '../dbPool/schema/VideoCommentSchema.js': schemas,
		'./SequenceValueService.js': {}, './BlockService.js': {}, './VideoService.js': {},
		'./UserService.js': { checkUserTokenService: async () => ({ success: true }), getUserUuid: async () => 'uuid' },
		'./loggingService.js': { logging() {} },
		'./CommentVoteMutation.js': { mutateCommentVote: async (...args) => { calls.push(args.slice(-2)); return false; } },
	});
	for (const direction of ['Up', 'Down']) {
		for (const action of ['emit', 'cancel']) {
			assert.equal((await service[action + 'VideoComment' + direction + 'voteService']({ videoId: 1, id: commentId }, 1, 'token')).success, true);
		}
	}
	assert.deepEqual(calls, [['upvote', true], ['upvote', false], ['downvote', true], ['downvote', false]]);
	assert.equal((await service.emitVideoCommentUpvoteService({ videoId: 1, id: {} }, 1, 'token')).success, false);
	assert.equal(calls.length, 4);
});
