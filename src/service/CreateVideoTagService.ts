import { CreateVideoTagRequestDto, CreateVideoTagResponseDto, GetVideoTagByTagIdRequestDto, GetVideoTagByTagIdResponseDto, SearchVideoTagRequestDto, SearchVideoTagResponseDto } from '../controller/VideoTagControllerDto.js'
import { checkUserRoleService, checkUserTokenService } from './UserService.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { VideoTagSchema } from '../dbPool/schema/VideoTagSchema.js'
import { InferSchemaType } from 'mongoose'
import { insertData2MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'

/**
 * 创建视频 TAG
 * @param createVideoTagRequest 创建视频 TAG 的请求载荷，即 TAG 数据
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 创建视频 TAG 的响应结果
 */
export const createVideoTagService = async (createVideoTagRequest: CreateVideoTagRequestDto, uid: number, token: string): Promise<CreateVideoTagResponseDto> => {
	try {
		if (checkCreateVideoTagRequest(createVideoTagRequest)) {
			if ((await checkUserTokenService(uid, token)).success) {
				if (await checkUserRoleService(uid, 'blocked')) {
					console.error('ERROR', '创建视频 TAG 失败，用户已封禁')
					return { success: false, message: '创建视频 TAG 失败，用户已封禁' }
				}
				try {
					const { collectionName, schemaInstance } = VideoTagSchema
					type videoTagListType = InferSchemaType<typeof schemaInstance>

					const videoTagIdNextSequenceValueResult = await getNextSequenceValueService('video-tag', 1)
					const tagId = videoTagIdNextSequenceValueResult.sequenceValue
					const nowDate = new Date().getTime()
					const tagNameList = createVideoTagRequest.tagNameList

					if (tagId !== undefined && tagId !== null) {
						// 准备上传到 MongoD 的数据
						const videoTagListData: videoTagListType = {
							tagId,
							tagNameList: tagNameList as videoTagListType['tagNameList'], // TODO: Mongoose issue: #12420
							editDateTime: nowDate,
						}
						const insert2MongoDBResult = await insertData2MongoDB(videoTagListData, schemaInstance, collectionName)
						if (insert2MongoDBResult?.success) {
							return { success: true, message: '创建视频 TAG 成功', result: { tagId, tagNameList } }
						} else {
							console.error('ERROR', '创建视频 TAG 时出错，向 MongoDB 插入 TAG 数据失败')
							return { success: false, message: '创建视频 TAG 时出错，数据插入失败' }
						}
					} else {
						console.error('ERROR', '创建视频 TAG 时出错，获取到的 TAG 自增编号为空')
						return { success: false, message: '创建视频 TAG 时出错，生成的 TAG 编号为空' }
					}
				} catch (error) {
					console.error('ERROR', '创建视频 TAG 时出错，获取 TAG 自增编号时出错')
					return { success: false, message: '创建视频 TAG 时出错，获取 TAG 编号时出错' }
				}
			} else {
				console.error('ERROR', '创建视频 TAG 时出错，用户非法')
				return { success: false, message: '创建视频 TAG 时出错，用户未登录或未通过验证' }
			}
		} else {
			console.error('ERROR', '创建视频 TAG 时出错，请求参数不正确')
			return { success: false, message: '创建视频 TAG 时出错，请求参数不正确' }
		}
	} catch (error) {
		console.error('ERROR', '创建视频 TAG 时出错，未知原因：', error)
		return { success: false, message: '创建视频 TAG 时出错，未知原因' }
	}
}

/**
 * 在数据库中模糊查询视频 TAG
 * @param searchVideoTagRequest 在数据库中查询视频 TAG 的请求响应
 * @returns 查询到的视频 TAG 列表
 */
export const searchVideoTagService = async (searchVideoTagRequest: SearchVideoTagRequestDto): Promise<SearchVideoTagResponseDto> => {
	try {
		if (checkSearchVideoTagRequest(searchVideoTagRequest)) {
			const { collectionName, schemaInstance } = VideoTagSchema
			type VideoTag = InferSchemaType<typeof schemaInstance>

			const regex = new RegExp(searchVideoTagRequest.tagNameSearchKey, 'i') // 忽略大小写
			const where: QueryType<VideoTag> = {
				'tagNameList.tagName.name': { $regex: regex },
			}
			const select: SelectType<VideoTag> = {
				tagId: 1,
				tagNameList: 1,
			}

			try {
				const searchVideoTagResult = await selectDataFromMongoDB<VideoTag>(where, select, schemaInstance, collectionName)
				const result = searchVideoTagResult?.result as unknown as SearchVideoTagResponseDto['result']
				if (searchVideoTagResult.success) {
					if (result?.length > 0) {
						return { success: true, message: '搜索视频 TAG 成功', result }
					} else {
						return { success: true, message: '搜索视频 TAG 的结果为空', result: [] }
					}
				} else {
					console.error('ERROR', '搜索视频 TAG 时出错，在 MongoDB 中查询数据失败')
					return { success: false, message: '搜索视频 TAG 失败，查询失败' }
				}
			} catch (error) {
				console.error('ERROR', '搜索视频 TAG 时出错，在 MongoDB 中查询数据出错：', error)
				return { success: false, message: '搜索视频 TAG 时出错，数据查询出错' }
			}
		} else {
			console.error('ERROR', '搜索视频 TAG 时出错，参数不合法')
			return { success: false, message: '搜索视频 TAG 时出错，参数错误' }
		}
	} catch (error) {
		console.error('ERROR', '搜索视频 TAG 时出错，未知原因：', error)
		return { success: false, message: '搜索视频 TAG 时出错，未知原因' }
	}
}

/**
 * 根据 TAG ID 在数据库中匹配视频 TAG 的请求参数
 * @param getVideoTagByTagIdRequest 根据 TAG ID 在数据库中匹配视频 TAG
 * @returns 根据 TAG ID 在数据库中匹配视频 TAG 的请求响应
 */
export const getVideoTagByTagIdService = async (getVideoTagByTagIdRequest: GetVideoTagByTagIdRequestDto): Promise<GetVideoTagByTagIdResponseDto> => {
	try {
		if (checkGetVideoTagByTagIdRequest(getVideoTagByTagIdRequest)) {
			const { collectionName, schemaInstance } = VideoTagSchema
			type VideoTag = InferSchemaType<typeof schemaInstance>

			const where: QueryType<VideoTag> = {
				tagId: { $in: getVideoTagByTagIdRequest.tagId },
			}
			const select: SelectType<VideoTag> = {
				tagId: 1,
				tagNameList: 1,
			}

			try {
				const searchVideoTagResult = await selectDataFromMongoDB<VideoTag>(where, select, schemaInstance, collectionName)
				const result = searchVideoTagResult?.result as unknown as SearchVideoTagResponseDto['result']
				if (searchVideoTagResult.success) {
					if (result?.length > 0) {
						return { success: true, message: '获取视频 TAG 成功', result }
					} else {
						return { success: true, message: '获取视频 TAG 的结果为空', result: [] }
					}
				} else {
					console.error('ERROR', '获取视频 TAG 时出错，在 MongoDB 中查询数据失败')
					return { success: false, message: '获取视频 TAG 失败，查询失败' }
				}
			} catch (error) {
				console.error('ERROR', '获取视频 TAG 时出错，在 MongoDB 中查询数据出错：', error)
				return { success: false, message: '获取视频 TAG 时出错，数据查询出错' }
			}
		} else {
			console.error('ERROR', '获取视频 TAG 时出错，参数不合法')
			return { success: false, message: '获取视频 TAG 时出错，参数错误' }
		}
	} catch (error) {
		console.error('ERROR', '获取视频 TAG 时出错，未知原因：', error)
		return { success: false, message: '获取视频 TAG 时出错，未知原因' }
	}
}

/**
 * 校验创建视频 TAG 的请求是否合法
 * @param createVideoTagRequest 创建视频 TAG 的请求
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateVideoTagRequest = (createVideoTagRequest: CreateVideoTagRequestDto): boolean => {
	const isAllTagItemNotNull = createVideoTagRequest?.tagNameList?.every(tag => tag && tag.lang && tag.tagName?.length > 0 && tag.tagName.every(tagName => !!tagName.name))
	return (
		createVideoTagRequest && createVideoTagRequest?.tagNameList?.length > 0
		&& isAllTagItemNotNull
	)
}

/**
 * 校验搜索 TAG 的请求参数是否合法
 * @param searchVideoTagRequest 搜索 TAG 的请求参数
 * @returns 合法返回 true, 不合法返回 false
 */
const checkSearchVideoTagRequest = (searchVideoTagRequest: SearchVideoTagRequestDto): boolean => {
	return !!searchVideoTagRequest.tagNameSearchKey
}

/**
 * 检查根据 TAG ID 在数据库中匹配视频 TAG 的请求参数是否合法
 * @param getVideoTagByTagIdRequest 根据 TAG ID 在数据库中匹配视频 TAG 的请求参数
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetVideoTagByTagIdRequest = (getVideoTagByTagIdRequest: GetVideoTagByTagIdRequestDto): boolean => {
	return !!getVideoTagByTagIdRequest && getVideoTagByTagIdRequest.tagId && getVideoTagByTagIdRequest.tagId.length > 0
}
