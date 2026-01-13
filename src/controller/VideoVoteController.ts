import { isPassRbacCheck } from '../service/RbacService.js'
import { emitVideoUpvoteService, emitVideoDownvoteService, cancelVideoUpvoteService, cancelVideoDownvoteService } from '../service/VideoVoteService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { VideoVoteRequestDto } from './VideoVoteControllerDto.js'
import { parseInteger } from '../common/ValidTool.js'
import { getUserUid } from '../service/UserService.js'

/**
 * 用户给视频点赞
 * @param ctx context
 * @param next context
 * @return 用户给视频点赞的请求响应
 */
export const emitVideoUpvoteController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<VideoVoteRequestDto>
	const emitVideoUpvoteRequest: VideoVoteRequestDto = {
		videoId: data.videoId ?? -1,
	}
	const emitVideoUpvoteResponse = await emitVideoUpvoteService(emitVideoUpvoteRequest, uuid, token)
	ctx.body = emitVideoUpvoteResponse
	await next()
}

/**
 * 用户给视频点踩
 * @param ctx context
 * @param next context
 * @return 用户给视频点踩的请求响应
 */
export const emitVideoDownvoteController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<VideoVoteRequestDto>
	const emitVideoDownvoteRequest: VideoVoteRequestDto = {
		videoId: data.videoId ?? -1,
	}
	const emitVideoDownvoteResponse = await emitVideoDownvoteService(emitVideoDownvoteRequest, uuid, token)
	ctx.body = emitVideoDownvoteResponse
	await next()
}

/**
 * 用户取消给视频点赞
 * @param ctx context
 * @param next context
 * @return 用户取消给视频点赞的请求响应
 */
export const cancelVideoUpvoteController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<VideoVoteRequestDto>
	const cancelVideoUpvoteRequest: VideoVoteRequestDto = {
		videoId: data.videoId ?? -1,
	}
	const cancelVideoUpvoteResponse = await cancelVideoUpvoteService(cancelVideoUpvoteRequest, uuid, token)
	ctx.body = cancelVideoUpvoteResponse
	await next()
}

/**
 * 用户取消给视频点踩
 * @param ctx context
 * @param next context
 * @return 用户取消给视频点踩的请求响应
 */
export const cancelVideoDownvoteController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<VideoVoteRequestDto>
	const cancelVideoDownvoteRequest: VideoVoteRequestDto = {
		videoId: data.videoId ?? -1,
	}
	const cancelVideoDownvoteResponse = await cancelVideoDownvoteService(cancelVideoDownvoteRequest, uuid, token)
	ctx.body = cancelVideoDownvoteResponse
	await next()
}
