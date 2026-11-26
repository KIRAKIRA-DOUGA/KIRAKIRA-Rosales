import mongoose, { InferSchemaType, PipelineStage } from 'mongoose'
import { GetUserInfoByUidRequestDto } from '../controller/UserControllerDto.js'
import { AdminDeleteVideoCommentRequestDto, AdminDeleteVideoCommentResponseDto, CancelVideoCommentDownvoteRequestDto, CancelVideoCommentDownvoteResponseDto, CancelVideoCommentUpvoteRequestDto, CancelVideoCommentUpvoteResponseDto, DeleteSelfVideoCommentRequestDto, DeleteSelfVideoCommentResponseDto, EmitVideoCommentDownvoteRequestDto, EmitVideoCommentDownvoteResponseDto, EmitVideoCommentRequestDto, EmitVideoCommentResponseDto, EmitVideoCommentUpvoteRequestDto, EmitVideoCommentUpvoteResponseDto, GetVideoCommentByKvidRequestDto, GetVideoCommentByKvidResponseDto, VideoCommentResult } from '../controller/VideoCommentControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB, deleteOneDataFromMongoDB, selectDataByAggregateFromMongoDB, findOneAndUpdateData4MongoDB, findOneAndUpdateWithOperators4MongoDB, countDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { RemovedVideoCommentSchema, VideoCommentSchema, VideoCommentVoteSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserTokenByUuidService, getUserInfoByUidService, getUserUid } from './UserService.js'
import { buildBlockListMongooseFilter } from './BlockService.js'
import { checkVideoBlockedByKvidService } from './VideoService.js'
import { logging } from './loggingService.js'

/**
 * 用户发送视频评论
 * @param emitVideoCommentRequest 用户发送的评论数据
 * @param uuid 当前用户的 UUID
 * @param token cookie 中的用户 token
 * @returns 用户发送评论的结果
 */
