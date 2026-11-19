const test = require('node:test');
const assert = require('node:assert/strict');
const { loadService } = require('./helpers/load-service.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const commentId = '0123456789abcdef01234567';
const matches = (row, where) => Object.entries(where).every(([key, value]) => value?.$regex ? value.$regex.test(row[key]) : row[key] === value);
const schemas = Object.fromEntries([
	['VideoCommentSchema', 'comments'], ['VideoCommentUpvoteSchema', 'up'], ['VideoCommentDownvoteSchema', 'down'],
].map(([key, collectionName]) => [key, { collectionName, schemaInstance: {} }]));

/** 模拟快照事务、首次写入冲突和回滚，通过实际数据库封装执行操作，不连接 MongoDB。 */
function fixture(initialUp = [], initialDown = [], initialCount = 0) {
	let state = { comments: [{ _id: commentId, videoId: 1, upvoteCount: initialCount, downvoteCount: initialDown.length, text: 'unchanged' }], up: copy(initialUp), down: copy(initialDown) };
	let version = 0, owner, nextId = 0;
	const controls = { sessions: 0, started: 0, committed: 0, aborted: 0, ended: 0, failCounter: false, options: [], failure: undefined, operations: [], sessionList: [], logs: [], startError: undefined, commitError: undefined, abortError: undefined, endError: undefined };
	const getRows = (name, session) => {
		assert.ok(session?.data, '所有操作必须参与事务');
		assert.ok(controls.sessionList.includes(session), '必须使用本次创建的 session');
		controls.operations.push({ name, session });
		return session.data[name];
	};
	const checkOptions = options => {
		assert.equal(Object.hasOwn(options ?? {}, 'preserveError'), false, 'wrapper-only option must not reach Mongoose');
		assert.equal(options?.readPreference, 'primary', '共通 CRUD 应让事务操作使用主节点');
		getRows('comments', options?.session);
	};
	const maybeFail = operation => {
		if (controls.failure?.operation === operation) {
			const error = controls.failure.error;
			controls.failure = undefined;
			throw error;
		}
	};
	const document = row => row ? { ...copy(row), toObject: () => copy(row) } : null;
	const query = (operation, initialOptions) => {
		let options = initialOptions, skip = 0, limit;
		return {
			session(value) { options = { ...options, session: value }; return this; },
			setOptions(value) { options = { ...options, ...value }; return this; },
			sort() { return this; },
			skip(value) { skip = value; return this; },
			limit(value) { limit = value; return this; },
			then(resolve, reject) { return Promise.resolve().then(() => {
				checkOptions(options);
				const result = operation(options.session);
				return Array.isArray(result) ? result.slice(skip, limit === undefined ? undefined : skip + limit) : result;
			}).then(resolve, reject); },
		};
	};
	const models = Object.fromEntries(['comments', 'up', 'down'].map(name => {
		class Model {
			constructor(data) { this.data = copy(data); }
			async save(options) {
				checkOptions(options); maybeFail('save');
				const row = { ...this.data, _id: `new-${++nextId}` };
				getRows(name, options.session).push(row);
				return document(row);
			}
			static async createIndexes() {}
			static findOneAndUpdate(where, update, options) {
				return query(session => {
					maybeFail('findOneAndUpdate');
					assert.equal(options.upsert, false);
					assert.equal(options.new, true);
					if (name === 'comments' && update.$inc) {
						if ((owner && owner !== session) || session.version !== version) {
							const error = new Error('simulated WriteConflict');
							error.hasErrorLabel = label => label === 'TransientTransactionError';
							throw error;
						}
						owner = session;
					}
					if (name === 'comments' && update.$set) {
						maybeFail('counter');
						if (controls.failCounter) throw new Error('counter write unavailable');
					}
					const row = getRows(name, session).find(row => matches(row, where));
					if (!row) return null;
					for (const [key, delta] of Object.entries(update.$inc ?? {})) row[key] = (row[key] || 0) + delta;
					Object.assign(row, update.$set);
					return document(row);
				}, options);
			}
			static find(where, _select, options) {
				return query(session => {
					maybeFail('find');
					return getRows(name, session).filter(row => matches(row, where)).map(document);
				}, options);
			}
			static async updateMany(where, update, options) {
				checkOptions(options); maybeFail('updateMany');
				const rows = getRows(name, options.session).filter(row => matches(row, where));
				let modifiedCount = 0;
				for (const row of rows) {
					if (Object.entries(update.$set).some(([key, value]) => row[key] !== value)) modifiedCount++;
					Object.assign(row, update.$set);
				}
				return { acknowledged: true, matchedCount: rows.length, modifiedCount };
			}
			static countDocuments(where, options) {
				return query(session => {
					maybeFail('countDocuments');
					return getRows(name, session).filter(row => matches(row, where)).length;
				}, options);
			}
		}
		return [name, Model];
	}));
	const mongoose = { models, async startSession() {
		controls.sessions++;
		return {
			startTransaction(options) {
				controls.started++;
				controls.options.push(options && copy(options));
				controls.sessionList.push(this);
				if (controls.startError) throw controls.startError;
				this.data = copy(state); this.version = version; this.active = true;
			},
			inTransaction() { return this.active === true; },
			async commitTransaction() {
				controls.committed++;
				assert.ok(this.active);
				// 模拟驱动在提交失败后退出活动事务状态，包括提交结果不确定的情况。
				this.active = false;
				if (controls.commitError) throw controls.commitError;
				state = this.data; version++;
				if (owner === this) owner = undefined;
				this.data = undefined;
			},
			async abortTransaction() {
				controls.aborted++;
				this.active = false;
				this.data = undefined;
				if (owner === this) owner = undefined;
				if (controls.abortError) throw controls.abortError;
			},
			async endSession() {
				controls.ended++;
				this.hasEnded = true;
				this.data = undefined;
				if (owner === this) owner = undefined;
				if (controls.endError) throw controls.endError;
			},
		};
	} };
	const pool = loadService('src/dbPool/DbClusterPool.ts', {
		mongoose, mongodb: {}, './schema/SequenceSchema.js': {}, './schema/UserSchema.js': {}, '../service/loggingService.js': { logging() {} },
	});
	const logger = { logging: (...args) => controls.logs.push(args) };
	const sessionTools = loadService('src/common/MongoDBSessionTool.ts', { mongoose, '../service/loggingService.js': logger });
	const { mutateCommentVote } = loadService('src/service/CommentVoteMutation.ts', {
		'../dbPool/DbClusterPool.js': pool,
		'../common/MongoDBSessionTool.js': sessionTools,
		'./loggingService.js': logger,
		'../dbPool/schema/VideoCommentSchema.js': schemas,
	});
	return { controls, sessionTools, state: () => state, mutate: (direction, active, uid = 1, videoId = 1, id = commentId) => mutateCommentVote(videoId, id, uid, `uuid-${uid}`, direction, active) };
}

const vote = id => ({ _id: id, videoId: 1, commentId, uid: 1, UUID: 'uuid-1', invalidFlag: false, deleteFlag: false });

test('并发点赞只允许一个事务成功，冲突直接抛出且不重跑', async () => {
	const f = fixture();
	const results = await Promise.allSettled([f.mutate('upvote', true), f.mutate('upvote', true)]);
	assert.equal(results.filter(result => result.status === 'fulfilled' && result.value).length, 1);
	const rejected = results.filter(result => result.status === 'rejected');
	assert.equal(rejected.length, 1);
	assert.equal(rejected[0].reason.hasErrorLabel('TransientTransactionError'), true);
	assert.equal(f.state().up.filter(v => !v.invalidFlag).length, 1);
	assert.equal(f.state().comments[0].upvoteCount, 1);
	assert.equal(f.controls.started, 2);
	assert.equal(f.controls.committed, 1);
	assert.equal(f.controls.aborted, 1);
	assert.equal(f.controls.sessions, f.controls.ended);
	assert.deepEqual(f.controls.options, [undefined, undefined]);
});

test('并发取消重复的点赞记录时仅一个事务成功并修复计数', async () => {
	const f = fixture([vote('old-1'), vote('old-2')], [], 9);
	const results = await Promise.allSettled([f.mutate('upvote', false), f.mutate('upvote', false)]);
	assert.equal(results.filter(result => result.status === 'rejected').length, 1);
	assert.equal(f.controls.started, 2);
	assert.equal(f.controls.committed, 1);
	assert.equal(f.controls.ended, 2);
	assert.equal(f.state().up.filter(v => !v.invalidFlag).length, 0);
	assert.equal(f.state().comments[0].upvoteCount, 0);
	assert.equal(f.state().comments[0].text, 'unchanged');
});

test('大小写不同的评论 ID 共用点赞记录，也能取消历史混合大小写记录', async () => {
	const f = fixture();
	assert.equal(await f.mutate('upvote', true), true);
	assert.equal(await f.mutate('upvote', true, 1, 1, commentId.toUpperCase()), false);
	assert.equal(f.state().up.filter(v => !v.invalidFlag).length, 1);
	assert.equal(f.state().up[0].commentId, commentId);
	assert.equal(f.state().comments[0].upvoteCount, 1);
	const legacy = fixture([
		vote('lower'), { ...vote('upper'), commentId: commentId.toUpperCase() },
		{ ...vote('mixed'), commentId: '0123456789AbCdEf01234567' },
	], [], 3);
	await legacy.mutate('upvote', false, 1, 1, commentId.toUpperCase());
	assert.equal(legacy.state().up.filter(v => !v.invalidFlag).length, 0);
	assert.equal(legacy.state().comments[0].upvoteCount, 0);
});

test('切换投票方向保持原子性，并发冲突不会同时启用两个方向', async () => {
	const f = fixture();
	await f.mutate('upvote', true);
	await f.mutate('downvote', true);
	assert.equal(f.state().comments[0].upvoteCount, 0);
	assert.equal(f.state().comments[0].downvoteCount, 1);
	const results = await Promise.allSettled([f.mutate('upvote', true), f.mutate('downvote', true)]);
	assert.equal(results.filter(result => result.status === 'rejected').length, 1);
	const row = f.state().comments[0];
	assert.equal(row.upvoteCount + row.downvoteCount, 1);
	assert.equal(f.state().up.filter(v => !v.invalidFlag).length + f.state().down.filter(v => !v.invalidFlag).length, 1);
	await f.mutate('upvote', false); await f.mutate('downvote', false);
	assert.equal(f.state().comments[0].upvoteCount + f.state().comments[0].downvoteCount, 0);
});

test('a counter failure rolls back insertion, opposite cancellation, and comment metadata', async () => {
	const f = fixture([vote('old')], [], 1);
	const before = copy(f.state());
	f.controls.failCounter = true;
	await assert.rejects(f.mutate('downvote', true), /counter write unavailable/);
	assert.deepEqual(f.state(), before);
	assert.equal(f.controls.sessions, f.controls.ended);
	f.controls.failCounter = false;
	await f.mutate('downvote', true);
	assert.equal(f.state().comments[0].upvoteCount, 0);
	assert.equal(f.state().comments[0].downvoteCount, 1);
});

test('a wrong video/comment pairing aborts before any vote is stored', async () => {
	const f = fixture();
	await assert.rejects(f.mutate('upvote', true, 1, 99), /不存在/);
	assert.equal(f.state().up.length, 0);
});

test('每个数据库操作的临时冲突均保留原始错误且不重跑事务', async () => {
	for (const operation of ['findOneAndUpdate', 'find', 'save', 'updateMany', 'countDocuments', 'counter']) {
		const f = fixture();
		const error = new Error(`transient ${operation}`);
		error.hasErrorLabel = label => label === 'TransientTransactionError';
		f.controls.failure = { operation, error };
		const before = copy(f.state());
		await assert.rejects(f.mutate('upvote', true), received => received === error, operation);
		assert.equal(f.controls.started, 1, operation);
		assert.equal(f.controls.committed, 0, operation);
		assert.equal(f.controls.aborted, 1, operation);
		assert.deepEqual(f.state(), before, operation);
		assert.equal(f.controls.sessions, f.controls.ended, operation);
	}
});

test('non-transient database failures roll back through the real wrappers without losing the original error', async () => {
	for (const operation of ['findOneAndUpdate', 'find', 'save', 'updateMany', 'countDocuments', 'counter']) {
		const f = fixture([vote('old')], [], 1);
		const before = copy(f.state());
		const error = new Error(`permanent ${operation}`);
		f.controls.failure = { operation, error };
		await assert.rejects(f.mutate('downvote', true), received => received === error, operation);
		assert.deepEqual(f.state(), before, operation);
		assert.equal(f.controls.started, 1, operation);
		assert.equal(f.controls.committed, 0, operation);
		assert.equal(f.controls.aborted, 1, operation);
		assert.equal(f.controls.sessions, f.controls.ended, operation);
	}
});

test('all four public comment vote handlers use the shared transaction and reject invalid requests', async () => {
	const calls = [];
	const service = loadService('src/service/VideoCommentService.ts', {
		mongoose: {}, '../dbPool/DbClusterPool.js': {}, '../dbPool/schema/VideoCommentSchema.js': schemas,
		'./SequenceValueService.js': {}, './BlockService.js': {}, './VideoService.js': {},
		'./UserService.js': { checkUserTokenService: async () => ({ success: true }), getUserUuid: async () => 'uuid' },
		'./loggingService.js': { logging() {} },
		'./CommentVoteMutation.js': { mutateCommentVote: async (...args) => { calls.push(args); return true; } },
	});
	for (const direction of ['Up', 'Down']) {
		for (const action of ['emit', 'cancel']) {
			const handler = service[`${action}VideoComment${direction}voteService`];
			assert.equal((await handler({ videoId: 1, id: commentId }, 1, 'token')).success, true);
		}
	}
	assert.deepEqual(calls.map(args => args.slice(-2)), [['upvote', true], ['upvote', false], ['downvote', true], ['downvote', false]]);
	assert.equal((await service.emitVideoCommentUpvoteService({ videoId: 1, id: {} }, 1, 'token')).success, false);
	assert.equal(calls.length, 4);
});

test('共通函数无参开启事务时沿用连接的设置', async () => {
	const f = fixture();
	const session = await f.sessionTools.createAndStartSession();
	assert.deepEqual(f.controls.options, [undefined]);
	assert.equal(await f.sessionTools.commitAndEndSession(session), true);
	assert.equal(f.controls.ended, 1);
});

test('点赞记录和评论计数使用同一个 session 并且只提交一次', async () => {
	const f = fixture();
	assert.equal(await f.mutate('upvote', true), true);
	assert.equal(f.controls.sessions, 1);
	assert.equal(f.controls.started, 1);
	assert.equal(f.controls.committed, 1);
	assert.equal(f.controls.aborted, 0);
	assert.equal(f.controls.ended, 1);
	assert.deepEqual([...new Set(f.controls.operations.map(operation => operation.name))].sort(), ['comments', 'down', 'up']);
	assert.ok(f.controls.operations.every(operation => operation.session === f.controls.sessionList[0]));
	assert.equal(f.state().up.length, 1);
	assert.equal(f.state().comments[0].upvoteCount, 1);
});

test('提交结果不确定时保留原始错误且不再次提交或执行事务', async () => {
	const f = fixture();
	const error = new Error('提交结果不确定');
	error.hasErrorLabel = label => label === 'UnknownTransactionCommitResult';
	f.controls.commitError = error;
	await assert.rejects(f.mutate('upvote', true), received => received === error);
	assert.equal(f.controls.started, 1);
	assert.equal(f.controls.committed, 1);
	assert.equal(f.controls.aborted, 0);
	assert.equal(f.controls.ended, 1);
});

test('提交失败时仍在进行的事务会回滚并关闭会话', async () => {
	const f = fixture();
	const session = await f.sessionTools.createAndStartSession();
	const error = new Error('提交命令未能发出');
	session.commitTransaction = async () => { throw error; };
	await assert.rejects(f.sessionTools.commitAndEndSession(session), received => received === error);
	assert.equal(f.controls.aborted, 1);
	assert.equal(f.controls.ended, 1);
});

test('事务启动失败仍关闭 session 并保留原始错误', async () => {
	const f = fixture();
	const error = new Error('启动失败');
	f.controls.startError = error;
	await assert.rejects(f.mutate('upvote', true), received => received === error);
	assert.equal(f.controls.started, 1);
	assert.equal(f.controls.committed, 0);
	assert.equal(f.controls.aborted, 0);
	assert.equal(f.controls.ended, 1);
	assert.equal(f.controls.operations.length, 0);
});

test('回滚和关闭同时失败时不覆盖业务错误', async () => {
	const f = fixture();
	const before = copy(f.state());
	const error = new Error('计数更新失败');
	f.controls.failure = { operation: 'counter', error };
	f.controls.abortError = new Error('回滚失败');
	f.controls.endError = new Error('关闭失败');
	await assert.rejects(f.mutate('upvote', true), received => received === error);
	assert.equal(f.controls.aborted, 1);
	assert.equal(f.controls.ended, 1);
	assert.equal(f.controls.logs.length, 2);
	assert.deepEqual(f.state(), before);
});

test('关闭失败不覆盖不确定的提交错误', async () => {
	const f = fixture();
	const error = new Error('提交结果不确定');
	error.hasErrorLabel = label => label === 'UnknownTransactionCommitResult';
	f.controls.commitError = error;
	f.controls.endError = new Error('关闭失败');
	await assert.rejects(f.mutate('upvote', true), received => received === error);
	assert.equal(f.controls.committed, 1);
	assert.equal(f.controls.ended, 1);
	assert.equal(f.controls.logs.length, 1);
});

test('数据库已确认点赞成功时单独记录关闭错误，并返回点赞成功', async () => {
	const f = fixture();
	const error = new Error('关闭失败');
	f.controls.endError = error;
	assert.equal(await f.mutate('upvote', true), true);
	assert.equal(f.controls.logs.length, 1);
	assert.equal(f.controls.logs[0][2], error);
	assert.equal(f.controls.committed, 1);
	assert.equal(f.controls.aborted, 0);
	assert.equal(f.controls.ended, 1);
	assert.equal(f.state().up.length, 1);
	assert.equal(f.state().comments[0].upvoteCount, 1);
});
