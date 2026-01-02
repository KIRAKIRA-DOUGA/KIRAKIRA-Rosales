import mongoose, { InferSchemaType, PipelineStage } from 'mongoose'
import {
	ApproveCommentReviewRequestDto,
	ApproveCommentReviewResponseDto,
	ApproveDanmakuReviewRequestDto,
	ApproveDanmakuReviewResponseDto,
	ApproveVideoReviewRequestDto,
	ApproveVideoReviewResponseDto,
	GetPendingReviewCommentListRequestDto,
	GetPendingReviewCommentListResponseDto,
	GetPendingReviewDanmakuListRequestDto,
	GetPendingReviewDanmakuListResponseDto,
	GetPendingReviewVideoListRequestDto,
	GetPendingReviewVideoListResponseDto,
	RejectCommentReviewRequestDto,
	RejectCommentReviewResponseDto,
	RejectDanmakuReviewRequestDto,
	RejectDanmakuReviewResponseDto,
	RejectVideoReviewRequestDto,
	RejectVideoReviewResponseDto,
} from '../controller/ReviewControllerDto.js'
import { selectDataByAggregateFromMongoDB, selectDataFromMongoDB, findOneAndUpdateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { DanmakuSchema } from '../dbPool/schema/DanmakuSchema.js'
import { UserAuthSchema } from '../dbPool/schema/UserSchema.js'
import { VideoCommentSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { VideoSchema } from '../dbPool/schema/VideoSchema.js'
import { UserInfoSchema } from '../dbPool/schema/UserSchema.js'
import { checkUserTokenByUuidService } from './UserService.js'
import { logging } from './loggingService.js'

/**
 * 获取待审核视频列表
 * @param getPendingReviewVideoListRequest 获取待审核视频列表的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 获取待审核视频列表的响应
 */
export const getPendingReviewVideoListService = async (
	getPendingReviewVideoListRequest: GetPendingReviewVideoListRequestDto,
	uuid: string,
	token: string
): Promise<GetPendingReviewVideoListResponseDto> => {
	try {
		if (!checkGetPendingReviewVideoListRequest(getPendingReviewVideoListRequest)) {
			logging('ERROR', '获取待审核视频列表失败：参数不合法')
			return { success: false, message: '获取待审核视频列表失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取待审核视频列表失败：用户验证失败')
			return { success: false, message: '获取待审核视频列表失败：用户验证失败' }
		}

		const { num, offset } = getPendingReviewVideoListRequest
		const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
		type Video = InferSchemaType<typeof videoSchemaInstance>

		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					pendingReview: true,
				},
			},
			{
				$count: 'total',
			},
		]
		const countResult = await selectDataByAggregateFromMongoDB(videoSchemaInstance, videoCollectionName, countPipeline)
		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].total : 0

		// 获取视频列表
		const listPipeline: PipelineStage[] = [
			{
				$match: {
					pendingReview: true,
				},
			},
			{
				$lookup: {
					from: 'user-infos',
					localField: 'uploaderId',
					foreignField: 'uid',
					as: 'uploader_info',
				},
			},
			{
				$unwind: {
					path: '$uploader_info',
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$sort: {
					editDateTime: -1,
				},
			},
			{
				$skip: offset,
			},
			{
				$limit: num,
			},
			{
				$project: {
					videoId: 1,
					title: 1,
					image: 1,
					uploadDate: 1,
					watchedCount: 1,
					uploaderId: 1,
					duration: 1,
					description: 1,
					editDateTime: 1,
					uploader: '$uploader_info.username',
					uploaderNickname: '$uploader_info.userNickname',
				},
			},
		]
		const listResult = await selectDataByAggregateFromMongoDB(videoSchemaInstance, videoCollectionName, listPipeline)

		if (!listResult.success) {
			logging('ERROR', '获取待审核视频列表失败：查询失败')
			return { success: false, message: '获取待审核视频列表失败：查询失败' }
		}

		const videos = (listResult.result || []).map((item: any) => ({
			videoId: item.videoId || 0,
			title: item.title || '',
			image: item.image,
			uploadDate: item.uploadDate,
			watchedCount: item.watchedCount,
			uploaderId: item.uploaderId,
			uploader: item.uploader,
			uploaderNickname: item.uploaderNickname,
			duration: item.duration,
			description: item.description,
			editDateTime: item.editDateTime,
		}))

		return {
			success: true,
			message: '获取待审核视频列表成功',
			totalCount,
			videos,
		}
	} catch (error) {
		logging('ERROR', '获取待审核视频列表失败：未知错误', error)
		return { success: false, message: '获取待审核视频列表失败：未知错误' }
	}
}

