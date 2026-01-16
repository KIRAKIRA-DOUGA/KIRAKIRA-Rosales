import { InferSchemaType, PipelineStage } from 'mongoose'
import { logging } from './loggingService.js'
import { checkUserTokenByUuidService, getUserUid } from './UserService.js'
import { QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoVoteRequestDto, VideoUpvoteResponseDto, VideoDownvoteResponseDto } from '../controller/VideoVoteControllerDto.js'
import { VideoUpvoteSchema, VideoDownvoteSchema } from '../dbPool/schema/VideoVoteSchema.js'
import { insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB, selectDataByAggregateFromMongoDB } from '../dbPool/DbClusterPool.js'

/**
 * 用户给视频点赞
 * @param emitVideoUpvoteRequest 用户给视频点赞的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户给视频点赞的请求响应
 */
export const emitVideoUpvoteService = async (emitVideoUpvoteRequest: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoUpvoteResponseDto> => {
    try {
			if (!checkVideoVoteRequest(emitVideoUpvoteRequest)) {
				logging('ERROR', '视频点赞失败，参数异常')
				return { success: false, message: '视频点赞失败，参数异常' }
			}

			if (!(await checkUserTokenByUuidService(uuid, token)).success) {
				logging('ERROR', '视频点赞失败，用户校验未通过')
				return { success: false, message: '视频点赞失败，用户校验未通过' }
			}

			const { videoId } = emitVideoUpvoteRequest

			const uid = await getUserUid(uuid)
			if (uid === undefined || uid === null || uid < 1) {
				logging('ERROR', '视频点赞失败，获取用户 UID 失败', undefined, { emitVideoUpvoteRequest, uuid })
				return { success: false, message: '视频点赞失败，获取用户 UID 失败' }
			}

			const { collectionName: videoUpvoteCollectionName, schemaInstance: correctVideoUpvoteSchema } = VideoUpvoteSchema

			type VideoUpvote = InferSchemaType<typeof correctVideoUpvoteSchema>
			const UUID = uuid
			const nowDate = new Date().getTime()

			// 检查是否已存在该用户对该视频的点赞记录（不管是否已被软删除）
			const existingVoteWhere: QueryType<VideoUpvote> = { videoId, UUID }
			const existingVoteResult = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoUpvoteSchema, videoUpvoteCollectionName)

			if (existingVoteResult.success && existingVoteResult.result && existingVoteResult.result.length > 0) {
				// 已存在记录，更新为有效状态
				const existingRecord = existingVoteResult.result[0]
				const updateWhere: QueryType<VideoUpvote> = { _id: existingRecord._id }
				const updateData: UpdateType<VideoUpvote> = {
					invalidFlag: false,
					editDateTime: nowDate
				}

				const updateResult = await updateData4MongoDB(updateWhere, updateData, correctVideoUpvoteSchema, videoUpvoteCollectionName)
				if (!updateResult || !updateResult.success) {
					logging('ERROR', '视频点赞失败，更新已有记录失败', undefined, { emitVideoUpvoteRequest, uuid })
					return { success: false, message: '视频点赞失败，更新记录失败' }
				}
			} else {
				// 不存在记录，创建新记录
				const videoUpvote: VideoUpvote = {
					videoId,
					UUID,
					uid,
					upvoteTime: nowDate,
					invalidFlag: false,
					editDateTime: nowDate,
				}

				const insertResult = await insertData2MongoDB(videoUpvote, correctVideoUpvoteSchema, videoUpvoteCollectionName)
				if (!insertResult || !insertResult.success) {
					logging('ERROR', '视频点赞失败，插入数据失败', undefined, { emitVideoUpvoteRequest, uuid })
					return { success: false, message: '视频点赞失败，存储数据失败' }
				}
			}

			// 如果用户之前有点踩，需要取消点踩
			if (await checkUserHasDownvoted(videoId, uuid)) {
				const cancelVideoDownvoteRequest: VideoVoteRequestDto = {
					videoId,
				}
				try {
					const cancelVideoDownvoteResult = await cancelVideoDownvoteService(cancelVideoDownvoteRequest, uuid, token)
					if (cancelVideoDownvoteResult.success) {
						return { success: true, message: '视频点赞成功', videoUpvoteCount: await getVideoUpvoteCount(videoId) }
					} else {
						logging('ERROR', '视频点赞成功，但未能取消点踩', undefined, { emitVideoUpvoteRequest, uuid })
						return { success: false, message: '视频点赞成功，但未能取消点踩' }
					}
				} catch (error) {
					logging('ERROR', '视频点赞成功，但取消点踩失败', error, { emitVideoUpvoteRequest, uuid })
					return { success: false, message: '视频点赞成功，但取消点踩失败' }
				}
			} else {
				return { success: true, message: '视频点赞成功', videoUpvoteCount: await getVideoUpvoteCount(videoId) }
			}
	} catch (error) {
		logging('ERROR', '视频点赞失败，未知错误：', error, { emitVideoUpvoteRequest, uuid })
		return { success: false, message: '视频点赞失败，未知错误' }
	}
}

