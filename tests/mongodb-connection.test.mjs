import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MongoClient } from 'mongodb'
import { buildMongoDBConnectionConfig, MongoDBConfigurationError } from '../dist/dbPool/MongoDBConnectionConfig.js'

const legacy = { MONGODB_CLUSTER_HOST: 'db-0.example.com:27017,db-1.example.com:27017', MONGODB_NAME: 'appdb', MONGODB_USERNAME: 'app', MONGODB_PASSWORD: 'secret' }
const certificate = Buffer.from('test certificate').toString('base64')

function clientOptions(env) {
	const { uri, options } = buildMongoDBConnectionConfig(env)
	return new MongoClient(uri, options).options
}

test('legacy hosts discover a replica set and preserve raw special-character credentials', () => {
	const options = clientOptions({ ...legacy, MONGODB_USERNAME: 'user@:/?', MONGODB_PASSWORD: 'p@ss:/?#%&' })
	assert.equal(options.hosts.length, 2)
	assert.equal(options.dbName, 'appdb')
	assert.equal(options.credentials.username, 'user@:/?')
	assert.equal(options.credentials.password, 'p@ss:/?#%&')
	assert.equal(options.credentials.source, 'admin')
	assert.equal(options.directConnection, false)
	assert.equal(options.readPreference.mode, 'secondaryPreferred')
	assert.notEqual(options.tls, true)
})

test('SRV without TLS uses one seed name and separate Secret credentials', () => {
	const options = clientOptions({ ...legacy, MONGODB_URI: 'mongodb+srv://db.example.com/appdb?tls=false&replicaSet=rs0&authSource=admin' })
	assert.equal(options.srvHost, 'db.example.com')
	assert.equal(options.tls, false)
	assert.equal(options.replicaSet, 'rs0')
	assert.equal(options.credentials.password, 'secret')
	assert.equal(options.directConnection, false)
})

test('URI controls database, credentials, read preference and driver tuning', () => {
	const options = clientOptions({ ...legacy, MONGODB_URI: 'mongodb://uriuser:p%40ss@db.example.com/newdb?authSource=users&readPreference=primary&maxPoolSize=12&retryWrites=false' })
	assert.equal(options.dbName, 'newdb')
	assert.equal(options.credentials.username, 'uriuser')
	assert.equal(options.credentials.password, 'p@ss')
	assert.equal(options.credentials.source, 'users')
	assert.equal(options.readPreference.mode, 'primary')
	assert.equal(options.maxPoolSize, 12)
	assert.equal(options.retryWrites, false)
})

test('local standalone without authentication is supported', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://127.0.0.1:27017/appdb?directConnection=true' })
	assert.equal(options.credentials, undefined)
	assert.equal(options.directConnection, true)
})

test('SRV defaults to verified TLS without requiring a custom CA', () => {
	for (const env of [{ MONGODB_URI: 'mongodb+srv://db.example.com/appdb' }, { ...legacy, MONGODB_PROTOCOL: 'mongodb+srv', MONGODB_CLUSTER_HOST: 'db.example.com' }]) {
		const options = clientOptions(env)
		assert.equal(options.tls, true)
		assert.notEqual(options.tlsAllowInvalidCertificates, true)
		assert.notEqual(options.tlsAllowInvalidHostnames, true)
	}
})

test('standard URI can use verified TLS with only a custom CA', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=true', MONGODB_TLS_CA_BASE64: certificate })
	assert.equal(options.tls, true)
	assert.equal(options.ca.toString(), 'test certificate')
	assert.equal(options.cert, undefined)
})

test('legacy Base64 CA, certificate and key still enable TLS', () => {
	const options = clientOptions({ ...legacy, MONGODB_TLS_CA_BASE64: certificate, MONGODB_TLS_CERT_BASE64: certificate, MONGODB_TLS_KEY_BASE64: certificate })
	assert.equal(options.tls, true)
	assert.equal(options.ca.toString(), 'test certificate')
	assert.equal(options.cert.toString(), 'test certificate')
	assert.equal(options.key.toString(), 'test certificate')
	assert.notEqual(options.tlsAllowInvalidCertificates, true)
})

