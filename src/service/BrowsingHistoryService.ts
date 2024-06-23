import { InferSchemaType, PipelineStage } from 'mongoose'
import { CreateOrUpdateBrowsingHistoryRequestDto, CreateOrUpdateBrowsingHistoryResponseDto, GetUserBrowsingHistoryWithFilterRequestDto, GetUserBrowsingHistoryWithFilterResponseDto } from '../controller/BrowsingHistoryControllerDto.js'
import { selectDataByAggregateFromMongoDB, findOneAndUpdateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType } from '../dbPool/DbClusterPoolTypes.js'
import { BrowsingHistorySchema } from '../dbPool/schema/BrowsingHistorySchema.js'
import { checkUserTokenService } from './UserService.js'

/**
 * 更新或创建用户浏览历史
 * @param createBrowsingHistoryRequest 更新或创建用户浏览历史请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 更新或创建用户浏览历史响应结果
 */
export const createOrUpdateBrowsingHistoryService = async (createOrUpdateBrowsingHistoryRequest: CreateOrUpdateBrowsingHistoryRequestDto, uid: number, token: string): Promise<CreateOrUpdateBrowsingHistoryResponseDto> => {
	try {
		if (checkCreateOrUpdateBrowsingHistoryRequest(createOrUpdateBrowsingHistoryRequest)) {
			if (createOrUpdateBrowsingHistoryRequest.uid === uid) {
				if ((await checkUserTokenService(uid, token)).success) {
					const { collectionName, schemaInstance } = BrowsingHistorySchema
					type BrowsingHistoryType = InferSchemaType<typeof schemaInstance>

					const uid = createOrUpdateBrowsingHistoryRequest.uid
					const category = createOrUpdateBrowsingHistoryRequest.category
					const id = createOrUpdateBrowsingHistoryRequest.id
					const anchor = createOrUpdateBrowsingHistoryRequest.anchor
					const nowDate = new Date().getTime()

					// 搜索数据
					const BrowsingHistoryWhere: QueryType<BrowsingHistoryType> = {
						uid,
						category,
						id,
					}

					// 准备上传到 MongoDB 的数据
					const BrowsingHistoryData: BrowsingHistoryType = {
						uid,
						category,
						id,
						anchor,
						lastUpdateDateTime: nowDate,
						editDateTime: nowDate,
					}

					try {
						const insert2MongoDResult = await findOneAndUpdateData4MongoDB(BrowsingHistoryWhere, BrowsingHistoryData, schemaInstance, collectionName)
						const result = insert2MongoDResult.result
						if (insert2MongoDResult.success && result) {
							return { success: true, message: '更新或创建用户浏览历史成功', result: result as CreateOrUpdateBrowsingHistoryResponseDto['result'] }
						}
					} catch (error) {
						console.error('ERROR', '更新或创建用户浏览历史时出错，插入数据时出错')
						return { success: false, message: '更新或创建用户浏览历史时出错，插入数据时出错' }
					}
				} else {
					console.error('ERROR', '更新或创建用户浏览历史时出错，用户校验失败')
					return { success: false, message: '更新或创建用户浏览历史时出错，用户校验失败' }
				}
			} else {
				console.error('ERROR', '更新或创建用户浏览历史时出错，查看历史记录的目标用户与当前登录用户不一致，不允许查看其他用户的历史记录！')
				return { success: false, message: '更新或创建用户浏览历史时出错，查看历史记录的目标用户与当前登录用户不一致，不允许查看其他用户的历史记录！' }
			}
		} else {
			console.error('ERROR', '更新或创建用户浏览历史时出错，参数不合法')
			return { success: false, message: '更新或创建用户浏览历史时出错，参数不合法' }
		}
	} catch (error) {
		console.error('ERROR', '更新或创建用户浏览历史时出错，未知原因：', error)
		return { success: false, message: '更新或创建用户浏览历史时出错，未知原因' }
	}
}

/**
 * 获取全部或过滤后的用户浏览历史，按对某一内容的最后访问时间降序排序
 * @param getUserBrowsingHistoryWithFilterRequest 获取用户浏览历史的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 获取用户浏览历史的请求响应，全部或过滤后的用户浏览历史
 */
