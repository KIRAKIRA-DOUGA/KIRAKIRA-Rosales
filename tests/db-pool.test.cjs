const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MongoServerError, ReadPreferenceMode } = require('mongodb');
const { loadService } = require('./helpers/load-service.cjs');

const collection = 'pool-test';
const schema = {};
const where = { owner: 'user-1' };
const flatUpdate = { count: 2 };

function fixture({ failure, updated = { owner: 'user-1', count: 2 }, count = 0 } = {}) {
	const calls = [];
	const record = (method, args, options) => {
		calls.push({ method, args, options });
		if (failure) throw failure;
	};
	class Model {
		constructor(data) { this.data = data; }
		static async createIndexes() {}
		async save(options) {
			record('save', [this.data], options);
			return { _id: 'document-1', ...this.data };
		}
		static find(filter, projection, options) {
			const query = {
				sort() { return query; },
				skip() { return query; },
				limit() { return query; },
				populate() { return query; },
				then(resolve, reject) {
					return Promise.resolve().then(() => {
						record('find', [filter, projection], options);
						return [{ toObject: () => ({ owner: 'user-1' }) }];
					}).then(resolve, reject);
				},
			};
			return query;
		}
		static async updateMany(filter, update, options) {
			record('updateMany', [filter, update], options);
			return { acknowledged: true, matchedCount: 1, modifiedCount: 1 };
		}
		static async findOneAndUpdate(filter, update, options) {
			record('findOneAndUpdate', [filter, update], options);
			return updated === null ? null : { toObject: () => updated };
		}
		static async countDocuments(filter, options) {
			record('countDocuments', [filter], options);
			return count;
		}
	}
	const pool = loadService('src/dbPool/DbClusterPool.ts', {
		mongodb: { ReadPreferenceMode },
		mongoose: { models: { [collection]: Model } },
		'./schema/SequenceSchema.js': { SequenceValueSchema: {} },
		'./schema/UserSchema.js': { UserInfoSchema: {}, UserTotpAuthenticatorSchema: {} },
		'../service/loggingService.js': { logging() {} },
	});
	return { pool, calls };
}

const operations = [
	{ name: 'insertData2MongoDB', legacy: true, invoke: (pool, options) => pool.insertData2MongoDB({ owner: 'user-1' }, schema, collection, options) },
	{ name: 'selectDataFromMongoDB', legacy: true, invoke: (pool, options) => pool.selectDataFromMongoDB(where, { owner: 1 }, schema, collection, options) },
	{ name: 'updateData4MongoDB', legacy: true, invoke: (pool, options) => pool.updateData4MongoDB(where, flatUpdate, schema, collection, options) },
	{ name: 'findOneAndUpdateData4MongoDB', legacy: true, invoke: (pool, options) => pool.findOneAndUpdateData4MongoDB(where, flatUpdate, schema, collection, options) },
	{ name: 'findOneAndUpdateWithOperators4MongoDB', legacy: false, invoke: (pool, options) => pool.findOneAndUpdateWithOperators4MongoDB(where, { $inc: { count: 1 } }, schema, collection, options) },
	{ name: 'countDataFromMongoDB', legacy: false, invoke: (pool, options) => pool.countDataFromMongoDB(where, schema, collection, options) },
];

test('atomic updates forward operators and aggregation pipelines without wrapping them in $set', async () => {
	for (const update of [
		{ $inc: { count: 1 }, $set: { active: true } },
		[{ $set: { count: { $add: ['$count', 1] } } }],
	]) {
		const { pool, calls } = fixture();
		const filter = { ...where, $expr: { $lt: ['$count', 5] } };
		const result = await pool.findOneAndUpdateWithOperators4MongoDB(filter, update, schema, collection);
		assert.equal(calls[0].args[0], filter);
		assert.equal(calls[0].args[1], update);
		assert.equal(calls[0].options.new, true);
		assert.equal(calls[0].options.upsert, false);
		assert.equal(result.success, true);
		assert.deepEqual(result.result, { owner: 'user-1', count: 2 });
	}
});

