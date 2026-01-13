import mongoose, { InferSchemaType } from 'mongoose'
import { logging } from './loggingService.js'
import { checkUserTokenByUuidService, checkUserTokenService, getUserUid } from './UserService.js'
import { QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoVoteRequestDto, VideoVoteResponseDto } from '../controller/VideoVoteControllerDto.js'
import { VideoUpvoteSchema, VideoDownvoteSchema } from '../dbPool/schema/VideoVoteSchema.js'
import { insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'

/**
 * 用户给视频点赞
 * @param emitVideoUpvoteRequest 用户给视频点赞的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户给视频点赞的请求响应
 */
export const emitVideoUpvoteService = async (emitVideoUpvoteRequest: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoVoteResponseDto> => {
	try {
		if (!checkVideoVoteRequest(emitVideoUpvoteRequest)) {
			logging('ERROR', '视频点赞失败，参数异常')
			return { success: false, message: '视频点赞失败，参数异常' }
		}

		if (!uuid || !token || !(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '视频点赞失败，用户校验未通过')
			return { success: false, message: '视频点赞失败，用户校验未通过' }
		}

		const videoId = emitVideoUpvoteRequest.videoId

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '视频点赞失败，获取用户 UID 失败', undefined, { emitVideoUpvoteRequest, uuid })
			return { success: false, message: '视频点赞失败，获取用户 UID 失败' }
		}

		const { collectionName: videoUpvoteCollectionName, schemaInstance: correctVideoUpvoteSchema } = VideoUpvoteSchema
		const { collectionName: videoDownvoteCollectionName, schemaInstance: correctVideoDownvoteSchema } = VideoDownvoteSchema

		// 使用事务保证「点赞」与同时存在的「点踩」互斥且原子化
		const session = await mongoose.startSession()
		session.startTransaction()
		try {
			const nowDate = new Date().getTime()
			type VideoUpvote = InferSchemaType<typeof correctVideoUpvoteSchema>
			// 先查询是否存在该用户对该视频的点赞记录（无论 invalidFlag）
			const existingVoteWhere: QueryType<VideoUpvote> = { videoId, uid }
			const existingVote = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoUpvoteSchema, videoUpvoteCollectionName, { session })

			if (existingVote.success && existingVote.result && existingVote.result.length > 0) {
				const existingVoteRecord = existingVote.result[0]
				if (existingVoteRecord.invalidFlag) {
					// 恢复为有效
					const updateVoteWhere: QueryType<VideoUpvote> = { _id: existingVoteRecord._id }
					const updateVoteUpdate: UpdateType<VideoUpvote> = { invalidFlag: false, editDateTime: nowDate }
					const updateResult = await updateData4MongoDB(updateVoteWhere, updateVoteUpdate, correctVideoUpvoteSchema, videoUpvoteCollectionName, { session })
					if (!(updateResult && updateResult.success)) throw new Error('恢复点赞记录失败')
				} else {
					// 已经是有效的点赞记录，无需更多操作
					if (session.inTransaction()) await session.abortTransaction()
					session.endSession()
					logging('ERROR', '用户点赞时出错，用户已点赞', undefined, { emitVideoUpvoteRequest, uid })
					return { success: false, message: '用户点赞时出错，用户已点赞' }
				}
			} else {
				// 不存在记录，创建新记录
				const videoUpvote: VideoUpvote = {
					videoId,
					UUID: uuid,
					uid,
					upvoteTime: nowDate,
					invalidFlag: false,
					editDateTime: nowDate,
				}

				try {
					const insertResult = await insertData2MongoDB(videoUpvote, correctVideoUpvoteSchema, videoUpvoteCollectionName, { session })
					if (!(insertResult && insertResult.success)) throw new Error('插入点赞记录失败')
				} catch (err: any) {
					// 并发冲突：重复键 -> 重新查询并尝试恢复
					if (err && (err.code === 11000 || /E11000/.test(String(err)))) {
						const recheck = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoUpvoteSchema, videoUpvoteCollectionName, { session })
						if (recheck.success && recheck.result && recheck.result.length > 0) {
							const rec = recheck.result[0]
							if (rec.invalidFlag) {
								const updateVoteWhere: QueryType<VideoUpvote> = { _id: rec._id }
								const updateVoteUpdate: UpdateType<VideoUpvote> = { invalidFlag: false, editDateTime: nowDate }
								const restoreResult = await updateData4MongoDB(updateVoteWhere, updateVoteUpdate, correctVideoUpvoteSchema, videoUpvoteCollectionName, { session })
								if (!(restoreResult && restoreResult.success)) throw new Error('并发恢复点赞失败')
							} else {
								if (session.inTransaction()) await session.abortTransaction()
								session.endSession()
								return { success: false, message: '用户已点赞' }
							}
						} else {
							throw new Error('并发插入后查询点赞记录失败')
						}
					} else {
						throw err
					}
				}
			}

			// 点赞成功后，检查是否存在有效的点踩记录，如存在则使其失效（互斥）
			type VideoDownvote = InferSchemaType<typeof correctVideoDownvoteSchema>
			const existingDownvoteWhere: QueryType<VideoDownvote> = { videoId, uid, invalidFlag: false }
			const existingDownvote = await selectDataFromMongoDB(existingDownvoteWhere, {}, correctVideoDownvoteSchema, videoDownvoteCollectionName, { session })
			if (existingDownvote.success && existingDownvote.result && existingDownvote.result.length > 0) {
				const downvoteUpdate: UpdateType<VideoDownvote> = { invalidFlag: true, editDateTime: nowDate }
				const downvoteResult = await updateData4MongoDB(existingDownvoteWhere, downvoteUpdate, correctVideoDownvoteSchema, videoDownvoteCollectionName, { session })
				if (!(downvoteResult && downvoteResult.success)) throw new Error('取消点踩失败')
			}

			await session.commitTransaction()
			session.endSession()
			return { success: true, message: '视频点赞成功' }
		} catch (error) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '视频点赞失败，数据库操作出错：', error, { emitVideoUpvoteRequest, uuid })
			return { success: false, message: '视频点赞失败，数据库操作出错' }
		}
	} catch (error) {
		logging('ERROR', '视频点赞失败，未知错误：', error, { emitVideoUpvoteRequest, uuid })
		return { success: false, message: '视频点赞失败，未知错误：' }
	}
}

