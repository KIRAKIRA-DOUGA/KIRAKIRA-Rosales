const test = require('node:test');
const assert = require('node:assert/strict');
const { loadService } = require('./helpers/load-service.cjs');

// Evaluate the Mongo expressions sent by the real atomic-attempt helper. No database is contacted.
function expression(value, document) {
	if (typeof value === 'string' && value.startsWith('$')) return document[value.slice(1)];
	if (value === null || typeof value !== 'object') return value;
	if (Array.isArray(value)) return value.map(item => expression(item, document));
	const [operator, operands] = Object.entries(value)[0];
	const args = expression(operands, document);
	switch (operator) {
		case '$ifNull': return args[0] ?? args[1];
		case '$cond': return args[0] ? args[1] : args[2];
		case '$lt': return args[0] < args[1];
		case '$gte': return args[0] >= args[1];
		case '$subtract': return args[0] - args[1];
		case '$add': return args[0] + args[1];
		default: throw new Error(`Unexpected expression: ${operator}`);
	}
}

function matches(document, filter) {
	return Object.entries(filter).every(([key, value]) => key === '$expr'
		? expression(value, document)
		: document[key] === value);
}

function fixture() {
	let now = new Date(2026, 10, 10, 12).getTime();
	let random = 0;
	let queries = 0;
	let otpChecks = 0;
	let secondaryAccount;
	const updates = [];
	const data = {};
	const schemas = Object.fromEntries([
		'UserAuthSchema', 'UserTotpAuthenticatorSchema', 'UserInfoSchema', 'UserInvitationCodeSchema',
		'UserSettingsSchema', 'General2FAEmailVerificationCodeSchema', 'GeneralEmailVerificationCodeSchema',
	].map(name => [name, { collectionName: name, schemaInstance: {} }]));
	class Clock extends Date {
		constructor(...args) { super(...(args.length ? args : [now])); }
		static now() { return now; }
	}
	const session = { startTransaction() {}, inTransaction: () => true };
	const mongoose = { models: {}, startSession: async () => session };
	const database = {
		async findOneAndUpdateWithOperators4MongoDB(filter, pipeline, _schema, collection) {
			assert.ok(Array.isArray(pipeline), 'attempt update must reach the shared helper as a pipeline');
			const document = (data[collection] || []).find(item => matches(item, filter));
			if (!document) return { success: false };
			const next = Object.fromEntries(Object.entries(pipeline[0].$set).map(([key, value]) => [key, expression(value, document)]));
			Object.assign(document, next);
			return { success: true, result: { ...document } };
		},
		async selectDataFromMongoDB(where, _select, _schema, collection, options) {
			queries++;
			const rows = collection === 'UserAuthSchema' && secondaryAccount && options?.readPreference !== 'primary' ? [secondaryAccount] : (data[collection] || []);
			return { success: true, result: rows.filter(row => matches(row, where)).map(row => ({ ...row })) };
		},
		async findOneAndUpdateData4MongoDB(where, update, _schema, collection, options, upsert) {
			updates.push({ where, update, collection, options, upsert });
			const document = (data[collection] || []).find(row => matches(row, where));
			if (!document) return { success: false };
			Object.assign(document, update);
			return { success: true, result: { ...document } };
		},
	};
	const attempts = loadService('src/service/UserVerificationAttempts.ts', { '../dbPool/DbClusterPool.js': database }, { Date: Clock });
	const dependencies = {
		'./UserVerificationAttempts.js': attempts,
		mongoose,
		'../cloudflare/index.js': {},
		'../common/EmailTool.js': { isInvalidEmail: () => false, sendMail: async () => ({ success: true }) },
		'../common/HashTool.js': { compareStringSync: (input, hash) => hash === `hashed:${input}`, hashStringSync: input => `hashed:${input}` },
		'../common/ObjectTool.js': { isEmptyObject: value => !Object.keys(value).length },
		'../common/ValidTool.js': { parseInteger: (value, fallback) => Number.parseInt(value, 10) || fallback },
		'../common/RandomTool.js': { generateSecureRandomString: () => `new-secret-${++random}`, generateSecureVerificationNumberCode: () => '654321' },
		'../dbPool/DbClusterPool.js': database,
		'../dbPool/schema/UserSchema.js': schemas,
		'./SequenceValueService.js': {},
		otplib: { authenticator: { check() { otpChecks++; return false; } } },
		'../common/i18n.js': { supportedLanguageList: ['en'], getI18nLanguagePack: () => ({ mailTitle: 'Code', mailHtml: '{{verificationCode}}' }) },
		'../common/MongoDBSessionTool.js': { createAndStartSession: async () => session, abortAndEndSession: async () => {}, commitAndEndSession: async () => {} },
		'../dbPool/schema/FeedSchema.js': {},
		'./BlockService.js': {},
		'../common/DateTool.js': { isToday: time => new Clock(time).toDateString() === new Clock().toDateString() },
		'./loggingService.js': { logging() {} },
	};
	const service = loadService('src/service/UserService.ts', dependencies, { Date: Clock });
	const account = { UUID: 'fixture-uuid', uid: 42, token: 'old-token', userDataBootstrapHint: 'old-hint', email: 'user@example.invalid', emailLowerCase: 'user@example.invalid', passwordHashHash: 'hashed:old-password', authenticatorType: 'none' };
	data.UserAuthSchema = [account];
	return { service, data, account, mongoose, updates, dependencies, simulateReplicaLag: () => { secondaryAccount = { ...account }; }, advance: ms => { now += ms; }, setTime: time => { now = time; }, now: () => now, queries: () => queries, otpChecks: () => otpChecks };
}

