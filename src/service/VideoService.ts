import { InferSchemaType, Schema } from 'mongoose'
import { UploadVideoRequestDto, UploadVideoResponseDto } from '../controller/VideoControllerDto.js'
import { insertData2MongoDB } from '../dbPool/DbClusterPool.js'
import VideoSchema from '../dbPool/schema/VideoSchema.js'
import { getNextSequenceValueEjectService } from './SequenceValueService.js'

/**
 * 上传视频
 * @param uploadVideoRequest 上传视频请求携带的请求载荷
 * @returns 上传视频的结果
 */
export const updateVideoService = async (uploadVideoRequest: UploadVideoRequestDto): Promise<UploadVideoResponseDto> => {
	try {
		if (checkUploadVideoRequest(uploadVideoRequest)) {
			const { collectionName, schema: videoSchema } = VideoSchema
			const schema = new Schema(videoSchema)
			const __VIDEO_SEQUENCE_EJECT__ = [9, 42, 233, 404, 2233, 10388, 10492, 114514]
			const videoIdNextSequenceValueResult = await getNextSequenceValueEjectService('video', __VIDEO_SEQUENCE_EJECT__)
			const videoId = videoIdNextSequenceValueResult.sequenceValue
			if (videoIdNextSequenceValueResult?.success && videoId !== null && videoId !== undefined) {
				type Video = InferSchemaType<typeof schema>
				const video: Video = {
					videoId,
					link: uploadVideoRequest.link,
					image: uploadVideoRequest.image,
					updateDate: new Date().getTime(),
					watchedCount: 0,
					uploader: uploadVideoRequest.uploader,
					uploaderId: uploadVideoRequest.uploaderId,
					duration: uploadVideoRequest.duration,
					description: uploadVideoRequest.description,
					editDateTime: new Date().getTime(),
				}
				try {
					await insertData2MongoDB(video, schema, collectionName)
					return { success: true, videoId, message: '视频上传成功' }
				} catch (error) {
					console.error('ERROR', '视频上传失败，数据无法导入数据库，错误：', error)
					return { success: false, message: '视频上传失败，无法记录视频信息' }
				}
			} else {
				console.error('ERROR', '获取视频自增 ID 失败', uploadVideoRequest)
				return { success: false, message: '视频上传失败，获取视频 ID 失败' }
			}
		}
	} catch (error) {
		console.error('ERROR', '视频上传失败：', error)
		return { success: false, message: '视频上传失败' }
	}
}


/**
 * 检查上传的视频中的参数是否正确且无疏漏
 * @param uploadVideoRequest 上传视频请求携带的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkUploadVideoRequest = (uploadVideoRequest: UploadVideoRequestDto) => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (
		uploadVideoRequest.link
		&& uploadVideoRequest.image
		&& uploadVideoRequest.uploader
		&& uploadVideoRequest.uploaderId
		&& uploadVideoRequest.duration
	)
}
