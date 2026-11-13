import mongoose, { InferSchemaType, PipelineStage } from 'mongoose'
import { GetUserInfoByUidRequestDto } from '../controller/UserControllerDto.js'
import { AdminDeleteVideoCommentRequestDto, AdminDeleteVideoCommentResponseDto, CancelVideoCommentDownvoteRequestDto, CancelVideoCommentDownvoteResponseDto, CancelVideoCommentUpvoteRequestDto, CancelVideoCommentUpvoteResponseDto, DeleteSelfVideoCommentRequestDto, DeleteSelfVideoCommentResponseDto, EmitVideoCommentDownvoteRequestDto, EmitVideoCommentDownvoteResponseDto, EmitVideoCommentRequestDto, EmitVideoCommentResponseDto, EmitVideoCommentUpvoteRequestDto, EmitVideoCommentUpvoteResponseDto, GetVideoCommentByKvidRequestDto, GetVideoCommentByKvidResponseDto, VideoCommentResult } from '../controller/VideoCommentControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB, deleteOneDataFromMongoDB, selectDataByAggregateFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { RemovedVideoCommentSchema, VideoCommentSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserTokenByUuidService, checkUserTokenService, getUserInfoByUidService, getUserUid, getUserUuid } from './UserService.js'
import { buildBlockListMongooseFilter } from './BlockService.js'
import { checkVideoBlockedByKvidService } from './VideoService.js'
import { logging } from './loggingService.js'
import { mutateCommentVote } from './CommentVoteMutation.js'

/**
 * 用户发送视频评论
 * @param emitVideoCommentRequest 用户发送的弹幕数据
 * @param uid cookie 中的用户 ID
 * @param token cookie 中的用户 token
 * @returns 用户发送弹幕的结果
 */
export const emitVideoCommentService = async (emitVideoCommentRequest: EmitVideoCommentRequestDto, uuid: string, token: string): Promise<EmitVideoCommentResponseDto> => {
	try {
		if (!checkEmitVideoCommentRequest(emitVideoCommentRequest)) {
			logging('ERROR', '视频评论发送失败，弹幕数据校验未通过：', undefined, { videoId: emitVideoCommentRequest.videoId, uuid })
			return { success: false, message: '视频评论发送失败，视频评论数据错误' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '视频评论发送失败，用户校验未通过', undefined, { videoId: emitVideoCommentRequest.videoId, uuid })
			return { success: false, message: '视频评论发送失败，用户校验未通过' }
		}

		if (!uuid) {
			logging('ERROR', '评论发送失败，UUID 不存在', undefined, { videoId: emitVideoCommentRequest.videoId, uuid })
			return { success: false, message: '评论发送失败，UUID 不存在' }
		}

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '评论发送失败，获取发送者 UID 失败。', undefined, { videoId: emitVideoCommentRequest.videoId, uuid })
			return { success: false, message: '评论发送失败，获取发送者 UID 失败。' }
		}

		// 检查视频是否被屏蔽
		const { videoId } = emitVideoCommentRequest
		const selectorUuid = uuid
		const selectorToken = token

		const checkVideoBlockedResult = await checkVideoBlockedByKvidService(videoId, selectorUuid, selectorToken)
		if (!checkVideoBlockedResult.success) {
			logging('ERROR', '评论发送失败，检查视频是否被屏蔽失败', undefined, { videoId: emitVideoCommentRequest.videoId, uuid })
			return { success: false, message: '评论发送失败，检查视频是否被屏蔽失败' }
		}

		if (checkVideoBlockedResult.isBlockedByOther) {
			logging('ERROR', '评论发送失败，用户被其他用户屏蔽', undefined, { videoId: emitVideoCommentRequest.videoId, uuid })
			return { success: false, message: '评论发送失败，用户被其他用户屏蔽' }
		}
		if (checkVideoBlockedResult.isBlocked) {
			logging('ERROR', '评论发送失败，用户已屏蔽上传者', undefined, { videoId: emitVideoCommentRequest.videoId, uuid })
			return { success: false, message: '评论发送失败，用户已屏蔽上传者' }
		}

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		const getCommentIndexResult = await getNextSequenceValueService(`KVID-${emitVideoCommentRequest.videoId}`, 1, 1, session) // 以视频 ID 为键，获取下一个值，即评论楼层
		const commentIndex = getCommentIndexResult.sequenceValue
		if (!getCommentIndexResult.success || commentIndex === undefined || commentIndex === null) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '视频评论发送失败，获取楼层数据失败，无法根据视频 ID 获取序列下一个值', undefined, { videoId: emitVideoCommentRequest.videoId, uid })
			return { success: false, message: '视频评论发送失败，获取楼层数据失败' }
		}

		const { collectionName, schemaInstance } = VideoCommentSchema
		type VideoComment = InferSchemaType<typeof schemaInstance>
		const nowDate = new Date().getTime()
		const videoComment: VideoComment = {
			...emitVideoCommentRequest,
			UUID: uuid,
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

			if (!insertData2MongoDBResult || !insertData2MongoDBResult.success) {
				if (session.inTransaction()) {
					await session.abortTransaction()
				}
				session.endSession()
				logging('ERROR', '视频评论发送失败，未返回结果', undefined, { videoId: emitVideoCommentRequest.videoId, uid })
				return { success: false, message: '视频评论发送失败，存储视频评论数据失败' }
			}

			const getUserInfoByUidRequest: GetUserInfoByUidRequestDto = { uid: videoComment.uid }
			try {
				const videoCommentSenderUserInfo = await getUserInfoByUidService(getUserInfoByUidRequest)
				const videoCommentSenderUserInfoResult = videoCommentSenderUserInfo.result
				if (!videoCommentSenderUserInfo.success || !videoCommentSenderUserInfoResult) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					logging('WARN', '视频评论发送成功，但是获取回显数据为空', undefined, { videoId: emitVideoCommentRequest.videoId, uid })
					return { success: false, message: '视频评论发送成功，请尝试刷新页面' }
				}

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
			} catch (error) {
				if (session.inTransaction()) {
					await session.abortTransaction()
				}
				session.endSession()
				logging('ERROR', '视频评论发送成功，但是获取回显数据失败', error, { videoId: emitVideoCommentRequest.videoId, uid })
				return { success: false, message: '视频评论发送成功，请刷新页面' }
			}
		} catch (error) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '视频评论发送失败，无法存储到 MongoDB', error, { videoId: emitVideoCommentRequest.videoId, uid })
			return { success: false, message: '视频评论发送失败，存储视频评论数据失败' }
		}
	} catch (error) {
		logging('ERROR', '视频评论发送失败，错误信息：', error, { videoId: emitVideoCommentRequest.videoId, uuid })
		return { success: false, message: '视频评论发送失败，未知错误' }
	}
}