test('non-string credentials and non-numeric UIDs never reach an authentication query', async () => {
	const f = fixture();
	for (const invalid of [{ $ne: null }, ['old-token'], 123, true, '', null, undefined]) {
		assert.equal((await f.service.checkUserTokenByUuidService('fixture-uuid', invalid)).success, false);
		assert.equal((await f.service.checkUserTokenByUuidService(invalid, 'old-token')).success, false);
		assert.equal(await f.service.checkUserBootstrapHintByUid(42, invalid), false);
		assert.equal((await f.service.checkUserTokenService(42, invalid)).success, false);
	}
	for (const invalid of [{ $ne: null }, [42], '42', NaN, Infinity, -1, 1.2]) {
		assert.equal(await f.service.checkUserBootstrapHintByUid(invalid, 'old-hint'), false);
		assert.equal((await f.service.checkUserTokenService(invalid, 'old-token')).success, false);
	}
	assert.equal(f.queries(), 0);
	assert.equal((await f.service.checkUserTokenByUuidService('fixture-uuid', 'old-token')).success, true);
	assert.equal(await f.service.checkUserBootstrapHintByUid(42, 'old-hint'), true);
});

for (const [name, collection, identifier] of [
	['GeneralEmailVerifier', 'GeneralEmailVerificationCodeSchema', 'emailLowerCase'],
	['General2FAEmailVerifier', 'General2FAEmailVerificationCodeSchema', 'uuid'],
]) {
	function addCode(f, overrides = {}) {
		const record = { [identifier]: 'fixture@example.invalid', used: false, verificationCode: '123456', verificationCreatedDate: f.now(), totalVerifierTimesToday: 0, ...overrides };
		f.data[collection] = [record];
		return record;
	}
	const attempt = f => new f.service[name]('fixture@example.invalid', '999999').verify({ isResetAttemptsImmediately: true });
	test(`${name}: sequential and concurrent guesses stop after five attempts`, async () => {
		for (const concurrent of [false, true]) {
			const f = fixture();
			const record = addCode(f);
			const results = concurrent
				? await Promise.all(Array.from({ length: 12 }, () => attempt(f)))
				: await Array.from({ length: 12 }).reduce(async (promise) => [...await promise, await attempt(f)], Promise.resolve([]));
			assert.equal(results.filter(result => result.isMaxVerifierTimesToday).length, 7);
			assert.equal(record.totalVerifierTimesToday, 5);
		}
	});
	test(`${name}: an unexpired code crossing midnight resets once, then accumulates`, async () => {
		const f = fixture();
		f.setTime(new Date(2026, 10, 10, 23, 59).getTime());
		const record = addCode(f, { totalVerifierTimesToday: 5 });
		f.advance(2 * 60 * 1000);
		assert.equal((await attempt(f)).isMaxVerifierTimesToday, false);
		assert.equal(record.totalVerifierTimesToday, 1);
		await attempt(f);
		assert.equal(record.totalVerifierTimesToday, 2);
	});
	test(`${name}: success consumes the code and resets attempts`, async () => {
		const f = fixture();
		const record = addCode(f, { totalVerifierTimesToday: 4 });
		const result = await new f.service[name]('fixture@example.invalid', '123456').verify({ isResetAttemptsImmediately: true });
		assert.equal(result.success, true);
		assert.equal(record.used, true);
		assert.equal(record.totalVerifierTimesToday, 0);
	});
}

