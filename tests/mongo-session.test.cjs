const test = require('node:test');
const assert = require('node:assert/strict');
const { loadService } = require('./helpers/load-service.cjs');

function fixture() {
	const events = [];
	const errors = {};
	const logs = [];
	const session = {
		active: false, hasEnded: false,
		startTransaction(...options) {
			events.push(['start', ...options]);
			if (errors.start) throw errors.start;
			this.active = true;
		},
		inTransaction() { return this.active; },
		async commitTransaction() {
			events.push(['commit']);
			if (errors.beforeCommit) throw errors.beforeCommit;
			this.active = false;
			if (errors.confirmation) throw errors.confirmation;
		},
		async abortTransaction() {
			events.push(['abort']);
			if (errors.abort) throw errors.abort;
			this.active = false;
		},
		async endSession() {
			this.hasEnded = true;
			events.push(['end']);
			if (errors.end) throw errors.end;
		},
	};
	const tools = loadService('src/common/MongoDBSessionTool.ts', {
		mongoose: { startSession: async () => session },
		'../service/loggingService.js': { logging: (...args) => logs.push(args) },
	});
	return { session, tools, events, errors, logs };
}

test('共通会话无参启动，成功只提交和关闭各一次', async () => {
	const f = fixture();
	assert.equal(await f.tools.createAndStartSession(), f.session);
	assert.equal(await f.tools.commitAndEndSession(f.session), true);
	assert.deepEqual(f.events, [['start'], ['commit'], ['end']]);
});

test('启动出错仍关闭会话，保留原始异常', async () => {
	const f = fixture();
	f.errors.start = new Error('启动失败');
	f.errors.end = new Error('关闭失败');
	await assert.rejects(f.tools.createAndStartSession(), e => e === f.errors.start);
	assert.deepEqual(f.events, [['start'], ['end']]);
	assert.equal(f.logs[0][2], f.errors.end);
});

test('仍活动的事务提交出错时回滚并关闭，清理错误不会覆盖提交错误', async () => {
	const f = fixture();
	await f.tools.createAndStartSession();
	f.errors.beforeCommit = new Error('尚未发出提交');
	f.errors.abort = new Error('回滚失败');
	f.errors.end = new Error('关闭失败');
	await assert.rejects(f.tools.commitAndEndSession(f.session), e => e === f.errors.beforeCommit);
	assert.deepEqual(f.events, [['start'], ['commit'], ['abort'], ['end']]);
	assert.deepEqual(f.logs.map(log => log[2]), [f.errors.end, f.errors.abort]);
});

test('提交确认丢失时关闭会话且保留错误，不再次提交', async () => {
	const f = fixture();
	await f.tools.createAndStartSession();
	f.errors.confirmation = new Error('提交结果不确定');
	f.errors.end = new Error('关闭失败');
	await assert.rejects(f.tools.commitAndEndSession(f.session), e => e === f.errors.confirmation);
	assert.deepEqual(f.events, [['start'], ['commit'], ['end']]);
});

test('数据库确认提交后，关闭错误单独记录', async () => {
	const f = fixture();
	await f.tools.createAndStartSession();
	f.errors.end = new Error('关闭失败');
	assert.equal(await f.tools.commitAndEndSession(f.session), true);
	assert.deepEqual(f.events, [['start'], ['commit'], ['end']]);
	assert.equal(f.logs[0][2], f.errors.end);
});

test('明确回滚活动事务并关闭，重复回滚为空操作', async () => {
	const f = fixture();
	await f.tools.createAndStartSession();
	assert.equal(await f.tools.abortAndEndSession(f.session), true);
	assert.equal(await f.tools.abortAndEndSession(f.session), false);
	assert.deepEqual(f.events, [['start'], ['abort'], ['end']]);
});
