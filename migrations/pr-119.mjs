/**
 * PR #119　评论和视频的赞踩迁移
 *
 * develop 和 production 分别执行一次。
 * 1. 准备本版本的镜像。从源码运行时，在项目根目录依次执行 npm ci 和 npm run build。
 * 2. 暂停评论发布、删除、赞踩和视频赞踩，等旧实例处理完正在执行的请求，备份目标业务库。
 * 3. 通过部署密钥设置 COMMENT_VOTE_MIGRATION_URI（含认证和 TLS 选项）和 MONGODB_NAME（业务库名），
 *    在项目根目录运行 node migrations/pr-119.mjs。
 * 4. 核对输出的数据库名及两项迁移的完成状态。新版后端启动时会建立赞踩表、评论和视频原表及
 *    归档表的索引。若唯一索引报告重复键，先核对重复记录。前后端均已就绪后恢复写入。
 *    四个评论赞踩接口都接收 { videoId, commentRoute }，例如 { videoId: 13, commentRoute: '13.2' }。
 *
 * 两项分别记录完成状态。中断时保持暂停，重跑同一条命令即可继续。视频仍按最后一次有效操作
 * 合并到 video-votes，保留旧集合。已有视频迁移完成标记的环境会跳过这一步。
 * 首次迁移评论时，从旧点赞表和点踩表取每人最后一条有效记录，时间相同取较大的原记录 ID。
 * 已完成旧版评论单表迁移时，只读 video-comment-votes 的当前状态，避免重新导入已经取消的赞踩。
 * 用原评论的 _id 找到 commentRoute，跳过已删除的评论和旧双表中视频错配的记录。新版使用
 * video-comment-route-votes，原集合保留用于回退。迁移后按路由重建所有评论的赞数和踩数，包括零。
 * 恢复写入后如需回退，先将新状态迁回旧表，或恢复至经确认的备份。
 *
 * 新版评论列表直接读取缓存总数，登录用户另查自己的状态。增减达到或跨过斐波那契数时，按该方向的
 * 全部明细核对。同一实例内合并的操作按方向核对一次，重复提交已生效的状态不会触发统计。
 * 用户状态和缓存分两次写入。更新计数报错时按明细核对，旧统计通过版本检查后才能写回。
 * 进程中断留下的误差可能保留到下次成功核对，计数长期停在两个阈值之间时也可能长期有偏差。
 */
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
	const migrationId = 'comment-route-vote-v2'
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
	const previouslyMerged = await migrations.findOne({ _id: 'single-comment-vote-v1' })
	const source = db.collection(previouslyMerged ? 'video-comment-votes' : 'video-comment-upvotes')
	const resolveRoute = [
		{ $set: { commentObjectId: { $convert: { input: '$commentId', to: 'objectId', onError: null, onNull: null } } } },
		{ $lookup: { from: 'video-comments', localField: 'commentObjectId', foreignField: '_id', as: 'comment', pipeline: [{ $project: { commentRoute: 1, videoId: 1 } }] } },
		{ $unwind: '$comment' },
	]
	const readVotes = previouslyMerged ? resolveRoute : [
		...legacyCommentVotes('upvote'),
		{ $unionWith: { coll: 'video-comment-downvotes', pipeline: legacyCommentVotes('downvote') } },
		...resolveRoute,
		{ $match: { $expr: { $eq: ['$videoId', '$comment.videoId'] } } },
		{ $sort: { editDateTime: -1, _id: -1, direction: 1 } },
		{ $group: { _id: { commentRoute: '$comment.commentRoute', uid: '$uid' }, vote: { $first: '$$ROOT' } } },
		{ $replaceWith: '$vote' },
	]
	await source.aggregate([
		...readVotes,
		{ $project: { _id: 0, commentRoute: '$comment.commentRoute', uid: 1, UUID: 1, direction: 1 } },
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
		{ $project: { videoId: 1, UUID: 1, uid: 1, direction: { $literal: direction }, editDateTime: { $ifNull: ['$editDateTime', timeField] } } },
	]
}

/**
 * 暂停视频赞踩写入后合并旧记录，同一用户只保留最后一次有效选择。
 * @param db 目标业务数据库
 * @returns 本次是否执行了迁移
 */
export async function migrateVideoVotes(db) {
	const migrations = db.collection('schema-migrations')
	const migrationId = 'single-video-vote-v1'
	if (await migrations.findOne({ _id: migrationId })) {
		return false
	}
	const { collectionName, schemaInstance } = VideoVoteSchema
	for (const [keys, options] of schemaInstance.indexes()) {
		await db.collection(collectionName).createIndex(keys, options)
	}
	await db.collection('video-upvotes').aggregate([
		...legacyVideoVotes('upvote', '$upvoteTime'),
		{ $unionWith: { coll: 'video-downvotes', pipeline: legacyVideoVotes('downvote', '$downvoteTime') } },
		{ $sort: { editDateTime: -1, _id: -1, direction: 1 } },
		{ $group: { _id: { videoId: '$videoId', UUID: '$UUID' }, vote: { $first: '$$ROOT' } } },
		{ $replaceWith: '$vote' },
		{ $unset: '_id' },
		{ $merge: { into: collectionName, on: ['videoId', 'UUID'], whenMatched: 'replace', whenNotMatched: 'insert' } },
	], { allowDiskUse: true }).toArray()
	await migrations.insertOne({ _id: migrationId, completedAt: new Date() })
	return true
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
	} finally {
		await client.close()
	}
}