/**
 * 用户取消视频点赞
 * @param videoId KVID 视频 ID
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 用户取消视频点赞的结果
 */
export const cancelVideoUpvoteService = async (cancelVideoUpvoteRequest: VideoVoteRequestDto, uuid: string, token: string): Promise<VideoUpvoteResponseDto> => {
	try {
		if (!checkVideoVoteRequest(cancelVideoUpvoteRequest)) {
			logging('ERROR', '取消视频点赞失败，参数异常')
			return { success: false, message: '取消视频点赞失败，参数异常' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '取消视频点赞失败，用户校验未通过')
			return { success: false, message: '取消视频点赞失败，用户校验未通过' }
		}

		const { videoId } = cancelVideoUpvoteRequest

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '取消视频点赞失败，获取用户 UID 失败', undefined, { cancelVideoUpvoteRequest, uuid })
			return { success: false, message: '取消视频点赞失败，获取用户 UID 失败' }
		}

		const { collectionName: videoUpvoteCollectionName, schemaInstance: correctVideoUpvoteSchema } = VideoUpvoteSchema
		try {
			const nowDate = new Date().getTime()
			type VideoUpvote = InferSchemaType<typeof correctVideoUpvoteSchema>
			// 查找是否存在有效的点赞记录
			const existingWhere: QueryType<VideoUpvote> = { videoId, uid, invalidFlag: false }
			const existing = await selectDataFromMongoDB(existingWhere, {}, correctVideoUpvoteSchema, videoUpvoteCollectionName)
			if (!existing.success) {
				logging('ERROR', '取消视频点赞失败：查询点赞记录失败', undefined, { cancelVideoUpvoteRequest, uuid })
				return { success: false, message: '取消视频点赞失败：查询点赞记录失败' }
			}

			if (!existing.result || existing.result.length === 0) {
				// 用户未点赞过
				logging('ERROR', '取消视频点赞失败，用户未点赞', undefined, { cancelVideoUpvoteRequest, uid })
				return { success: false, message: '取消视频点赞失败，用户未点赞' }
			}

			// 将点赞记录置为无效
			const updateWhere: QueryType<VideoUpvote> = { _id: existing.result[0]._id }
			const updateData: UpdateType<VideoUpvote> = { invalidFlag: true, editDateTime: nowDate }
			const updateResult = await updateData4MongoDB(updateWhere, updateData, correctVideoUpvoteSchema, videoUpvoteCollectionName)
			if (!(updateResult && updateResult.success)) {
				logging('ERROR', '取消视频点赞失败：更新记录失败', undefined, { cancelVideoUpvoteRequest, uid })
				return { success: false, message: '取消视频点赞失败：更新记录失败' }
			}
			return { success: true, message: '取消视频点赞成功', videoUpvoteCount: await getVideoUpvoteCount(videoId) }
		} catch (error) {
			logging('ERROR', '取消视频点赞失败，数据库操作出错：', error, { cancelVideoUpvoteRequest, uuid })
			return { success: false, message: '取消视频点赞失败，数据库操作出错' }
		}
	} catch (error) {
		logging('ERROR', '用户取消视频点赞时出错，未知错误', error, { cancelVideoUpvoteRequest, uuid })
		return { success: false, message: '用户取消视频点赞时出错，未知错误' }
	}
}

/**
 * 用户给视频点踩
 * @param emitVideoDownvoteRequest 用户给视频点踩的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 token
 * @returns 用户给视频点踩的结果
 */
