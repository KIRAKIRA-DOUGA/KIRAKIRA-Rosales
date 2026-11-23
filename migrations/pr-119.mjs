/**
 * PR #119　评论和视频的赞踩迁移
 *
 * develop 和 production 分别执行一次。
 * 1. 准备本版本的镜像。从源码运行时，在项目根目录依次执行 npm ci 和 npm run build。
 * 2. 暂停资料编辑与审核、评论发布与删除以及评论和视频赞踩，等旧实例处理完正在执行的请求，备份目标业务库。
 * 3. 通过部署密钥设置 COMMENT_VOTE_MIGRATION_URI（含认证和 TLS 选项）和 MONGODB_NAME（业务库名），
 *    在项目根目录运行 node migrations/pr-119.mjs。
 * 4. 核对输出的数据库名及各项迁移的完成状态。新版后端启动时会建立赞踩表、评论和视频原表及
 *    归档表的索引。若唯一索引报告重复键，先核对重复记录。前后端均已就绪后恢复写入。
 *    四个评论赞踩接口都接收 { videoId, commentRoute }，例如 { videoId: 13, commentRoute: '13.2' }。
 *
 * 各项分别记录完成状态。中断时保持暂停，重跑同一条命令即可继续。视频仍按最后一次有效操作
 * 合并到 video-votes，保留旧集合。已迁移的视频明细只移除多余的 uid 字段。
 * 首次迁移评论时，从旧点赞表和点踩表取每人最后一条有效记录，时间相同取较大的原记录 ID。
 * 已完成旧版评论单表迁移时，只读 video-comment-votes 的当前状态，避免重新导入已经取消的赞踩。
 * 用原评论的 _id 找到 commentRoute，跳过已删除的评论和旧双表中视频错配的记录。新版使用
 * video-comment-reactions，以 (commentRoute, UUID) 唯一标识赞踩。已迁移到 video-comment-route-votes 的环境直接读取该表。原集合保留用于回退。迁移后按路由重建所有评论的赞数和踩数，包括零。
 * 旧版本将私人 UUID 用作用户名时，替换成不含身份信息的随机用户名。旧版分组封面地址仍存档，新页面显示默认封面，重新上传后可恢复自定义封面。
 * 恢复写入后如需回退，先将新状态迁回旧表，或恢复至经确认的备份。
 *
 * 新版评论列表直接读取缓存总数，登录用户另查自己的状态。增减达到或跨过斐波那契数时，按该方向的
 * 全部明细核对。同一实例内合并的操作按方向核对一次，重复提交已生效的状态不会触发统计。
 * 用户状态和缓存分两次写入。更新计数报错时按明细核对，旧统计通过版本检查后才能写回。
 * 进程中断留下的误差可能保留到下次成功核对，计数长期停在两个阈值之间时也可能长期有偏差。
 */
import { randomBytes } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { VideoCommentVoteSchema } from '../dist/dbPool/schema/VideoCommentSchema.js'
import { VideoVoteSchema } from '../dist/dbPool/schema/VideoVoteSchema.js'

function legacyCommentVotes(direction) {
	return [
		{ $match: { invalidFlag: false, deleteFlag: false } },
		{ $set: { direction } },
	]
}

async function rebuildCommentCounts(db, routes) {
	const counts = new Map(routes.map(route => [route, { upvoteCount: 0, downvoteCount: 0 }]))
	const groups = db.collection(VideoCommentVoteSchema.collectionName).aggregate([
		{ $match: { commentRoute: { $in: routes } } },
		{ $group: { _id: { commentRoute: '$commentRoute', direction: '$direction' }, n: { $sum: 1 } } },
	])
	for await (const { _id, n } of groups) {
		const field = _id.direction === 'upvote' ? 'upvoteCount' : 'downvoteCount'
		counts.get(_id.commentRoute)[field] = n
	}
	await db.collection('video-comments').bulkWrite(routes.map(commentRoute => ({
		updateOne: {
			filter: { commentRoute },
			update: { $set: counts.get(commentRoute) },
		},
	})))
}

/**
 * 在暂停评论写入的数据库中合并点赞和点踩记录，并重新计算所有评论的数量。
 * @param db 已选择目标数据库的 MongoDB 连接
 * @returns 本次是否执行了迁移
 */