export const emitVideoCommentService = async (emitVideoCommentRequest: EmitVideoCommentRequestDto, uuid: string, token: string): Promise<EmitVideoCommentResponseDto> => {
	try {
		if (!checkEmitVideoCommentRequest(emitVideoCommentRequest)) {
			logging('ERROR', '视频评论发送失败，弹幕数据校验未通过：', undefined, { videoId: emitVideoCommentRequest.videoId })
			return { success: false, message: '视频评论发送失败，视频评论数据错误' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '视频评论发送失败，用户校验未通过', undefined, { videoId: emitVideoCommentRequest.videoId })
			return { success: false, message: '视频评论发送失败，用户校验未通过' }
		}

		if (!uuid) {
			logging('ERROR', '评论发送失败，UUID 不存在', undefined, { videoId: emitVideoCommentRequest.videoId })
			return { success: false, message: '评论发送失败，UUID 不存在' }
		}

		const uid = await getUserUid(uuid)
		if (uid === undefined || uid === null || uid < 1) {
			logging('ERROR', '评论发送失败，获取发送者 UID 失败。', undefined, { videoId: emitVideoCommentRequest.videoId })
			return { success: false, message: '评论发送失败，获取发送者 UID 失败。' }
		}

		// 检查视频是否被屏蔽
		const { videoId } = emitVideoCommentRequest
		const selectorUuid = uuid
		const selectorToken = token

		const checkVideoBlockedResult = await checkVideoBlockedByKvidService(videoId, selectorUuid, selectorToken)
		if (!checkVideoBlockedResult.success) {
			logging('ERROR', '评论发送失败，检查视频是否被屏蔽失败', undefined, { videoId: emitVideoCommentRequest.videoId })
			return { success: false, message: '评论发送失败，检查视频是否被屏蔽失败' }
		}

		if (checkVideoBlockedResult.isBlockedByOther) {
			logging('ERROR', '评论发送失败，用户被其他用户屏蔽', undefined, { videoId: emitVideoCommentRequest.videoId })
			return { success: false, message: '评论发送失败，用户被其他用户屏蔽' }
		}
		if (checkVideoBlockedResult.isBlocked) {
			logging('ERROR', '评论发送失败，用户已屏蔽上传者', undefined, { videoId: emitVideoCommentRequest.videoId })
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
			videoId: emitVideoCommentRequest.videoId,
			text: emitVideoCommentRequest.text,
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
					videoId,
					commentRoute: videoComment.commentRoute,
					uid,
					text: videoComment.text,
					emitTime: nowDate,
					commentIndex,
					editDateTime: nowDate,
					upvoteCount: 0,
					downvoteCount: 0,
					subComments: [],
					subCommentsCount: 0,
					isSelf: true,
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
		logging('ERROR', '视频评论发送失败，错误信息：', error, { videoId: emitVideoCommentRequest.videoId })
		return { success: false, message: '视频评论发送失败，未知错误' }
	}
}

/**
 * 根据 KVID 获取视频评论列表，并检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应的值会变为 true
 * @param getVideoCommentByKvidRequest 请求视频评论列表的查询参数
 * @param uuid 登录用户的 UUID，游客可省略
 * @param token 登录凭据
 * @returns 视频的视频评论列表
 */
export const getVideoCommentListByKvidService = async (getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto, uuid: string, token: string): Promise<GetVideoCommentByKvidResponseDto> => {
	// WARN // TODO 应当添加更多安全验证，防刷！
	try {
		if (!checkGetVideoCommentByKvidRequest(getVideoCommentByKvidRequest)) {
			logging('ERROR', '获取视频评论列表失败，数据校验失败', undefined, { getVideoCommentByKvidRequest })
			return { success: false, message: '获取视频评论列表失败，数据校验失败', videoCommentCount: 0, videoCommentList: [] }
		}

		if (uuid !== undefined && uuid !== null && token) { // 校验登录用户，随后按评论路由关联该用户的赞踩状态。
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
			{ uuid, token },
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
			// 游客只读评论上的缓存计数。登录用户用已校验的 UUID 查询一条个人记录。
			...(uuid && token ? [{
				$lookup: {
					from: VideoCommentVoteSchema.collectionName,
					localField: 'commentRoute',
					foreignField: 'commentRoute',
					pipeline: [
						{ $match: { UUID: uuid } },
						{ $project: { _id: 0, direction: 1 } },
						{ $limit: 1 },
					],
					as: 'viewerVote',
				},
			}] : []),
			{
				$set: {
					isUpvote: { $in: ['upvote', { $ifNull: ['$viewerVote.direction', []] }] },
					isDownvote: { $in: ['downvote', { $ifNull: ['$viewerVote.direction', []] }] },
				},
			},
			// 返回评论及作者的信息。
			{
				$project: {
					_id: 1, // 保留列表原有的 MongoDB 文档 ID
					content: 1, // 评论内容
					commentRoute: 1, // 评论的路由
					videoId: 1,
					isSelf: uuid && token ? { $eq: ['$UUID', { $literal: uuid }] } : { $literal: false },
					uid: 1, // 评论发送者的 UID
					emitTime: 1, // 发送评论的时间
					text: 1, // 评论正文
					upvoteCount: { $max: [0, '$upvoteCount'] },
					downvoteCount: { $max: [0, '$downvoteCount'] },
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


type CommentVoteDirection = 'upvote' | 'downvote'
type Counts = { upvoteCount: number; downvoteCount: number }
type CountBatch = { recountRevision: number | null; upvoteDelta: number; downvoteDelta: number; started: boolean; done: Promise<void> }

const comments = VideoCommentSchema
const votes = VideoCommentVoteSchema
const countBatches = new Map<string, CountBatch>()

function crossedFibonacciThreshold(total: number, delta: number) {
	if (delta === 0) {
		return false
	}
	if (total <= 0) {
		return true
	}
	// 只看本次经过的数，排除起点。从 4 到 6、从 6 到 4 都要核对经过的 5。
	const before = total - delta
	const lowest = delta > 0 ? before + 1 : total
	const highest = delta > 0 ? total : before - 1
	let current = 1
	let next = 2
	while (current < lowest) {
		const following = current + next
		current = next
		next = following
	}
	return current <= highest
}

async function applyCountBatch(commentRoute: string, batch: CountBatch) {
	const { upvoteDelta, downvoteDelta, recountRevision } = batch
	let comment
	try {
		const updated = await findOneAndUpdateWithOperators4MongoDB(
			{ commentRoute, voteRecountRevision: recountRevision },
			{ $inc: { upvoteCount: upvoteDelta, downvoteCount: downvoteDelta, voteRevision: 1 } },
			comments.schemaInstance, comments.collectionName,
		)
		comment = updated.result
	} catch (error) {
		// 写入结果未知，重复加减会破坏计数，改用明细恢复。
		logging('ERROR', '更新评论赞踩计数失败', error, { commentRoute })
	}

	if (!comment) {
		// 其他实例的校准可能已经包含本批的部分明细。登记待校准状态，
		// 后续批次即使抢先更新了 voteRevision，也会接手核对两个方向。
		const marked = await findOneAndUpdateWithOperators4MongoDB(
			{ commentRoute }, { $set: { voteRecountPending: true }, $inc: { voteRevision: 1 } },
			comments.schemaInstance, comments.collectionName,
		)
		comment = marked.result
		if (!comment) {
			throw new Error('视频评论不存在')
		}
	}

	const correction: Partial<Counts> = {}
	for (const direction of ['upvote', 'downvote'] as const) {
		const field = direction === 'upvote' ? 'upvoteCount' : 'downvoteCount'
		const delta = direction === 'upvote' ? upvoteDelta : downvoteDelta
		if (!comment.voteRecountPending && !crossedFibonacciThreshold(comment[field], delta)) {
			continue
		}
		const count = await countDataFromMongoDB({ commentRoute, direction }, votes.schemaInstance, votes.collectionName, { readPreference: 'primary' })
		if (count.result === undefined) {
			throw new Error('获取评论赞踩计数失败')
		}
		if (count.result !== comment[field]) {
			correction[field] = count.result
		}
	}
	if (comment.voteRecountPending || Object.keys(correction).length) {
		// 版本检查挡住统计期间已更新的缓存；新的校准版本挡住尚未更新缓存的旧明细增量。
		await findOneAndUpdateWithOperators4MongoDB(
			{ commentRoute, voteRevision: comment.voteRevision },
			{ $set: correction, $unset: { voteRecountPending: 1 }, $inc: { voteRevision: 1, voteRecountRevision: 1 } },
			comments.schemaInstance, comments.collectionName,
		)
	}
}

function queueCountUpdate(commentRoute: string, recountRevision: number | null, upvoteDelta: number, downvoteDelta: number) {
	const previous = countBatches.get(commentRoute)
	if (previous && !previous.started && previous.recountRevision === recountRevision) {
		previous.upvoteDelta += upvoteDelta
		previous.downvoteDelta += downvoteDelta
		return previous.done
	}

	const batch: CountBatch = { recountRevision, upvoteDelta, downvoteDelta, started: false, done: Promise.resolve() }
	const flush = async () => {
		batch.started = true
		try {
			await applyCountBatch(commentRoute, batch)
		} catch (error) {
			// 用户的投票已经落库，校准故障单独记录；已登记的待校准状态保留到下次更新。
			logging('ERROR', '校准评论赞踩计数失败', error, { commentRoute })
		} finally {
			if (countBatches.get(commentRoute) === batch) {
				countBatches.delete(commentRoute)
			}
		}
	}
	batch.done = (previous?.done ?? Promise.resolve()).then(flush)
	countBatches.set(commentRoute, batch)
	return batch.done
}

/**
 * 原子设置一个用户对一条评论的点赞或点踩状态，并更新评论上缓存的数量。
 * @param videoId 视频 ID
 * @param commentRoute 评论的业务唯一标识
 * @param uuid 当前用户的 UUID
 * @param direction 点赞或点踩
 * @param active 是否设置该状态，取消只移除指定方向
 * @returns 用户的状态是否发生了变化
 */
const mutateCommentVote = async (videoId: number, commentRoute: string, uuid: string, direction: CommentVoteDirection, active: boolean): Promise<boolean> => {
	const selected = await selectDataFromMongoDB(
		{ commentRoute, videoId }, { voteRecountRevision: 1, voteRecountPending: 1 },
		comments.schemaInstance, comments.collectionName, { readPreference: 'primary' },
	)
	const comment = selected.result?.[0]
	if (!comment) {
		throw new Error('视频评论不存在')
	}

	let before: string | undefined
	if (active) {
		// 用唯一键定位记录，同时取得修改前的方向。并发切换时，每次只计算自己实际造成的变化。
		const previous = await findOneAndUpdateData4MongoDB(
			{ commentRoute, UUID: uuid }, { direction }, votes.schemaInstance, votes.collectionName, { returnDocument: 'before' },
		)
		before = previous.result?.direction
	} else {
		const deleted = await deleteOneDataFromMongoDB({ commentRoute, UUID: uuid, direction }, votes.schemaInstance, votes.collectionName)
		before = deleted.result?.deletedCount ? direction : undefined
	}
	const after = active ? direction : undefined
	const changed = before !== after
	if (changed || comment.voteRecountPending) {
		await queueCountUpdate(commentRoute, comment.voteRecountRevision ?? null,
			Number(after === 'upvote') - Number(before === 'upvote'),
			Number(after === 'downvote') - Number(before === 'downvote'))
	}
	return changed
}

/** 四个接口共用鉴权和目标状态的处理。 */
const changeCommentVoteService = async (request: { videoId: number; commentRoute: string }, uuid: string, token: string, direction: CommentVoteDirection, active: boolean) => {
	try {
		if (!request || !Number.isSafeInteger(request.videoId) || request.videoId < 1 || typeof request.commentRoute !== 'string' || !request.commentRoute.trim()) {
			return { success: false, message: '评论点赞或点踩失败，参数异常' }
		}
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			return { success: false, message: '用户校验未通过' }
		}
		const changed = await mutateCommentVote(request.videoId, request.commentRoute, uuid, direction, active)
		return { success: true, message: changed ? '评论点赞或点踩状态已更新' : '评论点赞或点踩已是所选状态' }
	} catch (error) {
		logging('ERROR', '更新评论点赞或点踩状态失败', error, { videoId: request?.videoId, commentRoute: request?.commentRoute })
		return { success: false, message: '更新评论点赞或点踩状态失败，请重试' }
	}
}

/**
 * 为视频评论点赞。
 * @param request 视频和评论 ID
 * @param uuid 当前用户的 UUID
 * @param token 登录凭据
 * @returns 是否已达到请求的点赞或点踩状态
 */
export const emitVideoCommentUpvoteService = async (request: EmitVideoCommentUpvoteRequestDto, uuid: string, token: string): Promise<EmitVideoCommentUpvoteResponseDto> =>
	changeCommentVoteService(request, uuid, token, 'upvote', true)

/**
 * 取消视频评论的点赞。
 * @param request 视频和评论 ID
 * @param uuid 当前用户的 UUID
 * @param token 登录凭据
 * @returns 是否已达到请求的点赞或点踩状态
 */
export const cancelVideoCommentUpvoteService = async (request: CancelVideoCommentUpvoteRequestDto, uuid: string, token: string): Promise<CancelVideoCommentUpvoteResponseDto> =>
	changeCommentVoteService(request, uuid, token, 'upvote', false)

/**
 * 为视频评论点踩。
 * @param request 视频和评论 ID
 * @param uuid 当前用户的 UUID
 * @param token 登录凭据
 * @returns 是否已达到请求的点赞或点踩状态
 */
export const emitVideoCommentDownvoteService = async (request: EmitVideoCommentDownvoteRequestDto, uuid: string, token: string): Promise<EmitVideoCommentDownvoteResponseDto> =>
	changeCommentVoteService(request, uuid, token, 'downvote', true)

/**
 * 取消视频评论的点踩。
 * @param request 视频和评论 ID
 * @param uuid 当前用户的 UUID
 * @param token 登录凭据
 * @returns 是否已达到请求的点赞或点踩状态
 */
export const cancelVideoCommentDownvoteService = async (request: CancelVideoCommentDownvoteRequestDto, uuid: string, token: string): Promise<CancelVideoCommentDownvoteResponseDto> =>
	changeCommentVoteService(request, uuid, token, 'downvote', false)

/**
 * 删除一条自己发布的视频评论
 * @param deleteSelfVideoCommentRequest 删除一条自己发布的视频评论请求载荷
 * @param uuid 用户 UUID
 * @param token 登录凭据
 * @returns 删除一条自己发布的视频评论请求响应
 */
export const deleteSelfVideoCommentService = async (deleteSelfVideoCommentRequest: DeleteSelfVideoCommentRequestDto, uuid: string, token: string): Promise<DeleteSelfVideoCommentResponseDto> => {
	try {
		if (!checkDeleteSelfVideoCommentRequest(deleteSelfVideoCommentRequest)) {
			logging('ERROR', '删除视频评论失败，参数不合法')
			return { success: false, message: '删除视频评论失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除视频评论失败，用户校验未通过')
			return { success: false, message: '删除视频评论失败，用户校验未通过' }
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

			if (videoData.UUID !== uuid) {
				logging('ERROR', '删除视频评论失败，只能删除自己的评论')
				return { success: false, message: '删除视频评论失败，只能删除自己的评论' }
			}

			// 启动事务
			const session = await mongoose.startSession()
			session.startTransaction()

			const removedVideoCommentData: RemovedVideoComment = {
				...deleteSelfVideoCommentSelectResult.result[0],
				_operatorUUID_: uuid,
				_operatorUid_: videoData.uid,
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
 * @param adminUuid 管理员 UUID
 * @param adminToken 管理员 token
 * @returns 管理员删除一个视频评论的请求响应
 */
export const adminDeleteVideoCommentService = async (adminDeleteVideoCommentRequest: AdminDeleteVideoCommentRequestDto, adminUuid: string, adminToken: string): Promise<AdminDeleteVideoCommentResponseDto> => {
	try {
		if (!checkAdminDeleteVideoCommentRequest(adminDeleteVideoCommentRequest)) {
			logging('ERROR', '管理员删除视频评论失败，参数不合法')
			return { success: false, message: '管理员删除视频评论失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(adminUuid, adminToken)).success) {
			logging('ERROR', '管理员删除视频评论失败，用户校验未通过')
			return { success: false, message: '管理员删除视频评论失败，用户校验未通过' }
		}

		const adminUid = await getUserUid(adminUuid)
		if (!adminUid) {
			logging('ERROR', '管理员删除一条视频评论失败，获取管理员公开 UID 失败', undefined, { adminUid })
			return { success: false, message: '管理员删除一条视频评论失败，获取管理员公开 UID 失败' }
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
				_operatorUUID_: adminUuid,
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