/**
 * 根据 KVID 获取视频评论列表，并检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应的值会变为 true
 * @param getVideoCommentByKvidRequest 请求视频评论列表的查询参数
 * @returns 视频的视频评论列表
 */
export const getVideoCommentListByKvidService = async (getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto, uid: number, uuid: string, token: string): Promise<GetVideoCommentByKvidResponseDto> => {
	// WARN // TODO 应当添加更多安全验证，防刷！
	try {
		if (!checkGetVideoCommentByKvidRequest(getVideoCommentByKvidRequest)) {
			logging('ERROR', '获取视频评论列表失败，数据校验失败', undefined, { getVideoCommentByKvidRequest })
			return { success: false, message: '获取视频评论列表失败，数据校验失败', videoCommentCount: 0, videoCommentList: [] }
		}

		if (uuid !== undefined && uuid !== null && token) { // 校验用户，如果校验通过，则获取当前用户对某一视频的点赞/点踩的评论的评论 ID 列表
			if (!(await checkUserTokenByUuidService(uuid, token)).success) {
				logging('ERROR', '获取视频评论列表失败，用户校验未通过', undefined, { getVideoCommentByKvidRequest })
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

		const blockListFilter = await buildBlockListMongooseFilter(
			[
				{
					attr: 'UUID',
					category: 'block-uuid',
				},
				{
					attr: 'UUID',
					category: 'hide-uuid',
				},
				{
					attr: 'text',
					category: 'keyword',
				},
				{
					attr: 'text',
					category: 'regex',
				},
			],
			{ uid, uuid, token },
		)

		// 获取视频的评论总数的 pipeline
		const countVideoCommentPipeline: PipelineStage[] = [
			// 1. 查询评论信息
			{
				$match: {
					videoId, // 通过 videoId 筛选评论
				},
			},
			...blockListFilter.filter,
			// 2. 统计总数量
			{
				$count: 'totalCount', // 统计总文档数
			},
		]

		// 获取视频评论的 pipeline
		const getVideoCommentsPipeline: PipelineStage[] = [
			// 1. 查询评论信息
			{
				$match: {
					videoId, // 通过 videoId 筛选评论
				},
			},
			...blockListFilter.filter,
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
			{ $sort: { commentIndex: 1 } },
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
						gender: '$user_info_data.gender', // 用户的性别
					},
					...blockListFilter.additionalFields, // 黑名单过滤器的额外字段
				},
			},
		]

		const { collectionName, schemaInstance } = VideoCommentSchema
		const videoCommentsCountResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, countVideoCommentPipeline)
		const videoCommentsResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, getVideoCommentsPipeline)

		if (!videoCommentsResult.success || !videoCommentsCountResult.success) {
			logging('ERROR', '获取视频评论列表失败，查询数据失败', undefined, { getVideoCommentByKvidRequest })
			return { success: false, message: '获取视频评论列表失败，查询数据失败', videoCommentCount: 0, videoCommentList: [] }
		}

		return {
			success: true,
			message: videoCommentsCountResult.result?.[0]?.totalCount > 0 ? '获取视频评论列表成功' : '获取视频评论列表成功，长度为零',
			videoCommentCount: videoCommentsCountResult.result?.[0]?.totalCount,
			videoCommentList: videoCommentsResult.result,
		}
	} catch (error) {
		logging('ERROR', '获取视频评论列表失败，错误信息：', error, { getVideoCommentByKvidRequest })
		return { success: false, message: '获取视频评论列表失败，未知原因', videoCommentCount: 0, videoCommentList: [] }
	}
}


