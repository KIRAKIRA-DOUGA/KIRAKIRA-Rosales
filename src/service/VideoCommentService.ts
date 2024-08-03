import { InferSchemaType } from 'mongoose'
import { GetUserInfoByUidRequestDto } from '../controller/UserControllerDto.js'
import { CancelVideoCommentDownvoteRequestDto, CancelVideoCommentDownvoteResponseDto, CancelVideoCommentUpvoteRequestDto, CancelVideoCommentUpvoteResponseDto, EmitVideoCommentDownvoteRequestDto, EmitVideoCommentDownvoteResponseDto, EmitVideoCommentRequestDto, EmitVideoCommentResponseDto, EmitVideoCommentUpvoteRequestDto, EmitVideoCommentUpvoteResponseDto, GetVideoCommentByKvidRequestDto, GetVideoCommentByKvidResponseDto, GetVideoCommentDownvotePropsDto, GetVideoCommentDownvoteResultDto, GetVideoCommentUpvotePropsDto, GetVideoCommentUpvoteResultDto, VideoCommentResult } from '../controller/VideoCommentControllerDto.js'
import { findOneAndPlusByMongodbId, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoCommentDownvoteSchema, VideoCommentSchema, VideoCommentUpvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserRoleService, checkUserTokenService, getUserInfoByUidService } from './UserService.js'

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
				if (await checkUserRoleService(uid, 'blocked')) {
					console.error('ERROR', '评论发送失败，用户已封禁')
					return { success: false, message: '评论发送失败，用户已封禁' }
				}

				const getCommentIndexResult = await getNextSequenceValueService(`KVID-${emitVideoCommentRequest.videoId}`, 1) // 以视频 ID 为键，获取下一个值，即评论楼层
				const commentIndex = getCommentIndexResult.sequenceValue
				if (getCommentIndexResult.success && commentIndex !== undefined && commentIndex !== null) {
					const { collectionName, schemaInstance } = VideoCommentSchema
					type VideoComment = InferSchemaType<typeof schemaInstance>
					const nowDate = new Date().getTime()
					const videoComment: VideoComment = {
						...emitVideoCommentRequest,
						uid,
						commentRoute: `${emitVideoCommentRequest.videoId}.${commentIndex}`,
						commentIndex,
						emitTime: nowDate,
						upvoteCount: 0,
						downvoteCount: 0,
						subComments: [] as VideoComment['subComments'], // TODO: Mongoose issue: #12420
						subCommentsCount: 0,
						editDateTime: nowDate,
					}
					try {
						const insertData2MongoDBResult = await insertData2MongoDB(videoComment, schemaInstance, collectionName)
						if (insertData2MongoDBResult && insertData2MongoDBResult.success) {
							const getUserInfoByUidRequest: GetUserInfoByUidRequestDto = { uid: videoComment.uid }
							try {
								const videoCommentSenderUserInfo = await getUserInfoByUidService(getUserInfoByUidRequest)
								const videoCommentSenderUserInfoResult = videoCommentSenderUserInfo.result
								if (videoCommentSenderUserInfo.success && videoCommentSenderUserInfoResult) {
									const videoCommentResult: VideoCommentResult = {
										_id: insertData2MongoDBResult.result?.[0]?._id?.toString(),
										...videoComment,
										userInfo: {
											username: videoCommentSenderUserInfoResult.username,
											avatar: videoCommentSenderUserInfoResult.avatar,
											userBannerImage: videoCommentSenderUserInfoResult.userBannerImage,
											signature: videoCommentSenderUserInfoResult.signature,
											gender: videoCommentSenderUserInfoResult.gender,
										},
										isUpvote: false,
										isDownvote: false,
									}
									return { success: true, message: '视频评论发送成功！', videoComment: videoCommentResult }
								} else {
									console.warn('WARN', 'WARNING', '视频评论发送成功，但是获取回显数据为空', { videoId: emitVideoCommentRequest.videoId, uid })
									return { success: false, message: '视频评论发送成功，请尝试刷新页面' }
								}
							} catch (error) {
								console.warn('WARN', 'WARNING', '视频评论发送成功，但是获取回显数据失败', error, { videoId: emitVideoCommentRequest.videoId, uid })
								return { success: false, message: '视频评论发送成功，请刷新页面' }
							}
						}
					} catch (error) {
						console.error('ERROR', '视频评论发送失败，无法存储到 MongoDB', error, { videoId: emitVideoCommentRequest.videoId, uid })
						return { success: false, message: '视频评论发送失败，存储视频评论数据失败' }
					}
				} else {
					console.error('ERROR', '视频评论发送失败，获取楼层数据失败，无法根据视频 ID 获取序列下一个值', { videoId: emitVideoCommentRequest.videoId, uid })
					return { success: false, message: '视频评论发送失败，获取楼层数据失败' }
				}
			} else {
				console.error('ERROR', '视频评论发送失败，用户校验未通过', { videoId: emitVideoCommentRequest.videoId, uid })
				return { success: false, message: '视频评论发送失败，用户校验未通过' }
			}
		} else {
			console.error('ERROR', '视频评论发送失败，弹幕数据校验未通过：', { videoId: emitVideoCommentRequest.videoId, uid })
			return { success: false, message: '视频评论发送失败，视频评论数据错误' }
		}
	} catch (error) {
		console.error('ERROR', '视频评论发送失败，错误信息：', error, { videoId: emitVideoCommentRequest.videoId, uid })
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
			if (uid !== undefined && uid !== null && token && (await checkUserTokenService(uid, token)).success) { // 校验用户，如果校验通过，则获取当前用户对某一视频的点赞/点踩的评论的评论 ID 列表
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

			const { collectionName, schemaInstance } = VideoCommentSchema
			type VideoComment = InferSchemaType<typeof schemaInstance>
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
				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
				const videoCommentList = result.result as GetVideoCommentByKvidResponseDto['videoCommentList']
				if (result.success) {
					if (videoCommentList && videoCommentList.length > 0) {
						const videoCommentUpvoteResult = getVideoCommentUpvoteResult?.videoCommentUpvoteResult
						const videoCommentDownvoteResult = getVideoCommentDownvoteResult?.videoCommentDownvoteResult
						const haveUpvote = (getVideoCommentUpvoteResult?.success && videoCommentUpvoteResult && videoCommentUpvoteResult?.length > 0)
						const haveDownvote = (getVideoCommentDownvoteResult?.success && videoCommentDownvoteResult && videoCommentDownvoteResult?.length > 0)

						/**
						 * 检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应值会变为 true
						 * 获取每个评论的发送者的用户信息
						 */
						const correctVideoComment = await Promise.all(videoCommentList.map(async videoComment => {
							let isUpvote = false
							let isDownvote = false
							if (haveUpvote) {
								isUpvote = videoCommentUpvoteResult.some(upvote => upvote.commentId === videoComment._id?.toString())
							}
							if (haveDownvote) {
								isDownvote = videoCommentDownvoteResult.some(upvote => upvote.commentId === videoComment._id?.toString())
							}

							const getUserInfoByUidRequest: GetUserInfoByUidRequestDto = { uid: videoComment.uid }
							try {
								const videoCommentSenderUserInfo = await getUserInfoByUidService(getUserInfoByUidRequest)
								const videoCommentSenderUserInfoResult = videoCommentSenderUserInfo.result
								if (videoCommentSenderUserInfo.success && videoCommentSenderUserInfoResult) {
									return {
										...videoComment,
										isUpvote,
										isDownvote,
										userInfo: {
											username: videoCommentSenderUserInfoResult.username,
											avatar: videoCommentSenderUserInfoResult.avatar,
											userBannerImage: videoCommentSenderUserInfoResult.userBannerImage,
											signature: videoCommentSenderUserInfoResult.signature,
											gender: videoCommentSenderUserInfoResult.gender,
										},
									}
								} else {
									console.warn('WARN', 'WARNING', '获取评论的发送者信息时出错：请求失败或未获取到数据', { ...videoComment })
									return {
										...videoComment,
										isUpvote,
										isDownvote,
									}
								}
							} catch (error) {
								console.warn('WARN', 'WARNING', '获取评论的发送者信息时出错：未知原因', error, { ...videoComment })
							}
						}))

						// /**
						//  * 检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应值会变为 true
						//  * 获取每个评论的发送者的用户信息
						//  */
						// const correctVideoComment: GetVideoCommentByKvidResponseDto['videoCommentList'] = []
						// for (let videoCommentCycleIndex = 0; videoCommentCycleIndex < videoCommentList.length; videoCommentCycleIndex++) {
						// 	const videoComment = videoCommentList[videoCommentCycleIndex]
						// 	let isUpvote = false
						// 	let isDownvote = false
						// 	if (haveUpvote) {
						// 		isUpvote = videoCommentUpvoteResult.some(upvote => upvote.commentId === videoComment._id?.toString())
						// 	}
						// 	if (haveDownvote) {
						// 		isDownvote = videoCommentDownvoteResult.some(upvote => upvote.commentId === videoComment._id?.toString())
						// 	}

						// 	const getUserInfoByUidRequest: GetUserInfoByUidRequestDto = { uid: videoComment.uid }
						// 	try {
						// 		const videoCommentSenderUserInfo = await getUserInfoByUidService(getUserInfoByUidRequest)
						// 		const videoCommentSenderUserInfoResult = videoCommentSenderUserInfo.result
						// 		if (videoCommentSenderUserInfo.success && videoCommentSenderUserInfoResult) {
						// 			correctVideoComment.push({
						// 				...videoComment,
						// 				isUpvote,
						// 				isDownvote,
						// 				userInfo: {
						// 					username: videoCommentSenderUserInfoResult.username,
						// 					avatar: videoCommentSenderUserInfoResult.avatar,
						// 					userBannerImage: videoCommentSenderUserInfoResult.userBannerImage,
						// 					signature: videoCommentSenderUserInfoResult.signature,
						// 					gender: videoCommentSenderUserInfoResult.gender,
						// 				},
						// 			})
						// 		} else {
						// 			console.warn('WARN', 'WARNING', '获取评论的发送者信息时出错：请求失败或未获取到数据', { ...videoComment })
						// 			correctVideoComment.push({
						// 				...videoComment,
						// 				isUpvote,
						// 				isDownvote,
						// 			})
						// 		}
						// 	} catch (error) {
						// 		console.warn('WARN', 'WARNING', '获取评论的发送者信息时出错：未知原因', error, { ...videoComment })
						// 	}
						// }

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
			const { collectionName, schemaInstance } = VideoCommentUpvoteSchema
			type VideoCommentUpvote = InferSchemaType<typeof schemaInstance>
			const where: QueryType<VideoCommentUpvote> = {
				videoId: getVideoCommentUpvoteProps.videoId,
				uid: getVideoCommentUpvoteProps.uid,
				invalidFlag: false,
			}

			const select: SelectType<VideoCommentUpvote> = {
				videoId: 1,
				commentId: 1,
				uid: 1,
				editDateTime: 1,
			}

			try {
				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
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
			const { collectionName, schemaInstance } = VideoCommentDownvoteSchema
			type VideoCommentDownvote = InferSchemaType<typeof schemaInstance>
			const where: QueryType<VideoCommentDownvote> = {
				videoId: getVideoCommentDownvoteProps.videoId,
				uid: getVideoCommentDownvoteProps.uid,
				invalidFlag: false,
			}

			const select: SelectType<VideoCommentDownvote> = {
				videoId: 1,
				commentId: 1,
				uid: 1,
				editDateTime: 1,
			}

			try {
				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
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
				const { collectionName: videoCommentUpvoteCollectionName, schemaInstance: correctVideoCommentUpvoteSchema } = VideoCommentUpvoteSchema
				type VideoCommentUpvote = InferSchemaType<typeof correctVideoCommentUpvoteSchema>
				const videoId = emitVideoCommentUpvoteRequest.videoId
				const commentId = emitVideoCommentUpvoteRequest.id
				const nowDate = new Date().getTime()
				const videoCommentUpvote: VideoCommentUpvote = {
					videoId,
					commentId,
					uid,
					invalidFlag: false,
					deleteFlag: false,
					editDateTime: nowDate,
				}

				if (!(await checkUserHasUpvoted(commentId, uid))) { // 用户没有对这条视频评论点赞，才能点赞
					try {
						const insertData2MongoDBResult = await insertData2MongoDB(videoCommentUpvote, correctVideoCommentUpvoteSchema, videoCommentUpvoteCollectionName)
						if (insertData2MongoDBResult && insertData2MongoDBResult.success) {
							const { collectionName: videoCommentCollectionName, schemaInstance: correctVideoCommentSchema } = VideoCommentSchema
							const upvoteBy = 'upvoteCount'
							try {
								const updateResult = await findOneAndPlusByMongodbId(commentId, upvoteBy, correctVideoCommentSchema, videoCommentCollectionName)
								if (updateResult && updateResult.success) {
									if (await checkUserHasDownvoted(commentId, uid)) { // 用户在点赞一个视频评论时，如果用户之前对这个视频评论有点踩，需要将视频评论的点踩取消
										const cancelVideoCommentDownvoteRequest: CancelVideoCommentDownvoteRequestDto = {
											id: commentId,
											videoId,
										}
										try {
											const cancelVideoCommentDownvoteResult = await cancelVideoCommentDownvoteService(cancelVideoCommentDownvoteRequest, uid, token)
											if (cancelVideoCommentDownvoteResult.success) {
												return { success: true, message: '视频评论点赞成功' }
											} else {
												console.error('ERROR', '视频评论点赞成功，但未能取消点踩', { emitVideoCommentUpvoteRequest, uid })
												return { success: false, message: '视频评论点赞成功，但未能取消点踩' }
											}
										} catch (error) {
											console.error('ERROR', '视频评论点赞成功，但取消点踩的请求失败', error, { emitVideoCommentUpvoteRequest, uid })
											return { success: false, message: '视频评论点赞成功，但取消点踩失败' }
										}
									} else {
										return { success: true, message: '视频评论点赞成功' }
									}
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
 * 用户取消点赞一个视频评论
 * @param cancelVideoCommentUpvoteRequest 用户取消点赞一个视频评论的请求参数
 * @param uid 用户 UID
 * @param token 用户 UID 对应的 token
 * @returns 用户取消点赞一个视频评论的结果
 */
export const cancelVideoCommentUpvoteService = async (cancelVideoCommentUpvoteRequest: CancelVideoCommentUpvoteRequestDto, uid: number, token: string): Promise<CancelVideoCommentUpvoteResponseDto> => {
	try {
		if (checkCancelVideoCommentUpvoteRequest(cancelVideoCommentUpvoteRequest)) {
			if ((await checkUserTokenService(uid, token)).success) { // 校验用户，校验通过才能取消点赞
				const { collectionName: videoCommentUpvoteCollectionName, schemaInstance: correctVideoCommentUpvoteSchema } = VideoCommentUpvoteSchema
				type VideoCommentUpvote = InferSchemaType<typeof correctVideoCommentUpvoteSchema>
				const commentId = cancelVideoCommentUpvoteRequest.id
				const cancelVideoCommentUpvoteWhere: QueryType<VideoCommentUpvote> = {
					videoId: cancelVideoCommentUpvoteRequest.videoId,
					commentId,
					uid,
				}
				const cancelVideoCommentUpvoteUpdate: QueryType<VideoCommentUpvote> = {
					invalidFlag: true,
				}
				try {
					const updateResult = await updateData4MongoDB(cancelVideoCommentUpvoteWhere, cancelVideoCommentUpvoteUpdate, correctVideoCommentUpvoteSchema, videoCommentUpvoteCollectionName)
					if (updateResult && updateResult.success && updateResult.result) {
						if (updateResult.result.matchedCount > 0 && updateResult.result.modifiedCount > 0) {
							try {
								const { collectionName: videoCommentCollectionName, schemaInstance: correctVideoCommentSchema } = VideoCommentSchema
								const upvoteBy = 'upvoteCount'
								const updateResult = await findOneAndPlusByMongodbId(commentId, upvoteBy, correctVideoCommentSchema, videoCommentCollectionName, -1)
								if (updateResult.success) {
									return { success: true, message: '用户取消点赞成功' }
								} else {
									console.warn('WARN', 'WARNING', '用户取消点赞成功，但点赞总数未更新')
									return { success: true, message: '用户取消点赞成功，但点赞总数未更新' }
								}
							} catch (error) {
								console.warn('WARN', 'WARNING', '用户取消点赞成功，但点赞总数更新失败')
								return { success: true, message: '用户取消点赞成功，但点赞总数更新失败' }
							}
						} else {
							console.error('ERROR', '用户取消点赞时出错，更新数量为 0', { cancelVideoCommentUpvoteRequest, uid })
							return { success: false, message: '用户取消点赞时出错，无法更新' }
						}
					}
				} catch (error) {
					console.error('ERROR', '用户取消点赞时出错，更新数据时出错', error, { cancelVideoCommentUpvoteRequest, uid })
					return { success: false, message: '用户取消点赞时出错，更新数据时出错' }
				}
			} else {
				console.error('ERROR', '用户取消点赞时出错，用户校验未通过', { cancelVideoCommentUpvoteRequest, uid })
				return { success: false, message: '用户取消点赞时出错，用户校验未通过' }
			}
		} else {
			console.error('ERROR', '用户取消点赞时出错，参数不合法或必要的参数为空', { cancelVideoCommentUpvoteRequest, uid })
			return { success: false, message: '用户取消点赞时出错，参数异常' }
		}
	} catch (error) {
		console.error('ERROR', '用户取消点赞时出错，未知错误', error, { cancelVideoCommentUpvoteRequest, uid })
		return { success: false, message: '用户取消点赞时出错，未知错误' }
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
			const { collectionName, schemaInstance } = VideoCommentUpvoteSchema
			type VideoCommentUpvote = InferSchemaType<typeof schemaInstance>
			const where: QueryType<VideoCommentUpvote> = {
				commentId,
				invalidFlag: false,
			}

			const select: SelectType<VideoCommentUpvote> = {
				videoId: 1,
				commentId: 1,
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
				const { collectionName: videoCommentDownvoteCollectionName, schemaInstance: correctVideoCommentDownvoteSchema } = VideoCommentDownvoteSchema

				type VideoCommentDownvote = InferSchemaType<typeof correctVideoCommentDownvoteSchema>
				const videoId = emitVideoCommentDownvoteRequest.videoId
				const commentId = emitVideoCommentDownvoteRequest.id
				const nowDate = new Date().getTime()
				const videoCommentDownvote: VideoCommentDownvote = {
					videoId,
					commentId,
					uid,
					invalidFlag: false,
					deleteFlag: false,
					editDateTime: nowDate,
				}

				if (!(await checkUserHasDownvoted(commentId, uid))) { // 用户没有对这条视频评论点踩，才能点踩
					try {
						const insertData2MongoDBResult = await insertData2MongoDB(videoCommentDownvote, correctVideoCommentDownvoteSchema, videoCommentDownvoteCollectionName)
						if (insertData2MongoDBResult && insertData2MongoDBResult.success) {
							const { collectionName: videoCommentCollectionName, schemaInstance: correctVideoCommentSchema } = VideoCommentSchema
							const downvoteBy = 'downvoteCount'
							try {
								const updateResult = await findOneAndPlusByMongodbId(commentId, downvoteBy, correctVideoCommentSchema, videoCommentCollectionName)
								if (updateResult && updateResult.success) {
									if (await checkUserHasUpvoted(commentId, uid)) { // 用户在点踩一个视频评论时，如果用户之前对这个视频评论有点赞，需要将视频评论的点赞取消
										const cancelVideoCommentUpvoteRequest: CancelVideoCommentUpvoteRequestDto = {
											id: commentId,
											videoId,
										}
										try {
											const cancelVideoCommentUpvoteResult = await cancelVideoCommentUpvoteService(cancelVideoCommentUpvoteRequest, uid, token)
											if (cancelVideoCommentUpvoteResult.success) {
												return { success: true, message: '视频评论点踩成功' }
											} else {
												console.error('ERROR', '视频评论点踩成功，但未能取消点赞', { emitVideoCommentDownvoteRequest, uid })
												return { success: false, message: '视频评论点踩成功，但未能取消点赞' }
											}
										} catch (error) {
											console.error('ERROR', '视频评论点踩成功，但取消点赞的请求失败', error, { emitVideoCommentDownvoteRequest, uid })
											return { success: false, message: '视频评论点踩成功，但取消点赞失败' }
										}
									} else {
										return { success: true, message: '视频评论点踩成功' }
									}
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
 * 用户取消点踩一个视频评论
 * @param cancelVideoCommentDownvoteRequest 用户取消点踩一个视频评论的请求参数
 * @param uid 用户 UID
 * @param token 用户 UID 对应的 token
 * @returns 用户取消点踩一个视频评论的结果
 */
export const cancelVideoCommentDownvoteService = async (cancelVideoCommentDownvoteRequest: CancelVideoCommentDownvoteRequestDto, uid: number, token: string): Promise<CancelVideoCommentDownvoteResponseDto> => {
	try {
		if (checkCancelVideoCommentDownvoteRequest(cancelVideoCommentDownvoteRequest)) {
			if ((await checkUserTokenService(uid, token)).success) { // 校验用户，校验通过才能取消点踩
				const { collectionName: videoCommentDownvoteCollectionName, schemaInstance: correctVideoCommentDownvoteSchema } = VideoCommentDownvoteSchema
				type VideoCommentDownvote = InferSchemaType<typeof correctVideoCommentDownvoteSchema>
				const commentId = cancelVideoCommentDownvoteRequest.id
				const cancelVideoCommentDownvoteWhere: QueryType<VideoCommentDownvote> = {
					videoId: cancelVideoCommentDownvoteRequest.videoId,
					commentId,
					uid,
				}
				const cancelVideoCommentDownvoteUpdate: QueryType<VideoCommentDownvote> = {
					invalidFlag: true,
				}
				try {
					const updateResult = await updateData4MongoDB(cancelVideoCommentDownvoteWhere, cancelVideoCommentDownvoteUpdate, correctVideoCommentDownvoteSchema, videoCommentDownvoteCollectionName)
					if (updateResult && updateResult.success && updateResult.result) {
						if (updateResult.result.matchedCount > 0 && updateResult.result.modifiedCount > 0) {
							try {
								const { collectionName: videoCommentCollectionName, schemaInstance: correctVideoCommentSchema } = VideoCommentSchema
								const downvoteBy = 'downvoteCount'
								const updateResult = await findOneAndPlusByMongodbId(commentId, downvoteBy, correctVideoCommentSchema, videoCommentCollectionName, -1)
								if (updateResult.success) {
									return { success: true, message: '用户取消点踩成功' }
								} else {
									console.warn('WARN', 'WARNING', '用户取消点踩成功，但点踩总数未更新')
									return { success: true, message: '用户取消点踩成功，但点踩总数未更新' }
								}
							} catch (error) {
								console.warn('WARN', 'WARNING', '用户取消点踩成功，但点踩总数更新失败')
								return { success: true, message: '用户取消点踩成功，但点踩总数更新失败' }
							}
						} else {
							console.error('ERROR', '用户取消点踩时出错，更新数量为 0', { cancelVideoCommentDownvoteRequest, uid })
							return { success: false, message: '用户取消点踩时出错，无法更新' }
						}
					}
				} catch (error) {
					console.error('ERROR', '用户取消点踩时出错，更新数据时出错', error, { cancelVideoCommentDownvoteRequest, uid })
					return { success: false, message: '用户取消点踩时出错，更新数据时出错' }
				}
			} else {
				console.error('ERROR', '用户取消点踩时出错，用户校验未通过', { cancelVideoCommentDownvoteRequest, uid })
				return { success: false, message: '用户取消点踩时出错，用户校验未通过' }
			}
		} else {
			console.error('ERROR', '用户取消点踩时出错，参数不合法或必要的参数为空', { cancelVideoCommentDownvoteRequest, uid })
			return { success: false, message: '用户取消点踩时出错，参数异常' }
		}
	} catch (error) {
		console.error('ERROR', '用户取消点踩时出错，未知错误', error, { cancelVideoCommentDownvoteRequest, uid })
		return { success: false, message: '用户取消点踩时出错，未知错误' }
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
			const { collectionName, schemaInstance } = VideoCommentDownvoteSchema
			type VideoCommentDownvote = InferSchemaType<typeof schemaInstance>
			const where: QueryType<VideoCommentDownvote> = {
				commentId,
				invalidFlag: false,
			}

			const select: SelectType<VideoCommentDownvote> = {
				videoId: 1,
				commentId: 1,
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
 * 检查用户取消点赞的请求参数
 * @param cancelVideoCommentUpvoteRequest 用户取消点赞的请求参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkCancelVideoCommentUpvoteRequest = (cancelVideoCommentUpvoteRequest: CancelVideoCommentUpvoteRequestDto): boolean => {
	return (
		cancelVideoCommentUpvoteRequest.videoId !== undefined && cancelVideoCommentUpvoteRequest.videoId !== null
		&& !!cancelVideoCommentUpvoteRequest.id
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

/**
 * 检查用户取消点踩的请求参数
 * @param cancelVideoCommentDownvoteRequest 用户取消点踩的请求参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkCancelVideoCommentDownvoteRequest = (cancelVideoCommentDownvoteRequest: CancelVideoCommentDownvoteRequestDto): boolean => {
	return (
		cancelVideoCommentDownvoteRequest.videoId !== undefined && cancelVideoCommentDownvoteRequest.videoId !== null
		&& !!cancelVideoCommentDownvoteRequest.id
	)
}