test('atomic update options cannot enable upsert or request the old document', async () => {
	const { pool, calls } = fixture();
	await pool.findOneAndUpdateWithOperators4MongoDB(where, { $inc: { count: 1 } }, schema, collection, { upsert: true, new: false });
	assert.equal(calls[0].options.new, true);
	assert.equal(calls[0].options.upsert, false);
});

test('existing flat update helpers retain their $set and upsert behavior', async () => {
	const { pool, calls } = fixture();
	await pool.findOneAndUpdateData4MongoDB(where, flatUpdate, schema, collection);
	assert.equal(calls[0].args[1].$set, flatUpdate);
	assert.equal(calls[0].options.upsert, true);
	assert.equal(calls[0].options.new, true);
	await pool.findOneAndUpdateData4MongoDB(where, flatUpdate, schema, collection, undefined, false);
	assert.equal(calls[1].args[1].$set, flatUpdate);
	assert.equal(calls[1].options.upsert, false);
	await pool.updateData4MongoDB(where, flatUpdate, schema, collection);
	assert.equal(calls[2].args[1].$set, flatUpdate);
});

test('atomic updates report no match as failure without fabricating a record', async () => {
	const { pool, calls } = fixture({ updated: null });
	const result = await pool.findOneAndUpdateWithOperators4MongoDB(where, { $inc: { count: 1 } }, schema, collection);
	assert.equal(result.success, false);
	assert.equal(result.result, undefined);
	assert.equal(calls.length, 1);
	assert.equal(calls[0].options.upsert, false);
});

test('document counts return zero as a successful result', async () => {
	for (const count of [0, 3]) {
		const { pool, calls } = fixture({ count });
		const result = await pool.countDataFromMongoDB(where, schema, collection);
		assert.equal(calls[0].args[0], where);
		assert.equal(result.success, true);
		assert.equal(result.result, count);
	}
});

for (const { name, invoke, legacy } of operations) {
	test(`${name}: transaction options force primary and exclude preserveError`, async () => {
		for (const preserveError of [true, false]) {
			const { pool, calls } = fixture();
			const session = {};
			const result = await invoke(pool, { session, readPreference: 'secondary', preserveError });
			assert.equal(result.success, true);
			assert.equal(calls.length, 1);
			assert.equal(calls[0].options.session, session);
			assert.equal(calls[0].options.readPreference, 'primary');
			assert.equal(Object.hasOwn(calls[0].options, 'preserveError'), false);
		}
	});

	test(`${name}: non-transaction reads retain the selected read preference`, async () => {
		const { pool, calls } = fixture();
		await invoke(pool, { readPreference: 'secondaryPreferred', preserveError: true });
		assert.equal(calls[0].options.readPreference, 'secondaryPreferred');
		assert.equal(Object.hasOwn(calls[0].options, 'preserveError'), false);
	});

	test(`${name}: preserveError keeps the original MongoDB error and retry labels`, async () => {
		const failure = new MongoServerError({ message: 'simulated write conflict', code: 112 });
		failure.addErrorLabel('TransientTransactionError');
		const { pool } = fixture({ failure });
		await assert.rejects(invoke(pool, { preserveError: true }), error => {
			assert.equal(error, failure);
			assert.equal(error.code, 112);
			assert.equal(error.hasErrorLabel('TransientTransactionError'), true);
			return true;
		});
	});

	test(`${name}: callers without preserveError retain wrapped failure results`, async () => {
		for (const options of [undefined, { preserveError: false }]) {
			const failure = new MongoServerError({ message: 'simulated database error', code: 112 });
			const { pool } = fixture({ failure });
			await assert.rejects(invoke(pool, options), error => {
				assert.notEqual(error, failure);
				assert.equal(error.success, false);
				assert.equal(typeof error.message, 'string');
				if (legacy) {
					assert.equal(error.error.success, false);
					assert.equal(error.error.error, failure);
				} else {
					assert.equal(error.error, failure);
				}
				return true;
			});
		}
	});
}
