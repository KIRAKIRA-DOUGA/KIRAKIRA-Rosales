const test = require('node:test');
const assert = require('node:assert/strict');
const { loadService } = require('./helpers/load-service.cjs');

function fixture() {
	const state = {
		groups: [{ feedGroupUuid: 'group', feedGroupCreatorUuid: 'owner', uuidList: ['member-1'] }],
		following: ['member-1'], videos: [], inserts: [], queries: [], updates: [],
		commits: 0, aborts: 0, ends: 0, authCalls: [], missingUsers: new Set(), failUpdate: false,
		failCommit: false, failAbort: false, failEnd: false,
	};
	const schema = collectionName => ({ schemaInstance: {}, collectionName });
	const db = {
		insertData2MongoDB: async data => {
			state.inserts.push(structuredClone(data));
			return { success: true, result: [data] };
		},
		selectDataFromMongoDB: async (where, select, instance, collection) => {
			state.queries.push(structuredClone(where));
			const result = collection === 'following'
				? state.following.map(followingUuid => ({ followingUuid }))
				: state.groups.filter(group => Object.entries(where).every(([key, value]) => group[key] === value));
			return { success: true, result: structuredClone(result) };
		},
		findOneAndUpdateData4MongoDB: async (where, update, instance, collection, options) => {
			if (state.failUpdate) throw new Error('simulated write failure');
			state.updates.push(structuredClone(update));
			const updated = { ...state.groups.find(group => group.feedGroupUuid === where.feedGroupUuid), ...update };
			if (options?.session) options.session.pending = updated;
			return { success: true, result: updated };
		},
		selectDataByAggregateFromMongoDB: async (instance, collection, pipeline) => {
			const match = pipeline[0].$match;
			const result = state.videos.filter(video => match.uploaderUUID.$in.includes(video.uploaderUUID)
				&& (match.pendingReview === undefined || video.pendingReview === match.pendingReview));
			return { success: true, result: pipeline.some(stage => stage.$count)
				? (result.length ? [{ totalCount: result.length }] : []) : structuredClone(result) };
		},
	};
	const service = loadService('src/service/FeedService.ts', {
		'../controller/FeedControllerDto.js': { FOLLOWING_TYPE: { normal: 'normal' } },
		'../dbPool/schema/FeedSchema.js': { FeedGroupSchema: schema('groups'), FollowingSchema: schema('following'), UnfollowingSchema: schema('unfollowing') },
		'../dbPool/schema/UserSchema.js': { UserSettingsSchema: schema('settings') },
		'./UserService.js': {
			checkUserTokenByUuidService: async (uuid, token) => {
				state.authCalls.push([uuid, token]);
				return { success: uuid === 'owner' && token === 'valid-token' };
			},
			getUserUuid: async uid => {
				await new Promise(resolve => setImmediate(resolve));
				return `member-${uid}`;
			},
			checkUserExistsByUuidService: async ({ uuid }) => ({ success: true, exists: !state.missingUsers.has(uuid) }),
		},
		'../dbPool/DbClusterPool.js': db,
		'../common/MongoDBSessionTool.js': {
			createAndStartSession: async () => {
				let active = true;
				return {
					inTransaction: () => active,
					async commitTransaction() {
						// The MongoDB driver transitions out of the transaction even if commit fails.
						active = false;
						if (state.failCommit) throw new Error('simulated commit failure');
						state.commits++;
						if (this.pending) state.groups = [this.pending];
					},
					async abortTransaction() {
						state.aborts++;
						active = false;
						if (state.failAbort) throw new Error('simulated abort failure');
					},
					async endSession() {
						await new Promise(resolve => setImmediate(resolve));
						state.ends++;
						if (state.failEnd) throw new Error('simulated end session failure');
					},
				};
			},
			abortAndEndSession: async () => { state.aborts++; },
			commitAndEndSession: async session => { state.commits++; if (session.pending) state.groups = [session.pending]; },
		},
		uuid: { v4: () => 'new-group' }, '../common/RandomTool.js': {}, '../cloudflare/index.js': {},
		'../dbPool/schema/VideoSchema.js': { VideoSchema: schema('videos') }, './loggingService.js': { logging() {} },
	});
	return { state, service };
}

test('creating a group waits for UID lookup and preserves unique initial members', async () => {
	const { state, service } = fixture();
	const result = await service.createFeedGroupService({ feedGroupName: 'test', withUidList: [1, 2, 1] }, 'owner', 'valid-token');
	assert.equal(result.success, true);
	assert.deepEqual(state.inserts[0].uuidList, ['member-1', 'member-2']);
});

test('unknown members are rejected before the group is written', async () => {
	const { state, service } = fixture();
	state.missingUsers.add('member-2');
	assert.equal((await service.createFeedGroupService({ feedGroupName: 'test', withUidList: [2] }, 'owner', 'valid-token')).success, false);
	assert.equal(state.inserts.length, 0);
});

test('adding and removing members commits successful object-shaped database results', async () => {
	const { state, service } = fixture();
	assert.equal((await service.addNewUid2FeedGroupService({ feedGroupUuid: 'group', uidList: [2, 2] }, 'owner', 'valid-token')).success, true);
	assert.deepEqual([...state.groups[0].uuidList].sort(), ['member-1', 'member-2']);
	assert.equal((await service.removeUidFromFeedGroupService({ feedGroupUuid: 'group', uidList: [1] }, 'owner', 'valid-token')).success, true);
	assert.deepEqual([...state.groups[0].uuidList], ['member-2']);
	assert.equal(state.commits, 2);
	assert.equal(state.aborts, 0);
	assert.equal(state.ends, 2);
});

