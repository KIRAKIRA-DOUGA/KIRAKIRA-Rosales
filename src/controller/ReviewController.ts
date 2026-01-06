import {
	approveCommentReviewService,
	approveDanmakuReviewService,
	approveVideoReviewService,
	getPendingReviewCommentListService,
	getPendingReviewDanmakuListService,
	getPendingReviewVideoListService,
	rejectCommentReviewService,
	rejectDanmakuReviewService,
	rejectVideoReviewService,
	getSelfReviewLogListService,
} from '../service/ReviewService.js'
import {
	ApproveCommentReviewRequestDto,
	ApproveDanmakuReviewRequestDto,
	ApproveVideoReviewRequestDto,
	GetPendingReviewCommentListRequestDto,
	GetPendingReviewDanmakuListRequestDto,
	GetPendingReviewVideoListRequestDto,
	RejectCommentReviewRequestDto,
	RejectDanmakuReviewRequestDto,
	RejectVideoReviewRequestDto,
	GetSelfReviewLogRequestDto,
} from './ReviewControllerDto.js'
import { parseInteger } from '../common/ValidTool.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { isPassRbacCheck } from '../service/RbacService.js'

/**
 * 获取待审核视频列表
 * @param ctx context
 * @param next context
 * @return 获取待审核视频列表的响应
 */
export const getPendingReviewVideoListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const numStr = ctx.query.num as string
	const offsetStr = ctx.query.offset as string

	const num = parseInteger(numStr)
	const offset = parseInteger(offsetStr)

	if (!num || offset === undefined) {
		ctx.body = { success: false, message: '参数不合法' }
		return
	}

	const getPendingReviewVideoListRequest: GetPendingReviewVideoListRequestDto = {
		num,
		offset,
	}

	ctx.body = await getPendingReviewVideoListService(getPendingReviewVideoListRequest, uuid, token)
	await next()
}

/**
 * 获取待审核评论列表
 * @param ctx context
 * @param next context
 * @return 获取待审核评论列表的响应
 */
export const getPendingReviewCommentListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const numStr = ctx.query.num as string
	const offsetStr = ctx.query.offset as string

	const num = parseInteger(numStr)
	const offset = parseInteger(offsetStr)

	if (!num || offset === undefined) {
		ctx.body = { success: false, message: '参数不合法' }
		return
	}

	const getPendingReviewCommentListRequest: GetPendingReviewCommentListRequestDto = {
		num,
		offset,
	}

	ctx.body = await getPendingReviewCommentListService(getPendingReviewCommentListRequest, uuid, token)
	await next()
}

/**
 * 获取待审核弹幕列表
 * @param ctx context
 * @param next context
 * @return 获取待审核弹幕列表的响应
 */
export const getPendingReviewDanmakuListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const numStr = ctx.query.num as string
	const offsetStr = ctx.query.offset as string

	const num = parseInteger(numStr)
	const offset = parseInteger(offsetStr)

	if (!num || offset === undefined) {
		ctx.body = { success: false, message: '参数不合法' }
		return
	}

	const getPendingReviewDanmakuListRequest: GetPendingReviewDanmakuListRequestDto = {
		num,
		offset,
	}

	ctx.body = await getPendingReviewDanmakuListService(getPendingReviewDanmakuListRequest, uuid, token)
	await next()
}

/**
 * 通过视频审核
 * @param ctx context
 * @param next context
 * @return 通过视频审核的响应
 */
export const approveVideoReviewController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<ApproveVideoReviewRequestDto>
	const approveVideoReviewRequest: ApproveVideoReviewRequestDto = {
		videoId: data.videoId ?? 0,
	}

	ctx.body = await approveVideoReviewService(approveVideoReviewRequest, uuid, token)
	await next()
}

/**
 * 退回视频审核
 * @param ctx context
 * @param next context
 * @return 退回视频审核的响应
 */
export const rejectVideoReviewController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<RejectVideoReviewRequestDto>
	if (!data.reason || !data.videoId) {
		ctx.body = { success: false, message: '参数不合法：缺少 videoId 或 reason' }
		return
	}
	const rejectVideoReviewRequest: RejectVideoReviewRequestDto = {
		videoId: data.videoId,
		reason: data.reason,
	}

	ctx.body = await rejectVideoReviewService(rejectVideoReviewRequest, uuid, token)
	await next()
}

/**
 * 通过评论审核
 * @param ctx context
 * @param next context
 * @return 通过评论审核的响应
 */
export const approveCommentReviewController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<ApproveCommentReviewRequestDto>
	const approveCommentReviewRequest: ApproveCommentReviewRequestDto = {
		commentRoute: data.commentRoute ?? '',
	}

	ctx.body = await approveCommentReviewService(approveCommentReviewRequest, uuid, token)
	await next()
}

/**
 * 退回评论审核
 * @param ctx context
 * @param next context
 * @return 退回评论审核的响应
 */
export const rejectCommentReviewController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<RejectCommentReviewRequestDto>
	if (!data.commentRoute || !data.reason) {
		ctx.body = { success: false, message: '参数不合法：缺少 commentRoute 或 reason' }
		return
	}
	const rejectCommentReviewRequest: RejectCommentReviewRequestDto = {
		commentRoute: data.commentRoute,
		reason: data.reason,
	}

	ctx.body = await rejectCommentReviewService(rejectCommentReviewRequest, uuid, token)
	await next()
}

/**
 * 通过弹幕审核
 * @param ctx context
 * @param next context
 * @return 通过弹幕审核的响应
 */
export const approveDanmakuReviewController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<ApproveDanmakuReviewRequestDto>
	const approveDanmakuReviewRequest: ApproveDanmakuReviewRequestDto = {
		danmakuId: data.danmakuId ?? '',
	}

	ctx.body = await approveDanmakuReviewService(approveDanmakuReviewRequest, uuid, token)
	await next()
}

/**
 * 退回弹幕审核
 * @param ctx context
 * @param next context
 * @return 退回弹幕审核的响应
 */
export const rejectDanmakuReviewController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要 admin 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<RejectDanmakuReviewRequestDto>
	if (!data.danmakuId || !data.reason) {
		ctx.body = { success: false, message: '参数不合法：缺少 danmakuId 或 reason' }
		return
	}
	const rejectDanmakuReviewRequest: RejectDanmakuReviewRequestDto = {
		danmakuId: data.danmakuId,
		reason: data.reason,
	}

	ctx.body = await rejectDanmakuReviewService(rejectDanmakuReviewRequest, uuid, token)
	await next()
}

/**
 * 获取本人审核记录列表
 * @param ctx context
 * @param next context
 * @returns 获取本人审核记录列表的响应
 */
export const getSelfReviewLogListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}

	// RBAC 权限验证（需要登录用户，但不限制角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const page = parseInteger(ctx.query.page as string) ?? 1
	const pageSize = parseInteger(ctx.query.pageSize as string) ?? 20

	const request: GetSelfReviewLogRequestDto = {
		page,
		pageSize,
	}

	ctx.body = await getSelfReviewLogListService(request, uuid, token)
	await next()
}