export async function migrateCommentVotes(db) {
	const migrations = db.collection('schema-migrations')
	const migrationId = 'comment-route-uuid-v3'
	if (await migrations.findOne({ _id: migrationId })) {
		return false
	}
	const { collectionName, schemaInstance } = VideoCommentVoteSchema
	const comments = db.collection('video-comments')
	const invalidRoute = await comments.findOne({ $or: [
		{ $expr: { $ne: [{ $type: '$commentRoute' }, 'string'] } },
		{ commentRoute: { $not: /\S/ } },
	] }, { projection: { _id: 1 } })
	if (invalidRoute) {
		throw new Error(`评论 ${invalidRoute._id} 缺少有效的 commentRoute，请核对原评论路由后重跑迁移`)
	}
	await comments.createIndex({ commentRoute: 1 }, { unique: true })
	for (const [keys, options] of schemaInstance.indexes()) {
		await db.collection(collectionName).createIndex(keys, options)
	}

	// 旧版单表可能已经收到新的赞踩和取消操作。完成标记决定哪一份数据是当前状态。
	const routeMigration = await migrations.findOne({ _id: 'comment-route-vote-v2' })
	const singleTableMigration = await migrations.findOne({ _id: 'single-comment-vote-v1' })
	let source = 'video-comment-route-votes'
	const readVotes = []
	if (routeMigration) {
		readVotes.push(
			{ $lookup: { from: 'video-comments', localField: 'commentRoute', foreignField: 'commentRoute', as: 'comment', pipeline: [{ $project: { _id: 1 } }] } },
			{ $match: { 'comment.0': { $exists: true } } },
		)
	} else {
		source = singleTableMigration ? 'video-comment-votes' : 'video-comment-upvotes'
		if (!singleTableMigration) {
			readVotes.push(...legacyCommentVotes('upvote'),
				{ $unionWith: { coll: 'video-comment-downvotes', pipeline: legacyCommentVotes('downvote') } })
		}
		readVotes.push(
			{ $set: { commentObjectId: { $convert: { input: '$commentId', to: 'objectId', onError: null, onNull: null } } } },
			{ $lookup: { from: 'video-comments', localField: 'commentObjectId', foreignField: '_id', as: 'comment', pipeline: [{ $project: { commentRoute: 1, videoId: 1 } }] } },
			{ $unwind: '$comment' },
			{ $set: { commentRoute: '$comment.commentRoute' } },
		)
		if (!singleTableMigration) {
			readVotes.push({ $match: { $expr: { $eq: ['$videoId', '$comment.videoId'] } } })
		}
	}
	// 极早期只有 UID 的明细需要通过账号表补齐身份。找不到账号时保留原表并中止，避免误合并。
	const missingUuid = { UUID: { $not: /\S/ } }
	const identity = [
		{ $lookup: { from: 'user-auths', localField: 'uid', foreignField: 'uid', as: 'account', pipeline: [{ $project: { UUID: 1 } }, { $limit: 1 }] } },
		{ $set: { UUID: { $first: '$account.UUID' } } },
	]
	const votes = db.collection(source)
	const [unresolved] = await votes.aggregate([...readVotes, { $match: missingUuid }, ...identity,
		{ $match: missingUuid }, { $limit: 1 }, { $project: { _id: 1 } }]).toArray()
	if (unresolved) {
		throw new Error('评论赞踩明细缺少有效账号，请核对原表和 user-auths 后重跑迁移')
	}
	// 大多数记录已有 UUID，只对缺少 UUID 的记录查询账号。
	await votes.aggregate([
		...readVotes, { $match: { UUID: /\S/ } },
		{ $unionWith: { coll: source, pipeline: [...readVotes, { $match: missingUuid }, ...identity] } },
		{ $sort: { editDateTime: -1, _id: -1, direction: 1 } },
		{ $group: { _id: { commentRoute: '$commentRoute', UUID: '$UUID' }, direction: { $first: '$direction' } } },
		{ $project: { _id: 0, commentRoute: '$_id.commentRoute', UUID: '$_id.UUID', direction: 1 } },
		{ $out: collectionName },
	], { allowDiskUse: true }).toArray()

	// 从评论表遍历，以便把没有任何赞踩的评论也归零。
	const cursor = comments.find({}, { projection: { _id: 0, commentRoute: 1 } }).sort({ commentRoute: 1 })
	let routes = []
	for await (const { commentRoute } of cursor) {
		routes.push(commentRoute)
		if (routes.length === 500) {
			await rebuildCommentCounts(db, routes)
			routes = []
		}
	}
	if (routes.length) {
		await rebuildCommentCounts(db, routes)
	}
	await migrations.insertOne({ _id: migrationId, completedAt: new Date() })
	return true
}

