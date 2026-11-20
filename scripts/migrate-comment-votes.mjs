import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { VideoCommentVoteSchema } from '../dist/dbPool/schema/VideoCommentSchema.js'

const { collectionName, schemaInstance } = VideoCommentVoteSchema
const migrationId = 'single-comment-vote-v1'

// 通过评论 ID 和视频 ID 排除已删除评论及错挂到其他视频的旧记录。
function legacyRows(direction) {
	return [
		{ $match: { invalidFlag: false, deleteFlag: false } },
		{ $set: { direction, commentObjectId: { $convert: { input: '$commentId', to: 'objectId', onError: null, onNull: null } } } },
		{ $lookup: { from: 'video-comments', localField: 'commentObjectId', foreignField: '_id', as: 'comment', pipeline: [{ $project: { videoId: 1 } }] } },
		{ $unwind: '$comment' },
		{ $match: { $expr: { $eq: ['$videoId', '$comment.videoId'] } } },
		{ $project: { uid: 1, UUID: 1, direction: 1, editDateTime: 1, commentId: { $toString: '$commentObjectId' } } },
	]
}

async function rebuildCounts(db, ids) {
	const counts = new Map(ids.map(id => [id.toHexString(), { upvoteCount: 0, downvoteCount: 0 }]))
	const groups = db.collection(collectionName).aggregate([
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
			update: { $set: counts.get(_id.toHexString()), $unset: { voteRecountAt: '' } },
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
	if (await migrations.findOne({ _id: migrationId })) {
		return false
	}
	const votes = db.collection(collectionName)
	for (const [keys, options] of schemaInstance.indexes()) {
		await votes.createIndex(keys, options)
	}
	const upvotes = db.collection('video-comment-upvotes')
	await upvotes.aggregate([
		...legacyRows('upvote'),
		{ $unionWith: { coll: 'video-comment-downvotes', pipeline: legacyRows('downvote') } },
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
			await rebuildCounts(db, ids)
			ids = []
		}
	}
	if (ids.length) {
		await rebuildCounts(db, ids)
	}
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
		const changed = await migrateCommentVotes(client.db(database))
		console.info(database, changed ? '评论赞踩记录迁移完成' : '评论赞踩记录已迁移')
	} finally {
		await client.close()
	}
}