// /**
//  * 获取某个用户对某个视频的评论的点赞情况
//  * @param getVideoCommentUpvoteProps 获取某个用户对某个视频的评论的点赞情况的参数
//  * @returns 某个用户对某个视频的评论的点赞情况
//  */
// const getVideoCommentUpvoteByUid = async (getVideoCommentUpvoteProps: GetVideoCommentUpvotePropsDto): Promise<GetVideoCommentUpvoteResultDto> => {
// 	try {
// 		if (checkGetVideoCommentUpvoteProps(getVideoCommentUpvoteProps)) {
// 			const { collectionName, schemaInstance } = VideoCommentUpvoteSchema
// 			type VideoCommentUpvote = InferSchemaType<typeof schemaInstance>
// 			const where: QueryType<VideoCommentUpvote> = {
// 				videoId: getVideoCommentUpvoteProps.videoId,
// 				uid: getVideoCommentUpvoteProps.uid,
// 				invalidFlag: false,
// 			}

// 			const select: SelectType<VideoCommentUpvote> = {
// 				videoId: 1,
// 				commentId: 1,
// 				uid: 1,
// 				editDateTime: 1,
// 			}

// 			try {
// 				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
// 				const videoCommentUpvoteList = result.result
// 				if (result.success) {
// 					if (videoCommentUpvoteList && videoCommentUpvoteList.length > 0) {
// 						return { success: true, message: '获取用户点赞情况成功', videoCommentUpvoteResult: videoCommentUpvoteList }
// 					} else {
// 						return { success: true, message: '用户点赞情况为空', videoCommentUpvoteResult: [] }
// 					}
// 				} else {
// 					logging('ERROR', '获取用户点赞情况失败，查询失败或结果为空：', undefined, { getVideoCommentUpvoteProps })
// 					return { success: false, message: '获取用户点赞情况失败，查询失败', videoCommentUpvoteResult: [] }
// 				}
// 			} catch (error) {
// 				logging('ERROR', '获取用户点赞情况失败，查询失败：', error, { getVideoCommentUpvoteProps })
// 				return { success: false, message: '获取用户点赞情况失败，查询失败', videoCommentUpvoteResult: [] }
// 			}
// 		} else {
// 			logging('ERROR', '获取用户点赞情况失败，查询参数未通过校验', undefined, { getVideoCommentUpvoteProps })
// 			return { success: false, message: '获取用户点赞情况失败，必要参数为空', videoCommentUpvoteResult: [] }
// 		}
// 	} catch (error) {
// 		logging('ERROR', '获取用户点赞情况失败，错误信息：', error, { getVideoCommentUpvoteProps })
// 		return { success: false, message: '获取用户点赞情况失败，未知错误', videoCommentUpvoteResult: [] }
// 	}
// }