/**
 * 获取待审核评论列表
 * @param getPendingReviewCommentListRequest 获取待审核评论列表的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 获取待审核评论列表的响应
 */
export const getPendingReviewCommentListService = async (
	getPendingReviewCommentListRequest: GetPendingReviewCommentListRequestDto,
	uuid: string,
	token: string
): Promise<GetPendingReviewCommentListResponseDto> => {
	try {
		if (!checkGetPendingReviewCommentListRequest(getPendingReviewCommentListRequest)) {
			logging('ERROR', '获取待审核评论列表失败：参数不合法')
			return { success: false, message: '获取待审核评论列表失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取待审核评论列表失败：用户验证失败')
			return { success: false, message: '获取待审核评论列表失败：用户验证失败' }
		}

		const { num, offset } = getPendingReviewCommentListRequest
		const { collectionName: commentCollectionName, schemaInstance: commentSchemaInstance } = VideoCommentSchema
		type VideoComment = InferSchemaType<typeof commentSchemaInstance>

		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					pendingReview: true,
					userDeletedFlag: { $ne: true },
					adminDeletedFlag: { $ne: true },
				},
			},
			{
				$count: 'total',
			},
		]
		const countResult = await selectDataByAggregateFromMongoDB(commentSchemaInstance, commentCollectionName, countPipeline)
		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].total : 0

		// 获取评论列表
		const listPipeline: PipelineStage[] = [
			{
				$match: {
					pendingReview: true,
					userDeletedFlag: { $ne: true },
					adminDeletedFlag: { $ne: true },
				},
			},
			{
				$sort: {
					editDateTime: -1,
				},
			},
			{
				$skip: offset,
			},
			{
				$limit: num,
			},
			{
				$project: {
					commentRoute: 1,
					videoId: 1,
					UUID: 1,
					uid: 1,
					emitTime: 1,
					text: 1,
					upvoteCount: 1,
					downvoteCount: 1,
					commentIndex: 1,
					subCommentsCount: 1,
					editDateTime: 1,
				},
			},
		]
		const listResult = await selectDataByAggregateFromMongoDB<VideoComment>(commentSchemaInstance, commentCollectionName, listPipeline)

		if (!listResult.success) {
			logging('ERROR', '获取待审核评论列表失败：查询失败')
			return { success: false, message: '获取待审核评论列表失败：查询失败' }
		}

		const comments = (listResult.result || []).map((item: any) => ({
			commentRoute: item.commentRoute || '',
			videoId: item.videoId || 0,
			UUID: item.UUID || '',
			uid: item.uid || 0,
			emitTime: item.emitTime || 0,
			text: item.text || '',
			upvoteCount: item.upvoteCount || 0,
			downvoteCount: item.downvoteCount || 0,
			commentIndex: item.commentIndex || 0,
			subCommentsCount: item.subCommentsCount || 0,
			editDateTime: item.editDateTime || 0,
		}))

		return {
			success: true,
			message: '获取待审核评论列表成功',
			totalCount,
			comments,
		}
	} catch (error) {
		logging('ERROR', '获取待审核评论列表失败：未知错误', error)
		return { success: false, message: '获取待审核评论列表失败：未知错误' }
	}
}

/**
 * 获取待审核弹幕列表
 * @param getPendingReviewDanmakuListRequest 获取待审核弹幕列表的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 获取待审核弹幕列表的响应
 */
