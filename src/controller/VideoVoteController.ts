import { isPassRbacCheck } from '../service/RbacService.js'
import { cancelVideoDownvoteService, cancelVideoUpvoteService, emitVideoDownvoteService, emitVideoUpvoteService } from '../service/VideoVoteService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { CancelVideoDownvoteRequestDto, CancelVideoUpvoteRequestDto, EmitVideoDownvoteRequestDto, EmitVideoUpvoteRequestDto } from './VideoVoteControllerDto.js'
import { parseInteger } from '../common/ValidTool.js'

/**
 * 用户给视频点赞
 * @param ctx context
 * @param next context
 */
export const emitVideoUpvoteController = async (ctx: koaCtx, next: koaNext) => {
    const data = ctx.request.body as Partial<EmitVideoUpvoteRequestDto>
    const uuid = ctx.cookies.get('uuid')
    const token = ctx.cookies.get('token')

    // RBAC 权限验证
    if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
        return
    }

    const emitVideoUpvoteRequest: EmitVideoUpvoteRequestDto = {
        /** KVID 视频 ID */
        videoId: data.videoId,
    }
    const emitVideoUpvoteResponse = await emitVideoUpvoteService(emitVideoUpvoteRequest.videoId, uuid, token)
    ctx.body = emitVideoUpvoteResponse
    await next()
}

/**
 * 用户取消视频点赞
 * @param ctx context
 * @param next context
 */
export const cancelVideoUpvoteController = async (ctx: koaCtx, next: koaNext) => {
    const data = ctx.request.body as Partial<CancelVideoUpvoteRequestDto>
    const uid = parseInteger(ctx.cookies.get('uid'))
    const token = ctx.cookies.get('token')

    // RBAC 权限验证
    if (!await isPassRbacCheck({ uuid: ctx.cookies.get('uuid'), apiPath: ctx.path }, ctx)) {
        return
    }

    const cancelVideoUpvoteRequest: CancelVideoUpvoteRequestDto = {
        /** KVID 视频 ID */
        videoId: data.videoId,
    }
    const cancelVideoUpvoteResponse = await cancelVideoUpvoteService(cancelVideoUpvoteRequest.videoId, uid, token)
    ctx.body = cancelVideoUpvoteResponse
    await next()
}

/**
 * 用户给视频点踩
 * @param ctx context
 * @param next context
 */
export const emitVideoDownvoteController = async (ctx: koaCtx, next: koaNext) => {
    const data = ctx.request.body as Partial<EmitVideoDownvoteRequestDto>
    const uuid = ctx.cookies.get('uuid')
    const token = ctx.cookies.get('token')

    // RBAC 权限验证
    if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
        return
    }

    const emitVideoDownvoteRequest: EmitVideoDownvoteRequestDto = {
        /** KVID 视频 ID */
        videoId: data.videoId,
    }
    const emitVideoDownvoteResponse = await emitVideoDownvoteService(emitVideoDownvoteRequest.videoId, uuid, token)
    ctx.body = emitVideoDownvoteResponse
    await next()
}

/**
 * 用户取消视频点踩
 * @param ctx context
 * @param next context
 */
export const cancelVideoDownvoteController = async (ctx: koaCtx, next: koaNext) => {
    const data = ctx.request.body as Partial<CancelVideoDownvoteRequestDto>
    const uid = parseInteger(ctx.cookies.get('uid'))
    const token = ctx.cookies.get('token')

    // RBAC 权限验证
    if (!await isPassRbacCheck({ uuid: ctx.cookies.get('uuid'), apiPath: ctx.path }, ctx)) {
        return
    }

    const cancelVideoDownvoteRequest: CancelVideoDownvoteRequestDto = {
        /** KVID 视频 ID */
        videoId: data.videoId,
    }
    const cancelVideoDownvoteResponse = await cancelVideoDownvoteService(cancelVideoDownvoteRequest.videoId, uid, token)
    ctx.body = cancelVideoDownvoteResponse
    await next()
}
