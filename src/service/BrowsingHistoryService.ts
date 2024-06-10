import { InferSchemaType, PipelineStage } from 'mongoose'
import { CreateBrowsingHistoryRequestDto, CreateBrowsingHistoryResponseDto } from '../controller/BrowsingHistoryControllerDto.js'
import { selectDataByAggregateFromMongoDB, insertData2MongoDB } from '../dbPool/DbClusterPool.js'
import { BrowsingHistorySchema } from '../dbPool/schema/BrowsingHistorySchema.js'
import { checkUserTokenService } from './UserService.js'

/**
 * 创建用户浏览历史
 * @param createBrowsingHistoryRequest 创建用户浏览历史请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 创建用户浏览历史响应结果
 */
export const createBrowsingHistoryService = async (createBrowsingHistoryRequest: CreateBrowsingHistoryRequestDto, uid: number, token: string): Promise<CreateBrowsingHistoryResponseDto> => {
	try {
		if (checkCreateBrowsingHistoryRequest(createBrowsingHistoryRequest)) {
			if (createBrowsingHistoryRequest.uid === uid) {
				if ((await checkUserTokenService(uid, token)).success) {
					const { collectionName, schemaInstance } = BrowsingHistorySchema
					type BrowsingHistoryType = InferSchemaType<typeof schemaInstance>

					const nowDate = new Date().getTime()

					// 准备上传到 Elasticsearch 的数据
					const BrowsingHistoryData: BrowsingHistoryType = {
						uid: createBrowsingHistoryRequest.uid,
						type: createBrowsingHistoryRequest.type,
						id: createBrowsingHistoryRequest.id,
						editDateTime: nowDate,
					}

					try {
						const insert2MongoDResult = await insertData2MongoDB(BrowsingHistoryData, schemaInstance, collectionName)
						const result = insert2MongoDResult.result
						if (insert2MongoDResult.success && result && result.length === 1) {
							return { success: true, message: '创建用户浏览历史成功', result: result[0] as CreateBrowsingHistoryResponseDto['result'] }
						}
					} catch (error) {
						console.error('ERROR', '创建用户浏览历史时出错，插入数据时出错')
						return { success: false, message: '创建用户浏览历史时出错，插入数据时出错' }
					}
				} else {
					console.error('ERROR', '创建用户浏览历史时出错，用户校验失败')
					return { success: false, message: '创建用户浏览历史时出错，用户校验失败' }
				}
			} else {
				console.error('ERROR', '创建用户浏览历史时出错，查看历史记录的目标用户与当前登录用户不一致，不允许查看其他用户的历史记录！')
				return { success: false, message: '创建用户浏览历史时出错，查看历史记录的目标用户与当前登录用户不一致，不允许查看其他用户的历史记录！' }
			}
		} else {
			console.error('ERROR', '创建用户浏览历史时出错，参数不合法')
			return { success: false, message: '创建用户浏览历史时出错，参数不合法' }
		}
	} catch (error) {
		console.error('ERROR', '创建用户浏览历史时出错，未知原因：', error)
		return { success: false, message: '创建用户浏览历史时出错，未知原因' }
	}
}



// const { collectionName, schemaInstance } = BrowsingHistorySchema
// type BrowsingHistoryType = InferSchemaType<typeof schemaInstance>

// const aggregateProps: PipelineStage[] = [

// ]

// const result = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, aggregateProps)

/**
 * 校验创建用户浏览历史的请求参数
 * @param createBrowsingHistoryRequest 创建用户浏览历史的请求参数
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateBrowsingHistoryRequest = (createBrowsingHistoryRequest: CreateBrowsingHistoryRequestDto): boolean => {
	console.log('createBrowsingHistoryRequest', createBrowsingHistoryRequest)
	return (
		createBrowsingHistoryRequest.uid !== undefined && createBrowsingHistoryRequest.uid !== null && createBrowsingHistoryRequest.uid >= 0
		&& (createBrowsingHistoryRequest.type === 'video' || createBrowsingHistoryRequest.type === 'photo' || createBrowsingHistoryRequest.type === 'comment')
		&& !!createBrowsingHistoryRequest.id
	)
}
