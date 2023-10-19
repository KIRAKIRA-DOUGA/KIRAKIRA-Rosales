import { updateVideoService } from '../service/VideoService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { UploadVideoRequestDto } from './VideoControllerDto.js'

export const updateVideoController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UploadVideoRequestDto>
	const uploadVideoRequest: UploadVideoRequestDto = {
		link: data.link,
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
