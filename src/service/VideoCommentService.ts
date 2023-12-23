import { InferSchemaType, Schema } from 'mongoose'
import { EmitVideoCommentDownvoteRequestDto, EmitVideoCommentDownvoteResponseDto, EmitVideoCommentRequestDto, EmitVideoCommentResponseDto, EmitVideoCommentUpvoteRequestDto, EmitVideoCommentUpvoteResponseDto, GetVideoCommentByKvidRequestDto, GetVideoCommentByKvidResponseDto, GetVideoCommentDownvotePropsDto, GetVideoCommentDownvoteResultDto, GetVideoCommentUpvotePropsDto, GetVideoCommentUpvoteResultDto } from '../controller/VideoCommentControllerDto.js'
import { findOneAndPlusByMongodbId, insertData2MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoCommentDownvoteSchema, VideoCommentSchema, VideoCommentUpvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserTokenService } from './UserService.js'

/**
 * 用户发送视频评论
 * @param emitVideoCommentRequest 用户发送的弹幕数据
 * @param uid cookie 中的用户 ID
 * @param token cookie 中的用户 token
 * @returns 用户发送弹幕的结果
 */
export const emitVideoCommentService = async (emitVideoCommentRequest: EmitVideoCommentRequestDto, uid: number, token: string): Promise<EmitVideoCommentResponseDto> => {
	try {
		if (checkEmitVideoCommentRequest(emitVideoCommentRequest)) {
			if ((await checkUserTokenService(uid, token)).success) {
				const getCommentIndexResult = await getNextSequenceValueService(`KVID-${emitVideoCommentRequest.videoId}`) // 以视频 ID 为键，获取下一个值，即评论楼层
				const commentIndex = getCommentIndexResult.sequenceValue
				if (getCommentIndexResult.success && commentIndex !== undefined && commentIndex !== null) {
					const { collectionName, schema: videoCommentSchema } = VideoCommentSchema
					const schema = new Schema(videoCommentSchema)
					type VideoComment = InferSchemaType<typeof schema>
					const nowDate = new Date().getTime()
					const videoComment: VideoComment = {
						...emitVideoCommentRequest,
						uid,
						commentRoute: `${emitVideoCommentRequest.videoId}.${commentIndex}`,
						commentIndex,
						emitTime: nowDate,
						upvoteCount: 0,
						downvoteCount: 0,
						subComments: [],
						subCommentsCount: 0,
						editDateTime: nowDate,
					}
					try {
						const insertData2MongoDBResult = await insertData2MongoDB(videoComment, schema, collectionName)
						if (insertData2MongoDBResult && insertData2MongoDBResult.success) {
							return { success: true, message: '视频评论发送成功！', videoComment: emitVideoCommentRequest }
						}
					} catch (error) {
						console.error('ERROR', '视频评论发送失败，无法存储到 MongoDB', error)
						return { success: false, message: '视频评论发送失败，存储视频评论数据失败' }
					}
				} else {
					console.error('ERROR', '视频评论发送失败，获取楼层数据失败，无法根据视频 ID 获取序列下一个值', { videoId: emitVideoCommentRequest.videoId, uid, token })
					return { success: false, message: '视频评论发送失败，获取楼层数据失败' }
				}
			} else {
				console.error('ERROR', '视频评论发送失败，用户校验未通过', { videoId: emitVideoCommentRequest.videoId, uid, token })
				return { success: false, message: '视频评论发送失败，用户校验未通过' }
			}
		} else {
			console.error('ERROR', '视频评论发送失败，弹幕数据校验未通过：', { videoId: emitVideoCommentRequest.videoId, uid, token })
			return { success: false, message: '视频评论发送失败，视频评论数据错误' }
		}
	} catch (error) {
		console.error('ERROR', '视频评论发送失败，错误信息：', error, { videoId: emitVideoCommentRequest.videoId, uid, token })
		return { success: false, message: '视频评论发送失败，未知错误' }
	}
}

/**
 * 根据 KVID 获取视频评论列表，并检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应的值会变为 true
 * @param getVideoCommentByKvidRequest 请求视频评论列表的查询参数
 * @returns 视频的视频评论列表
 */
