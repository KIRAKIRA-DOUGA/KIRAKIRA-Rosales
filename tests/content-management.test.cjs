// Run with: node --test tests/content-management.test.cjs
// Load the real TypeScript services with in-memory dependencies. No database or
// search connection is opened, and archive validation uses the real schema.
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const mongoose = require('mongoose')

function loadModule(relativePath, dependencies) {
	const filename = path.resolve(__dirname, '..', relativePath)
	const source = fs.readFileSync(filename, 'utf8')
	const compiled = ts.transpileModule(source, {
		compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
	}).outputText
	const module = { exports: {} }
	vm.runInNewContext(compiled, {
		module, exports: module.exports,
		require: name => dependencies[name] || {},
	}, { filename })
	return module.exports
}

const schemas = loadModule('src/dbPool/schema/VideoSchema.ts', { mongoose })
const Archive = mongoose.model('ContentManagementTestArchive', schemas.RemovedVideoSchema.schemaInstance)
const ownerUuid = 'video-owner'
const originalVideo = {
	videoId: 1, title: 'Video', videoPart: [{ id: 0, videoPartTitle: 'Part', link: 'video', editDateTime: 1 }],
	image: 'cover', uploadDate: 1, watchedCount: 0, uploaderId: 7, uploaderUUID: ownerUuid,
	duration: 3000, description: 'Description', videoCategory: 'anime', copyright: 'reupload',
	originalAuthor: 'Original author', originalLink: 'https://example.com/original',
	pushToFeed: false, ensureOriginal: false, videoTagList: [], pendingReview: true, editDateTime: 1,
}
const editRequest = {
	videoId: 1, title: 'Updated', image: 'cover', description: 'Updated description',
	videoCategory: 'anime', copyright: 'original', pushToFeed: false, ensureOriginal: true, videoTagList: [],
}

function setup(failure) {
	const calls = []
	const state = { calls }
	const session = {
		hasEnded: false, active: false,
		startTransaction() { calls.push('start'); this.active = true },
		inTransaction() { return this.active },
		async commitTransaction() {
			calls.push('commit')
			if (failure === 'commit') throw new Error('commit failed')
			this.active = false
		},
		async abortTransaction() {
			calls.push('abort')
			if (failure === 'abort') throw new Error('abort failed')
			this.active = false
		},
		async endSession() { calls.push('end'); this.hasEnded = true },
	}
	const sessions = loadModule('src/common/MongoDBSessionTool.ts', {
		mongoose: { startSession: async () => session },
	})
	const dependencies = {
		'../common/ObjectTool.js': { isEmptyObject: value => Object.keys(value).length === 0 },
		'../common/MongoDBSessionTool.js': sessions,
		'../dbPool/schema/VideoSchema.js': schemas,
		'../elasticsearchPool/template/VideoDocument.js': { VideoDocument: { indexName: 'video-index', schema: { title: String } } },
		'./loggingService.js': { logging: () => {} },
		'./UserService.js': {
			checkUserTokenService: async (_uid, token) => ({ success: token === 'valid' }),
			checkUserTokenByUuidService: async (_uuid, token) => ({ success: token === 'valid' }),
			getUserUuid: async () => 'admin',
			getUserUid: async uuid => uuid === ownerUuid ? 7 : 8,
		},
		'../dbPool/DbClusterPool.js': {
			selectDataFromMongoDB: async (where, projection, _schema, _collection, options) => {
				calls.push('read')
				assert.equal(options.session, session)
				assert.equal(Object.keys(projection).length, 0, 'archive must read all fields')
				state.readWhere = { ...where }
				if (failure === 'read') throw new Error('read failed')
				const matches = where.videoId === originalVideo.videoId && (!where.uploaderUUID || where.uploaderUUID === ownerUuid)
				return { success: true, result: matches ? [originalVideo] : [] }
			},
			insertData2MongoDB: async (data, _schema, _collection, options) => {
				calls.push('archive')
				assert.equal(options.session, session)
				assert.equal(new Archive(data).validateSync(), undefined)
				state.archive = data
				if (failure === 'archive') throw new Error('archive failed')
				return { success: true }
			},
			deleteOneDataFromMongoDB: async (where, _schema, _collection, options) => {
				calls.push('delete')
				assert.equal(options.session, session)
				state.deleteWhere = { ...where }
				if (failure === 'delete') throw new Error('delete failed')
				return { success: true, result: { deletedCount: failure === 'no-delete' ? 0 : 1 } }
			},
			findOneAndUpdateData4MongoDB: async (where, _data, _schema, _collection, options, upsert) => {
				calls.push('update')
				assert.equal(options.session, session)
				assert.equal(upsert, false)
				assert.equal(where.uploaderUUID, ownerUuid)
				if (failure === 'update') throw new Error('update failed')
				return { success: failure !== 'not-found', result: failure === 'not-found' ? undefined : originalVideo }
			},
		},
		'../elasticsearchPool/ElasticsearchClusterPool.js': {
			deleteDataFromElasticsearchCluster: async (_client, _index, conditions) => {
				calls.push('search-delete')
				assert.equal(conditions.kvid, 1)
				return failure !== 'search'
			},
			updateData4ElasticsearchCluster: async () => {
				calls.push('search-update')
				return { success: failure !== 'search' }
			},
		},
	}
	return { ...state, state, session, sessions, services: loadModule('src/service/VideoService.ts', dependencies), client: { ready: true } }
}

