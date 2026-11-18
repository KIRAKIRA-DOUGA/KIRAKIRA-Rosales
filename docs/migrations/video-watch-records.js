/**
 * 归档故障版本仅含时间戳且未计入播放量的记录。
 * 暂停播放记录写入后，通过 mongosh 连接目标应用数据库的主节点并执行此文件。
 * 在实际部署目标环境的发布 PR 中列出此迁移。
 */

const watches = db.getCollection('video-watch-records')
const uncounted = { watchDate: { $exists: false }, watchDateTime: { $type: 'number' } }
const dated = { $expr: { $eq: [{ $type: '$watchDate' }, 'string'] } }

if (watches.findOne({ $nor: [uncounted, dated] }, { _id: 1 })) {
	throw new Error('发现非预期的观看记录格式，请核对后重跑迁移')
}

if (watches.findOne(uncounted, { _id: 1 })) {
	const writeConcern = { w: 'majority' }
	watches.aggregate([
		{ $match: uncounted },
		{
			$merge: {
				into: 'video-watch-records-uncounted-archive',
				on: '_id',
				whenMatched: 'keepExisting',
				whenNotMatched: 'insert',
			},
		},
	], { writeConcern }).toArray()
	const { deletedCount } = watches.deleteMany(uncounted, { writeConcern })
	print(`已从计数集合移出 ${deletedCount} 条已归档记录`)
}

const indexName = watches.createIndex({ UUID: 1, videoId: 1, watchDate: 1 }, { unique: true })
const previewIndex = watches.getIndexes().find(index => index.name === 'video_watch_daily_unique')
if (previewIndex?.partialFilterExpression) {
	watches.dropIndex(previewIndex.name)
}
print(`已确认播放记录唯一索引 ${indexName}`)
