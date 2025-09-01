import { Client } from '@elastic/elasticsearch'
import mongoose, { InferSchemaType, PipelineStage } from 'mongoose'
import { createCloudflareImageUploadSignedUrl } from '../cloudflare/index.js'
import { isEmptyObject } from '../common/ObjectTool.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { CreateOrUpdateBrowsingHistoryRequestDto } from '../controller/BrowsingHistoryControllerDto.js'
import { ApprovePendingReviewVideoRequestDto, ApprovePendingReviewVideoResponseDto, CheckVideoBlockedByKvidResponseDto, CheckVideoExistRequestDto, CheckVideoExistResponseDto, DeleteVideoRequestDto, DeleteVideoResponseDto, GetVideoByKvidRequestDto, GetVideoByKvidResponseDto, GetVideoByUidRequestDto, GetVideoByUidResponseDto, GetVideoCoverUploadSignedUrlResponseDto, GetVideoFileTusEndpointRequestDto, PendingReviewVideoResponseDto, SearchVideoByKeywordRequestDto, SearchVideoByKeywordResponseDto, SearchVideoByVideoTagIdRequestDto, SearchVideoByVideoTagIdResponseDto, ThumbVideoResponseDto, UploadVideoRequestDto, UploadVideoResponseDto, VideoPartDto } from '../controller/VideoControllerDto.js'
import { DbPoolOptions, deleteDataFromMongoDB, findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataByAggregateFromMongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { OrderByType, QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { UserInfoSchema } from '../dbPool/schema/UserSchema.js'
import { RemovedVideoSchema, VideoSchema } from '../dbPool/schema/VideoSchema.js'
import { deleteDataFromElasticsearchCluster, insertData2ElasticsearchCluster, searchDataFromElasticsearchCluster } from '../elasticsearchPool/ElasticsearchClusterPool.js'
import { EsSchema2TsType } from '../elasticsearchPool/ElasticsearchClusterPoolTypes.js'
import { VideoDocument } from '../elasticsearchPool/template/VideoDocument.js'
import { createOrUpdateBrowsingHistoryService } from './BrowsingHistoryService.js'
import { getNextSequenceValueEjectService } from './SequenceValueService.js'
import { checkUserTokenByUuidService, checkUserTokenService, getUserUid, getUserUuid } from './UserService.js'
import { FollowingSchema } from '../dbPool/schema/FeedSchema.js'
import { buildBlockListMongooseFilter, checkBlockUserService, checkIsBlockedByOtherUserService } from './BlockService.js'

/**
 * 上传视频
 * @param uploadVideoRequest 上传视频请求携带的请求载荷
 * @param esClient Elasticsearch 客户端连接
 * @returns 上传视频的结果
 */
export const updateVideoService = async (uploadVideoRequest: UploadVideoRequestDto, uid: number, token: string, esClient?: Client): Promise<UploadVideoResponseDto> => {
	try {
		if (checkUploadVideoRequest(uploadVideoRequest) && esClient && !isEmptyObject(esClient)) {
			if (!(await checkUserTokenService(uid, token)).success) {
				console.error('ERROR', '上传视频失败，用户校验未通过')
				return { success: false, message: '上传视频失败，用户校验未通过' }
			}

			if (uploadVideoRequest.uploaderId !== uid) {
				console.error('ERROR', '上传视频失败, UID 与 cookie 不相符')
				return { success: false, message: '上传视频失败, 账户未对齐' }
			}

			const UUID = await getUserUuid(uid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
			if (!UUID) {
				console.error('ERROR', '上传视频失败，UUID 不存在', { uid })
				return { success: false, message: '上传视频失败，UUID 不存在' }
			}

			// 启动事务
			const session = await mongoose.startSession()
			session.startTransaction()

			const __VIDEO_SEQUENCE_EJECT__ = [9, 42, 233, 404, 2233, 10388, 10492, 114514] // 生成 KVID 时要跳过的数字
			const videoIdNextSequenceValueResult = await getNextSequenceValueEjectService('video', __VIDEO_SEQUENCE_EJECT__, 1, 1, session)
			const videoId = videoIdNextSequenceValueResult.sequenceValue
			if (videoIdNextSequenceValueResult?.success && videoId !== null && videoId !== undefined) {
				// 准备视频数据
				const nowDate = new Date().getTime()
				const title = uploadVideoRequest.title
				const description = uploadVideoRequest.description
				const videoCategory = uploadVideoRequest.videoCategory
				const videoPart = uploadVideoRequest.videoPart.map(video => ({ ...video, editDateTime: nowDate }))
				const videoTagList = uploadVideoRequest.videoTagList.map(tag => ({ ...tag, editDateTime: nowDate }))

				// 准备上传到 MongoDB 的数据
				const { collectionName, schemaInstance } = VideoSchema
				type Video = InferSchemaType<typeof schemaInstance>

				const video: Video = {
					videoId,
					videoPart: videoPart as Video['videoPart'], // TODO: Mongoose issue: #12420
					title,
					image: uploadVideoRequest.image,
					uploadDate: nowDate,
					watchedCount: 0,
					uploaderUUID: UUID,
					uploaderId: uploadVideoRequest.uploaderId,
					duration: uploadVideoRequest.duration,
					description,
					videoCategory,
					copyright: uploadVideoRequest.copyright,
					originalAuthor: uploadVideoRequest.originalAuthor,
					originalLink: uploadVideoRequest.originalLink,
					pushToFeed: uploadVideoRequest.pushToFeed,
					ensureOriginal: uploadVideoRequest.ensureOriginal,
					videoTagList: videoTagList as Video['videoTagList'], // TODO: Mongoose issue: #12420
					pendingReview: true,
					editDateTime: nowDate,
				}

				// 准备上传到 Elasticsearch 的数据
				const { indexName: esIndexName, schema: videoEsSchema } = VideoDocument
				const videoEsData: EsSchema2TsType<typeof videoEsSchema> = {
					title,
					description,
					kvid: videoId,
					videoCategory,
					videoTagList,
				}

				try {
					const insert2MongoDBPromise = insertData2MongoDB(video, schemaInstance, collectionName, { session })
					const refreshFlag = true
					const insert2ElasticsearchPromise = insertData2ElasticsearchCluster(esClient, esIndexName, videoEsSchema, videoEsData, refreshFlag)
					const [insert2MongoDBResult, insert2ElasticsearchResult] = await Promise.all([insert2MongoDBPromise, insert2ElasticsearchPromise])

					if (insert2MongoDBResult.success && insert2ElasticsearchResult.success) {
						await session.commitTransaction()
						session.endSession()
						return { success: true, videoId, message: '视频上传成功' }
					} else {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '视频上传失败，数据无法导入数据库或搜索引擎')
						return { success: false, message: '视频上传失败，数据无法导入数据库或搜索引擎' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '视频上传失败，数据无法导入数据库，错误：', error)
					return { success: false, message: '视频上传失败，无法记录视频信息' }
				}
			} else {
				if (session.inTransaction()) {
					await session.abortTransaction()
				}
				session.endSession()
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
 * 获取主页视频 // TODO 应该使用推荐算法，而不是获取最后上传的 100 个视频
 * @returns 获取主页视频的请求响应
 */
export const getThumbVideoService = async (uuid?: string, token?: string): Promise<ThumbVideoResponseDto> => {
	try {
		const blockListFilter = await buildBlockListMongooseFilter(
			[
				{
					attr: 'uploaderUUID',
					category: 'block-uuid',
				},
				{
					attr: 'uploaderUUID',
					category: 'hide-uuid',
				},
				{
					attr: 'videoTagList.tagId',
					category: 'tag-id',
				},
				{
					attr: 'title',
					category: 'keyword',
				},
				{
					attr: 'title',
					category: 'regex',
				},
			],
			uuid,
			token
		)

		const getThumbVideoPipeline: PipelineStage[] = [
			{
				$lookup: {
					from: 'user-infos',
					localField: 'uploaderUUID',
					foreignField: 'UUID',
					as: 'uploader_info',
				},
			},
			...blockListFilter.filter,
			{ $skip: 0 }, // 跳过指定数量的文档 // TODO: 目前的值是占位符
			{ $limit: 100 }, // 限制返回的文档数量 // TODO: 目前的值是占位符
			{
				$unwind: '$uploader_info',
			},
			{
				$sort: {
					uploadDate: -1, // 按 uploadDate 降序排序
				},
			},
			{
				$project: {
					videoId: 1,
					title: 1,
					image: 1,
					uploadDate: 1,
					watchedCount: 1,
					uploaderId: 1, // 上传者 UID
					duration: 1,
					description: 1,
					editDateTime: 1,
					uploader: '$uploader_info.username', // 上传者的名字
					uploaderNickname: '$uploader_info.userNickname', // 上传者的昵称
					...blockListFilter.additionalFields, // 黑名单过滤器的额外字段
				}
			}
		]

		try {
			const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
			type ThumbVideo = InferSchemaType<typeof videoSchemaInstance>

			const result = await selectDataByAggregateFromMongoDB<ThumbVideo>(videoSchemaInstance, videoCollectionName, getThumbVideoPipeline)
			const videoResult = result.result

			if (!result.success || !videoResult) {
				console.error('ERROR', '获取到的视频数组长度小于等于 0')
				return { success: false, message: '获取首页视频时出现异常，视频数量为 0', videosCount: 0, videos: [] }
			}

			const videosCount = videoResult.length
			return { success: true, message: '获取首页视频成功', videosCount, videos: videoResult }
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
 * 根据视频 ID (KVID) 检查视频是否存在
 * @param getVideoByKvidRequest 根据视频 ID (KVID) 检查视频是否存在的请求载荷
 * @returns 视频是否存在
 */
export const checkVideoExistByKvidService = async (checkVideoExistRequestDto: CheckVideoExistRequestDto): Promise<CheckVideoExistResponseDto> => {
	try {
		if (checkGetVideoByKvidRequest(checkVideoExistRequestDto)) {
			const { collectionName, schemaInstance } = VideoSchema
			type Video = InferSchemaType<typeof schemaInstance>
			const where: QueryType<Video> = {
				videoId: checkVideoExistRequestDto.videoId,
			}
			const select: SelectType<Video> = {
				videoId: 1,
			}
			try {
				const result = await selectDataFromMongoDB<Video>(where, select, schemaInstance, collectionName)
				const videoResult = result.result
				if (result.success && videoResult) {
					const videosCount = videoResult?.length
					if (videosCount === 1) {
						return { success: true, message: "视频存在", exist: true }
					} else {
						console.error('ERROR', '获取到的视频数组长度不等于 1')
						return { success: false, message: "获取视频信息错误，视频不存在", exist: false }
					}
				} else {
					console.error('ERROR', '获取到的视频结果或视频数组为空')
					return { success: false, message: "获取视频信息错误，视频不存在", exist: false }
				}
			} catch (error) {
				console.error('ERROR', '获取视频失败：', error)
				return { success: false, message: "获取视频信息错误，视频不存在", exist: false }
			}
		} else {
			console.error('ERROR', 'KVID 为空')
			return { success: false, message: "获取视频信息错误，KVID 为空", exist: false }
		}
	} catch (error) {
		console.error('ERROR', '获取视频失败：', error)
		return { success: false, message: "获取视频信息错误，未知错误", exist: false }
	}
}

/**
 * 根据 kvid 判断用户是否被屏蔽
 * @param videoId 视频的 KVID
 * @param selectorUuid 用户的 UUID
 * @param selectorToken 用户的 Token
 */
export const checkVideoBlockedByKvidService = async (videoId: number, selectorUuid: string, selectorToken: string): Promise<CheckVideoBlockedByKvidResponseDto> => {
	try {
		let isBlocked = false
		let isBlockedByOther = false
		let isHidden = false

		const { collectionName, schemaInstance } = VideoSchema
		type Video = InferSchemaType<typeof schemaInstance>
		const where: QueryType<Video> = {
			videoId,
		}
		const select: SelectType<Video> = {
			uploaderUUID: 1,
		}
		const videoResult = await selectDataFromMongoDB<Video>(where, select, schemaInstance, collectionName)
		if (!videoResult.success || !videoResult.result || videoResult.result.length === 0) {
			console.error('ERROR', '检查视频是否被屏蔽失败，未找到对应的视频')
			return { success: false, message: '检查视频是否被屏蔽失败，未找到对应的视频'}
		}
		const video = videoResult.result?.[0]
		const uploaderUUID = video.uploaderUUID
		if (!uploaderUUID) {
			console.error('ERROR', '检查视频是否被屏蔽失败，视频上传者 UID 为空')
			return { success: false, message: '检查视频是否被屏蔽失败，视频上传者 UID 为空' }
		}
		const targetUid = await getUserUid(uploaderUUID)
		if (!targetUid) {
			console.error('ERROR', '检查视频是否被屏蔽失败，视频上传者 UID 不存在')
			return { success: false, message: '检查视频是否被屏蔽失败，视频上传者 UID 不存在' }
		}

		const checkBlockUserResult = await checkBlockUserService({ uid: targetUid }, selectorUuid, selectorToken)
		const checkIsBlockedByOtherUserResult = await checkIsBlockedByOtherUserService({ targetUid }, selectorUuid, selectorToken)
		if (!checkBlockUserResult.success && !checkIsBlockedByOtherUserResult.success) {
			console.error('ERROR', '检查视频是否被屏蔽失败，无法检查用户是否被屏蔽')
			return { success: false, message: '检查视频是否被屏蔽失败，无法检查用户是否被屏蔽' }
		}

		// 1. 检查上传者是否已经被当前用户隐藏
		if (checkBlockUserResult.isHidden) {
			isHidden = true
		}

		// 2. 检查当前用户是否已经被上传者屏蔽
		if (checkIsBlockedByOtherUserResult.isBlocked) {
			isBlockedByOther = true
		}

		// 3. 检查当前用户是否与上传者双向屏蔽
		if (checkBlockUserResult.isBlocked && checkIsBlockedByOtherUserResult.isBlocked) {
			return { success: true, message: '你与该用户已双向屏蔽', isBlockedByOther, isBlocked: true, isHidden }
		}

		// 4. 检查上传者是否已经被当前用户屏蔽
		if (checkBlockUserResult.isBlocked) {
			return { success: true, message: '你已屏蔽该用户', isBlockedByOther, isBlocked: true, isHidden }
		}
		return { success: true, message: '未屏蔽', isBlocked, isBlockedByOther, isHidden }
	} catch (error) {
		console.error('ERROR', '检查视频是否被屏蔽失败：', error)
		return { success: false, message: '检查视频是否被屏蔽失败，未知错误'}
	}
}

/**
 * 根据 kvid 获取视频详细信息（用户打开某个视频页面）
 * @param uploadVideoRequest 根据 kvid 获取视频的请求携带的请求载荷
 * @returns 视频数据
 */
export const getVideoByKvidService = async (getVideoByKvidRequest: GetVideoByKvidRequestDto, selectorUuid?: string, selectorToken?: string): Promise<GetVideoByKvidResponseDto> => {
	try {
		const { videoId } = getVideoByKvidRequest
		const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema

		let isHidden = false
		let isBlockedByOther = false

		// 判断请求参数是否合法
		if (!checkGetVideoByKvidRequest(getVideoByKvidRequest)) {
			console.error('ERROR', '视频页 - KVID 为空')
			return { success: false, message: '视频页 - 必要的请求参数为空', isBlocked: false, isBlockedByOther, isHidden }
		}

		// 构建视频查询 Pipeline
		const getThumbVideoPipeline: PipelineStage[] = [
			{
				$match: {
					videoId, // 通过 videoId 过滤视频
				},
			},
			{
				$limit: 1, // 如果意外获取多条视频，只获取第一条
			},
			{
				$lookup: { // 关联用户信息表，获取上传者信息
					from: 'user-infos',
					localField: 'uploaderUUID',
					foreignField: 'UUID',
					as: 'uploader_info',
				},
			},
			{
				$unwind: '$uploader_info', // 平铺上传者信息
			},
			{
				$project: {
					videoId: 1,
					videoPart: 1,
					title: 1,
					image: 1,
					uploadDate: 1,
					watchedCount: 1,
					uploaderUUID: 1,
					uploaderId: 1,
					duration: 1,
					description: 1,
					editDateTime: 1,
					videoCategory: 1,
					copyright: 1,
					videoTagList: 1,
					ensureOriginal: 1,
					pushToFeed: 1,
					uploaderInfo: {
						uid: '$uploader_info.uid',
						username: '$uploader_info.username',
						userNickname: '$uploader_info.userNickname',
						avatar: '$uploader_info.avatar',
						userBannerImage: '$uploader_info.userBannerImage',
						signature: '$uploader_info.signature',
					}
				}
			}
		]

		try {
			// 使用 Pipeline 查询视频及上传者数据
			const result = await selectDataByAggregateFromMongoDB(videoSchemaInstance, videoCollectionName, getThumbVideoPipeline)
			const video = result.result?.[0] as GetVideoByKvidResponseDto['video']
			if (!result.success || !video) {
				console.error('ERROR', '视频页 - 获取到的视频结果或视频数组为空')
				return { success: false, message: '视频页 - 未获取到视频', isBlocked: false, isBlockedByOther, isHidden }
			}

			video.uploaderInfo.isFollowing = false // 默认没有关注上传者
			video.uploaderInfo.isSelf = false // 默认上传者不是自己

			if ((await checkUserTokenByUuidService(selectorUuid, selectorToken)).success) { // 如果用户已登录
				const checkBlockUserResult = await checkBlockUserService({ uid: video.uploaderInfo.uid }, selectorUuid, selectorToken)
				const checkIsBlockedByOtherUserResult = await checkIsBlockedByOtherUserService({ targetUid: video.uploaderInfo.uid }, selectorUuid, selectorToken)

				// 1. 检查上传者是否已经被当前用户隐藏
				if (checkBlockUserResult.isHidden) {
					isHidden = true
				}

				// 2. 检查当前用户是否已经被上传者屏蔽
				if (checkIsBlockedByOtherUserResult.isBlocked) {
					isBlockedByOther = true
				}

				// 3. 检查当前用户是否与上传者双向屏蔽
				if (checkBlockUserResult.isBlocked && checkIsBlockedByOtherUserResult.isBlocked) {
					return { success: true, message: '视频页 - 未获取到视频，你与该用户已双向屏蔽', isBlockedByOther, isBlocked: true, isHidden }
				}

				// 4. 检查上传者是否已经被当前用户屏蔽
				if (checkBlockUserResult.isBlocked) {
					return { success: true, message: '视频页 - 未获取到视频，你已屏蔽该用户', isBlockedByOther, isBlocked: true, isHidden }
				}


				// 5. 存储浏览历史记录
				const createOrUpdateBrowsingHistoryRequest: CreateOrUpdateBrowsingHistoryRequestDto = {
					uuid: selectorUuid,
					category: 'video',
					id: String(video.videoId),
				}
				await createOrUpdateBrowsingHistoryService(createOrUpdateBrowsingHistoryRequest, selectorUuid, selectorToken)

				// 6. 查询上传者是否被当前登录用户关注
				const { collectionName: followingSchemaCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
				type Following = InferSchemaType<typeof followingSchemaInstance>
				const followingWhere: QueryType<Following> = {
					followerUuid: selectorUuid,
					followingUuid: video.uploaderUUID,
				}
				const followingSelect: SelectType<Following> = {
					followerUuid: 1,
					followingUuid: 1,
					followingType: 1,
				}
				const selectFollowingDataResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingSchemaCollectionName)
				const followingResult = selectFollowingDataResult?.result
				if (selectFollowingDataResult.success && followingResult.length === 1) { // 如果能查询到结果，则代表正在关注
					video.uploaderInfo.isFollowing = true
				}

				// 7. 如果上传者 uuid 和当前登录用户 uuid 相同，则是自己查看自己的视频
				if (video.uploaderUUID === selectorUuid) {
					video.uploaderInfo.isSelf = true
				}
			}

			return {
				success: true,
				message: '视频页 - 获取视频成功',
				video,
				isBlocked: false,
				isBlockedByOther,
				isHidden,
			}
		} catch (error) {
			console.error('ERROR', '视频页 - 视频查询失败：', error)
			return { success: false, message: '视频页 - 视频查询失败', isBlocked: false, isBlockedByOther, isHidden }
		}
	} catch (error) {
		console.error('ERROR', '获取视频失败：', error)
		return { success: false, message: '获取视频失败：', isBlocked: false, isBlockedByOther: false, isHidden: false }
	}
}

/**
 * 根据 UID 获取该用户上传的视频
 * @param getVideoByUidRequest 根据 UID 获取该用户上传的视频的请求 UID
 * @returns 请求到的视频信息
 */
export const getVideoByUidRequestService = async (getVideoByUidRequest: GetVideoByUidRequestDto, selectorUuid?: string, selectorToken?: string): Promise<GetVideoByUidResponseDto> => {
	try {
		let isHidden = false
		let isBlockedByOther = false

		if (!checkGetVideoByUidRequest(getVideoByUidRequest)) {
			console.error('ERROR', '根据 UID 获取视频失败，请求的 UID 为空：')
			return { success: false, message: '根据 UID 获取视频失败，请求的 UID 为空', videosCount: 0, videos: [], isBlockedByOther, isBlocked: false, isHidden }
		}

		const { uid } = getVideoByUidRequest

		if (selectorUuid && selectorToken && (await checkUserTokenByUuidService(selectorUuid, selectorToken)).success) {
			const checkBlockUserResult = await checkBlockUserService({ uid }, selectorUuid, selectorToken)
			const checkIsBlockedByOtherUserResult = await checkIsBlockedByOtherUserService({ targetUid: uid }, selectorUuid, selectorToken)

			// 1. 检查上传者是否已经被当前用户隐藏
			if (checkBlockUserResult.isHidden) {
				isHidden = true
			}

			// 2. 检查当前用户是否已经被上传者屏蔽
			if (checkIsBlockedByOtherUserResult.isBlocked) {
				isBlockedByOther = true
			}

			// 3. 检查当前用户是否与上传者双向屏蔽
			if (checkBlockUserResult.isBlocked && checkIsBlockedByOtherUserResult.isBlocked) {
				return { success: true, message: '根据 UID 获取视频失败，你与该用户已双向屏蔽', videosCount: 0, videos: [], isBlockedByOther, isBlocked: true, isHidden }
			}

			// 4. 检查上传者是否已经被当前用户屏蔽
			if (checkBlockUserResult.isBlocked) {
				return { success: true, message: '根据 UID 获取视频失败，你已屏蔽该用户', videosCount: 0, videos: [], isBlockedByOther, isBlocked: true, isHidden }
			}
		}

		const { collectionName, schemaInstance } = VideoSchema
		type Video = InferSchemaType<typeof schemaInstance>
		const where: QueryType<Video> = {
			uploaderId: uid,
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
			const result = await selectDataFromMongoDB<Video>(where, select, schemaInstance, collectionName)
			const videoResult = result.result
			if (!result.success || !videoResult) {
				console.error('ERROR', '根据 UID 获取视频失败，获取的结果失败或为空')
				return { success: false, message: '根据 UID 获取视频失败，获取的结果失败或为空', videosCount: 0, videos: [], isBlockedByOther, isBlocked: false, isHidden }
			}

			const videoResultLength = videoResult?.length

			if (videoResultLength <= 0) {
				return { success: true, message: '该用户似乎未上传过视频', videosCount: 0, videos: [], isBlockedByOther, isBlocked: false, isHidden }
			}

			return { success: true, message: '根据 UID 获取视频成功', videosCount: videoResultLength, videos: videoResult, isBlockedByOther, isBlocked: false, isHidden }
		} catch (error) {
			console.error('ERROR', '根据 UID 获取视频失败，检索视频出错：', error)
			return { success: false, message: '根据 UID 获取视频失败，检索视频出错', videosCount: 0, videos: [], isBlockedByOther, isBlocked: false, isHidden }
		}
	} catch (error) {
		console.error('ERROR', '根据 UID 获取视频失败，未知原因：', error)
		return { success: false, message: '根据 UID 获取视频失败，未知原因', videosCount: 0, videos: [], isBlockedByOther: false, isBlocked: false, isHidden: false }
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

/**
 * 获取视频文件 TUS 上传端点
 * @param uid 用户 UID
 * @param token 用户 token
 * @param getVideoFileTusEndpointRequest 获取视频文件 TUS 上传端点的请求载荷
 * @returns 获取视频文件 TUS 上传端点地址
 */
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

			try {
				const videoTusEndpointResponse = await fetch(streamTusEndpointUrl, {
					method: 'POST',
					headers: {
						Authorization: `Bearer ${streamToken}`,
						'Tus-Resumable': '1.0.0',
						'Upload-Length': `${uploadLength}`,
						'Upload-Metadata': uploadMetadata,
					},
				})

				if (!videoTusEndpointResponse.ok) {
					console.error('ERROR', `无法创建 Cloudflare Stream TUS Endpoint, HTTP error! status: ${videoTusEndpointResponse.status}`)
					return undefined
				}

				const videoTusEndpoint = videoTusEndpointResponse.headers.get('location')

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
 * 获取用于上传视频封面图的预签名 URL
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns GetVideoCoverUploadSignedUrlResponseDto 获取用于上传视频封面图的预签名 URL 响应结果
 */
export const getVideoCoverUploadSignedUrlService = async (uid: number, token: string): Promise<GetVideoCoverUploadSignedUrlResponseDto> => {
	try {
		if ((await checkUserTokenService(uid, token)).success) {
			const now = new Date().getTime()
			const fileName = `video-cover-${uid}-${generateSecureRandomString(32)}-${now}`
			try {
				const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 660)
				if (signedUrl) {
					return { success: true, message: '获取视频封面图上传预签名 URL 成功', result: { fileName, signedUrl } }
				}
			} catch (error) {
				console.error('ERROR', '获取视频封面图上传预签名 URL 失败，请求失败', error)
				return { success: false, message: '获取视频封面图上传预签名 URL 失败，请求失败' }
			}
		} else {
			console.error('ERROR', '获取视频封面图上传预签名 URL 失败，用户校验未通过')
			return { success: false, message: '获取视频封面图上传预签名 URL 失败，用户校验未通过' }
		}
	} catch (error) {
		console.error('ERROR', '获取视频封面图上传预签名 URL 失败：', error)
		return { success: false, message: '获取视频封面图上传预签名 URL 失败，未知原因' }
	}
}

/**
 * 根据视频 TAG ID 搜索视频数据
 * @param searchVideoByVideoTagIdRequest 根据视频 TAG ID 搜索视频的请求载荷
 * @returns 通过视频 TAG ID 获取视频的请求响应
 */
export const searchVideoByVideoTagIdService = async (searchVideoByVideoTagIdRequest: SearchVideoByVideoTagIdRequestDto): Promise<SearchVideoByVideoTagIdResponseDto> => {
	try {
		if (checkSearchVideoByVideoTagIdRequest(searchVideoByVideoTagIdRequest)) {
			const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
			const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaInstance } = UserInfoSchema
			type Video = InferSchemaType<typeof videoSchemaInstance>
			type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>
			const where: QueryType<Video> = {
				videoTagList: {
					$all: searchVideoByVideoTagIdRequest.tagId.map(tagId => ({ $elemMatch: { tagId } })),
				},
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
				videoTagList: 1,
			}
			const uploaderInfoKey = 'uploaderInfo'
			const option: DbPoolOptions<Video, UserInfo> = {
				virtual: {
					name: uploaderInfoKey, // 虚拟属性名
					options: {
						ref: userInfoCollectionName, // 关联的子模型，注意结尾要加s
						localField: 'uploaderId', // 父模型中用于关联的字段
						foreignField: 'uid', // 子模型中用于关联的字段
						justOne: true, // 如果为 true 则只一条数据关联一个文档（即使有很多符合条件的）
					},
				},
				populate: uploaderInfoKey,
			}
			try {
				const result = await selectDataFromMongoDB<Video, UserInfo>(where, select, videoSchemaInstance, videoCollectionName, option)
				const videoResult = result.result
				if (result.success && videoResult) {
					const videoList = videoResult.map(video => {
						const uploaderInfo = uploaderInfoKey in video && video?.[uploaderInfoKey] as UserInfo
						if (uploaderInfo) { // 如果获取到的话，就将视频上传者信息附加到请求响应中
							const uid = uploaderInfo.uid
							const username = uploaderInfo.username
							const userNickname = uploaderInfo.userNickname
							const avatar = uploaderInfo.avatar
							const userBannerImage = uploaderInfo.userBannerImage
							const signature = uploaderInfo.signature
							video.uploaderInfo = { uid, username, userNickname, avatar, userBannerImage, signature }
						}
						return { ...video, uploaderInfo } as SearchVideoByVideoTagIdResponseDto['videos'][number]
					})

					if (videoList) {
						if (videoList.length > 0) {
							return { success: true, message: '通过 TAG ID 搜索视频成功', videosCount: videoList.length, videos: videoList }
						} else {
							return { success: true, message: '通过 TAG ID 搜索未找到视频', videosCount: 0, videos: [] }
						}
					} else {
						console.error('ERROR', '通过 TAG ID 搜索时出错，搜索结果为空')
						return { success: true, message: '通过 TAG ID 搜索时出错，整理后的搜索结果为空', videosCount: 0, videos: [] }
					}
				} else {
					console.error('ERROR', '通过 TAG ID 搜索时出错，搜索结果为空')
					return { success: false, message: '通过 TAG ID 搜索时出错，搜索结果为空', videosCount: 0, videos: [] }
				}
			} catch (error) {
				console.error('ERROR', '通过 TAG ID 搜索时出错，搜索视频出错：', error)
				return { success: false, message: '通过 TAG ID 搜索时出错，搜索视频出错', videosCount: 0, videos: [] }
			}
		} else {
			console.error('ERROR', '无法通过 TAG ID 获取视频，请求参数不合法')
			return { success: false, message: '无法通过 TAG ID 获取视频，请求参数不合法', videosCount: 0, videos: [] }
		}
	} catch (error) {
		console.error('ERROR', '无法通过 TAG ID 获取视频，未知异常：', error)
		return { success: false, message: '无法通过 TAG ID 获取视频，未知异常', videosCount: 0, videos: [] }
	}
}

/**
 * 删除一个视频
 * @param deleteVideoRequest 删除一个视频的请求载荷
 * @param adminUid 管理员 UID
 * @param adminToken 管理员 token
 * @param esClient Elasticsearch 客户端连接
 * @returns 删除一个视频的请求响应
 */
export const deleteVideoByKvidService = async (deleteVideoRequest: DeleteVideoRequestDto, adminUid: number, adminToken: string, esClient: Client): Promise<DeleteVideoResponseDto> => {
	try {
		if (checkDeleteVideoRequest(deleteVideoRequest) && esClient && !isEmptyObject(esClient)) {
			if ((await checkUserTokenService(adminUid, adminToken)).success) {
				const adminUUID = await getUserUuid(adminUid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
				if (!adminUUID) {
					console.error('ERROR', '删除一个视频失败，adminUUID 不存在', { adminUid })
					return { success: false, message: '删除一个视频失败，adminUUID 不存在' }
				}

				const videoId = deleteVideoRequest.videoId
				const nowDate = new Date().getTime()

				const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
				type Video = InferSchemaType<typeof videoSchemaInstance>
				const deleteWhere: QueryType<Video> = {
					videoId,
				}

				const { indexName: esIndexName } = VideoDocument
				const conditions = {
					kvid: videoId,
				}

				const { collectionName: removedVideoCollectionName, schemaInstance: removedVideoSchemaInstance } = RemovedVideoSchema
				type RemovedVideo = InferSchemaType<typeof removedVideoSchemaInstance>

				// 启动事务
				const session = await mongoose.startSession()
				session.startTransaction()

				const option = { session }
				try {
					const getVideoByKvidRequest: GetVideoByKvidRequestDto = {
						videoId,
					}
					const videoResult = await getVideoByKvidService(getVideoByKvidRequest)
					const videoData = videoResult.video
					if (videoResult.success && videoData) {
						const removedVideoData: RemovedVideo = {
							...videoData as Video, // TODO: Mongoose issue: #12420
							pendingReview: false, // 已删除的视频就不需要审核了...
							_operatorUUID_: adminUUID,
							_operatorUid_: adminUid,
							editDateTime: nowDate,
						}
						const saveRemovedVideo = await insertData2MongoDB(removedVideoData, removedVideoSchemaInstance, removedVideoCollectionName, option)
						if (saveRemovedVideo.success) {
							const deleteResult = await deleteDataFromMongoDB<Video>(deleteWhere, videoSchemaInstance, videoCollectionName, option)
							const deleteFromElasticsearchResult = await deleteDataFromElasticsearchCluster(esClient, esIndexName, conditions)
							if (deleteResult.success && deleteFromElasticsearchResult) {
								await session.commitTransaction()
								session.endSession()
								return { success: true, message: '删除视频成功' }
							} else {
								if (session.inTransaction()) {
									await session.abortTransaction()
								}
								session.endSession()
								console.error('ERROR', '删除一个视频失败，删除视频失败')
								return { success: false, message: '删除一个视频失败，删除视频失败' }
							}
						} else {
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							console.error('ERROR', '删除一个视频失败，保存副本失败')
							return { success: false, message: '删除一个视频失败，保存副本失败' }
						}
					} else {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '删除一个视频失败，查询视频数据失败')
						return { success: false, message: '删除一个视频失败，查询视频数据失败' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '删除一个视频时出错，获取视频失败！')
					return { success: false, message: '删除一个视频时出错，获取视频失败' }
				}
			} else {
				console.error('ERROR', '删除一个视频失败，非法用户！')
				return { success: false, message: '删除一个视频失败，非法用户！' }
			}
		} else {
			console.error('ERROR', '删除一个视频失败，参数不合法')
			return { success: false, message: '删除一个视频失败，参数不合法' }
		}
	} catch (error) {
		console.error('ERROR', '删除一个视频时出错，未知错误：', error)
		return { success: false, message: '删除一个视频时出错，未知错误' }
	}
}


/**
 * 获取待审核视频列表
 * @param adminUid 管理员 UID
 * @param adminToken 管理员 token
 * @returns 获取待审核视频列表的请求响应
 */
export const getPendingReviewVideoService = async (adminUid: number, adminToken: string): Promise<PendingReviewVideoResponseDto> => {
	try {
		if (!(await checkUserTokenService(adminUid, adminToken)).success) {
			console.error('ERROR', '获取待审核视频列表失败，用户校验失败！')
			return { success: false, message: '获取待审核视频列表失败，用户校验失败！', videosCount: 0, videos: [] }
		}

		const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
		const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaInstance } = UserInfoSchema
		type Video = InferSchemaType<typeof videoSchemaInstance>
		type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>
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
		const orderBy: OrderByType<Video> = {
			editDateTime: -1,
		}
		const uploaderInfoKey = 'uploaderInfo'
		const option: DbPoolOptions<Video, UserInfo> = {
			virtual: {
				name: uploaderInfoKey, // 虚拟属性名
				options: {
					ref: userInfoCollectionName, // 关联的子模型
					localField: 'uploaderId', // 父模型中用于关联的字段
					foreignField: 'uid', // 子模型中用于关联的字段
					justOne: true, // 如果为 true 则只一条数据关联一个文档（即使有很多符合条件的）
				},
			},
			populate: uploaderInfoKey,
		}
		try {
			const result = await selectDataFromMongoDB<Video, UserInfo>(where, select, videoSchemaInstance, videoCollectionName, option, orderBy)
			const videoResult = result.result
			if (result.success && videoResult) {
				const videosCount = videoResult?.length
				if (videosCount && videosCount > 0) {
					return {
						success: true,
						message: '获取待审核视频成功',
						videosCount,
						videos: videoResult.map(video => {
							if (video) {
								const uploaderInfo = uploaderInfoKey in video && video?.[uploaderInfoKey] as UserInfo
								if (uploaderInfo) {
									const uploader = uploaderInfo.userNickname ?? uploaderInfo.username
									return { ...video, uploader }
								}
							}
							return { ...video, uploader: undefined }
						}),
					}
				} else {
					console.error('ERROR', '获取待审核视频列表失败，获取到的视频数组长度小于等于 0')
					return { success: false, message: '获取待审核视频列表失败，视频数量为 0', videosCount: 0, videos: [] }
				}
			} else {
				console.error('ERROR', '获取待审核视频列表失败，获取到的视频结果或视频数组为空')
				return { success: false, message: '获取待审核视频列表失败，未获取到视频', videosCount: 0, videos: [] }
			}
		} catch (error) {
			console.error('ERROR', '获取待审核视频列表时出错，获取视频时出现异常，查询失败：', error)
			return { success: false, message: '获取待审核视频列表时出错，查询失败', videosCount: 0, videos: [] }
		}
	} catch (error) {
		console.error('ERROR', '获取待审核视频列表时出错，获取视频出错：', error)
		return { success: false, message: '获取待审核视频列表时出错，获取视频出错', videosCount: 0, videos: [] }
	}
}

/**
 * 通过一个待审核视频
 * @param approvePendingReviewVideoRequest 通过一个待审核视频的请求载荷
 * @param adminUid 管理员 UID
 * @param adminToken 管理员 token
 * @returns 通过一个待审核视频的请求响应
 */
export const approvePendingReviewVideoService = async (approvePendingReviewVideoRequest: ApprovePendingReviewVideoRequestDto, adminUid: number, adminToken: string): Promise<ApprovePendingReviewVideoResponseDto> => {
	try {
		if (!checkApprovePendingReviewVideoRequest(approvePendingReviewVideoRequest)) {
			console.error('ERROR', '通过一个待审核视频失败，参数校验失败')
			return { success: false, message: '通过一个待审核视频失败，参数校验失败' }
		}

		if (!(await checkUserTokenService(adminUid, adminToken)).success) {
			console.error('ERROR', '通过一个待审核视频失败，用户校验失败！')
			return { success: false, message: '通过一个待审核视频失败，用户校验失败！' }
		}

		try {
			const { videoId } = approvePendingReviewVideoRequest
			const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
			type Video = InferSchemaType<typeof videoSchemaInstance>
			const updatePendingReviewVideoWhere: QueryType<Video> = {
				videoId,
			}

			const updatePendingReviewVideoData: UpdateType<Video> = {
				pendingReview: false,
			}
			const updatePendingReviewVideoResult = await findOneAndUpdateData4MongoDB<Video>(updatePendingReviewVideoWhere, updatePendingReviewVideoData, videoSchemaInstance, videoCollectionName)

			if (!updatePendingReviewVideoResult.success) {
				console.error('ERROR', '通过一个待审核视频失败，更新失败')
				return { success: false, message: '通过一个待审核视频失败，更新失败' }
			}


			return { success: true, message: '通过待审核视频成功' }
		} catch (error) {
			console.error('ERROR', '通过一个待审核视频时出错，请求更新时出错：', error)
			return { success: false, message: '通过一个待审核视频时出错，请求更新时出错' }
		}
	} catch (error) {
		console.error('ERROR', '通过一个待审核视频时出错，未知错误：', error)
		return { success: false, message: '通过一个待审核视频时出错，未知错误' }
	}
}

/**
 * 检查上传的视频中的参数是否正确且无疏漏
 * @param uploadVideoRequest 上传视频请求携带的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkUploadVideoRequest = (uploadVideoRequest: UploadVideoRequestDto) => {
	// TODO // WARN 这里可能需要更安全的校验机制

	const VIDEO_CATEGORY = ['anime', 'music', 'otomad', 'tech', 'design', 'game', 'misc']
	return (
		uploadVideoRequest.videoPart && uploadVideoRequest.videoPart?.length > 0 && uploadVideoRequest.videoPart.every(checkVideoPartData)
		&& uploadVideoRequest.title
		&& uploadVideoRequest.image
		&& uploadVideoRequest.uploaderId !== null && uploadVideoRequest.uploaderId !== undefined
		&& uploadVideoRequest.duration
		&& VIDEO_CATEGORY.includes(uploadVideoRequest.videoCategory)
		&& uploadVideoRequest.copyright
		&& uploadVideoRequest.pushToFeed !== undefined && uploadVideoRequest.pushToFeed !== null
		&& uploadVideoRequest.ensureOriginal !== undefined && uploadVideoRequest.ensureOriginal !== null
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

/**
 * 检查根据视频 TAG ID 搜索视频的请求载荷
 * @param searchVideoByVideoTagIdRequest 根据视频 TAG ID 搜索视频的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkSearchVideoByVideoTagIdRequest = (searchVideoByVideoTagIdRequest: SearchVideoByVideoTagIdRequestDto): boolean => {
	return (searchVideoByVideoTagIdRequest && searchVideoByVideoTagIdRequest.tagId && searchVideoByVideoTagIdRequest.tagId.length > 0)
}

/**
 * 检查删除一个视频的请求载荷
 * @param deleteVideoRequest 删除一个视频的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkDeleteVideoRequest = (deleteVideoRequest: DeleteVideoRequestDto): boolean => {
	return (!!deleteVideoRequest.videoId && typeof deleteVideoRequest.videoId === 'number' && deleteVideoRequest.videoId >= 0)
}

/**
 * 检查通过一个待审核视频的请求载荷
 * @param approvePendingReviewVideoRequest 通过一个待审核视频的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkApprovePendingReviewVideoRequest = (approvePendingReviewVideoRequest: ApprovePendingReviewVideoRequestDto) => {
	return (!!approvePendingReviewVideoRequest.videoId && typeof approvePendingReviewVideoRequest.videoId === 'number' && approvePendingReviewVideoRequest.videoId >= 0)
}