// /**
//  * 获取某个用户对某个视频的评论的点踩情况
//  * @param getVideoCommentDownvoteProps 获取某个用户对某个视频的评论的点踩情况的参数
//  * @returns 某个用户对某个视频的评论的点踩情况
//  */
// const getVideoCommentDownvoteByUid = async (getVideoCommentDownvoteProps: GetVideoCommentDownvotePropsDto): Promise<GetVideoCommentDownvoteResultDto> => {
// 	try {
// 		if (checkGetVideoCommentDownvoteProps(getVideoCommentDownvoteProps)) {
// 			const { collectionName, schemaInstance } = VideoCommentDownvoteSchema
// 			type VideoCommentDownvote = InferSchemaType<typeof schemaInstance>
// 			const where: QueryType<VideoCommentDownvote> = {
// 				videoId: getVideoCommentDownvoteProps.videoId,
// 				uid: getVideoCommentDownvoteProps.uid,
// 				invalidFlag: false,
// 			}

// 			const select: SelectType<VideoCommentDownvote> = {
// 				videoId: 1,
// 				commentId: 1,
// 				uid: 1,
// 				editDateTime: 1,
// 			}

// 			try {
// 				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
// 				const videoCommentDownvoteList = result.result
// 				if (result.success) {
// 					if (videoCommentDownvoteList && videoCommentDownvoteList.length > 0) {
// 						return { success: true, message: '获取用户点踩情况成功', videoCommentDownvoteResult: videoCommentDownvoteList }
// 					} else {
// 						return { success: true, message: '用户点踩情况为空', videoCommentDownvoteResult: [] }
// 					}
// 				} else {
// 					logging('ERROR', '获取用户点踩情况失败，查询失败或结果为空：', undefined, { getVideoCommentDownvoteProps })
// 					return { success: false, message: '获取用户点踩情况失败，查询失败', videoCommentDownvoteResult: [] }
// 				}
// 			} catch (error) {
// 				logging('ERROR', '获取用户点踩情况失败，查询失败：', error, { getVideoCommentDownvoteProps })
// 				return { success: false, message: '获取用户点踩情况失败，查询失败', videoCommentDownvoteResult: [] }
// 			}
// 		} else {
// 			logging('ERROR', '获取用户点踩情况失败，查询参数未通过校验', undefined, { getVideoCommentDownvoteProps })
// 			return { success: false, message: '获取用户点踩情况失败，必要参数为空', videoCommentDownvoteResult: [] }
// 		}
// 	} catch (error) {
// 		logging('ERROR', '获取用户点踩情况失败，错误信息：', error, { getVideoCommentDownvoteProps })
// 		return { success: false, message: '获取用户点踩情况失败，未知错误', videoCommentDownvoteResult: [] }
// 	}
// }

/** Apply all four comment-vote actions through the same transaction boundary. */
const changeCommentVoteService = async (request: { videoId: number; id: string }, uid: number, token: string, direction: 'upvote' | 'downvote', active: boolean) => {
	try {
		if (!request || !Number.isSafeInteger(request.videoId) || request.videoId < 1 || typeof request.id !== 'string' || !/^[a-f\d]{24}$/i.test(request.id)) {
			return { success: false, message: '评论投票失败，参数异常' }
		}
		if (!(await checkUserTokenService(uid, token)).success) { return { success: false, message: '评论投票失败，用户校验未通过' } }
		const UUID = await getUserUuid(uid)
		if (!UUID) { return { success: false, message: '评论投票失败，UUID 不存在' } }
		const changed = await mutateCommentVote(request.videoId, request.id, uid, UUID, direction, active)
		return { success: changed, message: changed ? '评论投票更新成功' : '评论投票状态未改变' }
	} catch (error) {
		logging('ERROR', '评论投票失败，事务未完成', error, { request, uid })
		return { success: false, message: '评论投票失败，请重试' }
	}
}

export const emitVideoCommentUpvoteService = async (request: EmitVideoCommentUpvoteRequestDto, uid: number, token: string): Promise<EmitVideoCommentUpvoteResponseDto> =>
	changeCommentVoteService(request, uid, token, 'upvote', true)

export const cancelVideoCommentUpvoteService = async (request: CancelVideoCommentUpvoteRequestDto, uid: number, token: string): Promise<CancelVideoCommentUpvoteResponseDto> =>
	changeCommentVoteService(request, uid, token, 'upvote', false)

export const emitVideoCommentDownvoteService = async (request: EmitVideoCommentDownvoteRequestDto, uid: number, token: string): Promise<EmitVideoCommentDownvoteResponseDto> =>
	changeCommentVoteService(request, uid, token, 'downvote', true)

