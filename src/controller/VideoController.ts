import { getThumbVideoService, getVideoByKvidService, getVideoByUidRequestService, getVideoFileTusEndpointService, searchVideoByKeywordService, updateVideoService } from '../service/VideoService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { GetVideoByKvidRequestDto, GetVideoByUidRequestDto, GetVideoFileTusEndpointRequestDto, SearchVideoByKeywordRequestDto, UploadVideoRequestDto } from './VideoControllerDto.js'

/**
 * 上传视频
 * @param ctx context
 * @param next context
 * @returns 上传视频的结果
 */
export const updateVideoController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UploadVideoRequestDto>
	const uploadVideoRequest: UploadVideoRequestDto = {
		title: data.title || '',
		videoPart: data.videoPart || [],
		image: data.image || '',
		uploaderId: data.uploaderId ?? -1,
		duration: data.duration ?? -1,
		description: data.description || '',
		videoCategory: data.videoCategory || '',
		copyright: data.copyright || '',
		originalAuthor: data.originalAuthor,
		originalLink: data.originalLink,
		pushToFeed: data.pushToFeed,
		ensureOriginal: data.ensureOriginal,
		videoTags: data.videoTags || [],
	}
	const esClient = ctx.elasticsearchClient
	const uploadVideoResponse = await updateVideoService(uploadVideoRequest, esClient)
	ctx.body = uploadVideoResponse
	await next()
}

/**
 * 获取首页要显示的视频
 * // TODO: 现在还只是获取全部视频，未来优化为推荐视频
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
	const uploadVideoRequest: GetVideoByKvidRequestDto = {
		videoId: videoId ? parseInt(videoId, 10) : -1, // WARN -1 means you can't find any video
	}
	const getVideoByKvidResponse = await getVideoByKvidService(uploadVideoRequest)
	ctx.body = getVideoByKvidResponse
	await next()
}

/**
 * 根据 UID 获取该用户上传的视频
 * @param ctx context
 * @param next context
 * @returns 获取到的视频信息
 */
export const getVideoByUidController = async (ctx: koaCtx, next: koaNext) => {
	const uid = ctx.query.uid as string
	const getVideoByUidRequest: GetVideoByUidRequestDto = {
		uid: uid ? parseInt(uid, 10) : -1, // WARN -1 means you can't find any video
	}
	const getVideoByKvidResponse = await getVideoByUidRequestService(getVideoByUidRequest)
	ctx.body = getVideoByKvidResponse
	await next()
}

/**
 * 根据关键字搜索视频
 * @param ctx context
 * @param next context
 * @returns 获取到的视频信息
 */
export const searchVideoByKeywordController = async (ctx: koaCtx, next: koaNext) => {
	const keyword = ctx.query.keyword as string
	const searchVideoByKeywordRequest: SearchVideoByKeywordRequestDto = {
		keyword: keyword ?? '', // WARN '' means you can't find any video
	}
	const esClient = ctx.elasticsearchClient
	const searchVideoByKeywordResponse = await searchVideoByKeywordService(searchVideoByKeywordRequest, esClient)
	ctx.body = searchVideoByKeywordResponse
	await next()
}

/**
 * 获取视频文件 TUS 上传端点
 * @param ctx context
 * @param next context
 * @returns 获取到的视频信息
 */
export const getVideoFileTusEndpointController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	const getVideoFileTusEndpointRequest: GetVideoFileTusEndpointRequestDto = {
		uploadLength: parseInt(ctx.get('Upload-Length'), 10),
		uploadMetadata: ctx.get('Upload-Metadata') || '',
	}

	const destination = await getVideoFileTusEndpointService(uid, token, getVideoFileTusEndpointRequest)
	ctx.set({
		'Access-Control-Expose-Headers': 'Location',
		'Access-Control-Allow-Headers': '*',
		'Access-Control-Allow-Origin': '*',
		Location: destination,
	})
	ctx.body = destination ? 'true' : 'false'
	await next()
}