export const getVideoCommentListByKvidService = async (getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto, uid: number, token: string): Promise<GetVideoCommentByKvidResponseDto> => {
	// WARN // TODO 应当添加更多安全验证，防刷！
	try {
		if (checkGetVideoCommentByKvidRequest(getVideoCommentByKvidRequest)) {
			const videoId = getVideoCommentByKvidRequest.videoId

			let getVideoCommentUpvoteResult: GetVideoCommentUpvoteResultDto
			let getVideoCommentDownvoteResult: GetVideoCommentDownvoteResultDto
			if ((await checkUserTokenService(uid, token)).success) { // 校验用户，如果校验通过，则获取当前用户对某一视频的点赞/点踩的评论的评论 ID 列表
				const getVideoCommentUpvotePromise = new Promise<GetVideoCommentUpvoteResultDto>((resolve, reject) => {
					const getVideoCommentUpvoteProps: GetVideoCommentUpvotePropsDto = {
						videoId,
						uid,
					}
					getVideoCommentUpvoteByUid(getVideoCommentUpvoteProps).then(resolve).catch(reject)
				})

				const getVideoCommentDownvotePromise = new Promise<GetVideoCommentDownvoteResultDto>((resolve, reject) => {
					const getVideoCommentDownvoteProps: GetVideoCommentDownvotePropsDto = {
						videoId,
						uid,
					}
					getVideoCommentDownvoteByUid(getVideoCommentDownvoteProps).then(resolve).catch(reject)
				})
				const [videoCommentUpvoteResult, videoCommentDownvoteResult] = await Promise.all([getVideoCommentUpvotePromise, getVideoCommentDownvotePromise])
				getVideoCommentUpvoteResult = videoCommentUpvoteResult
				getVideoCommentDownvoteResult = videoCommentDownvoteResult
			}

			const { collectionName, schema: videoCommentSchema } = VideoCommentSchema
			const schema = new Schema(videoCommentSchema)
			type VideoComment = InferSchemaType<typeof schema>
			const where: QueryType<VideoComment> = {
				videoId,
			}
	
			const select: SelectType<VideoComment & {_id: 1}> = {
				_id: 1,
				commentRoute: 1,
				videoId: 1,
				uid: 1,
				emitTime: 1,
				text: 1,
				upvoteCount: 1,
				downvoteCount: 1,
				commentIndex: 1,
				subComments: 1,
				subCommentsCount: 1,
				editDateTime: 1,
			}
			
			try {
				const result = await selectDataFromMongoDB(where, select, schema, collectionName)
				const videoCommentList = result.result as GetVideoCommentByKvidResponseDto['videoCommentList']
				if (result.success) {
					if (videoCommentList && videoCommentList.length > 0) {
						let correctVideoComment: GetVideoCommentByKvidResponseDto['videoCommentList']

						const videoCommentUpvoteResult = getVideoCommentUpvoteResult.videoCommentUpvoteResult
						const videoCommentDownvoteResult = getVideoCommentDownvoteResult.videoCommentDownvoteResult
						const videoCommentUpvoteResultLength = videoCommentUpvoteResult.length
						const videoCommentDownvoteResultLength = videoCommentDownvoteResult.length

						const haveUpvote = (getVideoCommentUpvoteResult.success && videoCommentUpvoteResult && videoCommentUpvoteResultLength > 0)
						const haveDownvote = (getVideoCommentDownvoteResult.success && videoCommentDownvoteResult && videoCommentDownvoteResultLength > 0)

						// 检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应值会变为 true
						if (haveUpvote || haveDownvote) {
							correctVideoComment = videoCommentList.map(videoComment => {
								let isUpvote = false
								let isDownvote = false
								if (haveUpvote) {
									isUpvote = videoCommentUpvoteResult.some(upvote => upvote.commentId === videoComment._id?.toString())
								}
								if (haveDownvote) {
									isDownvote = videoCommentUpvoteResult.some(upvote => upvote.commentId === videoComment._id?.toString())
								}
								return {
									...videoComment,
									isUpvote,
									isDownvote,
								}
							})
						} else { // 没有获取到用户的点赞或点踩信息
							correctVideoComment = videoCommentList.map(videoComment => {
								return {
									...videoComment,
									isUpvote: false,
									isDownvote: false,
								}
							})
						}

						return { success: true, message: '获取视频评论列表成功', videoCommentCount: correctVideoComment.length, videoCommentList: correctVideoComment }
					} else {
						return { success: true, message: '视频评论列表为空', videoCommentCount: 0, videoCommentList: [] }
					}
				} else {
					console.error('ERROR', '获取视频评论列表失败，查询失败或结果为空：', { getVideoCommentByKvidRequest })
					return { success: false, message: '获取视频评论列表失败，查询失败', videoCommentCount: 0, videoCommentList: [] }
				}
			} catch (error) {
				console.error('ERROR', '获取视频评论列表失败，查询失败：', error, { getVideoCommentByKvidRequest })
				return { success: false, message: '获取视频评论列表失败，查询失败：未知异常', videoCommentCount: 0, videoCommentList: [] }
			}
		} else {
			console.error('ERROR', '获取视频评论列表失败，数据校验失败', { getVideoCommentByKvidRequest })
			return { success: false, message: '获取视频评论列表失败，数据校验失败', videoCommentCount: 0, videoCommentList: [] }
		}
	} catch (error) {
		console.error('ERROR', '获取视频评论列表失败，错误信息：', error, { getVideoCommentByKvidRequest })
		return { success: false, message: '获取视频评论列表失败，未知原因', videoCommentCount: 0, videoCommentList: [] }
	}
}


