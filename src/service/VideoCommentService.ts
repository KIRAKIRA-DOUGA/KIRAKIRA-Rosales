import mongoose, { InferSchemaType, PipelineStage } from 'mongoose'
import { GetUserInfoByUidRequestDto } from '../controller/UserControllerDto.js'
import { AdminDeleteVideoCommentRequestDto, AdminDeleteVideoCommentResponseDto, CancelVideoCommentDownvoteRequestDto, CancelVideoCommentDownvoteResponseDto, CancelVideoCommentUpvoteRequestDto, CancelVideoCommentUpvoteResponseDto, DeleteSelfVideoCommentRequestDto, DeleteSelfVideoCommentResponseDto, EmitVideoCommentDownvoteRequestDto, EmitVideoCommentDownvoteResponseDto, EmitVideoCommentRequestDto, EmitVideoCommentResponseDto, EmitVideoCommentUpvoteRequestDto, EmitVideoCommentUpvoteResponseDto, GetVideoCommentByKvidRequestDto, GetVideoCommentByKvidResponseDto, GetVideoCommentDownvotePropsDto, GetVideoCommentDownvoteResultDto, GetVideoCommentUpvotePropsDto, GetVideoCommentUpvoteResultDto, VideoCommentResult } from '../controller/VideoCommentControllerDto.js'
import { findOneAndPlusByMongodbId, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB, deleteDataFromMongoDB, selectDataByAggregateFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { RemovedVideoCommentSchema, VideoCommentDownvoteSchema, VideoCommentSchema, VideoCommentUpvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserRoleService, checkUserTokenByUuidService, checkUserTokenService, getUserInfoByUidService, getUserUuid } from './UserService.js'

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

				const UUID = await getUserUuid(uid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
				if (!UUID) {
					console.error('ERROR', '评论发送失败，UUID 不存在', { uid })
					return { success: false, message: '评论发送失败，UUID 不存在' }
				}

				// 启动事务
				const session = await mongoose.startSession()
				session.startTransaction()

				const getCommentIndexResult = await getNextSequenceValueService(`KVID-${emitVideoCommentRequest.videoId}`, 1, 1, session) // 以视频 ID 为键，获取下一个值，即评论楼层
				const commentIndex = getCommentIndexResult.sequenceValue
				if (getCommentIndexResult.success && commentIndex !== undefined && commentIndex !== null) {
					const { collectionName, schemaInstance } = VideoCommentSchema
					type VideoComment = InferSchemaType<typeof schemaInstance>
					const nowDate = new Date().getTime()
					const videoComment: VideoComment = {
						...emitVideoCommentRequest,
						UUID,
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
						const insertData2MongoDBResult = await insertData2MongoDB(videoComment, schemaInstance, collectionName, { session })
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
											userNickname: videoCommentSenderUserInfoResult.userNickname,
											username: videoCommentSenderUserInfoResult.username,
											avatar: videoCommentSenderUserInfoResult.avatar,
											userBannerImage: videoCommentSenderUserInfoResult.userBannerImage,
											signature: videoCommentSenderUserInfoResult.signature,
											gender: videoCommentSenderUserInfoResult.gender,
										},
										isUpvote: false,
										isDownvote: false,
									}
									await session.commitTransaction()
									session.endSession()
									return { success: true, message: '视频评论发送成功！', videoComment: videoCommentResult }
								} else {
									if (session.inTransaction()) {
										await session.abortTransaction()
									}
									session.endSession()
									console.warn('WARN', 'WARNING', '视频评论发送成功，但是获取回显数据为空', { videoId: emitVideoCommentRequest.videoId, uid })
									return { success: false, message: '视频评论发送成功，请尝试刷新页面' }
								}
							} catch (error) {
								if (session.inTransaction()) {
									await session.abortTransaction()
								}
								session.endSession()
								console.warn('WARN', 'WARNING', '视频评论发送成功，但是获取回显数据失败', error, { videoId: emitVideoCommentRequest.videoId, uid })
								return { success: false, message: '视频评论发送成功，请刷新页面' }
							}
						} else {
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							console.error('ERROR', '视频评论发送失败，未返回结果', { videoId: emitVideoCommentRequest.videoId, uid })
							return { success: false, message: '视频评论发送失败，存储视频评论数据失败' }
						}
					} catch (error) {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '视频评论发送失败，无法存储到 MongoDB', error, { videoId: emitVideoCommentRequest.videoId, uid })
						return { success: false, message: '视频评论发送失败，存储视频评论数据失败' }
					}
				} else {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
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
export const getVideoCommentListByKvidService = async (getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto, uuid: string, token: string): Promise<GetVideoCommentByKvidResponseDto> => {
	// WARN // TODO 应当添加更多安全验证，防刷！
	try {
		if (!checkGetVideoCommentByKvidRequest(getVideoCommentByKvidRequest)) {
			console.error('ERROR', '获取视频评论列表失败，数据校验失败', { getVideoCommentByKvidRequest })
			return { success: false, message: '获取视频评论列表失败，数据校验失败', videoCommentCount: 0, videoCommentList: [] }
		}

		if (uuid !== undefined && uuid !== null && token) { // 校验用户，如果校验通过，则获取当前用户对某一视频的点赞/点踩的评论的评论 ID 列表
			if (!(await checkUserTokenByUuidService(uuid, token)).success) {
				console.error('ERROR', '获取视频评论列表失败，用户校验未通过', { getVideoCommentByKvidRequest })
				return { success: false, message: '获取视频评论列表失败，用户校验未通过', videoCommentCount: 0, videoCommentList: [] }
			}
		}

		const videoId = getVideoCommentByKvidRequest.videoId
		let pageSize = undefined
		let skip = 0
		if (getVideoCommentByKvidRequest.pagination && getVideoCommentByKvidRequest.pagination.page > 0 && getVideoCommentByKvidRequest.pagination.pageSize > 0) {
			skip = (getVideoCommentByKvidRequest.pagination.page - 1) * getVideoCommentByKvidRequest.pagination.pageSize
			pageSize = getVideoCommentByKvidRequest.pagination.pageSize
		}

		// 获取视频的评论总数的 pipeline
		const countVideoCommentPipeline = [
			// 1. 查询评论信息
			{
				$match: {
					videoId // 通过 videoId 筛选评论
				},
			},
			// 2. 统计总数量
			{
				$count: 'totalCount', // 统计总文档数
			}
		]

		// 获取视频评论的 pipeline
		const getVideoCommentsPipeline: PipelineStage[] = [
			// 1. 查询评论信息
			{
				$match: {
					videoId // 通过 videoId 筛选评论
				},
			},
			// 2. 关联用户表获取评论发送者信息
			{
				$lookup: {
					from: 'user-infos', // WARN: 别忘了变复数
					localField: 'UUID',
					foreignField: 'UUID',
					as: 'user_info_data',
				},
			},
			{
				$unwind: {
					path: '$user_info_data',
					preserveNullAndEmptyArrays: true, // 保留空数组和null值
				},
			},
			// 3. 按楼层升序排序
			{ $sort: { 'commentIndex': 1 } },
			// 4. 分页查询
			{ $skip: skip }, // 跳过指定数量的文档
			...(pageSize ? [{ $limit: pageSize }] : []), // 限制返回的文档数量
			// 5. 关联目标用户的点赞数据
			{
				$lookup: {
					from: 'video-comment-upvotes', // 用户视频评论点赞表名 // WARN: 别忘了变复数
					let: { commentId: { $toString: '$_id' } }, // 当前评论的 _id
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ['$commentId', '$$commentId'] }, // 匹配评论 ID
										{ $eq: ['$UUID', uuid] }, // 匹配用户 UUID
										{ $eq: ['$invalidFlag', false] }, // 只统计有效点赞
									],
								},
							},
						},
					],
					as: 'userUpvote',
				},
			},
			// 6. 只关联该用户的点踩数据
			{
				$lookup: {
					from: 'video-comment-downvotes', // 用户视频评论点踩表名 // WARN: 别忘了变复数
					let: { commentId: { $toString: '$_id' } },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ['$commentId', '$$commentId'] },
										{ $eq: ['$UUID', uuid] }, // 匹配用户 UUID
										{ $eq: ['$invalidFlag', false] }, // 只统计有效点踩
									],
								},
							},
						},
					],
					as: 'userDownvote',
				},
			},
			// 7. 判断用户是否点赞或点踩
			{
				$addFields: {
					isUpvote: { $gt: [{ $size: '$userUpvote' }, 0] }, // 是否点赞
					isDownvote: { $gt: [{ $size: '$userDownvote' }, 0] }, // 是否点踩
				},
			},
			// 8. 清理不必要字段，返回所需数据
			{
				$project: {
					_id: 1, // 评论的 ID
					content: 1, // 评论内容
					commentRoute: 1, // 评论的路由
					videoId: 1,
					UUID: 1, // 评论发送者的 UUID
					uid: 1, // 评论发送者的 UID
					emitTime: 1, // 发送评论的时间
					text: 1, // 评论正文
					upvoteCount: 1, // 评论点赞数
					downvoteCount: 1, // 评论点踩数
					commentIndex: 1, // 评论楼层数
					subCommentsCount: 1, // 该评论的下一级子评论数量
					editDateTime: 1, // 最后编辑时间
					isUpvote: 1, // 是否已点赞
					isDownvote: 1, // 是否已点踩
					userInfo: {
						username: '$user_info_data.username', // 用户名
						userNickname: '$user_info_data.userNickname', // 用户昵称
						avatar: '$user_info_data.avatar', // 用户头像的链接
						signature: '$user_info_data.signature', // 用户的个性签名
						gender: '$user_info_data.gender' // 用户的性别
					},
				},
			},
		]

		const { collectionName, schemaInstance } = VideoCommentSchema
		const videoCommentsCountResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, countVideoCommentPipeline)
		const videoCommentsResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, getVideoCommentsPipeline)

		if (!videoCommentsResult.success || !videoCommentsCountResult.success) {
			console.error('ERROR', '获取视频评论列表失败，查询数据失败', { getVideoCommentByKvidRequest })
			return { success: false, message: '获取视频评论列表失败，查询数据失败', videoCommentCount: 0, videoCommentList: [] }
		}

		return {
			success: true,
			message: videoCommentsCountResult.result?.[0]?.totalCount > 0 ? '获取视频评论列表成功' : '获取视频评论列表成功，长度为空',
			videoCommentCount: videoCommentsCountResult.result?.[0]?.totalCount,
			videoCommentList: videoCommentsResult.result,
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
				const UUID = await getUserUuid(uid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
				if (!UUID) {
					console.error('ERROR', '评论点赞失败，UUID 不存在', { uid })
					return { success: false, message: '评论点赞失败，UUID 不存在' }
				}

				const { collectionName: videoCommentUpvoteCollectionName, schemaInstance: correctVideoCommentUpvoteSchema } = VideoCommentUpvoteSchema
				type VideoCommentUpvote = InferSchemaType<typeof correctVideoCommentUpvoteSchema>
				const videoId = emitVideoCommentUpvoteRequest.videoId
				const commentId = emitVideoCommentUpvoteRequest.id
				const nowDate = new Date().getTime()
				const videoCommentUpvote: VideoCommentUpvote = {
					videoId,
					commentId,
					UUID,
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
				uid,
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
				const UUID = await getUserUuid(uid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
				if (!UUID) {
					console.error('ERROR', '评论点踩失败，UUID 不存在', { uid })
					return { success: false, message: '评论点踩失败，UUID 不存在' }
				}

				const { collectionName: videoCommentDownvoteCollectionName, schemaInstance: correctVideoCommentDownvoteSchema } = VideoCommentDownvoteSchema

				type VideoCommentDownvote = InferSchemaType<typeof correctVideoCommentDownvoteSchema>
				const videoId = emitVideoCommentDownvoteRequest.videoId
				const commentId = emitVideoCommentDownvoteRequest.id
				const nowDate = new Date().getTime()
				const videoCommentDownvote: VideoCommentDownvote = {
					videoId,
					commentId,
					UUID,
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
				uid,
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
 * 删除一条自己发布的视频评论
 * @param deleteSelfVideoCommentRequest 删除一条自己发布的视频评论请求载荷
 * @param uid 用户 UID
 * @param token 用户 UID 对应的 token
 * @returns 删除一条自己发布的视频评论请求响应
 */
export const deleteSelfVideoCommentService = async (deleteSelfVideoCommentRequest: DeleteSelfVideoCommentRequestDto, uid: number, token: string): Promise<DeleteSelfVideoCommentResponseDto> => {
	try {
		if (!checkDeleteSelfVideoCommentRequest(deleteSelfVideoCommentRequest)) {
			console.error('删除视频评论失败，参数不合法')
			return { success: false, message: '删除视频评论失败，参数不合法' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			console.error('删除视频评论失败，用户校验未通过')
			return { success: false, message: '删除视频评论失败，用户校验未通过' }
		}

		const UUID = await getUserUuid(uid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
		if (!UUID) {
			console.error('ERROR', '删除一条自己发布的视频评论失败，UUID 不存在', { uid })
			return { success: false, message: '删除一条自己发布的视频评论失败，UUID 不存在' }
		}

		const { commentRoute, videoId } = deleteSelfVideoCommentRequest
		const now = new Date().getTime()
		const { collectionName: videoCommentSchemaName, schemaInstance: videoCommentSchemaInstance } = VideoCommentSchema
		const { collectionName: removedVideoCommentSchemaName, schemaInstance: removedVideoCommentSchemaInstance } = RemovedVideoCommentSchema
		type VideoComment = InferSchemaType<typeof videoCommentSchemaInstance>
		type RemovedVideoComment = InferSchemaType<typeof removedVideoCommentSchemaInstance>

		const deleteSelfVideoCommentWhere: QueryType<VideoComment> | QueryType<RemovedVideoComment> = {
			commentRoute,
			videoId,
		}

		const deleteSelfVideoCommentSelect: SelectType<VideoComment> = {
			commentRoute: 1,
			videoId: 1,
			UUID: 1,
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
			const deleteSelfVideoCommentSelectResult = await selectDataFromMongoDB<VideoComment>(deleteSelfVideoCommentWhere, deleteSelfVideoCommentSelect, videoCommentSchemaInstance, videoCommentSchemaName)

			if (!deleteSelfVideoCommentSelectResult.success || !deleteSelfVideoCommentSelectResult.result || deleteSelfVideoCommentSelectResult.result.length !== 1) {
				console.error('删除视频评论失败，检索视频评论结果为空或长度超过限制')
				return { success: false, message: '删除视频评论失败，检索视频评论结果为空或长度超过限制' }
			}

			const videoData = deleteSelfVideoCommentSelectResult.result[0]

			if (videoData.uid !== uid) {
				console.error('删除视频评论失败，只能删除自己的评论')
				return { success: false, message: '删除视频评论失败，只能删除自己的评论' }
			}

			// 启动事务
			const session = await mongoose.startSession()
			session.startTransaction()

			const removedVideoCommentData: RemovedVideoComment = {
				...deleteSelfVideoCommentSelectResult.result[0],
				_operatorUUID_: UUID,
				_operatorUid_: uid,
				editDateTime: now,
			}

			try {
				const deleteSelfVideoCommentSaveResult = await insertData2MongoDB<RemovedVideoComment>(removedVideoCommentData, removedVideoCommentSchemaInstance, removedVideoCommentSchemaName, { session })

				if (!deleteSelfVideoCommentSaveResult.success) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('删除视频评论失败，保存已删除视频评论失败')
					return { success: false, message: '删除视频评论失败，记录失败' }
				}

				const deleteSelfVideoCommentDeleteResult = await deleteDataFromMongoDB<VideoComment>(deleteSelfVideoCommentWhere, videoCommentSchemaInstance, videoCommentSchemaName, { session })

				if (!deleteSelfVideoCommentDeleteResult.success) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('删除视频评论失败，删除失败')
					return { success: false, message: '删除视频评论失败，删除失败' }
				}

				await session.commitTransaction()
				session.endSession()
				return { success: true, message: '删除视频评论成功' }
			} catch (error) {
				if (session.inTransaction()) {
					await session.abortTransaction()
				}
				session.endSession()
				console.error('删除视频评论时出错：保存已删除视频评论出错', error)
				return { success: false, message: '删除视频评论时出错：无法存储记录' }
			}
		} catch (error) {
			console.error('删除视频评论时出错：检索视频评论出错', error)
			return { success: false, message: '删除视频评论时出错：检索视频评论出错' }
		}
	} catch (error) {
		console.error('删除视频评论时出错：未知错误', error)
		return { success: false, message: '删除视频评论时出错：未知错误' }
	}
}

/**
 * 管理员删除一条视频评论
 * @param adminDeleteVideoCommentRequest 管理员删除一个视频评论的请求载荷
 * @param adminUid 管理员 UID
 * @param adminToken 管理员 token
 * @returns 管理员删除一个视频评论的请求响应
 */
export const adminDeleteVideoCommentService = async (adminDeleteVideoCommentRequest: AdminDeleteVideoCommentRequestDto, adminUid: number, adminToken: string): Promise<AdminDeleteVideoCommentResponseDto> => {
	try {
		if (!checkAdminDeleteVideoCommentRequest(adminDeleteVideoCommentRequest)) {
			console.error('管理员删除视频评论失败，参数不合法')
			return { success: false, message: '管理员删除视频评论失败，参数不合法' }
		}

		if (!(await checkUserTokenService(adminUid, adminToken)).success) {
			console.error('管理员删除视频评论失败，用户校验未通过')
			return { success: false, message: '管理员删除视频评论失败，用户校验未通过' }
		}

		if (!(await checkUserRoleService(adminUid, 'admin'))) {
			console.error('管理员删除视频评论失败，用户权限不足')
			return { success: false, message: '管理员删除视频评论失败，用户权限不足' }
		}

		const adminUUID = await getUserUuid(adminUid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
		if (!adminUUID) {
			console.error('ERROR', '管理员删除一条视频评论失败，adminUUID 不存在', { adminUid })
			return { success: false, message: '管理员删除一条视频评论失败，adminUUID 不存在' }
		}

		const { commentRoute, videoId } = adminDeleteVideoCommentRequest
		const now = new Date().getTime()
		const { collectionName: videoCommentSchemaName, schemaInstance: videoCommentSchemaInstance } = VideoCommentSchema
		const { collectionName: removedVideoCommentSchemaName, schemaInstance: removedVideoCommentSchemaInstance } = RemovedVideoCommentSchema
		type VideoComment = InferSchemaType<typeof videoCommentSchemaInstance>
		type RemovedVideoComment = InferSchemaType<typeof removedVideoCommentSchemaInstance>

		const deleteSelfVideoCommentWhere: QueryType<VideoComment> | QueryType<RemovedVideoComment> = {
			commentRoute,
			videoId,
		}

		const deleteSelfVideoCommentSelect: SelectType<VideoComment> = {
			commentRoute: 1,
			videoId: 1,
			UUID: 1,
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
			const deleteSelfVideoCommentSelectResult = await selectDataFromMongoDB<VideoComment>(deleteSelfVideoCommentWhere, deleteSelfVideoCommentSelect, videoCommentSchemaInstance, videoCommentSchemaName)

			if (!deleteSelfVideoCommentSelectResult.success || !deleteSelfVideoCommentSelectResult.result || deleteSelfVideoCommentSelectResult.result.length !== 1) {
				console.error('管理员删除视频评论失败，检索视频评论结果为空或长度超过限制')
				return { success: false, message: '管理员删除视频评论失败，检索视频评论结果为空或长度超过限制' }
			}

			// 启动事务
			const session = await mongoose.startSession()
			session.startTransaction()

			const adminRemovedVideoCommentData: RemovedVideoComment = {
				...deleteSelfVideoCommentSelectResult.result[0],
				_operatorUUID_: adminUUID,
				_operatorUid_: adminUid,
				editDateTime: now,
			}

			try {
				const adminDeleteVideoCommentSaveResult = await insertData2MongoDB<VideoComment>(adminRemovedVideoCommentData, removedVideoCommentSchemaInstance, removedVideoCommentSchemaName, { session })

				if (!adminDeleteVideoCommentSaveResult.success) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('管理员删除视频评论失败，保存已删除视频评论失败')
					return { success: false, message: '管理员删除视频评论失败，记录失败' }
				}

				const deleteSelfVideoCommentDeleteResult = await deleteDataFromMongoDB<VideoComment>(deleteSelfVideoCommentWhere, videoCommentSchemaInstance, videoCommentSchemaName, { session })

				if (!deleteSelfVideoCommentDeleteResult.success) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('管理员删除视频评论失败，删除失败')
					return { success: false, message: '管理员删除视频评论失败，删除失败' }
				}

				await session.commitTransaction()
				session.endSession()
				return { success: true, message: '管理员删除视频评论成功' }
			} catch (error) {
				if (session.inTransaction()) {
					await session.abortTransaction()
				}
				session.endSession()
				console.error('管理员删除视频评论时出错：保存已删除视频评论出错', error)
				return { success: false, message: '管理员删除视频评论时出错：无法存储记录' }
			}
		} catch (error) {
			console.error('管理员删除视频评论时出错：检索视频评论出错', error)
			return { success: false, message: '管理员删除视频评论时出错：检索视频评论出错' }
		}
	} catch (error) {
		console.error('管理员删除视频评论时出错：未知错误', error)
		return { success: false, message: '管理员删除视频评论时出错：未知错误' }
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

/**
 * 检查删除视频评论的请求载荷
 * @param deleteSelfVideoCommentRequest 删除视频评论的请求载荷
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkDeleteSelfVideoCommentRequest = (deleteSelfVideoCommentRequest: DeleteSelfVideoCommentRequestDto): boolean => {
	return (
		deleteSelfVideoCommentRequest.videoId !== undefined && deleteSelfVideoCommentRequest.videoId !== null
		&& !!deleteSelfVideoCommentRequest.commentRoute
	)
}

/**
 * 检查管理员删除一个视频评论的请求载荷
 * @param adminDeleteVideoCommentRequest 管理员删除一个视频评论的请求载荷
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkAdminDeleteVideoCommentRequest = (adminDeleteVideoCommentRequest: AdminDeleteVideoCommentRequestDto): boolean => {
	return (
		adminDeleteVideoCommentRequest.videoId !== undefined && adminDeleteVideoCommentRequest.videoId !== null
		&& !!adminDeleteVideoCommentRequest.commentRoute
	)
}