export const getUserBrowsingHistoryWithFilterService = async (getUserBrowsingHistoryWithFilterRequest: GetUserBrowsingHistoryWithFilterRequestDto, uid: number, token: string): Promise<GetUserBrowsingHistoryWithFilterResponseDto> => {
	try {
		if (checkGetUserBrowsingHistoryWithFilterRequest(getUserBrowsingHistoryWithFilterRequest)) {
			if ((await checkUserTokenService(uid, token)).success) {
				const { collectionName, schemaInstance } = BrowsingHistorySchema

				// TODO: 下方这个 Aggregate 只适用于视频例是记录的搜索
				const videoHistoryAggregateProps: PipelineStage[] = [
					{
						$match: {
							category: 'video',
						},
					},
					{
						$addFields: {
							id_number: { $toInt: '$id' }, // 将 video_id 从字符串转换为数字
						},
					},
					{
						$lookup: {
							from: 'videos',
							localField: 'id_number',
							foreignField: 'videoId',
							as: 'video_info',
						},
					},
					{
						$unwind: '$video_info',
					},
					{
						$match: {
							'video_info.title': { $regex: getUserBrowsingHistoryWithFilterRequest.videoTitle ?? '', $options: 'i' }, // 使用正则表达式进行模糊查询，不区分大小写
						},
					},
					{
						$lookup: {
							from: 'user-infos',
							localField: 'video_info.uploaderId', // 假设视频表中有 author_id 字段
							foreignField: 'uid',
							as: 'uploader_info',
						},
					},
					{
						$unwind: '$uploader_info',
					},
					{
						$sort: {
							lastUpdateDateTime: -1, // 按 lastUpdateDateTime 降序排序
						},
					},
					{
						$project: {
							uid: 1,
							category: 1,
							id: '$id_number',
							anchor: 1,
							videoId: '$video_info.videoId',
							title: '$video_info.title',
							image: '$video_info.image',
							uploadDate: '$video_info.uploadDate',
							watchedCount: '$video_info.watchedCount',
							uploader: '$uploader_info.username',
							uploaderId: '$uploader_info.uid',
							duration: '$video_info.duration',
							description: '$video_info.description',
							lastUpdateDateTime: '$lastUpdateDateTime',
						},
					},
				]

				try {
					const result = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, videoHistoryAggregateProps)
					const browsingHistory = result.result
					if (result.success && browsingHistory) {
						if (browsingHistory.length > 0) {
							return { success: true, message: '获取用户浏览历史成功', result: browsingHistory }
						} else {
							return { success: true, message: '用户的浏览历史为空', result: [] }
						}
					} else {
						console.error('ERROR', '获取用户浏览历史时出错，未获取到数据')
						return { success: false, message: '获取用户浏览历史时出错，未获取到数据' }
					}
				} catch (error) {
					console.error('ERROR', '获取用户浏览历史时出错，获取用户浏览历史数据失败')
					return { success: false, message: '获取用户浏览历史时出错，获取用户浏览历史数据失败' }
				}
			} else {
				console.error('ERROR', '获取用户浏览历史时出错，用户校验失败')
				return { success: false, message: '获取用户浏览历史时出错，用户校验失败' }
			}
		} else {
			console.error('ERROR', '获取用户浏览历史时出错，请求参数不合法')
			return { success: false, message: '获取用户浏览历史时出错，请求参数不合法' }
		}
	} catch (error) {
		console.error('ERROR', '获取用户浏览历史时出错，未知原因：', error)
		return { success: false, message: '获取用户浏览历史时出错，未知原因' }
	}
}

/**
 * 校验创建用户浏览历史的请求参数
 * @param createBrowsingHistoryRequest 创建用户浏览历史的请求参数
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateOrUpdateBrowsingHistoryRequest = (createOrUpdateBrowsingHistoryRequest: CreateOrUpdateBrowsingHistoryRequestDto): boolean => {
	return (
		createOrUpdateBrowsingHistoryRequest.uid !== undefined && createOrUpdateBrowsingHistoryRequest.uid !== null && createOrUpdateBrowsingHistoryRequest.uid >= 0
		&& (createOrUpdateBrowsingHistoryRequest.category === 'video' || createOrUpdateBrowsingHistoryRequest.category === 'photo' || createOrUpdateBrowsingHistoryRequest.category === 'comment')
		&& !!createOrUpdateBrowsingHistoryRequest.id
	)
}

/**
 * 校验获取用户浏览历史的请求载荷
 * @param getUserBrowsingHistoryWithFilterRequest 获取用户浏览历史的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetUserBrowsingHistoryWithFilterRequest = (getUserBrowsingHistoryWithFilterRequest: GetUserBrowsingHistoryWithFilterRequestDto): boolean => {
	if (getUserBrowsingHistoryWithFilterRequest.videoTitle && getUserBrowsingHistoryWithFilterRequest.videoTitle.length > 200) { // 视频标题过滤字段存在，且长度大于 200 视为不合法
		return false
	} else {
		return true
	}
}
