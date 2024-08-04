import { adminDeleteVideoCommentService, cancelVideoCommentDownvoteService, cancelVideoCommentUpvoteService, deleteSelfVideoCommentService, emitVideoCommentDownvoteService, emitVideoCommentService, emitVideoCommentUpvoteService, getVideoCommentListByKvidService } from '../service/VideoCommentService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { AdminDeleteVideoCommentRequestDto, CancelVideoCommentDownvoteRequestDto, CancelVideoCommentUpvoteRequestDto, DeleteSelfVideoCommentRequestDto, EmitVideoCommentDownvoteRequestDto, EmitVideoCommentRequestDto, EmitVideoCommentUpvoteRequestDto, GetVideoCommentByKvidRequestDto } from './VideoCommentControllerDto.js'

/**
 * 用户发送视频评论
 * @param ctx context
 * @param next context
 */
export const emitVideoCommentController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<EmitVideoCommentRequestDto>
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const emitVideoCommentRequest: EmitVideoCommentRequestDto = {
		/** KVID 视频 ID */
		videoId: data.videoId,
		/** 评论正文 */
		text: data.text,
	}
	const emitVideoCommentResponse = await emitVideoCommentService(emitVideoCommentRequest, uid, token)
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
	const getVideoCommentByKvidRequest: GetVideoCommentByKvidRequestDto = {
		videoId: videoId ? parseInt(videoId, 10) : -1, // WARN -1 means you can't find any video
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const videoCommentListResponse = await getVideoCommentListByKvidService(getVideoCommentByKvidRequest, uid, token)
	ctx.body = videoCommentListResponse
	await next()
}

/**
 * 用户为视频评论点赞
 * @param ctx context
 * @param next context
 */
export const emitVideoCommentUpvoteController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<EmitVideoCommentUpvoteRequestDto>
	const uid = parseInt(ctx.cookies.get('uid'), 10)
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
	const uid = parseInt(ctx.cookies.get('uid'), 10)
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
	const uid = parseInt(ctx.cookies.get('uid'), 10)
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
	const uid = parseInt(ctx.cookies.get('uid'), 10)
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
	const uid = parseInt(ctx.cookies.get('uid'), 10)
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
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
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