test('resending an email code preserves the current day attempt count', async () => {
	const f = fixture();
	const record = { emailLowerCase: 'user@example.invalid', verificationCreatedDate: f.now() - 60000, totalCreateTimesToday: 1, totalVerifierTimesToday: 4, lastVerifierAttemptDate: f.now() - 1000 };
	f.data.GeneralEmailVerificationCodeSchema = [record];
	const result = await f.service.sendGeneralEmailVerificationCodeService({ email: 'user@example.invalid', clientLanguage: 'en', mailTemplate: 'test', exclusiveBusinessName: 'forgot-password' });
	assert.equal(result.success, true);
	assert.equal(record.totalVerifierTimesToday, 4);
});

test('resending a 2FA email code preserves the current day attempt count', async () => {
	const f = fixture();
	const record = { uuid: 'fixture-uuid', verificationCreatedDate: f.now() - 60000, totalCreateTimesToday: 1, totalVerifierTimesToday: 4, lastVerifierAttemptDate: f.now() - 1000 };
	f.data.General2FAEmailVerificationCodeSchema = [record];
	const result = await f.service.sendGeneral2FAEmailVerificationCodeService({ clientLanguage: 'en', mailTemplate: 'test', exclusiveBusinessName: 'update-password' }, 'fixture-uuid', 'old-token');
	assert.equal(result.success, true);
	assert.equal(record.totalVerifierTimesToday, 4);
});

test('TOTP concurrent guesses stop at five and resume after the cooldown', async () => {
	const f = fixture();
	const record = { UUID: 'fixture-uuid', enabled: true, attempts: 0, lastAttemptTime: f.now(), backupCodeHash: [], secret: 'fixture' };
	f.data.UserTotpAuthenticatorSchema = [record];
	const attempt = () => new f.service.General2FATotpVerifier('fixture-uuid', '999999').verify({ isResetAttemptsImmediately: true, isAllowBackupCode: true, isAllowRecoveryCodeAndDeleteTotp: true });
	const results = await Promise.all(Array.from({ length: 12 }, attempt));
	assert.equal(results.filter(result => result.isMaxAttemptsReachedWithinTime).length, 7);
	assert.equal(f.otpChecks(), 5);
	const lockStarted = record.lastAttemptTime;
	f.advance(29 * 60 * 1000);
	assert.equal((await attempt()).isMaxAttemptsReachedWithinTime, true);
	assert.equal(record.lastAttemptTime, lockStarted);
	f.advance(60 * 1000);
	assert.equal((await attempt()).isMaxAttemptsReachedWithinTime, false);
	assert.equal(record.attempts, 1);
	assert.equal(f.otpChecks(), 6);
});

test('logout revokes both credentials, and a stale token cannot revoke the replacement', async () => {
	const f = fixture();
	assert.equal((await f.service.userLogoutService('fixture-uuid', 'old-token')).success, true);
	assert.equal(f.updates[0].upsert, false);
	assert.notEqual(f.account.token, 'old-token');
	assert.notEqual(f.account.userDataBootstrapHint, 'old-hint');
	assert.equal((await f.service.checkUserTokenByUuidService('fixture-uuid', 'old-token')).success, false);
	assert.equal(await f.service.checkUserBootstrapHintByUid(42, 'old-hint'), false);
	const replacement = f.account.token;
	assert.equal((await f.service.userLogoutService('fixture-uuid', 'old-token')).success, true);
	assert.equal(f.account.token, replacement);
});