export const emitVideoDownvoteService = async (emitVideoDownvoteRequest: VideoVoteRequestDto, uuid: string, token: string): Promise<VideoDownvoteResponseDto> => {
	try {
		if (!checkVideoVoteRequest(emitVideoDownvoteRequest)) {
			logging('ERROR', '视频点踩失败，参数异常')
			return { success: false, message: '视频点踩失败，参数异常' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '视频点踩失败，用户校验未通过')
			return { success: false, message: '视频点踩失败，用户校验未通过' }
		}

		const { videoId } = emitVideoDownvoteRequest

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '视频点踩失败，获取用户 UID 失败', undefined, { emitVideoDownvoteRequest, uuid })
			return { success: false, message: '视频点踩失败，获取用户 UID 失败' }
		}

		const { collectionName: videoDownvoteCollectionName, schemaInstance: correctVideoDownvoteSchema } = VideoDownvoteSchema

		type VideoDownvote = InferSchemaType<typeof correctVideoDownvoteSchema>
		const UUID = uuid
		const nowDate = new Date().getTime()

		// 检查用户是否已对视频有点踩记录（无论是否有效）
		const existingVoteWhere: QueryType<VideoDownvote> = { videoId, UUID }
		const existingVoteResult = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoDownvoteSchema, videoDownvoteCollectionName)

		if (existingVoteResult.success && existingVoteResult.result && existingVoteResult.result.length > 0) {
			// 用户已有记录，更新 invalidFlag 为 false（激活点踩）并更新时间
			const existingRecord = existingVoteResult.result[0]
			const updateWhere: QueryType<VideoDownvote> = { _id: existingRecord._id }
			const updateData: UpdateType<VideoDownvote> = {
				invalidFlag: false,
				editDateTime: nowDate
			}

			const updateResult = await updateData4MongoDB(updateWhere, updateData, correctVideoDownvoteSchema, videoDownvoteCollectionName)

			if (!updateResult || !updateResult.success) {
				logging('ERROR', '视频点踩失败，更新已有记录失败', undefined, { emitVideoDownvoteRequest, uuid })
				return { success: false, message: '视频点踩失败，更新记录失败' }
			}
		} else {
			// 用户没有记录，创建新记录
			const videoDownvote: VideoDownvote = {
				videoId,
				UUID,
				uid,
				downvoteTime: nowDate,
				invalidFlag: false,
				editDateTime: nowDate,
			}

			const insertResult = await insertData2MongoDB(videoDownvote, correctVideoDownvoteSchema, videoDownvoteCollectionName)
			if (!insertResult || !insertResult.success) {
				logging('ERROR', '视频点踩失败，插入数据失败', undefined, { emitVideoDownvoteRequest, uuid })
				return { success: false, message: '视频点踩失败，存储数据失败' }
			}
		}

		// 如果用户之前有点赞，需要取消点赞
		if (await checkUserHasUpvoted(videoId, uuid)) {
			const cancelVideoUpvoteRequest: VideoVoteRequestDto = {
				videoId,
			}
			try {
				const cancelVideoUpvoteResult = await cancelVideoUpvoteService(cancelVideoUpvoteRequest, uuid, token)
				if (cancelVideoUpvoteResult.success) {
					return { success: true, message: '视频点踩成功', videoDownvoteCount: await getVideoDownvoteCount(videoId) }
				} else {
					logging('ERROR', '视频点踩成功，但未能取消点赞', undefined, { emitVideoDownvoteRequest, uuid })
					return { success: false, message: '视频点踩成功，但未能取消点赞' }
				}
			} catch (error) {
				logging('ERROR', '视频点踩成功，但取消点赞失败', error, { emitVideoDownvoteRequest, uuid })
				return { success: false, message: '视频点踩成功，但取消点赞失败' }
			}
		} else {
			return { success: true, message: '视频点踩成功', videoDownvoteCount: await getVideoDownvoteCount(videoId) }
		}
	} catch (error) {
		logging('ERROR', '视频点踩失败，未知错误：', error, { emitVideoDownvoteRequest, uuid })
		return { success: false, message: '视频点踩失败，未知错误' }
	}
}

/**
 * 用户取消视频点踩
 * @param videoId KVID 视频 ID
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 用户取消视频点踩的结果
 */
