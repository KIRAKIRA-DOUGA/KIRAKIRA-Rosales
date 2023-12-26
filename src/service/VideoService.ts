import { InferSchemaType, Schema } from 'mongoose'
import { GetVideoByKvidRequestDto, GetVideoByKvidResponseDto, GetVideoByUidRequestDto, GetVideoByUidResponseDto, ThumbVideoResponseDto, UploadVideoRequestDto, UploadVideoResponseDto, VideoPartDto } from '../controller/VideoControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import VideoSchema from '../dbPool/schema/VideoSchema.js'
import { getNextSequenceValueEjectService } from './SequenceValueService.js'
import { getUserInfoByUidService } from './UserService.js'

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
				const nowDate = new Date().getTime()
				const videoPart = uploadVideoRequest.videoPart.map(video => ({ ...video, editDateTime: nowDate }))
				const videoTags = uploadVideoRequest.videoTags.map(tag => ({ ...tag, editDateTime: nowDate }))
				const video: Video = {
					videoId,
					videoPart,
					title: uploadVideoRequest.title,
					image: uploadVideoRequest.image,
					uploadDate: new Date().getTime(),
					watchedCount: 0,
					uploader: uploadVideoRequest.uploader,
					uploaderId: uploadVideoRequest.uploaderId,
					duration: uploadVideoRequest.duration,
					description: uploadVideoRequest.description,
					videoCategory: uploadVideoRequest.videoCategory,
					copyright: uploadVideoRequest.copyright,
					videoTags,
					editDateTime: nowDate,
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
		} else {
			console.error('ERROR', `上传视频时的字段校验未通过，用户名：${uploadVideoRequest.uploader}, 用户ID：${uploadVideoRequest.uploaderId}`)
			return { success: false, message: '上传时携带的参数不正确' }
		}
	} catch (error) {
		console.error('ERROR', '视频上传失败：', error)
		return { success: false, message: '视频上传失败' }
	}
}

/**
 * 获取主页视频 // TODO 应该使用推荐算法，而不是获取全部视频
 * @param uploadVideoRequest 上传视频请求携带的请求载荷
 * @returns 上传视频的结果
 */
export const getThumbVideoService = async (): Promise<ThumbVideoResponseDto> => {
	try {
		const { collectionName, schema: videoSchema } = VideoSchema
		const schema = new Schema(videoSchema)
		type Video = InferSchemaType<typeof schema>
		const where: QueryType<Video> = {}
		const select: SelectType<Video> = {
			videoId: 1,
			title: 1,
			image: 1,
			uploadDate: 1,
			watchedCount: 1,
			uploader: 1,
			uploaderId: 1,
			duration: 1,
			description: 1,
			editDateTime: 1,
		}
		try {
			const result = await selectDataFromMongoDB(where, select, schema, collectionName)
			const videoResult = result.result
			if (result.success && videoResult) {
				const videosCount = result.result?.length
				if (videosCount > 0) {
					return {
						success: true,
						message: '获取首页视频成功',
						videosCount,
						videos: videoResult,
					}
				} else {
					console.error('ERROR', '获取到的视频数组长度小于等于 0')
					return { success: false, message: '获取首页视频时出现异常，视频数量为 0', videosCount: 0, videos: [] }
				}
			} else {
				console.error('ERROR', '获取到的视频结果或视频数组为空')
				return { success: false, message: '获取首页视频时出现异常，未获取到视频', videosCount: 0, videos: [] }
			}
		} catch (error) {
			console.error('ERROR', '获取首页视频时出现异常，查询失败：', error)
			return { success: false, message: '获取首页视频时出现异常', videosCount: 0, videos: [] }
		}
	} catch (error) {
		console.error('ERROR', '获取首页视频失败：', error)
		return { success: false, message: '获取首页视频失败', videosCount: 0, videos: [] }
	}
}

/**
 * 根据 kvid 获取视频详细信息
 * @param uploadVideoRequest 根据 kvid 获取视频的请求携带的请求载荷
 * @returns 视频数据
 */
