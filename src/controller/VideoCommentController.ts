import { isPassRbacCheck } from '../service/RbacService.js'
import { adminDeleteVideoCommentService, cancelVideoCommentDownvoteService, cancelVideoCommentUpvoteService, deleteSelfVideoCommentService, emitVideoCommentDownvoteService, emitVideoCommentService, emitVideoCommentUpvoteService, getSelfVideoCommentListService, getVideoCommentListByKvidService } from '../service/VideoCommentService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { AdminDeleteVideoCommentRequestDto, CancelVideoCommentDownvoteRequestDto, CancelVideoCommentUpvoteRequestDto, DeleteSelfVideoCommentRequestDto, EmitVideoCommentDownvoteRequestDto, EmitVideoCommentRequestDto, EmitVideoCommentUpvoteRequestDto, GetSelfVideoCommentRequestDto, GetVideoCommentByKvidRequestDto } from './VideoCommentControllerDto.js'
import { parseInteger } from '../common/ValidTool.js'

/**
 * 用户发送视频评论
 * @param ctx context
 * @param next context
 */
export const emitVideoCommentController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<EmitVideoCommentRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const emitVideoCommentRequest: EmitVideoCommentRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论正文 */
		text: data.text,
	}
	const emitVideoCommentResponse = await emitVideoCommentService(emitVideoCommentRequest, uuid, token)
	ctx.body = emitVideoCommentResponse
	await next()
}

/**
 * 根据 KVID 获取视频评论列表，并检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应的值会变为 true
 * @param ctx context
 * @param next context
 */
export const getVideoCommentListByKvidController = async (ctx: koaCtx, next: koaNext) => {
	const videoId = ctx.query.videoId as string
	const page = ctx.query.page as string
	const pageSize = ctx.query.pageSize as string
	const getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto = {
		videoId: videoId ? parseInteger(videoId) : -1, // WARN -1 means you can't find any video
		pagination: {
			page: parseInteger(page || '1') ?? 1,
			pageSize: parseInteger(pageSize) ?? Number.MAX_SAFE_INTEGER,
		},
	}
	const UUID = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const videoCommentListResponse = await getVideoCommentListByKvidService(getVideoCommentByKvidRequest, UUID, token)
	ctx.body = videoCommentListResponse
	await next()
}

/**
 * 获取本人已发布的评论（包含管理员删除或待审核，排除用户自行删除）
 * @param ctx context
 * @param next context
 */
export const getSelfVideoCommentListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const page = parseInteger(ctx.query.page as string) ?? 1
	const pageSize = parseInteger(ctx.query.pageSize as string) ?? 20
	const request: GetSelfVideoCommentRequestDto = {
		page,
		pageSize,
	}
	const resp = await getSelfVideoCommentListService(request, uuid, token)
	ctx.body = resp
	await next()
}

/**
 * 用户为视频评论点赞
 * @param ctx context
 * @param next context
 */
export const emitVideoCommentUpvoteController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<EmitVideoCommentUpvoteRequestDto>
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')
	const emitVideoCommentUpvoteRequest: EmitVideoCommentUpvoteRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论 ID */
		id: data.id,
	}
	const emitVideoCommentUpvoteResponse = await emitVideoCommentUpvoteService(emitVideoCommentUpvoteRequest, uid, token)
	ctx.body = emitVideoCommentUpvoteResponse
	await next()
}

/**
 * 用户为视频评论点踩
 * @param ctx context
 * @param next context
 */
export const emitVideoCommentDownvoteController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<EmitVideoCommentDownvoteRequestDto>
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')
	const emitVideoCommentUpvoteRequest: EmitVideoCommentDownvoteRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论 ID */
		id: data.id,
	}
	const emitVideoCommentDownvoteResponse = await emitVideoCommentDownvoteService(emitVideoCommentUpvoteRequest, uid, token)
	ctx.body = emitVideoCommentDownvoteResponse
	await next()
}

/**
 * 用户取消一个视频评论的点赞
 * @param ctx context
 * @param next context
 */
export const cancelVideoCommentUpvoteController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CancelVideoCommentUpvoteRequestDto>
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')
	const cancelVideoCommentUpvoteRequest: CancelVideoCommentUpvoteRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论 ID */
		id: data.id,
	}
	const emitVideoCommentResponse = await cancelVideoCommentUpvoteService(cancelVideoCommentUpvoteRequest, uid, token)
	ctx.body = emitVideoCommentResponse
	await next()
}

/**
 * 用户取消一个视频评论的点踩
 * @param ctx context
 * @param next context
 */
export const cancelVideoCommentDownvoteController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CancelVideoCommentDownvoteRequestDto>
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')
	const cancelVideoCommentDownvoteRequest: CancelVideoCommentDownvoteRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论 ID */
		id: data.id,
	}
	const emitVideoCommentResponse = await cancelVideoCommentDownvoteService(cancelVideoCommentDownvoteRequest, uid, token)
	ctx.body = emitVideoCommentResponse
	await next()
}

/**
 * 删除一条自己发布的视频评论
 * @param ctx context
 * @param next context
 */
export const deleteSelfVideoCommentController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<DeleteSelfVideoCommentRequestDto>
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')
	const deleteSelfVideoCommentRequest: DeleteSelfVideoCommentRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论的路由 */
		commentRoute: data.commentRoute,
	}
	const deleteSelfVideoCommentResponse = await deleteSelfVideoCommentService(deleteSelfVideoCommentRequest, uid, token)
	ctx.body = deleteSelfVideoCommentResponse
	await next()
}

/**
 * 管理员删除一条视频评论
 * @param ctx context
 * @param next context
 */
export const adminDeleteVideoCommentController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<AdminDeleteVideoCommentRequestDto>
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uid, apiPath: ctx.path }, ctx)) {
		return
	}

	const adminDeleteVideoCommentRequest: AdminDeleteVideoCommentRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论的路由 */
		commentRoute: data.commentRoute,
	}
	const adminDeleteVideoCommentResponse = await adminDeleteVideoCommentService(adminDeleteVideoCommentRequest, uid, token)
	ctx.body = adminDeleteVideoCommentResponse
	await next()
}
