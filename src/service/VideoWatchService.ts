import mongoose, { InferSchemaType } from 'mongoose'
import { QueryType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoSchema } from '../dbPool/schema/VideoSchema.js'
import { VideoWatchRecordSchema } from '../dbPool/schema/VideoWatchRecordSchema.js'
import { getUserUid } from './UserService.js'
import { logging } from './loggingService.js'

/**
 * 获取今天的日期字符串（格式：YYYY-MM-DD）
 * @returns 今天的日期字符串
 */
const getTodayDateString = (): string => {
	const now = new Date()
	const year = now.getFullYear()
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const day = String(now.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

/**
 * 记录用户今天观看该视频，并增加视频播放量
 * @param videoId 视频 ID
 * @param uuid 用户 UUID
 * @returns 返回是否成功增加播放量（如果今天已经观看过，返回 false，表示没有增加播放量）
 */
export const recordVideoWatchAndIncrementCount = async (videoId: number, uuid: string): Promise<boolean> => {
	try {
		if (!videoId || !uuid) {
			logging('ERROR', '记录视频播放失败：参数异常', undefined, { videoId, uuid })
			return false
		}

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '记录视频播放失败：获取用户 UID 失败', undefined, { uuid })
			return false
		}

		const todayDateString = getTodayDateString()
		const nowDate = new Date().getTime()

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		try {
			// 1. 记录观看记录（幂等），仅在首次观看时插入
			const { collectionName: watchRecordCollectionName, schemaInstance: watchRecordSchemaInstance } = VideoWatchRecordSchema
			type VideoWatchRecord = InferSchemaType<typeof watchRecordSchemaInstance>
			const watchRecordWhere: QueryType<VideoWatchRecord> = {
				UUID: uuid,
				uid,
				videoId,
				watchDate: todayDateString,
			}
			const watchRecordData: VideoWatchRecord = {
				UUID: uuid,
				uid,
				videoId,
				watchDate: todayDateString,
				editDateTime: nowDate,
			}

			let watchRecordModel: mongoose.Model<VideoWatchRecord>
			if (mongoose.models[watchRecordCollectionName]) {
				watchRecordModel = mongoose.models[watchRecordCollectionName] as mongoose.Model<VideoWatchRecord>
			} else {
				watchRecordModel = mongoose.model<VideoWatchRecord>(watchRecordCollectionName, watchRecordSchemaInstance)
			}

			const upsertWatchRecordResult = await watchRecordModel.updateOne(
				watchRecordWhere,
				{ $setOnInsert: watchRecordData },
				{ upsert: true, session },
			)

			// 若已存在当日观看记录，不再递增播放量
			if (!upsertWatchRecordResult.acknowledged) {
				await session.abortTransaction()
				session.endSession()
				logging('ERROR', '记录视频播放失败：插入观看记录未被确认', undefined, { videoId, uuid })
				return false
			}
			if ((upsertWatchRecordResult.upsertedCount ?? 0) === 0) {
				await session.commitTransaction()
				session.endSession()
				return false
			}

			// 2. 增加视频播放量
			const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
			type Video = InferSchemaType<typeof videoSchemaInstance>

			// 直接使用 MongoDB 模型来支持 $inc 操作符
			let mongoModel: mongoose.Model<Video>
			if (mongoose.models[videoCollectionName]) {
				mongoModel = mongoose.models[videoCollectionName] as mongoose.Model<Video>
			} else {
				mongoModel = mongoose.model<Video>(videoCollectionName, videoSchemaInstance)
			}

			const videoWhere: QueryType<Video> = {
				videoId,
			}

			const updateVideoResult = await mongoModel.updateMany(videoWhere, { $inc: { watchedCount: 1 } }, { session })
			if (!updateVideoResult.acknowledged || updateVideoResult.matchedCount === 0) {
				await session.abortTransaction()
				session.endSession()
				logging('ERROR', '记录视频播放失败：增加播放量失败', undefined, { videoId, uuid })
				return false
			}

			// 提交事务
			await session.commitTransaction()
			session.endSession()
			return true
		} catch (error) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '记录视频播放失败：事务执行失败', error, { videoId, uuid })
			return false
		}
	} catch (error) {
		logging('ERROR', '记录视频播放失败：未知错误', error, { videoId, uuid })
		return false
	}
}