test('owner deletion preserves the complete archive and uses ownership in both database queries', async () => {
	const { services, client, state, session } = setup()
	const result = await services.deleteSelfVideoService({ videoId: 1 }, ownerUuid, 'valid', client)
	assert.equal(result.success, true)
	assert.deepEqual(state.readWhere, { videoId: 1, uploaderUUID: ownerUuid })
	assert.deepEqual(state.deleteWhere, state.readWhere)
	assert.equal(state.archive.uploaderUUID, ownerUuid)
	assert.equal(state.archive.originalAuthor, originalVideo.originalAuthor)
	assert.equal(state.archive.originalLink, originalVideo.originalLink)
	assert.equal(state.archive._operatorUid_, 7)
	assert.equal(state.archive.pendingReview, false)
	assert.equal(result.uploaderUUID, undefined)
	assert.deepEqual(state.calls, ['start', 'read', 'archive', 'delete', 'search-delete', 'commit', 'end'])
	assert.equal(session.hasEnded, true)
})

test('another authenticated user cannot archive or delete the video', async () => {
	const { services, client, state } = setup()
	assert.equal((await services.deleteSelfVideoService({ videoId: 1 }, 'other-user', 'valid', client)).success, false)
	assert.deepEqual(state.calls, ['start', 'read', 'abort', 'end'])
})

test('expired credentials and invalid IDs never start a deletion transaction', async () => {
	const { services, client, state } = setup()
	assert.equal((await services.deleteSelfVideoService({ videoId: 1 }, ownerUuid, 'expired', client)).success, false)
	for (const videoId of [undefined, 0, -1, 1.5, NaN, '1', {}]) {
		assert.equal((await services.deleteSelfVideoService({ videoId }, ownerUuid, 'valid', client)).success, false)
	}
	assert.deepEqual(state.calls, [])
})

test('admin deletion keeps the original uploader identity in the archive', async () => {
	const { services, client, state } = setup()
	assert.equal((await services.deleteVideoByKvidService({ videoId: 1 }, 10, 'valid', client)).success, true)
	assert.deepEqual(state.readWhere, { videoId: 1 })
	assert.equal(state.archive.uploaderUUID, ownerUuid)
	assert.equal(state.archive._operatorUUID_, 'admin')
})

for (const failure of ['read', 'archive', 'delete', 'no-delete', 'search', 'commit']) {
	test(`deletion ${failure} failure rolls back and ends the session`, async () => {
		const { services, client, session, state } = setup(failure)
		assert.equal((await services.deleteSelfVideoService({ videoId: 1 }, ownerUuid, 'valid', client)).success, false)
		assert.deepEqual(state.calls.slice(-2), ['abort', 'end'])
		assert.equal(session.hasEnded, true)
	})
}

test('editing succeeds and ends the session without aborting a committed transaction', async () => {
	const { services, client, state } = setup()
	assert.equal((await services.editVideoService(editRequest, ownerUuid, 'valid', client)).success, true)
	assert.deepEqual(state.calls, ['start', 'update', 'search-update', 'commit', 'end'])
})

for (const failure of ['update', 'not-found', 'search', 'commit']) {
	test(`editing ${failure} failure rolls back and ends the session`, async () => {
		const { services, client, session, state } = setup(failure)
		assert.equal((await services.editVideoService(editRequest, ownerUuid, 'valid', client)).success, false)
		assert.deepEqual(state.calls.slice(-2), ['abort', 'end'])
		assert.equal(session.hasEnded, true)
	})
}

test('session cleanup still ends an inactive or failed-to-abort session', async () => {
	const inactive = setup()
	assert.equal(await inactive.sessions.abortAndEndSession(inactive.session), false)
	assert.deepEqual(inactive.state.calls, ['end'])
	const failing = setup('abort')
	failing.session.startTransaction()
	await assert.rejects(failing.sessions.abortAndEndSession(failing.session), /abort failed/)
	assert.equal(failing.session.hasEnded, true)
})

test('admin controller retains RBAC; owner controller takes identity only from cookies', async () => {
	const calls = []
	const controllers = loadModule('src/controller/VideoController.ts', {
		'../service/RbacService.js': { isPassRbacCheck: async () => false },
		'../common/ValidTool.js': { parseInteger: value => Number(value) },
		'../service/VideoService.js': {
			deleteVideoByKvidService: async () => { throw new Error('RBAC was bypassed') },
			deleteSelfVideoService: async (...args) => { calls.push(args); return { success: true } },
		},
	})
	const ctx = {
		path: '/video/delete',
		cookies: { get: name => ({ uid: '7', uuid: ownerUuid, token: 'valid' })[name] },
		request: { body: { videoId: 1, uuid: 'forged', uploaderUUID: 'forged', uid: 999 } },
		elasticsearchClient: { ready: true },
	}
	await controllers.deleteVideoByKvidController(ctx, async () => {})
	assert.equal(calls.length, 0)
	await controllers.deleteSelfVideoController(ctx, async () => {})
	assert.equal(calls.length, 1)
	assert.equal(calls[0][1], ownerUuid)
	assert.equal(calls[0][2], 'valid')
	assert.equal(Object.keys(calls[0][0]).join(), 'videoId')
})
