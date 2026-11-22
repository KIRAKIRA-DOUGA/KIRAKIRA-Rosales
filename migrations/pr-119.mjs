/**
 * PR #119　评论和视频的赞踩迁移
 *
 * develop 和 production 分别执行一次。
 * 1. 准备本版本的镜像。从源码运行时，在项目根目录依次执行 npm ci 和 npm run build。
 * 2. 暂停评论发布、删除、赞踩和视频赞踩，等旧实例处理完正在执行的请求，备份目标业务库。
 * 3. 通过部署密钥设置 COMMENT_VOTE_MIGRATION_URI（含认证和 TLS 选项）和 MONGODB_NAME（业务库名），
 *    在项目根目录运行 node migrations/pr-119.mjs。
 * 4. 核对输出的数据库名，以及评论和视频两项迁移的完成状态，再启动新版并恢复写入。
 *
 * 两项迁移分别记录完成状态。中断时保持暂停，重跑同一条命令即可继续。旧脚本留下的完成标记也有效。
 * 两项都保留原集合，按用户和目标合并最后一条有效记录，时间相同取较大的原记录 ID。
 * 评论迁移只接收指向现存评论且视频匹配的记录，并重建所有评论的赞数和踩数，包括应当归零的评论。
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

// 通过评论 ID 和视频 ID 排除已删除评论及错挂到其他视频的旧记录。
function legacyCommentVotes(direction) {
	return [
		{ $match: { invalidFlag: false, deleteFlag: false } },
		{ $set: { direction, commentObjectId: { $convert: { input: '$commentId', to: 'objectId', onError: null, onNull: null } } } },
		{ $lookup: { from: 'video-comments', localField: 'commentObjectId', foreignField: '_id', as: 'comment', pipeline: [{ $project: { videoId: 1 } }] } },
		{ $unwind: '$comment' },
		{ $match: { $expr: { $eq: ['$videoId', '$comment.videoId'] } } },
		{ $project: { uid: 1, UUID: 1, direction: 1, editDateTime: 1, commentId: { $toString: '$commentObjectId' } } },
	]
}

async function rebuildCommentCounts(db, ids) {
	const counts = new Map(ids.map(id => [id.toHexString(), { upvoteCount: 0, downvoteCount: 0 }]))
	const groups = db.collection(VideoCommentVoteSchema.collectionName).aggregate([
		{ $match: { commentId: { $in: [...counts.keys()] } } },
		{ $group: { _id: { commentId: '$commentId', direction: '$direction' }, n: { $sum: 1 } } },
	])
	for await (const { _id, n } of groups) {
		const field = _id.direction === 'upvote' ? 'upvoteCount' : 'downvoteCount'
		counts.get(_id.commentId)[field] = n
	}
	await db.collection('video-comments').bulkWrite(ids.map(_id => ({
		updateOne: {
			filter: { _id },
			update: { $set: counts.get(_id.toHexString()) },
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
	const migrationId = 'single-comment-vote-v1'
	if (await migrations.findOne({ _id: migrationId })) {
		return false
	}
	const { collectionName, schemaInstance } = VideoCommentVoteSchema
	const votes = db.collection(collectionName)
	for (const [keys, options] of schemaInstance.indexes()) {
		await votes.createIndex(keys, options)
	}
	const upvotes = db.collection('video-comment-upvotes')
	await upvotes.aggregate([
		...legacyCommentVotes('upvote'),
		{ $unionWith: { coll: 'video-comment-downvotes', pipeline: legacyCommentVotes('downvote') } },
		{ $sort: { editDateTime: -1, _id: -1, direction: 1 } },
		{ $group: { _id: { commentId: '$commentId', uid: '$uid' }, vote: { $first: '$$ROOT' } } },
		{ $replaceWith: '$vote' },
		{ $unset: ['_id', 'editDateTime'] },
		{ $merge: { into: collectionName, on: ['commentId', 'uid'], whenMatched: 'replace', whenNotMatched: 'insert' } },
	], { allowDiskUse: true }).toArray()

	// 按不变的主键遍历，包含没有任何记录的评论。中断后可在恢复写入前重新执行。
	const comments = db.collection('video-comments').find({}, { projection: { _id: 1 } }).sort({ _id: 1 })
	let ids = []
	for await (const { _id } of comments) {
		ids.push(_id)
		if (ids.length === 500) {
			await rebuildCommentCounts(db, ids)
			ids = []
		}
	}
	if (ids.length) {
		await rebuildCommentCounts(db, ids)
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