export const getPendingReviewDanmakuListService = async (
	getPendingReviewDanmakuListRequest: GetPendingReviewDanmakuListRequestDto,
	uuid: string,
	token: string
): Promise<GetPendingReviewDanmakuListResponseDto> => {
	try {
		if (!checkGetPendingReviewDanmakuListRequest(getPendingReviewDanmakuListRequest)) {
			logging('ERROR', '获取待审核弹幕列表失败：参数不合法')
			return { success: false, message: '获取待审核弹幕列表失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取待审核弹幕列表失败：用户验证失败')
			return { success: false, message: '获取待审核弹幕列表失败：用户验证失败' }
		}

		const { num, offset } = getPendingReviewDanmakuListRequest
		const { collectionName: danmakuCollectionName, schemaInstance: danmakuSchemaInstance } = DanmakuSchema
		type Danmaku = InferSchemaType<typeof danmakuSchemaInstance>

		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					pendingReview: true,
					userDeletedFlag: { $ne: true },
					adminDeletedFlag: { $ne: true },
				},
			},
			{
				$count: 'total',
			},
		]
		const countResult = await selectDataByAggregateFromMongoDB(danmakuSchemaInstance, danmakuCollectionName, countPipeline)
		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].total : 0

		// 获取弹幕列表
		const listPipeline: PipelineStage[] = [
			{
				$match: {
					pendingReview: true,
					userDeletedFlag: { $ne: true },
					adminDeletedFlag: { $ne: true },
				},
			},
			{
				$sort: {
					editDateTime: -1,
				},
			},
			{
				$skip: offset,
			},
			{
				$limit: num,
			},
			{
				$project: {
					_id: 1,
					videoId: 1,
					UUID: 1,
					uid: 1,
					time: 1,
					text: 1,
					color: 1,
					fontSize: 1,
					mode: 1,
					enableRainbow: 1,
					editDateTime: 1,
				},
			},
		]
		const listResult = await selectDataByAggregateFromMongoDB<Danmaku>(danmakuSchemaInstance, danmakuCollectionName, listPipeline)

		if (!listResult.success) {
			logging('ERROR', '获取待审核弹幕列表失败：查询失败')
			return { success: false, message: '获取待审核弹幕列表失败：查询失败' }
		}

		const danmaku = (listResult.result || []).map((item: any) => ({
			_id: item._id?.toString() || '',
			videoId: item.videoId || 0,
			UUID: item.UUID || '',
			uid: item.uid || 0,
			time: item.time || 0,
			text: item.text || '',
			color: item.color || '',
			fontSize: item.fontSize || 'medium',
			mode: item.mode || 'rtl',
			enableRainbow: item.enableRainbow || false,
			editDateTime: item.editDateTime || 0,
		}))

		return {
			success: true,
			message: '获取待审核弹幕列表成功',
			totalCount,
			danmaku,
		}
	} catch (error) {
		logging('ERROR', '获取待审核弹幕列表失败：未知错误', error)
		return { success: false, message: '获取待审核弹幕列表失败：未知错误' }
	}
}

/**
 * 通过视频审核
 * @param approveVideoReviewRequest 通过视频审核的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 通过视频审核的响应
 */
export const approveVideoReviewService = async (
	approveVideoReviewRequest: ApproveVideoReviewRequestDto,
	uuid: string,
	token: string
): Promise<ApproveVideoReviewResponseDto> => {
	try {
		if (!checkApproveVideoReviewRequest(approveVideoReviewRequest)) {
			logging('ERROR', '通过视频审核失败：参数不合法')
			return { success: false, message: '通过视频审核失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '通过视频审核失败：用户验证失败')
			return { success: false, message: '通过视频审核失败：用户验证失败' }
		}

		const { videoId } = approveVideoReviewRequest
		const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
		type Video = InferSchemaType<typeof videoSchemaInstance>

		// 检查视频是否存在且待审核
		const checkWhere: QueryType<Video> = {
			videoId,
			pendingReview: true,
		}
		const checkSelect: SelectType<Video> = {
			videoId: 1,
			pendingReview: 1,
		}
		const checkResult = await selectDataFromMongoDB<Video>(checkWhere, checkSelect, videoSchemaInstance, videoCollectionName)

		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '通过视频审核失败：视频不存在或不是待审核状态')
			return { success: false, message: '通过视频审核失败：视频不存在或不是待审核状态' }
		}

		// 更新视频状态
		const updateWhere: QueryType<Video> = {
			videoId,
			pendingReview: true,
		}
		const updateData: UpdateType<Video> = {
			pendingReview: false,
			editDateTime: new Date().getTime(),
		}
		const updateResult = await findOneAndUpdateData4MongoDB<Video>(updateWhere, updateData, videoSchemaInstance, videoCollectionName)

		if (!updateResult.success) {
			logging('ERROR', '通过视频审核失败：更新失败')
			return { success: false, message: '通过视频审核失败：更新失败' }
		}

		return { success: true, message: '通过视频审核成功' }
	} catch (error) {
		logging('ERROR', '通过视频审核失败：未知错误', error)
		return { success: false, message: '通过视频审核失败：未知错误' }
	}
}

/**
 * 退回视频审核
 * @param rejectVideoReviewRequest 退回视频审核的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 退回视频审核的响应
 */
