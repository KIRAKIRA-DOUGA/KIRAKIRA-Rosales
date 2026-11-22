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
			return { _id: { toString: () => 'document-1' }, toObject: () => ({ ...this.data }) };
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
		'./schema/VideoSchema.js': { RemovedVideoSchema: { collectionName: 'removed-video', schemaInstance: {} } },
		'./schema/VideoVoteSchema.js': { VideoVoteSchema: {} },
		'./schema/VideoCommentSchema.js': { VideoCommentVoteSchema: {} },
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
	assert.equal(calls[0].options.returnDocument, 'after');
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

test('原子设置可取旧记录，首次插入没有旧记录也成功', async () => {
	for (const old of [null, { direction: 'downvote' }]) {
		const { pool, calls } = fixture({ updated: old });
		const result = await pool.findOneAndUpdateData4MongoDB(where, { direction: 'upvote' }, schema, collection, { returnDocument: 'before' });
		assert.equal(result.success, true);
		assert.deepEqual(result.result, old ?? undefined);
		assert.equal(calls[0].options.returnDocument, 'before');
		assert.equal(calls[0].options.upsert, true);
	}
});

test('校准计数的上限与主节点读偏好均传给数据库', async () => {
	const { pool, calls } = fixture();
	await pool.countDataFromMongoDB(where, schema, collection, { readPreference: 'primary', limit: 201 });
	assert.equal(calls[0].options.limit, 201);
	assert.equal(calls[0].options.readPreference, 'primary');
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

test('插入结果返回保存后的字段和字符串 ID', async () => {
	const { pool } = fixture();
	const result = await pool.insertData2MongoDB({ owner: '一号用户' }, schema, collection);
	assert.equal(result.result[0]._id, 'document-1');
	assert.equal(result.result[0].owner, '一号用户');
});

for (const { name, invoke, legacy } of operations) {
	test(name + ' 在事务内读取主节点，普通查询沿用指定的读偏好', async () => {
		const { pool, calls } = fixture();
		const session = {};
		await invoke(pool, { session, readPreference: 'secondary' });
		assert.equal(calls[0].options.session, session);
		assert.equal(calls[0].options.readPreference, 'primary');
		await invoke(pool, { readPreference: 'secondaryPreferred' });
		assert.equal(calls[1].options.readPreference, 'secondaryPreferred');
	});

	test(name + ' 保留既有的失败返回结构和原始错误信息', async () => {
		const failure = new MongoServerError({ message: '模拟数据库异常', code: 112 });
		const { pool } = fixture({ failure });
		await assert.rejects(invoke(pool), error => {
			assert.equal(error.success, false);
			assert.equal(typeof error.message, 'string');
			assert.equal(legacy ? error.error.error : error.error, failure);
			return true;
		});
	});
}
