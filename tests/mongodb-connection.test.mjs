import assert from 'node:assert/strict'
import { test } from 'node:test'
import { MongoClient } from 'mongodb'
import { buildMongoDBConnectionConfig, MongoDBConfigurationError } from '../dist/dbPool/MongoDBConnectionConfig.js'

const connection = { MONGODB_URI: 'mongodb://db-0.example.com:27017,db-1.example.com:27017/appdb?authSource=admin', MONGODB_USERNAME: 'app', MONGODB_PASSWORD: 'secret' }
const certificate = Buffer.from('test certificate').toString('base64')

function clientOptions(env) {
	const { uri, options } = buildMongoDBConnectionConfig(env)
	return new MongoClient(uri, options).options
}

test('standard URI supports multiple seeds and raw separate credentials', () => {
	const options = clientOptions({ ...connection, MONGODB_USERNAME: 'user@:/?', MONGODB_PASSWORD: 'p@ss:/?#%&' })
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
	const options = clientOptions({ ...connection, MONGODB_URI: 'mongodb+srv://db.example.com/appdb?tls=false&replicaSet=rs0&authSource=admin' })
	assert.equal(options.srvHost, 'db.example.com')
	assert.equal(options.tls, false)
	assert.equal(options.replicaSet, 'rs0')
	assert.equal(options.credentials.password, 'secret')
	assert.equal(options.directConnection, false)
})

test('URI controls database, credentials, read preference and driver tuning', () => {
	const options = clientOptions({ ...connection, MONGODB_URI: 'mongodb://uriuser:p%40ss@db.example.com/newdb?authSource=users&readPreference=primary&maxPoolSize=12&retryWrites=false' })
	assert.equal(options.dbName, 'newdb')
	assert.equal(options.credentials.username, 'uriuser')
	assert.equal(options.credentials.password, 'p@ss')
	assert.equal(options.credentials.source, 'users')
	assert.equal(options.readPreference.mode, 'primary')
	assert.equal(options.maxPoolSize, 12)
	assert.equal(options.retryWrites, false)
})

test('URI credentials ignore separate credentials as a pair, including incomplete values', () => {
	for (const credentials of [
		{ MONGODB_USERNAME: '', MONGODB_PASSWORD: 'ignored' },
		{ MONGODB_USERNAME: 'ignored' },
		{ MONGODB_PASSWORD: 'ignored' },
	]) {
		const env = { MONGODB_URI: 'mongodb://uriuser:p%40ss@db.example.com/appdb', ...credentials }
		assert.equal(buildMongoDBConnectionConfig(env).options.auth, undefined)
		const options = clientOptions(env)
		assert.equal(options.credentials.username, 'uriuser')
		assert.equal(options.credentials.password, 'p@ss')
	}
})

test('an empty URI password is not filled from the separate password', () => {
	const options = clientOptions({ ...connection, MONGODB_URI: 'mongodb://uriuser:@db.example.com/appdb' })
	assert.equal(options.credentials.username, 'uriuser')
	assert.equal(options.credentials.password, '')
})

test('separate credentials preserve an explicitly empty password', () => {
	const options = clientOptions({ ...connection, MONGODB_PASSWORD: '' })
	assert.equal(options.credentials.password, '')
})

test('a complete URI is required even when retired address variables are present', () => {
	const retired = { MONGODB_PROTOCOL: 'mongodb', MONGODB_CLUSTER_HOST: 'old.example.com:27017', MONGODB_NAME: 'olddb' }
	for (const MONGODB_URI of [undefined, '', '  ']) {
		assert.throws(() => buildMongoDBConnectionConfig({ ...retired, MONGODB_URI }), { name: 'MongoDBConfigurationError', message: '缺少 MONGODB_URI' })
	}
	const options = clientOptions({ ...retired, ...connection })
	assert.equal(options.dbName, 'appdb')
	assert.equal(options.hosts[0].host, 'db-0.example.com')
})

test('local standalone without authentication is supported', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://127.0.0.1:27017/appdb?directConnection=true' })
	assert.equal(options.credentials, undefined)
	assert.equal(options.directConnection, true)
})

test('SRV defaults to verified TLS without requiring a custom CA', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb+srv://db.example.com/appdb' })
	assert.equal(options.tls, true)
	assert.notEqual(options.tlsAllowInvalidCertificates, true)
	assert.notEqual(options.tlsAllowInvalidHostnames, true)
})

test('standard URI can use verified TLS with only a custom CA', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=true', MONGODB_TLS_CA_BASE64: certificate })
	assert.equal(options.tls, true)
	assert.equal(options.ca.toString(), 'test certificate')
	assert.equal(options.cert, undefined)
})