export const rejectVideoReviewService = async (
	rejectVideoReviewRequest: RejectVideoReviewRequestDto,
	uuid: string,
	token: string
): Promise<RejectVideoReviewResponseDto> => {
	try {
		if (!checkRejectVideoReviewRequest(rejectVideoReviewRequest)) {
			logging('ERROR', '退回视频审核失败：参数不合法')
			return { success: false, message: '退回视频审核失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '退回视频审核失败：用户验证失败')
			return { success: false, message: '退回视频审核失败：用户验证失败' }
		}

		const { videoId } = rejectVideoReviewRequest
		const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
		type Video = InferSchemaType<typeof videoSchemaInstance>

		// 检查视频是否存在且待审核
		const checkWhere: QueryType<Video> = {
			videoId,
			pendingReview: true,
		}
		const checkSelect: SelectType<Video> = {
			videoId: 1,
			pendingReview: 1,
		}
		const checkResult = await selectDataFromMongoDB<Video>(checkWhere, checkSelect, videoSchemaInstance, videoCollectionName)

		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '退回视频审核失败：视频不存在或不是待审核状态')
			return { success: false, message: '退回视频审核失败：视频不存在或不是待审核状态' }
		}

		// 退回审核：保持 pendingReview 为 true，但可以添加其他标记或记录
		// 这里我们只是确认操作成功，实际业务可能需要记录退回原因等
		return { success: true, message: '退回视频审核成功' }
	} catch (error) {
		logging('ERROR', '退回视频审核失败：未知错误', error)
		return { success: false, message: '退回视频审核失败：未知错误' }
	}
}

/**
 * 通过评论审核
 * @param approveCommentReviewRequest 通过评论审核的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 通过评论审核的响应
 */
export const approveCommentReviewService = async (
	approveCommentReviewRequest: ApproveCommentReviewRequestDto,
	uuid: string,
	token: string
): Promise<ApproveCommentReviewResponseDto> => {
	try {
		if (!checkApproveCommentReviewRequest(approveCommentReviewRequest)) {
			logging('ERROR', '通过评论审核失败：参数不合法')
			return { success: false, message: '通过评论审核失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '通过评论审核失败：用户验证失败')
			return { success: false, message: '通过评论审核失败：用户验证失败' }
		}

		const { commentRoute } = approveCommentReviewRequest
		const { collectionName: commentCollectionName, schemaInstance: commentSchemaInstance } = VideoCommentSchema
		type VideoComment = InferSchemaType<typeof commentSchemaInstance>

		// 检查评论是否存在且待审核且未被删除
		const checkWhere: QueryType<VideoComment> = {
			commentRoute,
			pendingReview: true,
			userDeletedFlag: { $ne: true } as any,
			adminDeletedFlag: { $ne: true } as any,
		}
		const checkSelect: SelectType<VideoComment> = {
			commentRoute: 1,
			pendingReview: 1,
		}
		const checkResult = await selectDataFromMongoDB<VideoComment>(checkWhere, checkSelect, commentSchemaInstance, commentCollectionName)

		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '通过评论审核失败：评论不存在或不是待审核状态或已被删除')
			return { success: false, message: '通过评论审核失败：评论不存在或不是待审核状态或已被删除' }
		}

		// 更新评论状态
		const updateWhere: QueryType<VideoComment> = {
			commentRoute,
			pendingReview: true,
			userDeletedFlag: { $ne: true } as any,
			adminDeletedFlag: { $ne: true } as any,
		}
		const updateData: UpdateType<VideoComment> = {
			pendingReview: false,
			editDateTime: new Date().getTime(),
		}
		const updateResult = await findOneAndUpdateData4MongoDB<VideoComment>(updateWhere, updateData, commentSchemaInstance, commentCollectionName)

		if (!updateResult.success) {
			logging('ERROR', '通过评论审核失败：更新失败')
			return { success: false, message: '通过评论审核失败：更新失败' }
		}

		return { success: true, message: '通过评论审核成功' }
	} catch (error) {
		logging('ERROR', '通过评论审核失败：未知错误', error)
		return { success: false, message: '通过评论审核失败：未知错误' }
	}
}

/**
 * 退回评论审核
 * @param rejectCommentReviewRequest 退回评论审核的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 退回评论审核的响应
 */