test('logout does not report success if credential revocation fails', async () => {
	const f = fixture();
	f.dependencies['../dbPool/DbClusterPool.js'].findOneAndUpdateData4MongoDB = async () => { throw new Error('storage unavailable'); };
	assert.equal((await f.service.userLogoutService('fixture-uuid', 'old-token')).success, false);
	assert.equal(f.account.token, 'old-token');
});

test('replication lag cannot authenticate revoked credentials or return them on a new login', async () => {
	const f = fixture();
	f.simulateReplicaLag();
	await f.service.userLogoutService('fixture-uuid', 'old-token');
	assert.equal((await f.service.checkUserTokenService(42, 'old-token')).success, false);
	assert.equal((await f.service.checkUserTokenByUuidService('fixture-uuid', 'old-token')).success, false);
	assert.equal(await f.service.checkUserBootstrapHintByUid(42, 'old-hint'), false);
	const login = await f.service.userLoginService({ email: 'user@example.invalid', passwordHash: 'old-password' });
	assert.equal(login.success, true);
	assert.equal(login.token, f.account.token);
	assert.equal(login.userDataBootstrapHint, f.account.userDataBootstrapHint);
});

test('logout controller keeps cookies available when revocation fails, then clears them after a successful retry', async () => {
	let succeeds = false;
	const controller = loadService('src/controller/UserController.ts', {
		'../common/i18n.js': {},
		'../common/UrlTool.js': { getCorrectCookieDomain: () => 'example.invalid' },
		'../common/ValidTool.js': {},
		'../service/RbacService.js': {},
		'../service/UserService.js': { userLogoutService: async () => ({ success: succeeds, message: succeeds ? '登出成功' : '请重试' }) },
	});
	const cleared = [];
	const ctx = { cookies: { get: name => ({ uuid: 'fixture-uuid', token: 'old-token' })[name], set: name => cleared.push(name) } };
	await controller.userLogoutController(ctx, async () => {});
	assert.equal(ctx.body.success, false);
	assert.deepEqual(cleared, []);
	succeeds = true;
	await controller.userLogoutController(ctx, async () => {});
	assert.equal(ctx.body.success, true);
	assert.ok(cleared.includes('token') && cleared.includes('uuid') && cleared.includes('user-data-bootstrap-hint'));
});

for (const operation of ['changePasswordService', 'forgotPasswordService']) {
	test(`${operation}: credentials rotate in the same password update`, async () => {
		const f = fixture();
		// These cases isolate session revocation after successful verification; verifier behavior is tested above.
		f.service.General2FAVerifier.prototype.verify = async () => ({ success: true });
		f.service.GeneralEmailVerifier.prototype.verify = async () => ({ success: true });
		const result = await f.service[operation]({ oldPasswordHash: 'old-password', newPasswordHash: 'new-password', verificationCode: '123456', email: 'user@example.invalid' }, 'fixture-uuid', 'old-token');
		assert.equal(result.success, true);
		assert.equal(f.account.passwordHashHash, 'hashed:new-password');
		assert.notEqual(f.account.token, 'old-token');
		assert.notEqual(f.account.userDataBootstrapHint, 'old-hint');
		const write = f.updates.find(update => update.collection === 'UserAuthSchema');
		assert.ok(write.options.session);
		assert.equal(write.upsert, false);
		assert.ok(write.update.passwordHashHash && write.update.token && write.update.userDataBootstrapHint);
		assert.equal((await f.service.checkUserTokenByUuidService('fixture-uuid', 'old-token')).success, false);
		assert.equal(await f.service.checkUserBootstrapHintByUid(42, 'old-hint'), false);
	});
}

test('a rejected password change does not revoke credentials', async () => {
	const f = fixture();
	f.service.General2FAVerifier.prototype.verify = async () => ({ success: true });
	const result = await f.service.changePasswordService({ oldPasswordHash: 'incorrect', newPasswordHash: 'new-password', verificationCode: '123456' }, 'fixture-uuid', 'old-token');
	assert.equal(result.success, false);
	assert.equal(f.account.token, 'old-token');
	assert.equal(f.account.userDataBootstrapHint, 'old-hint');
	assert.equal(f.updates.length, 0);
});