test('Base64 CA, certificate and key enable TLS using decoded text only', () => {
	const options = clientOptions({ ...connection, MONGODB_TLS_CA_BASE64: certificate, MONGODB_TLS_CERT_BASE64: certificate, MONGODB_TLS_KEY_BASE64: certificate })
	assert.equal(options.tls, true)
	assert.equal(options.ca, 'test certificate')
	assert.equal(options.cert, 'test certificate')
	assert.equal(options.key, 'test certificate')
	assert.equal(options.tlsCAFile, undefined)
	assert.equal(options.tlsCertificateKeyFile, undefined)
	assert.equal(options.tlsCRLFile, undefined)
	assert.equal(options.passphrase, undefined)
	assert.notEqual(options.tlsAllowInvalidCertificates, true)
})

test('Base64 decoding preserves multiline PEM content', () => {
	const pem = '-----BEGIN CERTIFICATE-----\nZXhhbXBsZQ==\n-----END CERTIFICATE-----\n'
	const base64 = Buffer.from(pem).toString('base64')
	for (const value of [base64, base64.replace(/=+$/, ''), `\n ${base64.slice(0, 20)}\n${base64.slice(20)} `]) {
		const options = clientOptions({ ...connection, MONGODB_TLS_CA_BASE64: value })
		assert.equal(options.ca, pem)
	}
})

test('retired certificate file environment variables are not passed to the driver', () => {
	const options = clientOptions({ ...connection, MONGODB_TLS_CA_FILE: '/private/ca.pem', MONGODB_TLS_CERTIFICATE_KEY_FILE: '/private/client.pem', MONGODB_TLS_CERTIFICATE_KEY_PASSWORD: 'ignored' })
	assert.equal(options.tlsCAFile, undefined)
	assert.equal(options.tlsCertificateKeyFile, undefined)
	assert.equal(options.passphrase, undefined)
	assert.notEqual(options.tls, true)
})

test('X.509 authentication can omit username and password', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=true&authMechanism=MONGODB-X509&authSource=%24external', MONGODB_TLS_CERT_BASE64: certificate, MONGODB_TLS_KEY_BASE64: certificate })
	assert.equal(options.credentials.mechanism, 'MONGODB-X509')
	assert.equal(options.credentials.source, '$external')
})

test('X.509 authentication accepts a separate certificate subject', () => {
	const options = clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=true&authMechanism=MONGODB-X509&authSource=%24external', MONGODB_USERNAME: 'CN=app', MONGODB_TLS_CERT_BASE64: certificate, MONGODB_TLS_KEY_BASE64: certificate })
	assert.equal(options.credentials.username, 'CN=app')
})

test('URI TLS file options are rejected before the driver can read a file', () => {
	for (const name of ['tlsCAFile', 'TLSCAFILE', 'tls%43AFile', 'tlsCertificateKeyFile', 'tlsCertificateKeyFilePassword', 'tlsCRLFile']) {
		for (const value of ['', '%2Fprivate-value%2Fcert.pem']) {
			const MONGODB_URI = `mongodb://uriuser:private-value@db.example.com/appdb?${name}=${value}`
			assert.throws(() => buildMongoDBConnectionConfig({ MONGODB_URI }), error => error instanceof MongoDBConfigurationError && !error.message.includes('private-value'))
		}
	}
})

test('disabling TLS rejects Base64 certificate material for both URI schemes and aliases', () => {
	for (const scheme of ['mongodb', 'mongodb+srv']) {
		for (const flag of ['tls=false', 'ssl=false', 'TLS=false&ssl=false']) {
			for (const material of [{ MONGODB_TLS_CA_BASE64: certificate }, { MONGODB_TLS_CERT_BASE64: certificate, MONGODB_TLS_KEY_BASE64: certificate }]) {
				assert.throws(() => buildMongoDBConnectionConfig({ MONGODB_URI: `${scheme}://db.example.com/appdb?${flag}`, ...material }), /tls=false/)
			}
		}
	}
})

test('configuration errors identify variables without echoing secrets', () => {
	const invalid = [
		{},
		{ MONGODB_URI: 'http://user:private-value@example.com/appdb' },
		{ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=private-value' },
		{ MONGODB_URI: 'mongodb://db.example.com/appdb?tls=false&ssl=true' },
		{ ...connection, MONGODB_PASSWORD: undefined },
		{ ...connection, MONGODB_USERNAME: '' },
		{ ...connection, MONGODB_TLS_CA_BASE64: 'private-value' },
		{ ...connection, MONGODB_TLS_CA_BASE64: '   ' },
		{ ...connection, MONGODB_TLS_CA_BASE64: 'A' },
		{ ...connection, MONGODB_TLS_CA_BASE64: 'AB==' },
		{ ...connection, MONGODB_TLS_CERT_BASE64: certificate },
		{ ...connection, MONGODB_TLS_KEY_BASE64: certificate },
	]
	for (const env of invalid) assert.throws(() => buildMongoDBConnectionConfig(env), error => error instanceof MongoDBConfigurationError && !error.message.includes('private-value'))
})

test('URI validation errors are left to the driver and do not require network access', () => {
	assert.throws(() => clientOptions({ MONGODB_URI: 'mongodb+srv://db.example.com:27017/appdb' }))
	assert.throws(() => clientOptions({ MONGODB_URI: 'mongodb://db.example.com/appdb?unknownOption=true' }))
})