export const cancelVideoCommentDownvoteService = async (request: CancelVideoCommentDownvoteRequestDto, uid: number, token: string): Promise<CancelVideoCommentDownvoteResponseDto> =>
	changeCommentVoteService(request, uid, token, 'downvote', false)

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
			logging('ERROR', '删除视频评论失败，参数不合法')
			return { success: false, message: '删除视频评论失败，参数不合法' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			logging('ERROR', '删除视频评论失败，用户校验未通过')
			return { success: false, message: '删除视频评论失败，用户校验未通过' }
		}

		const UUID = await getUserUuid(uid) // FIXME: 这是一个临时解决方法，应该使用 cookie 中的 uuid
		if (!UUID) {
			logging('ERROR', '删除一条自己发布的视频评论失败，UUID 不存在', undefined, { uid })
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
				logging('ERROR', '删除视频评论失败，检索视频评论结果为空或长度超过限制')
				return { success: false, message: '删除视频评论失败，检索视频评论结果为空或长度超过限制' }
			}

			const videoData = deleteSelfVideoCommentSelectResult.result[0]

			if (videoData.uid !== uid) {
				logging('ERROR', '删除视频评论失败，只能删除自己的评论')
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
					logging('ERROR', '删除视频评论失败，保存已删除视频评论失败')
					return { success: false, message: '删除视频评论失败，记录失败' }
				}

				const deleteSelfVideoCommentDeleteResult = await deleteOneDataFromMongoDB<VideoComment>(deleteSelfVideoCommentWhere, videoCommentSchemaInstance, videoCommentSchemaName, { session })

				if (!deleteSelfVideoCommentDeleteResult.success) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					logging('ERROR', '删除视频评论失败，删除失败')
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
				logging('ERROR', '删除视频评论时出错：保存已删除视频评论出错', error)
				return { success: false, message: '删除视频评论时出错：无法存储记录' }
			}
		} catch (error) {
			logging('ERROR', '删除视频评论时出错：检索视频评论出错', error)
			return { success: false, message: '删除视频评论时出错：检索视频评论出错' }
		}
	} catch (error) {
		logging('ERROR', '删除视频评论时出错：未知错误', error)
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
			logging('ERROR', '管理员删除视频评论失败，参数不合法')
			return { success: false, message: '管理员删除视频评论失败，参数不合法' }
		}

		if (!(await checkUserTokenService(adminUid, adminToken)).success) {
			logging('ERROR', '管理员删除视频评论失败，用户校验未通过')
			return { success: false, message: '管理员删除视频评论失败，用户校验未通过' }
		}

		const adminUUID = await getUserUuid(adminUid) // FIXME: 这是一个临时解决方法，应该使用 cookie 中的 uuid
		if (!adminUUID) {
			logging('ERROR', '管理员删除一条视频评论失败，adminUUID 不存在', undefined, { adminUid })
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
				logging('ERROR', '管理员删除视频评论失败，检索视频评论结果为空或长度超过限制')
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
					logging('ERROR', '管理员删除视频评论失败，保存已删除视频评论失败')
					return { success: false, message: '管理员删除视频评论失败，记录失败' }
				}

				const deleteSelfVideoCommentDeleteResult = await deleteOneDataFromMongoDB<VideoComment>(deleteSelfVideoCommentWhere, videoCommentSchemaInstance, videoCommentSchemaName, { session })

				if (!deleteSelfVideoCommentDeleteResult.success) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					logging('ERROR', '管理员删除视频评论失败，删除失败')
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
				logging('ERROR', '管理员删除视频评论时出错：保存已删除视频评论出错', error)
				return { success: false, message: '管理员删除视频评论时出错：无法存储记录' }
			}
		} catch (error) {
			logging('ERROR', '管理员删除视频评论时出错：检索视频评论出错', error)
			return { success: false, message: '管理员删除视频评论时出错：检索视频评论出错' }
		}
	} catch (error) {
		logging('ERROR', '管理员删除视频评论时出错：未知错误', error)
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
 * 校验根据 KVID 获取视频评论的请求的参数
 * @param getVideoCommentByKvidRequest 根据 KVID 获取视频评论的请求的参数
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkGetVideoCommentByKvidRequest = (getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto): boolean => {
	return (getVideoCommentByKvidRequest.videoId !== undefined && getVideoCommentByKvidRequest.videoId !== null)
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
