import { getThumbVideoService, getVideoByKvidService, updateVideoService } from '../service/VideoService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { getVideoByKvidRequestDto, UploadVideoRequestDto } from './VideoControllerDto.js'

/**
 * 上传视频
 * @param ctx context
 * @param next context
 * @returns 上传视频的结果
 */
export const updateVideoController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UploadVideoRequestDto>
	const uploadVideoRequest: UploadVideoRequestDto = {
		title: data.title,
		videoPart: data.videoPart,
		image: data.image,
		uploader: data.uploader,
		uploaderId: data.uploaderId,
		duration: data.duration,
		description: data.description,
	}
	const uploadVideoResponse = await updateVideoService(uploadVideoRequest)
	ctx.body = uploadVideoResponse
	await next()
}

/**
 * 获取首页要显示的视频
 * @param ctx context
 * @param next context
 * @returns 获取首页要显示的视频
 */
export const getThumbVideoController = async (ctx: koaCtx, next: koaNext) => {
	const getThumbVideoResponse = await getThumbVideoService()
	ctx.body = getThumbVideoResponse
	await next()
}

/**
 * 根据 kvid 获取视频详细信息
 * @param ctx context
 * @param next context
 * @returns 获取视频信息
 */
export const getVideoByKvidController = async (ctx: koaCtx, next: koaNext) => {
	const videoId = ctx.query.videoId as string
	const uploadVideoRequest: getVideoByKvidRequestDto = {
		videoId: videoId ? parseInt(videoId, 10) : -1, // WARN -1 means you can't find any video
	}
	const getVideoByKvidResponse = await getVideoByKvidService(uploadVideoRequest)
	ctx.body = getVideoByKvidResponse
	await next()
}