/**
 * 获取某个用户对某个视频的评论的点赞情况
 * @param getVideoCommentUpvoteProps 获取某个用户对某个视频的评论的点赞情况的参数
 * @returns 某个用户对某个视频的评论的点赞情况
 */
const getVideoCommentUpvoteByUid = async (getVideoCommentUpvoteProps: GetVideoCommentUpvotePropsDto): Promise<GetVideoCommentUpvoteResultDto> => {
	try {
		if (checkGetVideoCommentUpvoteProps(getVideoCommentUpvoteProps)) {
			const { collectionName, schema: videoCommentUpvoteSchema } = VideoCommentUpvoteSchema
			const schema = new Schema(videoCommentUpvoteSchema)
			type VideoCommentUpvote = InferSchemaType<typeof schema>
			const where: QueryType<VideoCommentUpvote> = {
				videoId: getVideoCommentUpvoteProps.videoId,
				uid: getVideoCommentUpvoteProps.uid,
			}
	
			const select: SelectType<VideoCommentUpvote> = {
				videoId: 1,
				commentId: 1,
				uid: 1,
				editDateTime: 1,
			}
			
			try {
				const result = await selectDataFromMongoDB(where, select, schema, collectionName)
				const videoCommentUpvoteList = result.result
				if (result.success) {
					if (videoCommentUpvoteList && videoCommentUpvoteList.length > 0) {
						return { success: true, message: '获取用户点赞情况成功', videoCommentUpvoteResult: videoCommentUpvoteList }
					} else {
						return { success: true, message: '用户点赞情况为空', videoCommentUpvoteResult: [] }
					}
				} else {
					console.warn('WARN', 'WARNING', '获取用户点赞情况失败，查询失败或结果为空：', { getVideoCommentUpvoteProps })
					return { success: false, message: '获取用户点赞情况失败，查询失败', videoCommentUpvoteResult: [] }
				}
			} catch (error) {
				console.warn('WARN', 'WARNING', '获取用户点赞情况失败，查询失败：', error, { getVideoCommentUpvoteProps })
				return { success: false, message: '获取用户点赞情况失败，查询失败', videoCommentUpvoteResult: [] }
			}
		} else {
			console.warn('WARN', 'WARNING', '获取用户点赞情况失败，查询参数未通过校验', { getVideoCommentUpvoteProps })
			return { success: false, message: '获取用户点赞情况失败，必要参数为空', videoCommentUpvoteResult: [] }
		}
	} catch (error) {
		console.warn('WARN', 'WARNING', '获取用户点赞情况失败，错误信息：', error, { getVideoCommentUpvoteProps })
		return { success: false, message: '获取用户点赞情况失败，未知错误', videoCommentUpvoteResult: [] }
	}
}

/**
 * 获取某个用户对某个视频的评论的点踩情况
 * @param getVideoCommentDownvoteProps 获取某个用户对某个视频的评论的点踩情况的参数
 * @returns 某个用户对某个视频的评论的点踩情况
 */
