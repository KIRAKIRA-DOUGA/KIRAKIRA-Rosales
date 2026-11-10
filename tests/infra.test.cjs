const assert = require('node:assert/strict');
const { test } = require('node:test');
const { MongoClient, ReadPreferenceMode } = require('mongodb');
const { loadService } = require('./helpers/load-service.cjs');

const nextTurn = () => new Promise(resolve => setImmediate(resolve));

function loadLogging(insertData2MongoDB, env = { SERVER_ENV: 'prod', LOG_LEVEL: 'error' }) {
	const errors = [];
	const service = loadService('src/service/loggingService.ts', {
		'../dbPool/schema/LoggingSchema.js': { LogSchema: { collectionName: 'logs', schemaInstance: {} } },
		'../dbPool/DbClusterPool.js': { insertData2MongoDB },
	}, {
		process: { env },
		console: { error(...args) { errors.push(args); }, warn() {}, info() {} },
	});
	return { ...service, errors };
}

function loadPool(mongoose, env = {}, logging = () => {}) {
	return loadService('src/dbPool/DbClusterPool.ts', {
		mongodb: { ReadPreferenceMode },
		mongoose,
		'./schema/SequenceSchema.js': { SequenceValueSchema: {} },
		'./schema/UserSchema.js': {
			UserInfoSchema: { collectionName: 'users', schemaInstance: {} },
			UserTotpAuthenticatorSchema: { collectionName: 'totp', schemaInstance: {} },
		},
		'../service/loggingService.js': { logging },
	}, { process: { env, exit(code) { throw new Error(`Unexpected exit: ${code}`); } } });
}

test('failed log persistence is handled without retrying or terminating the process', async () => {
	const failure = new Error('simulated database outage');
	let writes = 0;
	const { logging, errors } = loadLogging(async () => {
		writes++;
		throw failure;
	});
	assert.equal(logging('ERROR', 'business failure'), undefined);
	await nextTurn();
	assert.equal(writes, 1);
	assert.equal(errors.length, 2);
	assert.equal(errors[1][2], failure);
});

test('successful log persistence and explicitly disabled persistence retain their behavior', async () => {
	let writes = 0;
	const { logging, errors } = loadLogging(async () => { writes++; });
	logging('ERROR', 'persist this error');
	logging('ERROR', 'console only', undefined, undefined, { recordingLogs: false });
	await nextTurn();
	assert.equal(writes, 1);
	assert.equal(errors.length, 2);
	const dev = loadLogging(async () => { writes++; }, { SERVER_ENV: 'dev', LOG_LEVEL: 'error' });
	dev.logging('ERROR', 'development error');
	await nextTurn();
	assert.equal(writes, 1);
});

test('index creation failures are handled without recursively persisting another log', async () => {
	const failure = new Error('index creation unavailable');
	let saves = 0;
	const indexErrors = [];
	class Model {
		static async createIndexes() { throw failure; }
		async save() { saves++; }
	}
	const pool = loadPool({ models: { logs: Model } }, {}, (...args) => indexErrors.push(args));
	const { logging, errors } = loadLogging(pool.insertData2MongoDB);
	logging('ERROR', 'persist during database outage');
	await nextTurn();
	assert.equal(saves, 1);
	assert.equal(errors.length, 1);
	assert.equal(indexErrors.length, 1);
	assert.equal(indexErrors[0][2], failure);
	assert.equal(indexErrors[0][4].recordingLogs, false);
});

test('background index creation does not block an existing transaction document save', async () => {
	let releaseIndexes;
	const indexes = new Promise(resolve => { releaseIndexes = resolve; });
	const session = {};
	let savedWithSession;
	class Model {
		static createIndexes() { return indexes; }
		async save(options) { savedWithSession = options.session; return {}; }
	}
	const pool = loadPool({ models: { logs: Model } });
	const insert = pool.insertData2MongoDB({}, {}, 'logs', { session });
	try {
		await nextTurn();
		assert.equal(savedWithSession, session);
	} finally {
		releaseIndexes();
		await insert;
	}
});

test('document save failures reach the log persistence rejection handler', async () => {
	const failure = new Error('save unavailable');
	class Model {
		static async createIndexes() {}
		async save() { throw failure; }
	}
	const pool = loadPool({ models: { logs: Model } });
	const { logging, errors } = loadLogging(pool.insertData2MongoDB);
	logging('ERROR', 'persist during database outage');
	await nextTurn();
	assert.equal(errors.length, 2);
	assert.equal(errors[1][2].error.error, failure);
});

test('Elasticsearch connections require a trusted server certificate', async () => {
	let options;
	class Client {
		constructor(value) { options = value; }
		async ping() {}
		async info() { return { version: {} }; }
	}
	const { connectElasticSearchCluster } = loadService('src/elasticsearchPool/ElasticsearchClusterPool.ts', {
		'@elastic/elasticsearch': { Client },
		'../common/ObjectTool.js': { isEmptyObject: value => !Object.keys(value).length },
		'../service/loggingService.js': { logging() {} },
	}, {
		process: {
			env: {
				ELASTICSEARCH_CLUSTER_HOST: 'search.example.invalid:9200',
				ELASTICSEARCH_ADMIN_USERNAME: 'audit',
				ELASTICSEARCH_ADMIN_PASSWORD: 'placeholder',
			},
			exit(code) { throw new Error(`Unexpected exit: ${code}`); },
		},
	});
	await connectElasticSearchCluster();
	assert.equal(options.tls.rejectUnauthorized, true);
	assert.equal(options.node[0], 'https://search.example.invalid:9200');
});

async function captureMongoConnection(extraEnv = {}) {
	let connection;
	const { connectMongoDBCluster } = loadPool({
		set() {},
		model() {},
		async connect(uri, options) { connection = { uri, options }; },
	}, {
		MONGODB_PROTOCOL: 'mongodb+srv',
		MONGODB_CLUSTER_HOST: 'db.example.invalid',
		MONGODB_NAME: 'audit',
		MONGODB_USERNAME: 'audit',
		MONGODB_PASSWORD: 'placeholder',
		...extraEnv,
	});
	await connectMongoDBCluster();
	return connection;
}

test('MongoDB SRV without custom CA retains TLS certificate validation', async () => {
	const { uri, options } = await captureMongoConnection();
	// Constructing a client parses driver options without opening a connection.
	const client = new MongoClient(uri, options);
	assert.equal(client.options.tls, true);
	assert.equal(client.options.rejectUnauthorized, true);
});

test('MongoDB custom CA and client certificate configuration is preserved', async () => {
	const encode = value => Buffer.from(value).toString('base64');
	const { uri, options } = await captureMongoConnection({
		MONGODB_TLS_CA_BASE64: encode('custom CA'),
		MONGODB_TLS_CERT_BASE64: encode('client certificate'),
		MONGODB_TLS_KEY_BASE64: encode('client key'),
	});
	assert.equal(options.tls, true);
	assert.equal(options.ca, 'custom CA');
	assert.equal(options.cert, 'client certificate');
	assert.equal(options.key, 'client key');
	assert.equal(new MongoClient(uri, options).options.rejectUnauthorized, true);
});

test('the existing non-SRV transport configuration is preserved', async () => {
	const { uri, options } = await captureMongoConnection({ MONGODB_PROTOCOL: 'mongodb' });
	const client = new MongoClient(uri, options);
	assert.equal(client.options.tls, undefined);
	assert.equal(client.options.rejectUnauthorized, true);
});