export const rejectCommentReviewService = async (
	rejectCommentReviewRequest: RejectCommentReviewRequestDto,
	uuid: string,
	token: string
): Promise<RejectCommentReviewResponseDto> => {
	try {
		if (!checkRejectCommentReviewRequest(rejectCommentReviewRequest)) {
			logging('ERROR', '退回评论审核失败：参数不合法')
			return { success: false, message: '退回评论审核失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '退回评论审核失败：用户验证失败')
			return { success: false, message: '退回评论审核失败：用户验证失败' }
		}

		const { commentRoute } = rejectCommentReviewRequest
		const { collectionName: commentCollectionName, schemaInstance: commentSchemaInstance } = VideoCommentSchema
		type VideoComment = InferSchemaType<typeof commentSchemaInstance>

		// 检查评论是否存在且待审核且未被删除
		const checkWhere: QueryType<VideoComment> = {
			commentRoute,
			pendingReview: true,
			userDeletedFlag: { $ne: true } as any,
			adminDeletedFlag: { $ne: true } as any,
		}
		const checkSelect: SelectType<VideoComment> = {
			commentRoute: 1,
			pendingReview: 1,
		}
		const checkResult = await selectDataFromMongoDB<VideoComment>(checkWhere, checkSelect, commentSchemaInstance, commentCollectionName)

		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '退回评论审核失败：评论不存在或不是待审核状态或已被删除')
			return { success: false, message: '退回评论审核失败：评论不存在或不是待审核状态或已被删除' }
		}

		// 退回审核：保持 pendingReview 为 true
		return { success: true, message: '退回评论审核成功' }
	} catch (error) {
		logging('ERROR', '退回评论审核失败：未知错误', error)
		return { success: false, message: '退回评论审核失败：未知错误' }
	}
}

/**
 * 通过弹幕审核
 * @param approveDanmakuReviewRequest 通过弹幕审核的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 通过弹幕审核的响应
 */
export const approveDanmakuReviewService = async (
	approveDanmakuReviewRequest: ApproveDanmakuReviewRequestDto,
	uuid: string,
	token: string
): Promise<ApproveDanmakuReviewResponseDto> => {
	try {
		if (!checkApproveDanmakuReviewRequest(approveDanmakuReviewRequest)) {
			logging('ERROR', '通过弹幕审核失败：参数不合法')
			return { success: false, message: '通过弹幕审核失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '通过弹幕审核失败：用户验证失败')
			return { success: false, message: '通过弹幕审核失败：用户验证失败' }
		}

		const { danmakuId } = approveDanmakuReviewRequest
		const { collectionName: danmakuCollectionName, schemaInstance: danmakuSchemaInstance } = DanmakuSchema
		type Danmaku = InferSchemaType<typeof danmakuSchemaInstance>

		// 检查弹幕是否存在且待审核且未被删除
		const checkWhere: QueryType<Danmaku> = {
			_id: new mongoose.Types.ObjectId(danmakuId as any) as any,
			pendingReview: true,
			userDeletedFlag: { $ne: true } as any,
			adminDeletedFlag: { $ne: true } as any,
		}
		const checkSelect: any = {
			_id: 1,
			pendingReview: 1,
		}
		const checkResult = await selectDataFromMongoDB<Danmaku>(checkWhere, checkSelect, danmakuSchemaInstance, danmakuCollectionName)

		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '通过弹幕审核失败：弹幕不存在或不是待审核状态或已被删除')
			return { success: false, message: '通过弹幕审核失败：弹幕不存在或不是待审核状态或已被删除' }
		}

		// 更新弹幕状态
		const updateWhere: QueryType<Danmaku> = {
			_id: new mongoose.Types.ObjectId(danmakuId as any) as any,
			pendingReview: true,
			userDeletedFlag: { $ne: true } as any,
			adminDeletedFlag: { $ne: true } as any,
		}
		const updateData: UpdateType<Danmaku> = {
			pendingReview: false,
			editDateTime: new Date().getTime(),
		}
		const updateResult = await findOneAndUpdateData4MongoDB<Danmaku>(updateWhere, updateData, danmakuSchemaInstance, danmakuCollectionName)

		if (!updateResult.success) {
			logging('ERROR', '通过弹幕审核失败：更新失败')
			return { success: false, message: '通过弹幕审核失败：更新失败' }
		}

		return { success: true, message: '通过弹幕审核成功' }
	} catch (error) {
		logging('ERROR', '通过弹幕审核失败：未知错误', error)
		return { success: false, message: '通过弹幕审核失败：未知错误' }
	}
}

/**
 * 退回弹幕审核
 * @param rejectDanmakuReviewRequest 退回弹幕审核的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 退回弹幕审核的响应
 */