export const getVideoByKvidService = async (getVideoByKvidRequest: GetVideoByKvidRequestDto): Promise<GetVideoByKvidResponseDto> => {
	try {
		if (checkGetVideoByKvidRequest(getVideoByKvidRequest)) {
			const { collectionName, schema: videoSchema } = VideoSchema
			const schema = new Schema(videoSchema)
			type Video = InferSchemaType<typeof schema>
			const where: QueryType<Video> = {
				videoId: getVideoByKvidRequest.videoId,
			}
			const select: SelectType<Video> = {
				videoId: 1,
				videoPart: 1,
				title: 1,
				image: 1,
				uploadDate: 1,
				watchedCount: 1,
				uploader: 1,
				uploaderId: 1,
				duration: 1,
				description: 1,
				editDateTime: 1,
				videoCategory: 1,
				copyright: 1,
				videoTags: 1,
			}
			try {
				const result = await selectDataFromMongoDB(where, select, schema, collectionName)
				const videoResult = result.result
				if (result.success && videoResult) {
					const videosCount = result.result?.length
					if (videosCount === 1) {
						const video = videoResult?.[0] as GetVideoByKvidResponseDto['video']
						if (video) {
							const getVideoByUidRequest: GetVideoByUidRequestDto = {
								uid: video.uploaderId,
							}
							const userInfoResult = await getUserInfoByUidService(getVideoByUidRequest) // 通过视频的上传者 ID 获取上传者信息
							const userInfo = userInfoResult.result
							if (userInfoResult.success) { // 如果获取到的话，就将视频上传者信息附加到请求响应中
								video.uploaderInfo = { uid: video.uploaderId, username: userInfo.username, avatar: userInfo.avatar, userBannerImage: userInfo.userBannerImage, signature: userInfo.signature }
							}
							return {
								success: true,
								message: '获取首页视频成功',
								video,
							}
						} else {
							console.error('ERROR', '视频页 - 获取到的视频为空', { result, getVideoByKvidRequest, VideoSchema, where, select })
							return { success: false, message: '视频页 - 获取到的视频数据为空' }
						}
					} else {
						console.error('ERROR', '视频页 - 获取到的视频数组长度不等于 1')
						return { success: false, message: '视频页 - 获取到的视频数量不为 1' }
					}
				} else {
					console.error('ERROR', '视频页 - 获取到的视频结果或视频数组为空')
					return { success: false, message: '视频页 - 未获取到视频' }
				}
			} catch (error) {
				console.error('ERROR', '视频页 - 视频查询失败：', error)
				return { success: false, message: '视频页 - 视频查询失败' }
			}
		} else {
			console.error('ERROR', '视频页 - KVID 为空')
			return { success: false, message: '视频页 - 必要的请求参数为空' }
		}
	} catch (error) {
		console.error('ERROR', '获取视频失败：', error)
		return { success: false, message: '获取视频失败：' }
	}
}

/**
 * 根据 UID 获取该用户上传的视频
 * @param getVideoByUidRequest 根据 UID 获取该用户上传的视频的请求 UID
 * @returns 请求到的视频信息
 */
export const getVideoByUidRequestService = async (getVideoByUidRequest: GetVideoByUidRequestDto): Promise<GetVideoByUidResponseDto> => {
	try {
		if (checkGetVideoByUidRequest(getVideoByUidRequest)) {
			const { collectionName, schema: videoSchema } = VideoSchema
			const schema = new Schema(videoSchema)
			type Video = InferSchemaType<typeof schema>
			const where: QueryType<Video> = {
				uploaderId: getVideoByUidRequest.uid,
			}
			const select: SelectType<Video> = {
				videoId: 1,
				videoPart: 1,
				title: 1,
				image: 1,
				uploadDate: 1,
				watchedCount: 1,
				uploader: 1,
				uploaderId: 1,
				duration: 1,
				description: 1,
				editDateTime: 1,
			}

			try {
				const result = await selectDataFromMongoDB(where, select, schema, collectionName)
				const videoResult = result.result
				if (result.success && videoResult) {
					const videoResultLength = videoResult?.length
					if (videoResultLength > 0) {
						return { success: true, message: '根据 UID 获取视频成功', videosCount: videoResultLength, videos: videoResult }
					} else {
						return { success: false, message: '该用户似乎未上传过视频', videosCount: 0, videos: [] }
					}
				} else {
					console.error('ERROR', '根据 UID 获取视频失败，获取的结果失败或为空')
					return { success: false, message: '根据 UID 获取视频失败，获取的结果失败或为空', videosCount: 0, videos: [] }
				}
			} catch (error) {
				console.error('ERROR', '根据 UID 获取视频失败，检索视频出错：', error)
				return { success: false, message: '根据 UID 获取视频失败，检索视频出错', videosCount: 0, videos: [] }
			}
		} else {
			console.error('ERROR', '根据 UID 获取视频失败，请求的 UID 为空：')
			return { success: false, message: '根据 UID 获取视频失败，请求的 UID 为空', videosCount: 0, videos: [] }
		}
	} catch (error) {
		console.error('ERROR', '根据 UID 获取视频失败，未知原因：', error)
		return { success: false, message: '根据 UID 获取视频失败，未知原因', videosCount: 0, videos: [] }
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
		uploadVideoRequest.videoPart && uploadVideoRequest.videoPart?.length > 0 && uploadVideoRequest.videoPart.every(checkVideoPartData)
		&& uploadVideoRequest.title
		&& uploadVideoRequest.image
		&& uploadVideoRequest.uploader
		&& uploadVideoRequest.uploaderId !== null && uploadVideoRequest.uploaderId !== undefined
		&& uploadVideoRequest.duration
	)
}

/**
 * 检查上传的视频中的 videoPartDate 参数是否正确且无疏漏
 * @param videoPartDate 每一 P 视频的数据
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkVideoPartData = (videoPartDate: VideoPartDto) => {
	return (
		videoPartDate.id !== null && videoPartDate.id !== undefined
		&& videoPartDate.link
		&& videoPartDate.videoPartTitle
	)
}

/**
 * 检查根据 kvid 获取视频时的 kvid 是否存在
 * @param getVideoByKvidRequest 根据 kvid 获取视频数据时携带的请求参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkGetVideoByKvidRequest = (getVideoByKvidRequest: GetVideoByKvidRequestDto) => {
	return (getVideoByKvidRequest.videoId !== null && getVideoByKvidRequest.videoId !== undefined)
}

/**
 * 检查根据 uid 获取视频列表时的 uid 是否存在
 * @param getVideoByUidRequest 根据 uid 获取视频列表数据时携带的请求参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkGetVideoByUidRequest = (getVideoByUidRequest: GetVideoByUidRequestDto) => {
	return (getVideoByUidRequest.uid !== null && getVideoByUidRequest.uid !== undefined)
}