const getVideoCommentDownvoteByUid = async (getVideoCommentDownvoteProps: GetVideoCommentDownvotePropsDto): Promise<GetVideoCommentDownvoteResultDto> => {
	try {
		if (checkGetVideoCommentDownvoteProps(getVideoCommentDownvoteProps)) {
			const { collectionName, schema: videoCommentDownvoteSchema } = VideoCommentDownvoteSchema
			const schema = new Schema(videoCommentDownvoteSchema)
			type VideoCommentDownvote = InferSchemaType<typeof schema>
			const where: QueryType<VideoCommentDownvote> = {
				videoId: getVideoCommentDownvoteProps.videoId,
				uid: getVideoCommentDownvoteProps.uid,
			}
	
			const select: SelectType<VideoCommentDownvote> = {
				videoId: 1,
				commentId: 1,
				uid: 1,
				editDateTime: 1,
			}
			
			try {
				const result = await selectDataFromMongoDB(where, select, schema, collectionName)
				const videoCommentDownvoteList = result.result
				if (result.success) {
					if (videoCommentDownvoteList && videoCommentDownvoteList.length > 0) {
						return { success: true, message: '获取用户点踩情况成功', videoCommentDownvoteResult: videoCommentDownvoteList }
					} else {
						return { success: true, message: '用户点踩情况为空', videoCommentDownvoteResult: [] }
					}
				} else {
					console.warn('WARN', 'WARNING', '获取用户点踩情况失败，查询失败或结果为空：', { getVideoCommentDownvoteProps })
					return { success: false, message: '获取用户点踩情况失败，查询失败', videoCommentDownvoteResult: [] }
				}
			} catch (error) {
				console.warn('WARN', 'WARNING', '获取用户点踩情况失败，查询失败：', error, { getVideoCommentDownvoteProps })
				return { success: false, message: '获取用户点踩情况失败，查询失败', videoCommentDownvoteResult: [] }
			}
		} else {
			console.warn('WARN', 'WARNING', '获取用户点踩情况失败，查询参数未通过校验', { getVideoCommentDownvoteProps })
			return { success: false, message: '获取用户点踩情况失败，必要参数为空', videoCommentDownvoteResult: [] }
		}
	} catch (error) {
		console.warn('WARN', 'WARNING', '获取用户点踩情况失败，错误信息：', error, { getVideoCommentDownvoteProps })
		return { success: false, message: '获取用户点踩情况失败，未知错误', videoCommentDownvoteResult: [] }
	}
}

/**
 * 用户给视频评论点赞
 * @param emitVideoCommentUpvoteRequest 用户给视频评论点赞的请求载荷
 * @param uid 用户 UID
 * @param token 用户 UID 对应的 token
 * @returns 用户给视频评论点赞的结果
 */