function legacyVideoVotes(direction, timeField) {
	return [
		{ $match: { invalidFlag: false } },
		{ $project: { videoId: 1, UUID: 1, direction: { $literal: direction }, editDateTime: { $ifNull: ['$editDateTime', timeField] } } },
	]
}

/**
 * 暂停视频赞踩写入后合并旧记录，同一用户只保留最后一次有效选择。
 * @param db 目标业务数据库
 * @returns 本次是否执行了迁移
 */
export async function migrateVideoVotes(db) {
	const migrations = db.collection('schema-migrations')
	const migrationId = 'video-vote-uuid-v2'
	if (await migrations.findOne({ _id: migrationId })) {
		return false
	}
	const { collectionName, schemaInstance } = VideoVoteSchema
	for (const [keys, options] of schemaInstance.indexes()) {
		await db.collection(collectionName).createIndex(keys, options)
	}
	if (await migrations.findOne({ _id: 'single-video-vote-v1' })) {
		await db.collection(collectionName).updateMany({ uid: { $exists: true } }, { $unset: { uid: '' } })
	} else {
		await db.collection('video-upvotes').aggregate([
			...legacyVideoVotes('upvote', '$upvoteTime'),
			{ $unionWith: { coll: 'video-downvotes', pipeline: legacyVideoVotes('downvote', '$downvoteTime') } },
			{ $sort: { editDateTime: -1, _id: -1, direction: 1 } },
			{ $group: { _id: { videoId: '$videoId', UUID: '$UUID' }, vote: { $first: '$$ROOT' } } },
			{ $replaceWith: '$vote' },
			{ $unset: '_id' },
			{ $merge: { into: collectionName, on: ['videoId', 'UUID'], whenMatched: 'replace', whenNotMatched: 'insert' } },
		], { allowDiskUse: true }).toArray()
	}
	await migrations.insertOne({ _id: migrationId, completedAt: new Date() })
	return true
}

/**
 * 替换旧版本清空用户资料时用用户 UUID 生成的公开用户名。
 * @param db 目标业务数据库
 * @returns 此次替换的用户名数量
 */
export async function migratePrivateUsernames(db) {
	const migrations = db.collection('schema-migrations')
	const marker = 'private-usernames-pr119'
	if (await migrations.findOne({ _id: marker })) {
		return 0
	}
	const profiles = db.collection('user-infos')
	const oldName = /^(?:[a-z0-9]{24}|[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12})(?:_[a-z0-9]{6})?$/i
	const candidates = profiles.find({ username: oldName }, { projection: { username: 1, UUID: 1 } })
	let changed = 0
	for await (const profile of candidates) {
		if (profile.username.split('_')[0].toLowerCase() !== profile.UUID?.toLowerCase()) {
			continue
		}
		// 条件包含原名，恢复中断的迁移时可保留已完成的更名。
		const username = `user_${randomBytes(6).toString('hex')}`
		if (await profiles.findOne({ username }, { collation: { locale: 'en', strength: 2 }, projection: { _id: 1 } })) {
			throw new Error('生成的替代用户名已存在，请重跑迁移')
		}
		const result = await profiles.updateOne({ _id: profile._id, username: profile.username }, { $set: { username } })
		changed += result.modifiedCount
	}
	await migrations.insertOne({ _id: marker, completedAt: new Date() })
	return changed
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const uri = process.env.COMMENT_VOTE_MIGRATION_URI
	const database = process.env.MONGODB_NAME
	if (!uri || !database || ['admin', 'local', 'config'].includes(database)) {
		throw new Error('请设置 COMMENT_VOTE_MIGRATION_URI 和业务数据库 MONGODB_NAME')
	}
	const client = new mongoose.mongo.MongoClient(uri, { readPreference: 'primary', writeConcern: { w: 'majority' } })
	try {
		await client.connect()
		const db = client.db(database)
		const commentsChanged = await migrateCommentVotes(db)
		console.info(database, commentsChanged ? '评论赞踩记录迁移完成' : '评论赞踩记录已迁移')
		const videosChanged = await migrateVideoVotes(db)
		console.info(database, videosChanged ? '视频赞踩记录迁移完成' : '视频赞踩记录已迁移')
		// 初始化标识用于读取展示偏好，部署时为已有账号显式建立查询索引。
		await db.collection('user-auths').createIndex({ userDataBootstrapHint: 1 }, { sparse: true })
		console.info(database, '本次替换旧用户名数量', await migratePrivateUsernames(db))
	} finally {
		await client.close()
	}
}
