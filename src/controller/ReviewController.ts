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

	// RBAC 权限验证（需要 developer 角色）
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

	// RBAC 权限验证（需要 developer 角色）
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

	// RBAC 权限验证（需要 developer 角色）
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

	// RBAC 权限验证（需要 developer 角色）
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

	// RBAC 权限验证（需要 developer 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<RejectVideoReviewRequestDto>
	const rejectVideoReviewRequest: RejectVideoReviewRequestDto = {
		videoId: data.videoId ?? 0,
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

	// RBAC 权限验证（需要 developer 角色）
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

	// RBAC 权限验证（需要 developer 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<RejectCommentReviewRequestDto>
	const rejectCommentReviewRequest: RejectCommentReviewRequestDto = {
		commentRoute: data.commentRoute ?? '',
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

	// RBAC 权限验证（需要 developer 角色）
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

	// RBAC 权限验证（需要 developer 角色）
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<RejectDanmakuReviewRequestDto>
	const rejectDanmakuReviewRequest: RejectDanmakuReviewRequestDto = {
		danmakuId: data.danmakuId ?? '',
	}

	ctx.body = await rejectDanmakuReviewService(rejectDanmakuReviewRequest, uuid, token)
	await next()
}

