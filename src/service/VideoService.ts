import { Client } from '@elastic/elasticsearch'
import axios from 'axios'
import { InferSchemaType } from 'mongoose'
import { isEmptyObject } from '../common/ObjectTool.js'
import { GetVideoByKvidRequestDto, GetVideoByKvidResponseDto, GetVideoByUidRequestDto, GetVideoByUidResponseDto, GetVideoFileTusEndpointRequestDto, SearchVideoByKeywordRequestDto, SearchVideoByKeywordResponseDto, ThumbVideoResponseDto, UploadVideoRequestDto, UploadVideoResponseDto, VideoPartDto } from '../controller/VideoControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoSchema } from '../dbPool/schema/VideoSchema.js'
import { insertData2ElasticsearchCluster, searchDataFromElasticsearchCluster } from '../elasticsearchPool/ElasticsearchClusterPool.js'
import { EsSchema2TsType } from '../elasticsearchPool/ElasticsearchClusterPoolTypes.js'
import { VideoDocument } from '../elasticsearchPool/template/VideoDocument.js'
import { getNextSequenceValueEjectService } from './SequenceValueService.js'
import { checkUserTokenService, getUserInfoByUidService } from './UserService.js'

/**
 * 上传视频
 * @param uploadVideoRequest 上传视频请求携带的请求载荷
 * @param esClient Elasticsearch 客户端连接
 * @returns 上传视频的结果
 */