test('mounted certificate files and encrypted client keys are supported', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb+srv://db.example.com/appdb', MONGODB_TLS_CA_FILE: '/run/mongodb/ca.pem', MONGODB_TLS_CERTIFICATE_KEY_FILE: '/run/mongodb/client.pem', MONGODB_TLS_CERTIFICATE_KEY_PASSWORD: 'key-password' })
	assert.equal(options.tlsCAFile, '/run/mongodb/ca.pem')
	assert.equal(options.tlsCertificateKeyFile, '/run/mongodb/client.pem')
	assert.equal(options.passphrase, 'key-password')
})

test('X.509 authentication can omit username and password', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=true&authMechanism=MONGODB-X509&authSource=%24external', MONGODB_TLS_CERTIFICATE_KEY_FILE: '/run/mongodb/client.pem' })
	assert.equal(options.credentials.mechanism, 'MONGODB-X509')
	assert.equal(options.credentials.source, '$external')
})

test('X.509 authentication accepts a separate certificate subject', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=true&authMechanism=MONGODB-X509&authSource=%24external', MONGODB_USERNAME: 'CN=app', MONGODB_TLS_CERTIFICATE_KEY_FILE: '/run/mongodb/client.pem' })
	assert.equal(options.credentials.username, 'CN=app')
})

test('URI certificate file options work without custom environment variables', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=true&tlsCAFile=%2Frun%2Fca.pem&tlsCertificateKeyFile=%2Frun%2Fclient.pem' })
	assert.equal(options.tlsCAFile, '/run/ca.pem')
	assert.equal(options.tlsCertificateKeyFile, '/run/client.pem')
})

test('configuration errors identify variables without echoing secrets', () => {
	const invalid = [
		{},
		{ ...legacy, MONGODB_PROTOCOL: 'invalid' },
		{ ...legacy, MONGODB_NAME: '' },
		{ ...legacy, MONGODB_CLUSTER_HOST: 'db.example.com/?tls=false' },
		{ ...legacy, MONGODB_PROTOCOL: 'mongodb+srv' },
		{ MONGODB_URI: 'http://user:private-value@example.com/appdb' },
		{ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=private-value' },
		{ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=false&ssl=true' },
		{ ...legacy, MONGODB_PASSWORD: undefined },
		{ ...legacy, MONGODB_TLS_CA_BASE64: 'private-value' },
		{ ...legacy, MONGODB_TLS_CERT_BASE64: certificate },
		{ ...legacy, MONGODB_TLS_KEY_BASE64: certificate },
		{ ...legacy, MONGODB_TLS_CA_FILE: '/run/ca.pem', MONGODB_TLS_CA_BASE64: certificate },
		{ ...legacy, MONGODB_TLS_CERT_BASE64: certificate, MONGODB_TLS_KEY_BASE64: certificate, MONGODB_TLS_CERTIFICATE_KEY_FILE: '/run/client.pem' },
		{ ...legacy, MONGODB_TLS_CERTIFICATE_KEY_PASSWORD: 'private-value' },
		{ MONGODB_URI: 'mongodb+srv://db.example.com/appdb?tls=false', MONGODB_TLS_CA_FILE: '/run/ca.pem' },
		{ MONGODB_URI: 'mongodb://db.example.com/appdb?ssl=false&tlsCAFile=%2Frun%2Fca.pem' },
		{ MONGODB_URI: 'mongodb://db.example.com/appdb?tlsCAFile=%2Frun%2Fca.pem', MONGODB_TLS_CA_FILE: '/run/other.pem' },
	]
	for (const env of invalid) assert.throws(() => buildMongoDBConnectionConfig(env), error => error instanceof MongoDBConfigurationError && !error.message.includes('private-value'))
})

test('URI validation errors are left to the driver and do not require network access', () => {
	assert.throws(() => clientOptions({ MONGODB_URI: 'mongodb+srv://db.example.com:27017/appdb' }))
	assert.throws(() => clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?unknownOption=true' }))
})