export const cancelVideoDownvoteService = async (cancelVideoDownvoteRequest: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoDownvoteResponseDto> => {
	try {
		if (!checkVideoVoteRequest(cancelVideoDownvoteRequest)) {
			logging('ERROR', '取消视频点踩失败，参数异常')
			return { success: false, message: '取消视频点踩失败，参数异常' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '取消视频点踩失败，用户校验未通过')
			return { success: false, message: '取消视频点踩失败，用户校验未通过' }
		}

		const { videoId } = cancelVideoDownvoteRequest

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '取消视频点踩失败，获取用户 UID 失败', undefined, { cancelVideoDownvoteRequest, uuid })
			return { success: false, message: '取消视频点踩失败，获取用户 UID 失败' }
		}
		const { collectionName: videoDownvoteCollectionName, schemaInstance: correctVideoDownvoteSchema } = VideoDownvoteSchema
		try {
			const nowDate = new Date().getTime()
			type VideoDownvote = InferSchemaType<typeof correctVideoDownvoteSchema>
			// 查找是否存在有效的点踩记录
			const existingWhere: QueryType<VideoDownvote> = { videoId, uid, invalidFlag: false }
			const existing = await selectDataFromMongoDB(existingWhere, {}, correctVideoDownvoteSchema, videoDownvoteCollectionName)
			if (!existing.success) {
				logging('ERROR', '取消视频点踩失败：查询点踩记录失败', undefined, { cancelVideoDownvoteRequest, uuid })
				return { success: false, message: '取消视频点踩失败：查询点踩记录失败' }
			}

			if (!existing.result || existing.result.length === 0) {
				// 用户未点踩过
				logging('ERROR', '取消视频点踩失败，用户未点踩', undefined, { cancelVideoDownvoteRequest, uid })
				return { success: false, message: '取消视频点踩失败，用户未点踩' }
			}

			// 将点踩记录置为无效
			const updateWhere: QueryType<VideoDownvote> = { _id: existing.result[0]._id }
			const updateData: UpdateType<VideoDownvote> = { invalidFlag: true, editDateTime: nowDate }
			const updateResult = await updateData4MongoDB(updateWhere, updateData, correctVideoDownvoteSchema, videoDownvoteCollectionName)
			if (!(updateResult && updateResult.success)) {
				logging('ERROR', '取消视频点踩失败：更新记录失败', undefined, { cancelVideoDownvoteRequest, uid })
				return { success: false, message: '取消视频点踩失败：更新记录失败' }
			}
			return { success: true, message: '取消视频点踩成功', videoDownvoteCount: await getVideoDownvoteCount(videoId) }
		} catch (error) {
			logging('ERROR', '取消视频点踩失败，数据库操作出错：', error, { cancelVideoDownvoteRequest, uuid })
			return { success: false, message: '取消视频点踩失败，数据库操作出错' }
		}
	} catch (error) {
		logging('ERROR', '用户取消视频点踩时出错，未知错误：', error, { cancelVideoDownvoteRequest, uuid })
		return { success: false, message: '用户取消视频点踩时出错，未知错误' }
	}
}

/**
 * 获取视频的点赞数
 * @param videoId KVID 视频 ID
 * @returns 视频的点赞数
 */
export const getVideoUpvoteCount = async (videoId: number): Promise<number> => {
	try {
		if (!videoId) {
			logging('ERROR', '获取视频点赞数失败：视频 ID 为空', undefined, { videoId })
			return 0
		}

		const { collectionName, schemaInstance } = VideoUpvoteSchema

		// 使用聚合管道来统计数量，提高性能
		const countVideoUpvotePipeline: PipelineStage[] = [
			{
				$match: {
					videoId,
					invalidFlag: false,
				}
			},
			{
				$count: 'totalCount'
			}
		]

		try {
			const countVideoUpvoteResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, countVideoUpvotePipeline)
			if (countVideoUpvoteResult.success && countVideoUpvoteResult.result && countVideoUpvoteResult.result.length > 0) {
				return countVideoUpvoteResult.result?.[0]?.totalCount
			} else {
				return 0
			}
		} catch (error) {
			logging('ERROR', '获取视频点赞数失败：查询失败', error, { videoId })
			return 0
		}
	} catch (error) {
		logging('ERROR', '获取视频点赞数失败：', error, { videoId })
		return 0
	}
}

/**
 * 获取视频的点踩数
 * @param videoId KVID 视频 ID
 * @returns 视频的点踩数
 */