export const updateVideoService = async (uploadVideoRequest: UploadVideoRequestDto, esClient?: Client): Promise<UploadVideoResponseDto> => {
	try {
		if (checkUploadVideoRequest(uploadVideoRequest) && esClient && !isEmptyObject(esClient)) {
			const __VIDEO_SEQUENCE_EJECT__ = [9, 42, 233, 404, 2233, 10388, 10492, 114514]
			const videoIdNextSequenceValueResult = await getNextSequenceValueEjectService('video', __VIDEO_SEQUENCE_EJECT__)
			const videoId = videoIdNextSequenceValueResult.sequenceValue
			if (videoIdNextSequenceValueResult?.success && videoId !== null && videoId !== undefined) {
				// 准别视频数据
				const nowDate = new Date().getTime()
				const title = uploadVideoRequest.title
				const description = uploadVideoRequest.description
				const videoCategory = uploadVideoRequest.videoCategory
				const videoPart = uploadVideoRequest.videoPart.map(video => ({ ...video, editDateTime: nowDate }))
				const videoTags = uploadVideoRequest.videoTags.map(tag => ({ ...tag, editDateTime: nowDate }))

				// 准备上传到 MongoDB 的数据
				const { collectionName, schemaInstance } = VideoSchema
				type Video = InferSchemaType<typeof schemaInstance>

				const video: Video = {
					videoId,
					videoPart: videoPart as Video['videoPart'], // TODO: Mongoose issue: #12420
					title,
					image: uploadVideoRequest.image,
					uploadDate: new Date().getTime(),
					watchedCount: 0,
					uploaderId: uploadVideoRequest.uploaderId,
					duration: uploadVideoRequest.duration,
					description,
					videoCategory,
					copyright: uploadVideoRequest.copyright,
					videoTags: videoTags as Video['videoTags'], // TODO: Mongoose issue: #12420
					editDateTime: nowDate,
				}

				// 准备上传到 Elasticsearch 的数据
				const { indexName: esIndexName, schema: videoEsSchema } = VideoDocument
				const videoEsData: EsSchema2TsType<typeof videoEsSchema> = {
					title,
					description,
					kvid: videoId,
					videoCategory,
					videoTags,
				}

				try {
					const insert2MongoDBPromise = insertData2MongoDB(video, schemaInstance, collectionName)
					const refreshFlag = true
					const insert2ElasticsearchPromise = insertData2ElasticsearchCluster(esClient, esIndexName, videoEsSchema, videoEsData, refreshFlag)
					const [insert2MongoDBResult, insert2ElasticsearchResult] = await Promise.all([insert2MongoDBPromise, insert2ElasticsearchPromise])

					if (insert2MongoDBResult.success && insert2ElasticsearchResult.success) {
						return { success: true, videoId, message: '视频上传成功' }
					} else {
						console.error('ERROR', '视频上传失败，数据无法导入数据库或搜索引擎')
						return { success: false, message: '视频上传失败，数据无法导入数据库或搜索引擎' }
					}
				} catch (error) {
					console.error('ERROR', '视频上传失败，数据无法导入数据库，错误：', error)
					return { success: false, message: '视频上传失败，无法记录视频信息' }
				}
			} else {
				console.error('ERROR', '获取视频自增 ID 失败', uploadVideoRequest)
				return { success: false, message: '视频上传失败，获取视频 ID 失败' }
			}
		} else {
			console.error('ERROR', `上传视频时的字段校验未通过或 Es 客户端未连接，用户ID：${uploadVideoRequest.uploaderId}`)
			return { success: false, message: '上传时携带的参数不正确或搜索引擎客户端未连接' }
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
		const { collectionName, schemaInstance } = VideoSchema
		type Video = InferSchemaType<typeof schemaInstance>
		const where: QueryType<Video> = {}
		const select: SelectType<Video> = {
			videoId: 1,
			title: 1,
			image: 1,
			uploadDate: 1,
			watchedCount: 1,
			uploaderId: 1,
			duration: 1,
			description: 1,
			editDateTime: 1,
		}
		try {
			const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
			const videoResult = result.result
			if (result.success && videoResult) {
				const videosCount = videoResult?.length
				if (videosCount && videosCount > 0) {
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
			const { collectionName, schemaInstance } = VideoSchema
			type Video = InferSchemaType<typeof schemaInstance>
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
				uploaderId: 1,
				duration: 1,
				description: 1,
				editDateTime: 1,
				videoCategory: 1,
				copyright: 1,
				videoTags: 1,
			}
			try {
				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
				const videoResult = result.result
				if (result.success && videoResult) {
					const videosCount = result.result?.length
					if (videosCount === 1) {
						const video = videoResult?.[0] as GetVideoByKvidResponseDto['video']
						if (video && video.uploaderId) {
							const uploaderId = video.uploaderId
							const getVideoByUidRequest: GetVideoByUidRequestDto = {
								uid: uploaderId,
							}
							const userInfoResult = await getUserInfoByUidService(getVideoByUidRequest) // 通过视频的上传者 ID 获取上传者信息
							const userInfo = userInfoResult.result
							if (userInfoResult.success && userInfo && !isEmptyObject(userInfo)) { // 如果获取到的话，就将视频上传者信息附加到请求响应中
								video.uploaderInfo = { uid: uploaderId, username: userInfo.username, avatar: userInfo.avatar, userBannerImage: userInfo.userBannerImage, signature: userInfo.signature }
							}
							return {
								success: true,
								message: '视频页 - 获取视频成功',
								video,
							}
						} else {
							console.error('ERROR', '视频页 - 获取到的视频为空', { result, getVideoByKvidRequest, where, select })
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
			const { collectionName, schemaInstance } = VideoSchema
			type Video = InferSchemaType<typeof schemaInstance>
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
				uploaderId: 1,
				duration: 1,
				description: 1,
				editDateTime: 1,
			}

			try {
				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
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
 * 根据关键字在 Elasticsearch 中搜索视频
 * @param searchVideoByKeywordRequest 请求参数，搜索的关键字
 * @param client Elasticsearch 连接客户端
 * @returns 搜索视频的请求结果
 */
export const searchVideoByKeywordService = async (searchVideoByKeywordRequest: SearchVideoByKeywordRequestDto, client: Client | undefined): Promise<SearchVideoByKeywordResponseDto> => {
	try {
		if (checkSearchVideoByKeywordRequest(searchVideoByKeywordRequest) && client && !isEmptyObject(client)) {
			const { indexName: esIndexName, schema: videoEsSchema } = VideoDocument
			const esQuery = {
				query_string: {
					query: searchVideoByKeywordRequest.keyword,
				},
			}

			try {
				const esSearchResult = await searchDataFromElasticsearchCluster(client, esIndexName, videoEsSchema, esQuery)
				if (esSearchResult.success) {
					const videoResult = esSearchResult?.result
					if (videoResult && videoResult?.length > 0) {
						try {
							const videos: SearchVideoByKeywordResponseDto['videos'] = await Promise.all(videoResult.map(async video => {
								const esVideoId = video.kvid
								const esVideoTitle = video.title
								const uploadVideoRequest: GetVideoByKvidRequestDto = {
									videoId: esVideoId,
								}
								const result = await getVideoByKvidService(uploadVideoRequest)
								const videoResult = result?.video
								if (result.success && videoResult && !isEmptyObject(videoResult)) {
									return {
										videoId: videoResult.videoId,
										title: videoResult.title,
										image: videoResult.image,
										uploadDate: videoResult.uploadDate,
										watchedCount: videoResult.watchedCount,
										uploader: videoResult.uploaderInfo?.username,
										uploaderId: videoResult.uploaderId,
										duration: videoResult.duration,
										description: videoResult.description,
									}
								} else {
									return {
										videoId: esVideoId,
										title: esVideoTitle,
									}
								}
							}))
							const videosCount = videos?.length
							if (videos && videosCount !== undefined && videosCount !== null && videosCount > 0) {
								return { success: true, message: '使用关键字搜索视频成功', videosCount, videos }
							} else {
								console.error('ERROR', '使用关键字搜索视频失败，在 Es 中搜索成功，但在 MongoDB 中没有找到匹配的视频')
								return { success: false, message: '使用关键字搜索视频失败，搜索到视频了，但是视频信息没有存储在在数据库中', videosCount: 0, videos: [] }
							}
						} catch (error) {
							console.error('ERROR', '使用关键字搜索视频失败，在 Es 中搜索成功，但在 MongoDB 中搜索出现异常')
							return { success: false, message: '使用关键字搜索视频失败，搜索到视频了，但是视频数据获取异常', videosCount: 0, videos: [] }
						}
					} else {
						return { success: true, message: '使用关键字搜索视频成功，但搜索结果为空', videosCount: 0, videos: [] }
					}
				} else {
					console.error('ERROR', '使用关键字搜索视频失败，在 Es 中搜索失败')
					return { success: false, message: '使用关键字搜索视频失败，搜索失败', videosCount: 0, videos: [] }
				}
			} catch (error) {
				console.error('ERROR', '使用关键字搜索视频失败，在 Es 中搜索数据出现异常', error)
				return { success: false, message: '使用关键字搜索视频失败，搜索数据时出现异常', videosCount: 0, videos: [] }
			}
		} else {
			console.error('ERROR', '使用关键字搜索视频失败，检索关键字或 Es 连接客户端为空')
			return { success: false, message: '使用关键字搜索视频失败，必要参数为空', videosCount: 0, videos: [] }
		}
	} catch (error) {
		console.error('ERROR', '使用关键字搜索视频失败，未知原因：', error)
		return { success: false, message: '使用关键字搜索视频失败，未知原因', videosCount: 0, videos: [] }
	}
}


export const getVideoFileTusEndpointService = async (uid: number, token: string, getVideoFileTusEndpointRequest: GetVideoFileTusEndpointRequestDto): Promise<string | undefined> => {
	try {
		if ((await checkUserTokenService(uid, token)).success) {
			const streamTusEndpointUrl = process.env.CF_STREAM_TUS_ENDPOINT_URL
			const streamToken = process.env.CF_STREAM_TOKEN

			const uploadLength = getVideoFileTusEndpointRequest.uploadLength
			const uploadMetadata = getVideoFileTusEndpointRequest.uploadMetadata

			if (!streamTusEndpointUrl && !streamToken) {
				console.error('ERROR', '无法创建 Cloudflare Stream TUS Endpoint, streamTusEndpointUrl 和 streamToken 可能为空。请检查环境变量设置（CF_STREAM_TUS_ENDPOINT_URL, CF_STREAM_TOKEN）')
				return undefined
			}

			// 创建 Axios 请求配置
			const config = {
				headers: {
					Authorization: `Bearer ${streamToken}`,
					'Tus-Resumable': '1.0.0',
					'Upload-Length': uploadLength,
					'Upload-Metadata': uploadMetadata,
				},
			}

			try {
				const videoTusEndpointResult = await axios.post(streamTusEndpointUrl, {}, config)
				const videoTusEndpoint = videoTusEndpointResult.headers?.location
				if (videoTusEndpoint) {
					return videoTusEndpoint
				} else {
					console.error('ERROR', '无法创建 Cloudflare Stream TUS Endpoint, 请求结果为空')
					return undefined
				}
			} catch (error) {
				console.error('ERROR', '无法创建 Cloudflare Stream TUS Endpoint, 发送请求失败', error?.response?.data)
				return undefined
			}
		} else {
			console.error('ERROR', '无法创建 Cloudflare Stream TUS Endpoint, 用户校验未通过', { uid })
			return undefined
		}
	} catch (error) {
		console.error('ERROR', '无法创建 Cloudflare Stream TUS Endpoint, 未知错误：', error)
		return undefined
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

/**
 * 检查根据关键字搜索视频的请求参数
 * @param searchVideoByKeywordRequest 根据关键字搜索视频的请求参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkSearchVideoByKeywordRequest = (searchVideoByKeywordRequest: SearchVideoByKeywordRequestDto) => {
	return (!!searchVideoByKeywordRequest.keyword)
}