export const rejectDanmakuReviewService = async (
	rejectDanmakuReviewRequest: RejectDanmakuReviewRequestDto,
	uuid: string,
	token: string
): Promise<RejectDanmakuReviewResponseDto> => {
	try {
		if (!checkRejectDanmakuReviewRequest(rejectDanmakuReviewRequest)) {
			logging('ERROR', '退回弹幕审核失败：参数不合法')
			return { success: false, message: '退回弹幕审核失败：参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '退回弹幕审核失败：用户验证失败')
			return { success: false, message: '退回弹幕审核失败：用户验证失败' }
		}

		const { danmakuId } = rejectDanmakuReviewRequest
		const { collectionName: danmakuCollectionName, schemaInstance: danmakuSchemaInstance } = DanmakuSchema
		type Danmaku = InferSchemaType<typeof danmakuSchemaInstance>

		// 检查弹幕是否存在且待审核且未被删除
		const checkWhere: QueryType<Danmaku> = {
			_id: new mongoose.Types.ObjectId(danmakuId as any) as any,
			pendingReview: true,
			userDeletedFlag: { $ne: true } as any,
			adminDeletedFlag: { $ne: true } as any,
		}
		const checkSelect: any = {
			_id: 1,
			pendingReview: 1,
		}
		const checkResult = await selectDataFromMongoDB<Danmaku>(checkWhere, checkSelect, danmakuSchemaInstance, danmakuCollectionName)

		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '退回弹幕审核失败：弹幕不存在或不是待审核状态或已被删除')
			return { success: false, message: '退回弹幕审核失败：弹幕不存在或不是待审核状态或已被删除' }
		}

		// 退回审核：保持 pendingReview 为 true
		return { success: true, message: '退回弹幕审核成功' }
	} catch (error) {
		logging('ERROR', '退回弹幕审核失败：未知错误', error)
		return { success: false, message: '退回弹幕审核失败：未知错误' }
	}
}

/**
 * 校验获取待审核视频列表的请求载荷
 */
const checkGetPendingReviewVideoListRequest = (request: GetPendingReviewVideoListRequestDto): boolean => {
	return (
		request.num !== undefined &&
		request.num !== null &&
		request.num > 0 &&
		request.num <= 200 &&
		request.offset !== undefined &&
		request.offset !== null &&
		request.offset >= 0
	)
}

/**
 * 校验获取待审核评论列表的请求载荷
 */
const checkGetPendingReviewCommentListRequest = (request: GetPendingReviewCommentListRequestDto): boolean => {
	return (
		request.num !== undefined &&
		request.num !== null &&
		request.num > 0 &&
		request.num <= 200 &&
		request.offset !== undefined &&
		request.offset !== null &&
		request.offset >= 0
	)
}

/**
 * 校验获取待审核弹幕列表的请求载荷
 */
const checkGetPendingReviewDanmakuListRequest = (request: GetPendingReviewDanmakuListRequestDto): boolean => {
	return (
		request.num !== undefined &&
		request.num !== null &&
		request.num > 0 &&
		request.num <= 200 &&
		request.offset !== undefined &&
		request.offset !== null &&
		request.offset >= 0
	)
}

/**
 * 校验通过视频审核的请求载荷
 */
const checkApproveVideoReviewRequest = (request: ApproveVideoReviewRequestDto): boolean => {
	return request.videoId !== undefined && request.videoId !== null && request.videoId > 0
}

/**
 * 校验退回视频审核的请求载荷
 */
const checkRejectVideoReviewRequest = (request: RejectVideoReviewRequestDto): boolean => {
	return request.videoId !== undefined && request.videoId !== null && request.videoId > 0
}

/**
 * 校验通过评论审核的请求载荷
 */
const checkApproveCommentReviewRequest = (request: ApproveCommentReviewRequestDto): boolean => {
	return !!request.commentRoute
}

/**
 * 校验退回评论审核的请求载荷
 */
const checkRejectCommentReviewRequest = (request: RejectCommentReviewRequestDto): boolean => {
	return !!request.commentRoute
}

/**
 * 校验通过弹幕审核的请求载荷
 */
const checkApproveDanmakuReviewRequest = (request: ApproveDanmakuReviewRequestDto): boolean => {
	return !!request.danmakuId
}

/**
 * 校验退回弹幕审核的请求载荷
 */
const checkRejectDanmakuReviewRequest = (request: RejectDanmakuReviewRequestDto): boolean => {
	return !!request.danmakuId
}