export const getVideoDownvoteCount = async (videoId: number): Promise<number> => {
	try {
		if (!videoId) {
			logging('ERROR', '获取视频点踩数失败：视频 ID 为空', undefined, { videoId })
			return 0
		}

		const { collectionName, schemaInstance } = VideoDownvoteSchema

		// 使用聚合管道来统计数量，提高性能
		const countVideoDownvotePipeline: PipelineStage[] = [
			{
				$match: {
					videoId,
					invalidFlag: false,
				}
			},
			{
				$count: 'totalCount'
			}
		]

		try {
			const countVideoDownvoteResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, countVideoDownvotePipeline)
			if (countVideoDownvoteResult.success && countVideoDownvoteResult.result && countVideoDownvoteResult.result.length > 0) {
				return countVideoDownvoteResult.result?.[0]?.totalCount
			} else {
				return 0
			}
		} catch (error) {
			logging('ERROR', '获取视频点踩数失败：查询失败', error, { videoId })
			return 0
		}
	} catch (error) {
		logging('ERROR', '获取视频点踩数失败：', error, { videoId })
		return 0
	}
}

/**
 * 检查用户是否已经对一个视频点赞
 * @param videoId KVID 视频 ID
 * @param uid 用户 UID
 * @returns 校验结果，用户已点赞返回 true，未点赞返回 false
 */
export const checkUserHasUpvoted = async (videoId: number, uuid: string): Promise<boolean> => {
	try {
		if (!videoId || uuid === undefined || uuid === null) {
			logging('ERROR', '在验证用户是否已经对某视频点赞时出错：数据校验未通过', undefined, { videoId, uuid })
			return false
		}

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '在验证用户是否已经对某视频点赞时出错：uuid 未找到对应 uid，视为未点赞', undefined, { videoId, uuid })
			return false
		}

		const { collectionName, schemaInstance } = VideoUpvoteSchema
		type VideoUpvote = InferSchemaType<typeof schemaInstance>
		const where: QueryType<VideoUpvote> = {
			uid,
			videoId,
			invalidFlag: false,
		}

		const select: SelectType<VideoUpvote> = {
			videoId: 1,
			uid: 1,
		}

		try {
			const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
			if (result.success) {
				if (result.result && result.result.length > 0) {
					return true // 查询到结果了，证明用户已点赞过了，所以返回 true
				} else {
					return false // 查询成功但未查询到结果，证明用户未点赞，所以返回 false
				}
			} else {
				return false // 悲观：查询失败，不算作用户点赞
			}
		} catch (error) {
			logging('ERROR', '在验证用户是否已经对某视频点赞时出错：获取用户点赞数据失败', error, { videoId, uuid })
			return false
		}
	} catch (error) {
		logging('ERROR', '在验证用户是否已经对某视频点赞时出错：', error, { videoId, uuid })
		return false
	}
}

/**
 * 检查用户是否已经对一个视频点踩
 * @param videoId KVID 视频 ID
 * @param uid 用户 UID
 * @returns 校验结果，用户已点踩返回 true，未点踩返回 false
 */
export const checkUserHasDownvoted = async (videoId: number, uuid: string): Promise<boolean> => {
	try {
		if (!videoId || uuid === undefined || uuid === null) {
			logging('ERROR', '在验证用户是否已经对某视频点踩时出错：数据校验未通过', undefined, { videoId, uuid })
			return false
		}

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '在验证用户是否已经对某视频点踩时出错：uuid 未找到对应 uid，视为未点踩', undefined, { videoId, uuid })
			return false
		}

		const { collectionName, schemaInstance } = VideoDownvoteSchema
		type VideoDownvote = InferSchemaType<typeof schemaInstance>
		const where: QueryType<VideoDownvote> = {
			uid,
			videoId,
			invalidFlag: false,
		}

		const select: SelectType<VideoDownvote> = {
			videoId: 1,
			uid: 1,
		}

		try {
			const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
			if (result.success) {
				if (result.result && result.result.length > 0) {
					return true // 查询到结果了，证明用户已点踩过了，所以返回 true
				} else {
					return false // 查询成功但未查询到结果，证明用户未点踩，所以返回 false
				}
			} else {
				return false // 悲观：查询失败，不算作用户点踩
			}
		} catch (error) {
			logging('ERROR', '在验证用户是否已经对某视频点踩时出错：获取用户点踩数据失败', error, { videoId, uuid })
			return false
		}
	} catch (error) {
		logging('ERROR', '在验证用户是否已经对某视频点踩时出错：', error, { videoId, uuid })
		return false
	}
}

/**
 * 检查用户给视频点赞的请求参数
 * @param emitVideoUpvoteRequest 用户给视频点赞的请求参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkVideoVoteRequest = (VideoVoteRequest: VideoVoteRequestDto): boolean => {
	return (
		VideoVoteRequest.videoId !== undefined &&
		VideoVoteRequest.videoId !== null &&
		VideoVoteRequest.videoId > 0
	)
}

