import mongoose, { InferSchemaType } from 'mongoose'
import { CreateFavoritesRequestDto, CreateFavoritesResponseDto, GetFavoritesResponseDto } from '../controller/FavoritesControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { FavoritesSchema } from '../dbPool/schema/FavoritesSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserTokenService } from './UserService.js'
import { logging } from './loggingService.js'

/**
 * 创建收藏夹
 * @param createFavoritesRequest 创建收藏夹的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 创建收藏夹的请求响应
 */
export const createFavoritesService = async (createFavoritesRequest: CreateFavoritesRequestDto, uid: number, token: string): Promise<CreateFavoritesResponseDto> => {
	try {
		if (checkCreateFavoritesRequest(createFavoritesRequest)) {
			if ((await checkUserTokenService(uid, token)).success) {
				const { favoritesTitle, favoritesBio, favoritesCover, favoritesVisibility } = createFavoritesRequest
				const { collectionName, schemaInstance } = FavoritesSchema
				const now = new Date().getTime()

				type FavoritesType = InferSchemaType<typeof schemaInstance>

				// 启动事务
				const session = await mongoose.startSession()
				session.startTransaction()

				const favoritesId = (await getNextSequenceValueService('favorites', 1, 1, session))?.sequenceValue

				const createFavoritesData: FavoritesType = {
					favoritesId,
					creator: uid,
					editor: [],
					favoritesTitle,
					favoritesBio,
					favoritesCover,
					favoritesVisibility,
					favoritesCreateDateTime: now,
					createDateTime: now,
					editDateTime: now,
				}

				try {
					const createFavoritesResult = await insertData2MongoDB<FavoritesType>(createFavoritesData, schemaInstance, collectionName)
					if (createFavoritesResult.success && createFavoritesResult.result?.length === 1 && createFavoritesResult.result?.[0]) {
						await session.commitTransaction()
						session.endSession()
						return { success: true, message: '创建收藏夹成功', result: createFavoritesResult.result[0] }
					} else {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						logging('ERROR', '创建收藏夹失败，数据存储失败')
						return { success: false, message: '创建收藏夹失败，数据存储失败' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					logging('ERROR', '创建收藏夹失败，数据存储时出错：', error)
					return { success: false, message: '创建收藏夹失败，数据存储时出错' }
				}
			} else {
				logging('ERROR', '创建收藏夹失败，用户校验失败')
				return { success: false, message: '创建收藏夹失败，用户校验失败' }
			}
		} else {
			logging('ERROR', '创建收藏夹失败，数据校验失败')
			return { success: false, message: '创建收藏夹失败，数据校验失败' }
		}
	} catch (error) {
		logging('ERROR', '创建收藏夹失败，未知原因：', error)
		return { success: false, message: '创建收藏夹失败，未知原因' }
	}
}

/**
 * 获取当前登录用户的收藏夹列表
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 获取当前登录用户的收藏夹列表的请求响应
 */
export const getFavoritesService = async (uid: number, token: string): Promise<GetFavoritesResponseDto> => {
	try {
		if ((await checkUserTokenService(uid, token)).success) {
			const { collectionName, schemaInstance } = FavoritesSchema

			type FavoritesType = InferSchemaType<typeof schemaInstance>

			const getFavoritesQuery: QueryType<FavoritesType> = {
				creator: uid,
			}

			const getFavoritesSelect: SelectType<FavoritesType> = {
				favoritesId: 1,
				creator: 1,
				editor: 1,
				favoritesTitle: 1,
				favoritesBio: 1,
				favoritesCover: 1,
				favoritesVisibility: 1,
				favoritesCreateDateTime: 1,
			}

			try {
				const getFavoritesResult = await selectDataFromMongoDB<FavoritesType>(getFavoritesQuery, getFavoritesSelect, schemaInstance, collectionName)
				const favorites = getFavoritesResult?.result
				if (getFavoritesResult.success && favorites) {
					if (favorites?.length > 0) {
						return { success: true, message: '获取收藏夹列表成功', result: favorites }
					} else {
						return { success: true, message: '收藏夹列表为空', result: [] }
					}
				} else {
					logging('ERROR', '获取收藏夹失败，请求收藏夹数据失败')
					return { success: false, message: '获取收藏夹失败，请求收藏夹数据失败' }
				}
			} catch (error) {
				logging('ERROR', '获取收藏夹失败，请求收藏夹数据时出错', error)
				return { success: false, message: '获取收藏夹失败，请求收藏夹数据时出错' }
			}
		} else {
			logging('ERROR', '获取收藏夹失败，用户校验失败')
			return { success: false, message: '获取收藏夹失败，用户校验失败' }
		}
	} catch (error) {
		logging('ERROR', '获取收藏夹失败，未知原因：', error)
		return { success: false, message: '获取收藏夹失败，未知原因' }
	}
}

/**
 * 检查创建收藏夹的请求载荷
 * @param createFavoritesRequest  创建收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateFavoritesRequest = (createFavoritesRequest: CreateFavoritesRequestDto): boolean => {
	return (!!createFavoritesRequest.favoritesTitle && createFavoritesRequest.favoritesTitle.length < 200)
}
