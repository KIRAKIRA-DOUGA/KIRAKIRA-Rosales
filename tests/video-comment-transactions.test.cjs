const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: tick } = require('node:timers/promises');
const { loadService } = require('./helpers/load-service.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const commentId = '0123456789abcdef01234567';
const matches = (row, where) => Object.entries(where).every(([key, value]) => value?.$regex ? value.$regex.test(row[key]) : row[key] === value);
const schemas = Object.fromEntries([
	['VideoCommentSchema', 'comments'], ['VideoCommentUpvoteSchema', 'up'], ['VideoCommentDownvoteSchema', 'down'],
].map(([key, collectionName]) => [key, { collectionName, schemaInstance: {} }]));

/** Model a snapshot transaction with first-writer conflicts, retries, and rollback.
 * No MongoDB service or network is used. The actual helper controls every database operation.
 */
function fixture(initialUp = [], initialDown = [], initialCount = 0) {
	let state = { comments: [{ _id: commentId, videoId: 1, upvoteCount: initialCount, downvoteCount: initialDown.length, text: 'unchanged' }], up: copy(initialUp), down: copy(initialDown) };
	let version = 0, owner, nextId = 0;
	const controls = { retries: 0, sessions: 0, ended: 0, failCounter: false, options: [], failure: undefined, retriedErrors: [] };
	const getRows = (name, session) => {
		assert.ok(session?.data, 'every operation must participate in the transaction');
		return session.data[name];
	};
	const checkOptions = options => {
		assert.equal(Object.hasOwn(options ?? {}, 'preserveError'), false, 'wrapper-only option must not reach Mongoose');
		assert.equal(options?.readPreference, 'primary');
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
			async withTransaction(callback, options) {
				controls.options.push(copy(options));
				for (let attempt = 0; attempt < 30; attempt++) {
					this.data = copy(state); this.version = version;
					try {
						const result = await callback();
						state = this.data; version++;
						return result;
					} catch (error) {
						if (!error.hasErrorLabel?.('TransientTransactionError')) throw error;
						controls.retries++;
						controls.retriedErrors.push(error);
					} finally {
						if (owner === this) owner = undefined;
						this.data = undefined;
					}
					await tick();
				}
				throw new Error('retry budget exhausted');
			},
			async endSession() { controls.ended++; },
		};
	} };
	const pool = loadService('src/dbPool/DbClusterPool.ts', {
		mongoose, mongodb: {}, './schema/SequenceSchema.js': {}, './schema/UserSchema.js': {}, '../service/loggingService.js': { logging() {} },
	});
	const sessions = loadService('src/common/MongoDBSessionTool.ts', { mongoose });
	const { mutateCommentVote } = loadService('src/service/CommentVoteMutation.ts', {
		'../dbPool/DbClusterPool.js': pool,
		'../common/MongoDBSessionTool.js': sessions,
		'../dbPool/schema/VideoCommentSchema.js': schemas,
	});
	return { controls, state: () => state, mutate: (direction, active, uid = 1, videoId = 1, id = commentId) => mutateCommentVote(videoId, id, uid, `uuid-${uid}`, direction, active) };
}

const vote = id => ({ _id: id, videoId: 1, commentId, uid: 1, UUID: 'uuid-1', invalidFlag: false, deleteFlag: false });

test('concurrent comment upvotes retry the transaction and store exactly one active vote', async () => {
	const f = fixture();
	const results = await Promise.all([f.mutate('upvote', true), f.mutate('upvote', true)]);
	assert.equal(results.filter(Boolean).length, 1);
	assert.equal(f.state().up.filter(v => !v.invalidFlag).length, 1);
	assert.equal(f.state().comments[0].upvoteCount, 1);
	assert.ok(f.controls.retries > 0);
	assert.equal(f.controls.sessions, f.controls.ended);
	assert.ok(f.controls.options.every(o => o.timeoutMS === 60000 && o.readPreference === 'primary'));
});

test('concurrent cancellation of legacy duplicate votes repairs the counter without going negative', async () => {
	const f = fixture([vote('old-1'), vote('old-2')], [], 9);
	await Promise.all([f.mutate('upvote', false), f.mutate('upvote', false)]);
	assert.equal(f.state().up.filter(v => !v.invalidFlag).length, 0);
	assert.equal(f.state().comments[0].upvoteCount, 0);
	assert.equal(f.state().comments[0].text, 'unchanged');
});

test('ObjectId case variants share the same vote and cancel historical mixed-case records', async () => {
	const f = fixture();
	await Promise.all([
		f.mutate('upvote', true),
		f.mutate('upvote', true, 1, 1, commentId.toUpperCase()),
	]);
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

test('opposite comment votes switch atomically and concurrent switches never leave both directions active', async () => {
	const f = fixture();
	await f.mutate('upvote', true);
	await f.mutate('downvote', true);
	assert.equal(f.state().comments[0].upvoteCount, 0);
	assert.equal(f.state().comments[0].downvoteCount, 1);
	await Promise.all([f.mutate('upvote', true), f.mutate('downvote', true)]);
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

test('real database wrappers preserve transient error labels and retry every transaction operation', async () => {
	for (const operation of ['findOneAndUpdate', 'find', 'save', 'updateMany', 'countDocuments', 'counter']) {
		const f = fixture();
		const error = new Error(`transient ${operation}`);
		error.hasErrorLabel = label => label === 'TransientTransactionError';
		f.controls.failure = { operation, error };
		assert.equal(await f.mutate('upvote', true), true, operation);
		assert.equal(f.controls.retries, 1, operation);
		assert.equal(f.controls.retriedErrors[0], error, 'the actual driver error must survive the common wrapper');
		assert.equal(f.state().up.filter(row => !row.invalidFlag).length, 1, operation);
		assert.equal(f.state().comments[0].upvoteCount, 1, operation);
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
		assert.equal(f.controls.retries, 0, operation);
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
