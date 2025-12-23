import mongoose, { InferSchemaType } from 'mongoose'
import { findOneAndUpdateData4MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoWatchRecordSchema } from '../dbPool/schema/VideoWatchRecordSchema.js'
import { VideoSchema } from '../dbPool/schema/VideoSchema.js'
import { getUserUid } from './UserService.js'

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
 * 检查用户今天是否已经观看过该视频
 * @param videoId 视频 ID
 * @param uuid 用户 UUID
 * @returns 如果今天已经观看过返回 true，否则返回 false
 */
const checkUserWatchedToday = async (videoId: number, uuid: string): Promise<boolean> => {
	try {
		if (!videoId || !uuid) {
			return false
		}

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			return false
		}

		const todayDateString = getTodayDateString()
		const { collectionName, schemaInstance } = VideoWatchRecordSchema
		type VideoWatchRecord = InferSchemaType<typeof schemaInstance>
		const where: QueryType<VideoWatchRecord> = {
			UUID: uuid,
			uid,
			videoId,
			watchDate: todayDateString,
		}

		const select: any = {
			_id: 1,
		}

		try {
			const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
			if (result.success && result.result && result.result.length > 0) {
				return true // 今天已经观看过
			} else {
				return false // 今天还没有观看过
			}
		} catch (error) {
			console.error('检查用户今天是否观看过视频失败：', error, { videoId, uuid })
			return false // 出错时返回 false，不增加播放量
		}
	} catch (error) {
		console.error('检查用户今天是否观看过视频失败：', error, { videoId, uuid })
		return false
	}
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
			console.error('记录视频播放失败：参数异常', { videoId, uuid })
			return false
		}

		// 检查今天是否已经观看过
		const alreadyWatched = await checkUserWatchedToday(videoId, uuid)
		if (alreadyWatched) {
			// 今天已经观看过，不重复增加播放量
			return true
		}

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			console.error('记录视频播放失败：获取用户 UID 失败', { uuid })
			return false
		}

		const todayDateString = getTodayDateString()
		const nowDate = new Date().getTime()

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		try {
			// 1. 记录观看记录
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

			const insertWatchRecordResult = await findOneAndUpdateData4MongoDB(watchRecordWhere, watchRecordData, watchRecordSchemaInstance, watchRecordCollectionName, { session })
			if (!insertWatchRecordResult.success) {
				await session.abortTransaction()
				session.endSession()
				console.error('记录视频播放失败：插入观看记录失败', { videoId, uuid })
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
				console.error('记录视频播放失败：增加播放量失败', { videoId, uuid })
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
			console.error('记录视频播放失败：事务执行失败', error, { videoId, uuid })
			return false
		}
	} catch (error) {
		console.error('记录视频播放失败：未知错误', error, { videoId, uuid })
		return false
	}
}