export const emitVideoCommentUpvoteService = async (emitVideoCommentUpvoteRequest: EmitVideoCommentUpvoteRequestDto, uid: number, token: string): Promise<EmitVideoCommentUpvoteResponseDto> => {
	// WARN // TODO 应当添加更多安全验证，防刷！
	try {
		if (checkEmitVideoCommentUpvoteRequestData(emitVideoCommentUpvoteRequest)) {
			if ((await checkUserTokenService(uid, token)).success) { // 校验用户，校验通过才能点赞
				const { collectionName: videoCommentUpvoteCollectionName, schema: videoCommentUpvoteSchema } = VideoCommentUpvoteSchema
				const correctVideoCommentUpvoteSchema = new Schema(videoCommentUpvoteSchema)
				type VideoCommentUpvote = InferSchemaType<typeof correctVideoCommentUpvoteSchema>
				const nowDate = new Date().getTime()
				const videoCommentUpvote: VideoCommentUpvote = {
					videoId: emitVideoCommentUpvoteRequest.videoId,
					commentId: emitVideoCommentUpvoteRequest.id,
					uid,
					editDateTime: nowDate,
				}

				const commentId = emitVideoCommentUpvoteRequest.id
				if (await checkUserHasUpvoted(commentId, uid)) {
					try {
						const insertData2MongoDBResult = await insertData2MongoDB(videoCommentUpvote, correctVideoCommentUpvoteSchema, videoCommentUpvoteCollectionName)
						if (insertData2MongoDBResult && insertData2MongoDBResult.success) {
							const { collectionName: videoCommentCollectionName, schema: videoCommentSchema } = VideoCommentSchema
							const correctVideoCommentSchema = new Schema(videoCommentSchema)
							const upvoteBy = 'upvoteCount'
							try {
								const updateResult = await findOneAndPlusByMongodbId(commentId, upvoteBy, correctVideoCommentSchema, videoCommentCollectionName)
								if (updateResult && updateResult.success) {
									return { success: true, message: '视频评论点赞成功' }
								} else {
									console.error('ERROR', '视频评论点赞数据存储成功，但点赞合计未增加', { emitVideoCommentUpvoteRequest, uid })
									return { success: false, message: '视频评论点赞数据存储成功，但点赞合计未增加' }
								}
							} catch (error) {
								console.error('ERROR', '视频评论点赞数据存储成功，但点赞合计增加失败', error, { emitVideoCommentUpvoteRequest, uid })
								return { success: false, message: '视频评论点赞数据存储成功，但点赞合计增加失败' }
							}
						} else {
							console.error('ERROR', '视频评论点赞失败', { emitVideoCommentUpvoteRequest, uid })
							return { success: false, message: '视频评论点赞失败，存储数据失败' }
						}
					} catch (error) {
						console.error('ERROR', '视频评论点赞失败，无法存储到 MongoDB', error, { emitVideoCommentUpvoteRequest, uid })
						return { success: false, message: '视频评论点赞失败，存储数据失败' }
					}
				} else {
					console.error('ERROR', '用户点赞时出错，用户已点赞', { emitVideoCommentUpvoteRequest, uid })
					return { success: false, message: '用户点赞时出错，用户已点赞' }
				}
			} else {
				console.error('ERROR', '用户点赞时出错，用户校验未通过', { emitVideoCommentUpvoteRequest, uid })
				return { success: false, message: '用户点赞时出错，用户校验未通过' }
			}
		} else {
			console.error('ERROR', '用户点赞时出错，点赞数据校验未通过：', { emitVideoCommentUpvoteRequest, uid })
			return { success: false, message: '用户点赞时出错，数据错误' }
		}
	} catch (error) {
		console.error('ERROR', '点赞失败，未知错误：', error, { emitVideoCommentUpvoteRequest, uid })
		return { success: false, message: '点赞失败，未知错误' }
	}
}

/**
 * 检查用户是否已经对一个视频评论点赞
 * @param commentId 评论的 ID
 * @param uid 用户 UID
 * @returns 校验结果，用户已点赞返回 false, 未点赞返回 true
 */
const checkUserHasUpvoted = async (commentId: string, uid: number): Promise<boolean> => {
	try {
		if (commentId && uid !== undefined && uid !== null) {
			const { collectionName, schema: videoCommentUpvoteSchema } = VideoCommentUpvoteSchema
			const schema = new Schema(videoCommentUpvoteSchema)
			type VideoCommentUpvote = InferSchemaType<typeof schema>
			const where: QueryType<VideoCommentUpvote> = {
				commentId,
			}
	
			const select: SelectType<VideoCommentUpvote> = {
				videoId: 1,
				commentId: 1,
				uid: 1,
			}
			
			try {
				const result = await selectDataFromMongoDB(where, select, schema, collectionName)
				if (result.success) {
					if (result.result && result.result.length > 0) {
						return false // 查询到结果了，证明用户已点赞过了，所以返回 false
					} else {
						return true // 查询成功但未查询到结果，证明用户已点赞过了，所以返回 false
					}
				} else {
					return true // 乐观：查询失败，也算作用户未点赞过
				}
			} catch (error) {
				console.error('在验证用户是否已经对某评论点赞时出错：获取用户点赞数据失败', { commentId, uid })
				return false
			}
		} else {
			console.error('在验证用户是否已经对某评论点赞时出错：数据校验未通过', { commentId, uid })
			return false
		}
	} catch (error) {
		console.error('在验证用户是否已经对某评论点赞时出错：', error, { commentId, uid })
		return false
	}
}

/**
 * 用户给视频评论点踩
 * @param emitVideoCommentDownvoteRequest 用户给视频评论点踩的请求载荷
 * @param uid 用户 UID
 * @param token 用户 UID 对应的 token
 * @returns 用户给视频评论点踩的结果
 */