/**
 * 用户取消视频点赞
 * @param videoId KVID 视频 ID
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 用户取消视频点赞的结果
 */
export const cancelVideoUpvoteService = async (cancelVideoUpvoteRequest: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoVoteResponseDto> => {
	try {
		if (!checkVideoVoteRequest(cancelVideoUpvoteRequest)) {
			logging('ERROR', '取消视频点赞失败，参数异常')
			return { success: false, message: '取消视频点赞失败，参数异常' }
		}

		if (!uuid || !token || !(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '取消视频点赞失败，用户校验未通过')
			return { success: false, message: '取消视频点赞失败，用户校验未通过' }
		}

		const videoId = cancelVideoUpvoteRequest.videoId

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

            return { success: true, message: '取消视频点赞成功' }
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
 * @param videoId KVID 视频 ID
 * @param uuid 用户 UUID
 * @param token 用户 token
 * @returns 用户给视频点踩的结果
 */
export const emitVideoDownvoteService = async (emitVideoDownvoteRequest: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoVoteResponseDto> => {
	try {
		if (!checkVideoVoteRequest(emitVideoDownvoteRequest)) {
			logging('ERROR', '视频点踩失败，参数异常')
			return { success: false, message: '视频点踩失败，参数异常' }
		}

		if (!uuid || !token || !(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '视频点踩失败，用户校验未通过')
			return { success: false, message: '视频点踩失败，用户校验未通过' }
		}

		const videoId = emitVideoDownvoteRequest.videoId

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '视频点踩失败，获取用户 UID 失败', undefined, { emitVideoDownvoteRequest, uuid })
			return { success: false, message: '视频点踩失败，获取用户 UID 失败' }
		}

		const { collectionName: videoUpvoteCollectionName, schemaInstance: correctVideoUpvoteSchema } = VideoUpvoteSchema
		const { collectionName: videoDownvoteCollectionName, schemaInstance: correctVideoDownvoteSchema } = VideoDownvoteSchema

        // 使用事务保证「点踩」与同时存在的「点赞」互斥且原子化
        const session = await mongoose.startSession()
        session.startTransaction()
        try {
            const nowDate = new Date().getTime()
            type VideoDownvote = InferSchemaType<typeof correctVideoDownvoteSchema>
            // 先查询是否存在该用户对该视频的点踩记录（无论 invalidFlag）
            const existingVoteWhere: QueryType<VideoDownvote> = { videoId, uid }
            const existingVote = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoDownvoteSchema, videoDownvoteCollectionName, { session })

            if (existingVote.success && existingVote.result && existingVote.result.length > 0) {
                const existingVoteRecord = existingVote.result[0]
                if (existingVoteRecord.invalidFlag) {
                    // 恢复为有效
                    const updateVoteWhere: QueryType<VideoDownvote> = { _id: existingVoteRecord._id }
                    const updateVoteUpdate: UpdateType<VideoDownvote> = { invalidFlag: false, editDateTime: nowDate }
                    const updateResult = await updateData4MongoDB(updateVoteWhere, updateVoteUpdate, correctVideoDownvoteSchema, videoDownvoteCollectionName, { session })
                    if (!(updateResult && updateResult.success)) throw new Error('恢复点踩记录失败')
                } else {
                    // 已经是有效的点踩记录，无需更多操作
                    if (session.inTransaction()) await session.abortTransaction()
                    session.endSession()
                    logging('ERROR', '用户点踩时出错，用户已点踩', undefined, { emitVideoDownvoteRequest, uid })
                    return { success: false, message: '用户点踩时出错，用户已点踩' }
                }
            } else {
                // 不存在记录，创建新记录
                const videoDownvote: VideoDownvote = {
                    videoId,
                    UUID: uuid,
                    uid,
                    downvoteTime: nowDate,
                    invalidFlag: false,
                    editDateTime: nowDate,
                }

                try {
                    const insertResult = await insertData2MongoDB(videoDownvote, correctVideoDownvoteSchema, videoDownvoteCollectionName, { session })
                    if (!(insertResult && insertResult.success)) throw new Error('插入点踩记录失败')
                } catch (err: any) {
                    // 并发冲突：重复键 -> 重新查询并尝试恢复
                    if (err && (err.code === 11000 || /E11000/.test(String(err)))) {
                        const recheck = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoDownvoteSchema, videoDownvoteCollectionName, { session })
                        if (recheck.success && recheck.result && recheck.result.length > 0) {
                            const rec = recheck.result[0]
                            if (rec.invalidFlag) {
                                const updateVoteWhere: QueryType<VideoDownvote> = { _id: rec._id }
                                const updateVoteUpdate: UpdateType<VideoDownvote> = { invalidFlag: false, editDateTime: nowDate }
                                const restoreResult = await updateData4MongoDB(updateVoteWhere, updateVoteUpdate, correctVideoDownvoteSchema, videoDownvoteCollectionName, { session })
                                if (!(restoreResult && restoreResult.success)) throw new Error('并发恢复点踩失败')
                            } else {
                                if (session.inTransaction()) await session.abortTransaction()
                                session.endSession()
                                return { success: false, message: '用户已点踩' }
                            }
                        } else {
                            throw new Error('并发插入后查询点踩记录失败')
                        }
                    } else {
                        throw err
                    }
                }
            }

            // 点踩成功后，检查是否存在有效的点赞记录，如存在则使其失效（互斥）
            type VideoUpvote = InferSchemaType<typeof correctVideoUpvoteSchema>
            const existingUpvoteWhere: QueryType<VideoUpvote> = { videoId, uid, invalidFlag: false }
            const existingUpvote = await selectDataFromMongoDB(existingUpvoteWhere, {}, correctVideoUpvoteSchema, videoUpvoteCollectionName, { session })
            if (existingUpvote.success && existingUpvote.result && existingUpvote.result.length > 0) {
                const upvoteUpdate: UpdateType<VideoUpvote> = { invalidFlag: true, editDateTime: nowDate }
                const upvoteResult = await updateData4MongoDB(existingUpvoteWhere, upvoteUpdate, correctVideoUpvoteSchema, videoUpvoteCollectionName, { session })
                if (!(upvoteResult && upvoteResult.success)) throw new Error('取消点赞失败')
            }

            await session.commitTransaction()
            session.endSession()
            return { success: true, message: '视频点踩成功' }
        } catch (error) {
            if (session.inTransaction()) {
                await session.abortTransaction()
            }
            session.endSession()
            logging('ERROR', '视频点踩失败，数据库操作出错：', error, { emitVideoDownvoteRequest, uuid })
            return { success: false, message: '视频点踩失败，数据库操作出错' }
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
export const cancelVideoDownvoteService = async (cancelVideoDownvoteRequest: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoVoteResponseDto> => {
	try {
		if (!checkVideoVoteRequest(cancelVideoDownvoteRequest)) {
			logging('ERROR', '取消视频点踩失败，参数异常')
			return { success: false, message: '取消视频点踩失败，参数异常' }
		}

		if (!uuid || !token || !(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '取消视频点踩失败，用户校验未通过')
			return { success: false, message: '取消视频点踩失败，用户校验未通过' }
		}

		const videoId = cancelVideoDownvoteRequest.videoId

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

            return { success: true, message: '取消视频点踩成功' }
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
		type VideoUpvote = InferSchemaType<typeof schemaInstance>
		const where: QueryType<VideoUpvote> = {
			videoId,
			invalidFlag: false,
		}

		const select: SelectType<VideoUpvote> = {
			videoId: 1,
		}

		try {
			const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
			if (result.success && result.result) {
				return result.result.length
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
		type VideoDownvote = InferSchemaType<typeof schemaInstance>
		const where: QueryType<VideoDownvote> = {
			videoId,
			invalidFlag: false,
		}

		const select: SelectType<VideoDownvote> = {
			videoId: 1,
		}

		try {
			const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
			if (result.success && result.result) {
				return result.result.length
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