test('missing groups and write failures abort membership transactions', async () => {
	for (const method of ['addNewUid2FeedGroupService', 'removeUidFromFeedGroupService']) {
		for (const missing of [true, false]) {
			const { state, service } = fixture();
			if (missing) state.groups = []; else state.failUpdate = true;
			assert.equal((await service[method]({ feedGroupUuid: 'group', uidList: [2] }, 'owner', 'valid-token')).success, false);
			assert.equal(state.aborts, 1);
			assert.equal(state.commits, 0);
			assert.equal(state.ends, 1);
		}
	}
});

test('membership commit failures end the session after the transaction becomes inactive', async () => {
	for (const method of ['addNewUid2FeedGroupService', 'removeUidFromFeedGroupService']) {
		const { state, service } = fixture();
		state.failCommit = true;
		const response = await service[method]({ feedGroupUuid: 'group', uidList: [2] }, 'owner', 'valid-token');
		assert.equal(response.success, false);
		assert.equal(state.commits, 0);
		assert.equal(state.aborts, 0);
		assert.equal(state.ends, 1);
	}
});

test('failed aborts still end the session and preserve the original membership error', async () => {
	for (const method of ['addNewUid2FeedGroupService', 'removeUidFromFeedGroupService']) {
		const { state, service } = fixture();
		state.groups = [];
		state.failAbort = true;
		const response = await service[method]({ feedGroupUuid: 'group', uidList: [2] }, 'owner', 'valid-token');
		assert.equal(response.success, false);
		assert.match(response.message, /不存在或者不是由当前用户创建/);
		assert.equal(state.aborts, 1);
		assert.equal(state.ends, 1);
	}
});

test('failed session cleanup does not replace committed success or the original failure', async () => {
	for (const method of ['addNewUid2FeedGroupService', 'removeUidFromFeedGroupService']) {
		for (const failUpdate of [true, false]) {
			const { state, service } = fixture();
			state.failUpdate = failUpdate;
			state.failEnd = true;
			const response = await service[method]({ feedGroupUuid: 'group', uidList: [2] }, 'owner', 'valid-token');
			assert.equal(response.success, !failUpdate);
			assert.equal(state.ends, 1);
			assert.equal(state.commits, failUpdate ? 0 : 1);
			assert.equal(state.aborts, failUpdate ? 1 : 0);
		}
	}
});

const page = { page: 1, pageSize: 10 };
test('group feeds authenticate with token and include only approved videos of members', async () => {
	const { state, service } = fixture();
	state.videos = [
		{ videoId: 1, uploaderUUID: 'member-1', pendingReview: false },
		{ videoId: 2, uploaderUUID: 'member-1', pendingReview: true },
		{ videoId: 3, uploaderUUID: 'member-2', pendingReview: false },
	];
	const response = await service.getFeedContentService({ feedGroupUuid: 'group', pagination: page }, 'owner', 'valid-token');
	assert.equal(response.success, true);
	assert.equal(response.result.count, 1);
	assert.equal(response.result.content[0].videoId, 1);
	assert.deepEqual(state.authCalls, [['owner', 'valid-token']]);
});

test('following feeds work without a selected group and handle zero matching videos', async () => {
	const { state, service } = fixture();
	const empty = await service.getFeedContentService({ pagination: page }, 'owner', 'valid-token');
	assert.equal(empty.success, true);
	assert.equal(empty.result.count, 0);
	state.videos = [{ videoId: 1, uploaderUUID: 'member-1', pendingReview: false }];
	const result = await service.getFeedContentService({ pagination: page }, 'owner', 'valid-token');
	assert.equal(result.result.count, 1);
});

test('empty groups return an empty feed and another owner cannot read a group', async () => {
	const { state, service } = fixture();
	state.groups[0].uuidList = [];
	const empty = await service.getFeedContentService({ feedGroupUuid: 'group', pagination: page }, 'owner', 'valid-token');
	assert.equal(empty.success, true);
	assert.equal(empty.result.count, 0);
	state.groups[0].feedGroupCreatorUuid = 'someone-else';
	assert.equal((await service.getFeedContentService({ feedGroupUuid: 'group', pagination: page }, 'owner', 'valid-token')).success, false);
});

test('invalid authentication and non-string group IDs cannot reach feed queries', async () => {
	const { state, service } = fixture();
	assert.equal((await service.getFeedContentService({ feedGroupUuid: 'group', pagination: page }, 'owner', 'wrong')).success, false);
	assert.equal((await service.getFeedContentService({ feedGroupUuid: ['group'], pagination: page }, 'owner', 'valid-token')).success, false);
	assert.equal(state.queries.length, 0);
});

test('successful group metadata updates report success', async () => {
	const { service } = fixture();
	assert.equal((await service.createOrEditFeedGroupInfoService({ feedGroupUuid: 'group', feedGroupName: 'new-name' }, 'owner', 'valid-token')).success, true);
});

test('feed controller uses the requested group and defaults to the following feed', async () => {
	let request;
	const controller = loadService('src/controller/FeedController.ts', {
		'../common/ValidTool.js': { limitPageSize: () => 10, parseInteger: Number },
		'../service/FeedService.js': { getFeedContentService: async value => { request = value; return { success: true }; } },
		'../service/RbacService.js': {},
	});
	for (const group of ['selected-group', undefined]) {
		await controller.getFeedContentController({ cookies: { get: name => name === 'uuid' ? 'owner' : 'valid-token' }, query: { feedGroupUuid: group } }, async () => {});
		assert.equal(request.feedGroupUuid, group ?? '');
	}
});