export const emitVideoCommentDownvoteService = async (emitVideoCommentDownvoteRequest: EmitVideoCommentDownvoteRequestDto, uid: number, token: string): Promise<EmitVideoCommentDownvoteResponseDto> => {
	// WARN // TODO 应当添加更多安全验证，防刷！
	try {
		if (checkEmitVideoCommentDownvoteRequestData(emitVideoCommentDownvoteRequest)) {
			if ((await checkUserTokenService(uid, token)).success) { // 校验用户，校验通过才能点踩
				const { collectionName: videoCommentDownvoteCollectionName, schema: videoCommentDownvoteSchema } = VideoCommentDownvoteSchema
				const correctVideoCommentDownvoteSchema = new Schema(videoCommentDownvoteSchema)
				type VideoCommentDownvote = InferSchemaType<typeof correctVideoCommentDownvoteSchema>
				const nowDate = new Date().getTime()
				const videoCommentDownvote: VideoCommentDownvote = {
					videoId: emitVideoCommentDownvoteRequest.videoId,
					commentId: emitVideoCommentDownvoteRequest.id,
					uid,
					editDateTime: nowDate,
				}

				const commentId = emitVideoCommentDownvoteRequest.id
				if (await checkUserHasDownvoted(commentId, uid)) {
					try {
						const insertData2MongoDBResult = await insertData2MongoDB(videoCommentDownvote, correctVideoCommentDownvoteSchema, videoCommentDownvoteCollectionName)
						if (insertData2MongoDBResult && insertData2MongoDBResult.success) {
							const { collectionName: videoCommentCollectionName, schema: videoCommentSchema } = VideoCommentSchema
							const correctVideoCommentSchema = new Schema(videoCommentSchema)
							const downvoteBy = 'downvoteCount'
							try {
								const updateResult = await findOneAndPlusByMongodbId(commentId, downvoteBy, correctVideoCommentSchema, videoCommentCollectionName)
								if (updateResult && updateResult.success) {
									return { success: true, message: '视频评论点踩成功' }
								} else {
									console.error('ERROR', '视频评论点踩数据存储成功，但点踩合计未增加', { emitVideoCommentDownvoteRequest, uid })
									return { success: false, message: '视频评论点踩数据存储成功，但点踩合计未增加' }
								}
							} catch (error) {
								console.error('ERROR', '视频评论点踩数据存储成功，但点踩合计增加失败', error, { emitVideoCommentDownvoteRequest, uid })
								return { success: false, message: '视频评论点踩数据存储成功，但点踩合计增加失败' }
							}
						} else {
							console.error('ERROR', '视频评论点踩失败', { emitVideoCommentDownvoteRequest, uid })
							return { success: false, message: '视频评论点踩失败，存储数据失败' }
						}
					} catch (error) {
						console.error('ERROR', '视频评论点踩失败，无法存储到 MongoDB', error, { emitVideoCommentDownvoteRequest, uid })
						return { success: false, message: '视频评论点踩失败，存储数据失败' }
					}
				} else {
					console.error('ERROR', '用户点踩时出错，用户已点踩', { emitVideoCommentDownvoteRequest, uid })
					return { success: false, message: '用户点踩时出错，用户已点踩' }
				}
			} else {
				console.error('ERROR', '用户点踩时出错，用户校验未通过', { emitVideoCommentDownvoteRequest, uid })
				return { success: false, message: '用户点踩时出错，用户校验未通过' }
			}
		} else {
			console.error('ERROR', '用户点踩时出错，点踩数据校验未通过：', { emitVideoCommentDownvoteRequest, uid })
			return { success: false, message: '用户点踩时出错，数据错误' }
		}
	} catch (error) {
		console.error('ERROR', '点踩失败，未知错误：', error, { emitVideoCommentDownvoteRequest, uid })
		return { success: false, message: '点踩失败，未知错误' }
	}
}

/**
 * 检查用户是否已经对一个视频评论点踩
 * @param commentId 评论的 ID
 * @param uid 用户 UID
 * @returns 校验结果，用户已点踩返回 false, 未点踩返回 true
 */
