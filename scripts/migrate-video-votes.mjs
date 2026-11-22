import { pathToFileURL } from 'node:url'
import mongoose from 'mongoose'
import { VideoVoteSchema } from '../dist/dbPool/schema/VideoVoteSchema.js'

function activeRecords(direction, timeField) {
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
		...activeRecords('upvote', '$upvoteTime'),
		{ $unionWith: { coll: 'video-downvotes', pipeline: activeRecords('downvote', '$downvoteTime') } },
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
		const changed = await migrateVideoVotes(client.db(database))
		console.info(database, changed ? '视频赞踩记录迁移完成' : '视频赞踩记录已迁移')
	} finally {
		await client.close()
	}
}
