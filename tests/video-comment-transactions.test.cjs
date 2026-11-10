const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: tick } = require('node:timers/promises');
const { loadService } = require('./helpers/load-service.cjs');
const copy = value => JSON.parse(JSON.stringify(value));
const commentId = '0123456789abcdef01234567';
const matches = (row, where) => Object.entries(where).every(([key, value]) => typeof value?.test === 'function' ? value.test(row[key]) : row[key] === value);
const schemas = Object.fromEntries([
	['VideoCommentSchema', 'comments'], ['VideoCommentUpvoteSchema', 'up'], ['VideoCommentDownvoteSchema', 'down'],
].map(([key, collectionName]) => [key, { collectionName, schemaInstance: {} }]));

/** Model a snapshot transaction with first-writer conflicts, retries, and rollback.
 * No MongoDB service or network is used. The actual helper controls every database operation.
 */
function fixture(initialUp = [], initialDown = [], initialCount = 0) {
	let state = { comments: [{ _id: commentId, videoId: 1, upvoteCount: initialCount, downvoteCount: initialDown.length, text: 'unchanged' }], up: copy(initialUp), down: copy(initialDown) };
	let version = 0, owner, nextId = 0;
	const controls = { retries: 0, sessions: 0, ended: 0, failCounter: false, options: [] };
	const getRows = (name, session) => {
		assert.ok(session?.data, 'every operation must participate in the transaction');
		return session.data[name];
	};
	const query = operation => {
		let session;
		return {
			session(value) { session = value; return this; },
			lean() { return Promise.resolve().then(() => operation(session)); },
			then(resolve, reject) { return Promise.resolve().then(() => operation(session)).then(resolve, reject); },
		};
	};
	const models = Object.fromEntries(['comments', 'up', 'down'].map(name => [name, {
		findOneAndUpdate(where, update, { session }) {
			return { lean: async () => {
				if ((owner && owner !== session) || session.version !== version) {
					const error = new Error('simulated WriteConflict'); error.transient = true; throw error;
				}
				owner = session;
				const row = getRows(name, session).find(row => matches(row, where));
				if (!row) return null;
				for (const [key, delta] of Object.entries(update.$inc)) row[key] = (row[key] || 0) + delta;
				return copy(row);
			} };
		},
		findOne(where) { return query(session => {
			const row = getRows(name, session).find(row => matches(row, where));
			return row ? copy(row) : null;
		}); },
		async updateMany(where, update, { session }) {
			for (const row of getRows(name, session).filter(row => matches(row, where))) Object.assign(row, update.$set);
			return { acknowledged: true };
		},
		async updateOne(where, update, { session }) {
			if (name === 'comments' && controls.failCounter) throw new Error('counter write unavailable');
			Object.assign(getRows(name, session).find(row => matches(row, where)), update.$set);
			return { acknowledged: true };
		},
		async create(rows, { session }) {
			getRows(name, session).push(...rows.map(row => ({ ...copy(row), _id: `new-${++nextId}` })));
		},
		countDocuments(where) { return query(session => getRows(name, session).filter(row => matches(row, where)).length); },
	}]));
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
						if (!error.transient) throw error;
						controls.retries++;
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
	const { mutateCommentVote } = loadService('src/service/CommentVoteMutation.ts', {
		mongoose, '../dbPool/schema/VideoCommentSchema.js': schemas,
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
	assert.ok(f.controls.options.every(o => o.timeoutMS === 10000 && o.readPreference === 'primary'));
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