const checkUserHasDownvoted = async (commentId: string, uid: number): Promise<boolean> => {
	try {
		if (commentId && uid !== undefined && uid !== null) {
			const { collectionName, schema: videoCommentDownvoteSchema } = VideoCommentDownvoteSchema
			const schema = new Schema(videoCommentDownvoteSchema)
			type VideoCommentDownvote = InferSchemaType<typeof schema>
			const where: QueryType<VideoCommentDownvote> = {
				commentId,
			}
	
			const select: SelectType<VideoCommentDownvote> = {
				videoId: 1,
				commentId: 1,
				uid: 1,
			}
			
			try {
				const result = await selectDataFromMongoDB(where, select, schema, collectionName)
				if (result.success) {
					if (result.result && result.result.length > 0) {
						return false // 查询到结果了，证明用户已点踩过了，所以返回 false
					} else {
						return true // 查询成功但未查询到结果，证明用户已点踩过了，所以返回 false
					}
				} else {
					return true // 乐观：查询失败，也算作用户未点踩过
				}
			} catch (error) {
				console.error('在验证用户是否已经对某评论点踩时出错：获取用户点踩数据失败', { commentId, uid })
				return false
			}
		} else {
			console.error('在验证用户是否已经对某评论点踩时出错：数据校验未通过', { commentId, uid })
			return false
		}
	} catch (error) {
		console.error('在验证用户是否已经对某评论点踩时出错：', error, { commentId, uid })
		return false
	}
}


/**
 * 校验发送视频评论数据是否合法
 * @param emitVideoCommentRequest 视频评论
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkEmitVideoCommentRequest = (emitVideoCommentRequest: EmitVideoCommentRequestDto): boolean => {
	return (
		emitVideoCommentRequest.text && emitVideoCommentRequest.text.length < 20000 // 视频评论正文不为空，且不长于 20000 字
		&& emitVideoCommentRequest.videoId !== undefined && emitVideoCommentRequest.videoId !== null // 视频评论不能缺少视频 ID
	)
}

/**
 * 校验获取某个用户对某个视频的评论的点赞情况的参数
 * @param getVideoCommentUpvoteProps 获取某个用户对某个视频的评论的点赞情况的参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkGetVideoCommentUpvoteProps = (getVideoCommentUpvoteProps: GetVideoCommentUpvotePropsDto): boolean => {
	return (
		getVideoCommentUpvoteProps.videoId !== undefined && getVideoCommentUpvoteProps.videoId !== null
		&& getVideoCommentUpvoteProps.uid !== undefined && getVideoCommentUpvoteProps.uid !== null
	)
}

/**
 * 校验获取某个用户对某个视频的评论的点踩情况的参数
 * @param getVideoCommentDownvoteProps 获取某个用户对某个视频的评论的点踩情况的参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkGetVideoCommentDownvoteProps = (getVideoCommentDownvoteProps: GetVideoCommentDownvotePropsDto): boolean => {
	return (
		getVideoCommentDownvoteProps.videoId !== undefined && getVideoCommentDownvoteProps.videoId !== null
		&& getVideoCommentDownvoteProps.uid !== undefined && getVideoCommentDownvoteProps.uid !== null
	)
}

/**
 * 校验根据 KVID 获取视频评论的请求的参数
 * @param getVideoCommentByKvidRequest 根据 KVID 获取视频评论的请求的参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkGetVideoCommentByKvidRequest = (getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto): boolean => {
	return (getVideoCommentByKvidRequest.videoId !== undefined && getVideoCommentByKvidRequest.videoId !== null)
}

/**
 * 校验用户点赞的请求参数
 * @param emitVideoCommentUpvoteRequest 用户点赞的请求参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkEmitVideoCommentUpvoteRequestData = (emitVideoCommentUpvoteRequest: EmitVideoCommentUpvoteRequestDto): boolean => {
	return (
		emitVideoCommentUpvoteRequest.videoId !== undefined && emitVideoCommentUpvoteRequest.videoId !== null
		&& !!emitVideoCommentUpvoteRequest.id
	)
}

/**
 * 校验用户点踩的请求参数
 * @param emitVideoCommentDownvoteRequest 用户点踩的请求参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkEmitVideoCommentDownvoteRequestData = (emitVideoCommentDownvoteRequest: EmitVideoCommentDownvoteRequestDto): boolean => {
	return (
		emitVideoCommentDownvoteRequest.videoId !== undefined && emitVideoCommentDownvoteRequest.videoId !== null
		&& !!emitVideoCommentDownvoteRequest.id
	)
}
