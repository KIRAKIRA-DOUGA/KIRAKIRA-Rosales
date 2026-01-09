import mongoose, { InferSchemaType } from 'mongoose'
import { AddToFavoritesRequestDto, AddToFavoritesResponseDto, CreateFavoritesRequestDto, CreateFavoritesResponseDto, DeleteFavoritesRequestDto, DeleteFavoritesResponseDto, GetFavoritesByUidRequestDto, GetFavoritesByUidResponseDto, GetFavoritesCoverUploadSignedUrlResponseDto, GetFavoritesDetailRequestDto, GetFavoritesDetailResponseDto, GetFavoritesResponseDto, RemoveFromFavoritesRequestDto, RemoveFromFavoritesResponseDto, ReorderFavoritesDetailRequestDto, ReorderFavoritesDetailResponseDto, UpdateFavoritesRequestDto, UpdateFavoritesResponseDto } from '../controller/FavoritesControllerDto.js'
import { deleteDataFromMongoDB, findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { OrderByType, QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { FavoritesDetailSchema, FavoritesSchema } from '../dbPool/schema/FavoritesSchema.js'
import { FollowingSchema } from '../dbPool/schema/FeedSchema.js'
import { UserSettingsSchema } from '../dbPool/schema/UserSchema.js'
import { createCloudflareImageUploadSignedUrl } from '../cloudflare/index.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserTokenByUuidService, getUserUid, getUserUuid } from './UserService.js'
import { logging } from './loggingService.js'

/**
 * 创建收藏夹
 * @param createFavoritesRequest 创建收藏夹的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 创建收藏夹的请求响应
 */
export const createFavoritesService = async (createFavoritesRequest: CreateFavoritesRequestDto, uuid: string, token: string): Promise<CreateFavoritesResponseDto> => {
	try {
		if (checkCreateFavoritesRequest(createFavoritesRequest)) {
			if ((await checkUserTokenByUuidService(uuid, token)).success) {
				const uid = await getUserUid(uuid)
				if (!uid) {
					logging('ERROR', '创建收藏夹失败，用户ID不存在')
					return { success: false, message: '创建收藏夹失败，用户ID不存在' }
				}
				// 检查用户已创建的收藏夹数量是否达到上限（100个）
				const { collectionName: favoritesCollectionName, schemaInstance: favoritesSchemaInstance } = FavoritesSchema
				type FavoritesType = InferSchemaType<typeof favoritesSchemaInstance>
				const countWhere: QueryType<FavoritesType> = {
					creator: uid,
				}
				const countSelect: SelectType<FavoritesType> = {
					favoritesId: 1,
				}
				const countResult = await selectDataFromMongoDB<FavoritesType>(countWhere, countSelect, favoritesSchemaInstance, favoritesCollectionName)
				if (countResult.success && countResult.result && countResult.result.length >= 100) {
					logging('ERROR', '创建收藏夹失败，收藏夹数量已达上限（100个）')
					return { success: false, message: '创建收藏夹失败，收藏夹数量已达上限（100个）' }
				}

				const { favoritesTitle, favoritesBio, favoritesCover, favoritesVisibility } = createFavoritesRequest
				const { collectionName, schemaInstance } = FavoritesSchema
				const now = new Date().getTime()

				// 启动事务
				const session = await mongoose.startSession()
				session.startTransaction()

				const getSequenceResult = await getNextSequenceValueService('favorites', 1, 1, session)
				if (!getSequenceResult.success || !getSequenceResult.sequenceValue) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					logging('ERROR', '创建收藏夹失败，获取序列值失败')
					return { success: false, message: '创建收藏夹失败，获取序列值失败' }
				}
				const favoritesId = getSequenceResult.sequenceValue

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
					const createFavoritesResult = await insertData2MongoDB<FavoritesType>(createFavoritesData, schemaInstance, collectionName, { session })
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
 * 获取当前登录用户自己的收藏夹列表
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 获取当前登录用户自己的收藏夹列表的请求响应
 */
export const getFavoritesService = async (uuid: string, token: string): Promise<GetFavoritesResponseDto> => {
	try {
		if ((await checkUserTokenByUuidService(uuid, token)).success) {
			const uid = await getUserUid(uuid)
			if (!uid) {
				logging('ERROR', '获取收藏夹列表失败，用户ID不存在')
				return { success: false, message: '获取收藏夹列表失败，用户ID不存在' }
			}
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
 * 获取指定用户的收藏夹列表（需要验证用户整体可见性设置）
 * @param getFavoritesByUidRequest 获取指定用户收藏夹列表的请求载荷
 * @param uuid 查看者用户 UUID
 * @param token 查看者用户 Token
 * @returns 获取指定用户收藏夹列表的请求响应
 */
export const getFavoritesByUidService = async (getFavoritesByUidRequest: GetFavoritesByUidRequestDto, uuid: string, token: string): Promise<GetFavoritesByUidResponseDto> => {
	try {
		if (!getFavoritesByUidRequest.uid) {
			logging('ERROR', '获取指定用户收藏夹列表失败，参数校验失败')
			return { success: false, message: '获取指定用户收藏夹列表失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取指定用户收藏夹列表失败，用户校验失败')
			return { success: false, message: '获取指定用户收藏夹列表失败，用户校验失败' }
		}

		const viewerUid = await getUserUid(uuid)
		if (!viewerUid) {
			logging('ERROR', '获取指定用户收藏夹列表失败，查看者用户ID不存在')
			return { success: false, message: '获取指定用户收藏夹列表失败，查看者用户ID不存在' }
		}

		const targetUid = getFavoritesByUidRequest.uid
		const targetUuid = await getUserUuid(targetUid)
		if (!targetUuid) {
			logging('ERROR', '获取指定用户收藏夹列表失败，目标用户不存在')
			return { success: false, message: '获取指定用户收藏夹列表失败，目标用户不存在' }
		}

		// 如果是查看自己的收藏夹，直接返回所有收藏夹
		if (targetUid === viewerUid) {
			return await getFavoritesService(uuid, token)
		}

		// 第一层验证：检查用户整体的收藏夹可见性设置（privary.favorites）
		const { collectionName: userSettingsCollectionName, schemaInstance: userSettingsSchemaInstance } = UserSettingsSchema
		type UserSettings = InferSchemaType<typeof userSettingsSchemaInstance>
		const userSettingsWhere: QueryType<UserSettings> = {
			UUID: targetUuid,
		}
		const userSettingsSelect: SelectType<UserSettings> = {
			userPrivaryVisibilitiesSetting: 1,
		}
		const userSettingsResult = await selectDataFromMongoDB<UserSettings>(userSettingsWhere, userSettingsSelect, userSettingsSchemaInstance, userSettingsCollectionName)
		
		if (userSettingsResult.success && userSettingsResult.result && userSettingsResult.result.length > 0) {
			const userSettings = userSettingsResult.result[0]
			const favoritesPrivacySetting = userSettings.userPrivaryVisibilitiesSetting?.find(
				(setting: any) => setting.privaryId === 'privary.favorites'
			)

			if (favoritesPrivacySetting) {
				if (favoritesPrivacySetting.visibilitiesType === 'private') {
					logging('ERROR', '获取指定用户收藏夹列表失败，该用户的收藏夹设置为私有')
					return { success: false, message: '获取指定用户收藏夹列表失败，该用户的收藏夹设置为私有' }
				} else if (favoritesPrivacySetting.visibilitiesType === 'following') {
					// 需要检查是否关注了目标用户
					const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
					type Following = InferSchemaType<typeof followingSchemaInstance>
					const followingWhere: QueryType<Following> = {
						followerUuid: uuid,
						followingUuid: targetUuid,
					}
					const followingSelect: SelectType<Following> = {
						followerUuid: 1,
						followingUuid: 1,
					}
					const followingResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingCollectionName)
					if (!followingResult.success || !followingResult.result || followingResult.result.length === 0) {
						logging('ERROR', '获取指定用户收藏夹列表失败，需要关注该用户才能查看收藏夹')
						return { success: false, message: '获取指定用户收藏夹列表失败，需要关注该用户才能查看收藏夹' }
					}
					// 已关注，继续获取收藏夹列表
				}
				// 'public' 继续获取收藏夹列表
			}
			// 如果没有设置用户整体可见性，默认视为 'public'，继续获取收藏夹列表
		}

		// 第二层验证：获取收藏夹列表，并根据单个收藏夹的可见性设置过滤
		const { collectionName, schemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof schemaInstance>
		const getFavoritesQuery: QueryType<FavoritesType> = {
			creator: targetUid,
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
			if (!getFavoritesResult.success || !favorites) {
				logging('ERROR', '获取指定用户收藏夹列表失败，查询收藏夹数据失败')
				return { success: false, message: '获取指定用户收藏夹列表失败，查询收藏夹数据失败' }
			}

			// 过滤：只返回查看者有权限查看的收藏夹
			const visibleFavorites = []
			for (const fav of favorites) {
				if (await checkFavoritesViewPermission(fav.favoritesId, viewerUid, uuid)) {
					visibleFavorites.push(fav)
				}
			}

			return { success: true, message: '获取指定用户收藏夹列表成功', result: visibleFavorites }
		} catch (error) {
			logging('ERROR', '获取指定用户收藏夹列表失败，查询收藏夹数据时出错', error)
			return { success: false, message: '获取指定用户收藏夹列表失败，查询收藏夹数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '获取指定用户收藏夹列表失败，未知原因：', error)
		return { success: false, message: '获取指定用户收藏夹列表失败，未知原因' }
	}
}

/**
 * 添加内容到收藏夹
 * @param addToFavoritesRequest 添加内容到收藏夹的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 添加内容到收藏夹的请求响应
 */
export const addToFavoritesService = async (addToFavoritesRequest: AddToFavoritesRequestDto, uuid: string, token: string): Promise<AddToFavoritesResponseDto> => {
	try {
		if (!checkAddToFavoritesRequest(addToFavoritesRequest)) {
			logging('ERROR', '添加内容到收藏夹失败，参数校验失败')
			return { success: false, message: '添加内容到收藏夹失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '添加内容到收藏夹失败，用户校验失败')
			return { success: false, message: '添加内容到收藏夹失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			logging('ERROR', '添加内容到收藏夹失败，用户ID不存在')
			return { success: false, message: '添加内容到收藏夹失败，用户ID不存在' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(addToFavoritesRequest.favoritesListId, uid))) {
			logging('ERROR', '添加内容到收藏夹失败，没有权限操作该收藏夹')
			return { success: false, message: '添加内容到收藏夹失败，没有权限操作该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const now = new Date().getTime()

		// 检查是否已经存在
		const checkWhere: QueryType<FavoritesDetailType> = {
			favoritesListId: addToFavoritesRequest.favoritesListId,
			category: addToFavoritesRequest.category,
			id: addToFavoritesRequest.id,
		}
		const checkResult = await selectDataFromMongoDB<FavoritesDetailType>(checkWhere, { _id: 1 } as any, schemaInstance, collectionName)
		if (checkResult.success && checkResult.result && checkResult.result.length > 0) {
			return { success: false, message: '该内容已存在于收藏夹中' }
		}

		// 检查收藏夹内的内容数量是否达到上限（5000个）
		const countWhere: QueryType<FavoritesDetailType> = {
			favoritesListId: addToFavoritesRequest.favoritesListId,
		}
		const countSelect: any = {
			_id: 1,
		}
		const countResult = await selectDataFromMongoDB<FavoritesDetailType>(countWhere, countSelect, schemaInstance, collectionName)
		if (countResult.success && countResult.result && countResult.result.length >= 5000) {
			logging('ERROR', '添加内容到收藏夹失败，收藏夹内内容数量已达上限（5000个）')
			return { success: false, message: '添加内容到收藏夹失败，收藏夹内内容数量已达上限（5000个）' }
		}

		// 获取当前收藏夹中的最大 sortOrder
		const maxSortOrderWhere: QueryType<FavoritesDetailType> = {
			favoritesListId: addToFavoritesRequest.favoritesListId,
		}
		const maxSortOrderResult = await selectDataFromMongoDB<FavoritesDetailType>(maxSortOrderWhere, { sortOrder: 1 } as any, schemaInstance, collectionName)
		let newSortOrder = 0
		if (maxSortOrderResult.success && maxSortOrderResult.result && maxSortOrderResult.result.length > 0) {
			const maxSortOrder = Math.max(...maxSortOrderResult.result.map(item => item.sortOrder || 0))
			newSortOrder = maxSortOrder + 1
		}

		const favoritesDetailData: FavoritesDetailType = {
			favoritesListId: addToFavoritesRequest.favoritesListId,
			operator: uid,
			category: addToFavoritesRequest.category,
			id: addToFavoritesRequest.id,
			addedDateTime: now,
			sortOrder: newSortOrder,
			editDateTime: now,
		}

		try {
			const insertResult = await insertData2MongoDB<FavoritesDetailType>(favoritesDetailData, schemaInstance, collectionName)
			if (insertResult.success && insertResult.result && insertResult.result.length > 0) {
				return { success: true, message: '添加内容到收藏夹成功' }
			} else {
				logging('ERROR', '添加内容到收藏夹失败，数据存储失败')
				return { success: false, message: '添加内容到收藏夹失败，数据存储失败' }
			}
		} catch (error) {
			logging('ERROR', '添加内容到收藏夹失败，数据存储时出错：', error)
			return { success: false, message: '添加内容到收藏夹失败，数据存储时出错' }
		}
	} catch (error) {
		logging('ERROR', '添加内容到收藏夹失败，未知原因：', error)
		return { success: false, message: '添加内容到收藏夹失败，未知原因' }
	}
}

/**
 * 从收藏夹移除内容
 * @param removeFromFavoritesRequest 从收藏夹移除内容的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 从收藏夹移除内容的请求响应
 */
export const removeFromFavoritesService = async (removeFromFavoritesRequest: RemoveFromFavoritesRequestDto, uuid: string, token: string): Promise<RemoveFromFavoritesResponseDto> => {
	try {
		if (!checkRemoveFromFavoritesRequest(removeFromFavoritesRequest)) {
			logging('ERROR', '从收藏夹移除内容失败，参数校验失败')
			return { success: false, message: '从收藏夹移除内容失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '从收藏夹移除内容失败，用户校验失败')
			return { success: false, message: '从收藏夹移除内容失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			logging('ERROR', '从收藏夹移除内容失败，用户ID不存在')
			return { success: false, message: '从收藏夹移除内容失败，用户ID不存在' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(removeFromFavoritesRequest.favoritesListId, uid))) {
			logging('ERROR', '从收藏夹移除内容失败，没有权限操作该收藏夹')
			return { success: false, message: '从收藏夹移除内容失败，没有权限操作该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesDetailType> = {
			favoritesListId: removeFromFavoritesRequest.favoritesListId,
			category: removeFromFavoritesRequest.category,
			id: removeFromFavoritesRequest.id,
		}

		try {
			const deleteResult = await deleteDataFromMongoDB<FavoritesDetailType>(where, schemaInstance, collectionName)
			if (deleteResult.success && deleteResult.result && deleteResult.result.deletedCount > 0) {
				return { success: true, message: '从收藏夹移除内容成功' }
			} else {
				logging('ERROR', '从收藏夹移除内容失败，未找到要删除的内容')
				return { success: false, message: '从收藏夹移除内容失败，未找到要删除的内容' }
			}
		} catch (error) {
			logging('ERROR', '从收藏夹移除内容失败，删除数据时出错：', error)
			return { success: false, message: '从收藏夹移除内容失败，删除数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '从收藏夹移除内容失败，未知原因：', error)
		return { success: false, message: '从收藏夹移除内容失败，未知原因' }
	}
}

/**
 * 获取收藏夹内容列表
 * @param getFavoritesDetailRequest 获取收藏夹内容的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 获取收藏夹内容的请求响应
 */
export const getFavoritesDetailService = async (getFavoritesDetailRequest: GetFavoritesDetailRequestDto, uuid: string, token: string): Promise<GetFavoritesDetailResponseDto> => {
	try {
		if (!checkGetFavoritesDetailRequest(getFavoritesDetailRequest)) {
			logging('ERROR', '获取收藏夹内容失败，参数校验失败')
			return { success: false, message: '获取收藏夹内容失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取收藏夹内容失败，用户校验失败')
			return { success: false, message: '获取收藏夹内容失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			logging('ERROR', '获取收藏夹内容失败，用户ID不存在')
			return { success: false, message: '获取收藏夹内容失败，用户ID不存在' }
		}

		// 检查用户是否有权限查看该收藏夹（根据可见性设置）
		if (!(await checkFavoritesViewPermission(getFavoritesDetailRequest.favoritesListId, uid, uuid))) {
			logging('ERROR', '获取收藏夹内容失败，没有权限查看该收藏夹')
			return { success: false, message: '获取收藏夹内容失败，没有权限查看该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesDetailType> = {
			favoritesListId: getFavoritesDetailRequest.favoritesListId,
		}
		const select: SelectType<FavoritesDetailType> = {
			favoritesListId: 1,
			operator: 1,
			category: 1,
			id: 1,
			addedDateTime: 1,
			sortOrder: 1,
			editDateTime: 1,
		}
		const sortOrder = getFavoritesDetailRequest.sortOrder ?? 1
		const orderBy: OrderByType<FavoritesDetailType> = {
			sortOrder: sortOrder as 1 | -1,
		}

		try {
			const result = await selectDataFromMongoDB<FavoritesDetailType>(where, select, schemaInstance, collectionName, undefined, orderBy)
			if (result.success && result.result) {
				return { success: true, message: '获取收藏夹内容成功', result: result.result }
			} else {
				logging('ERROR', '获取收藏夹内容失败，查询数据失败')
				return { success: false, message: '获取收藏夹内容失败，查询数据失败' }
			}
		} catch (error) {
			logging('ERROR', '获取收藏夹内容失败，查询数据时出错：', error)
			return { success: false, message: '获取收藏夹内容失败，查询数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '获取收藏夹内容失败，未知原因：', error)
		return { success: false, message: '获取收藏夹内容失败，未知原因' }
	}
}

/**
 * 更新收藏夹信息
 * @param updateFavoritesRequest 更新收藏夹信息的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 更新收藏夹信息的请求响应
 */
export const updateFavoritesService = async (updateFavoritesRequest: UpdateFavoritesRequestDto, uuid: string, token: string): Promise<UpdateFavoritesResponseDto> => {
	try {
		if (!checkUpdateFavoritesRequest(updateFavoritesRequest)) {
			logging('ERROR', '更新收藏夹信息失败，参数校验失败')
			return { success: false, message: '更新收藏夹信息失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '更新收藏夹信息失败，用户校验失败')
			return { success: false, message: '更新收藏夹信息失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			logging('ERROR', '更新收藏夹信息失败，用户ID不存在')
			return { success: false, message: '更新收藏夹信息失败，用户ID不存在' }
		}

		// 检查用户是否有权限操作该收藏夹（只有创建者可以修改收藏夹信息，维护者不能修改）
		const { collectionName: favoritesCollectionName, schemaInstance: favoritesSchemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof favoritesSchemaInstance>
		const checkWhere: QueryType<FavoritesType> = {
			favoritesId: updateFavoritesRequest.favoritesId,
		}
		const checkSelect: SelectType<FavoritesType> = {
			creator: 1,
		}
		const checkResult = await selectDataFromMongoDB<FavoritesType>(checkWhere, checkSelect, favoritesSchemaInstance, favoritesCollectionName)
		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '更新收藏夹信息失败，收藏夹不存在')
			return { success: false, message: '更新收藏夹信息失败，收藏夹不存在' }
		}
		if (checkResult.result[0].creator !== uid) {
			logging('ERROR', '更新收藏夹信息失败，只有创建者可以修改收藏夹信息')
			return { success: false, message: '更新收藏夹信息失败，只有创建者可以修改收藏夹信息' }
		}

		const where: QueryType<FavoritesType> = {
			favoritesId: updateFavoritesRequest.favoritesId,
		}
		const { collectionName, schemaInstance } = FavoritesSchema
		const update: UpdateType<FavoritesType> = {
			editDateTime: new Date().getTime(),
		}
		if (updateFavoritesRequest.favoritesTitle !== undefined) {
			update.favoritesTitle = updateFavoritesRequest.favoritesTitle
		}
		if (updateFavoritesRequest.favoritesBio !== undefined) {
			update.favoritesBio = updateFavoritesRequest.favoritesBio
		}
		if (updateFavoritesRequest.favoritesCover !== undefined) {
			update.favoritesCover = updateFavoritesRequest.favoritesCover
		}
		if (updateFavoritesRequest.favoritesVisibility !== undefined) {
			update.favoritesVisibility = updateFavoritesRequest.favoritesVisibility
		}

		try {
			const updateResult = await updateData4MongoDB<FavoritesType>(where, update, schemaInstance, collectionName)
			if (updateResult.success && updateResult.result && updateResult.result.modifiedCount > 0) {
				// 重新查询更新后的数据
				const select: SelectType<FavoritesType> = {
					favoritesId: 1,
					creator: 1,
					editor: 1,
					favoritesTitle: 1,
					favoritesBio: 1,
					favoritesCover: 1,
					favoritesVisibility: 1,
					favoritesCreateDateTime: 1,
				}
				const getResult = await selectDataFromMongoDB<FavoritesType>(where, select, schemaInstance, collectionName)
				if (getResult.success && getResult.result && getResult.result.length > 0) {
					return { success: true, message: '更新收藏夹信息成功', result: getResult.result[0] }
				} else {
					return { success: true, message: '更新收藏夹信息成功' }
				}
			} else {
				logging('ERROR', '更新收藏夹信息失败，更新数据失败')
				return { success: false, message: '更新收藏夹信息失败，更新数据失败' }
			}
		} catch (error) {
			logging('ERROR', '更新收藏夹信息失败，更新数据时出错：', error)
			return { success: false, message: '更新收藏夹信息失败，更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '更新收藏夹信息失败，未知原因：', error)
		return { success: false, message: '更新收藏夹信息失败，未知原因' }
	}
}

/**
 * 删除收藏夹
 * @param deleteFavoritesRequest 删除收藏夹的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 删除收藏夹的请求响应
 */
export const deleteFavoritesService = async (deleteFavoritesRequest: DeleteFavoritesRequestDto, uuid: string, token: string): Promise<DeleteFavoritesResponseDto> => {
	try {
		if (!checkDeleteFavoritesRequest(deleteFavoritesRequest)) {
			logging('ERROR', '删除收藏夹失败，参数校验失败')
			return { success: false, message: '删除收藏夹失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除收藏夹失败，用户校验失败')
			return { success: false, message: '删除收藏夹失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			logging('ERROR', '删除收藏夹失败，用户ID不存在')
			return { success: false, message: '删除收藏夹失败，用户ID不存在' }
		}

		// 检查用户是否有权限操作该收藏夹（只有创建者可以删除）
		const { collectionName: favoritesCollectionName, schemaInstance: favoritesSchemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof favoritesSchemaInstance>
		const checkWhere: QueryType<FavoritesType> = {
			favoritesId: deleteFavoritesRequest.favoritesId,
		}
		const checkSelect: SelectType<FavoritesType> = {
			creator: 1,
		}
		const checkResult = await selectDataFromMongoDB<FavoritesType>(checkWhere, checkSelect, favoritesSchemaInstance, favoritesCollectionName)
		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '删除收藏夹失败，收藏夹不存在')
			return { success: false, message: '删除收藏夹失败，收藏夹不存在' }
		}
		if (checkResult.result[0].creator !== uid) {
			logging('ERROR', '删除收藏夹失败，只有创建者可以删除收藏夹')
			return { success: false, message: '删除收藏夹失败，只有创建者可以删除收藏夹' }
		}

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		try {
			// 1. 删除收藏夹明细
			const { collectionName: detailCollectionName, schemaInstance: detailSchemaInstance } = FavoritesDetailSchema
			type FavoritesDetailType = InferSchemaType<typeof detailSchemaInstance>
			const detailWhere: QueryType<FavoritesDetailType> = {
				favoritesListId: deleteFavoritesRequest.favoritesId,
			}
			await deleteDataFromMongoDB<FavoritesDetailType>(detailWhere, detailSchemaInstance, detailCollectionName, { session })

			// 2. 删除收藏夹
			await deleteDataFromMongoDB<FavoritesType>(checkWhere, favoritesSchemaInstance, favoritesCollectionName, { session })

			await session.commitTransaction()
			session.endSession()
			return { success: true, message: '删除收藏夹成功' }
		} catch (error) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '删除收藏夹失败，删除数据时出错：', error)
			return { success: false, message: '删除收藏夹失败，删除数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '删除收藏夹失败，未知原因：', error)
		return { success: false, message: '删除收藏夹失败，未知原因' }
	}
}

/**
 * 调整收藏夹内部排序
 * @param reorderFavoritesDetailRequest 调整收藏夹内部排序的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 调整收藏夹内部排序的请求响应
 */
export const reorderFavoritesDetailService = async (reorderFavoritesDetailRequest: ReorderFavoritesDetailRequestDto, uuid: string, token: string): Promise<ReorderFavoritesDetailResponseDto> => {
	try {
		if (!checkReorderFavoritesDetailRequest(reorderFavoritesDetailRequest)) {
			logging('ERROR', '调整收藏夹内部排序失败，参数校验失败')
			return { success: false, message: '调整收藏夹内部排序失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '调整收藏夹内部排序失败，用户校验失败')
			return { success: false, message: '调整收藏夹内部排序失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			logging('ERROR', '调整收藏夹内部排序失败，用户ID不存在')
			return { success: false, message: '调整收藏夹内部排序失败，用户ID不存在' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(reorderFavoritesDetailRequest.favoritesListId, uid))) {
			logging('ERROR', '调整收藏夹内部排序失败，没有权限操作该收藏夹')
			return { success: false, message: '调整收藏夹内部排序失败，没有权限操作该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const now = new Date().getTime()

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		try {
			// 1) 取出当前收藏夹内所有内容的原始排序
			const whereAll: QueryType<FavoritesDetailType> = {
				favoritesListId: reorderFavoritesDetailRequest.favoritesListId,
			}
			const selectAll: SelectType<FavoritesDetailType> = {
				category: 1,
				id: 1,
				sortOrder: 1,
				addedDateTime: 1,
			}
			const existingResult = await selectDataFromMongoDB<FavoritesDetailType>(whereAll, selectAll, schemaInstance, collectionName, { session })
			if (!existingResult.success) {
				await session.abortTransaction()
				session.endSession()
				logging('ERROR', '调整收藏夹内部排序失败，读取现有数据失败')
				return { success: false, message: '调整收藏夹内部排序失败，读取现有数据失败' }
			}

			const existing = existingResult.result ?? []
			if (existing.length === 0) {
				await session.commitTransaction()
				session.endSession()
				return { success: true, message: '调整收藏夹内部排序成功（列表为空）' }
			}

			// 2) 将请求中的目标排序写入内存模型（不落库），其他项保持原排序
			type WorkingItem = {
				category: string
				id: string
				currentOrder: number
				desiredOrder: number
				addedDateTime?: number
			}
			const keyOf = (c: string, id: string) => `${c}__${id}`
			const workingMap = new Map<string, WorkingItem>()
			let maxExistingOrder = 0
			for (const item of existing) {
				maxExistingOrder = Math.max(maxExistingOrder, item.sortOrder ?? 0)
				workingMap.set(
					keyOf(item.category as any, item.id as any),
					{
						category: item.category as any,
						id: item.id as any,
						currentOrder: item.sortOrder ?? 0,
						desiredOrder: item.sortOrder ?? 0,
						addedDateTime: item.addedDateTime,
					},
				)
			}

			for (const item of reorderFavoritesDetailRequest.items) {
				const key = keyOf(item.category, item.id)
				const target = workingMap.get(key)
				if (!target) {
					await session.abortTransaction()
					session.endSession()
					logging('ERROR', '调整收藏夹内部排序失败，存在不存在的收藏项')
					return { success: false, message: '调整收藏夹内部排序失败，存在不存在的收藏项' }
				}

				const desired = Math.max(1, item.sortOrder || 1)
				// 如果是当前最大，则置为最大+1；否则先按用户期望排序，稍后统一重排
				target.desiredOrder = desired > maxExistingOrder ? maxExistingOrder + 1 : desired
				maxExistingOrder = Math.max(maxExistingOrder, target.desiredOrder)
				workingMap.set(key, target)
			}

			// 3) 在内存中计算严格的 1..N 顺序，先按 desired，再按原顺序/时间稳定排序
			const workingList = Array.from(workingMap.values())
			workingList.sort((a, b) => {
				if (a.desiredOrder !== b.desiredOrder) return a.desiredOrder - b.desiredOrder
				if (a.currentOrder !== b.currentOrder) return a.currentOrder - b.currentOrder
				return (a.addedDateTime ?? 0) - (b.addedDateTime ?? 0)
			})

			const finalOrders = new Map<string, number>()
			for (let i = 0; i < workingList.length; i++) {
				finalOrders.set(keyOf(workingList[i].category, workingList[i].id), i + 1)
			}

			// 4) 统一落库（严格 1..N），避免并发累加导致溢出
			for (const item of workingList) {
				const finalOrder = finalOrders.get(keyOf(item.category, item.id))!
				if (finalOrder === item.currentOrder) {
					continue // 无需更新
				}
				const where: QueryType<FavoritesDetailType> = {
					favoritesListId: reorderFavoritesDetailRequest.favoritesListId,
					category: item.category,
					id: item.id,
				}
				const update: UpdateType<FavoritesDetailType> = {
					sortOrder: finalOrder,
					editDateTime: now,
				}
				await updateData4MongoDB<FavoritesDetailType>(where, update, schemaInstance, collectionName, { session })
			}

			await session.commitTransaction()
			session.endSession()
			return { success: true, message: '调整收藏夹内部排序成功' }
		} catch (error) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '调整收藏夹内部排序失败，更新数据时出错：', error)
			return { success: false, message: '调整收藏夹内部排序失败，更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '调整收藏夹内部排序失败，未知原因：', error)
		return { success: false, message: '调整收藏夹内部排序失败，未知原因' }
	}
}

/**
 * 获取用于上传收藏夹封面图的预签名 URL
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 获取用于上传收藏夹封面图的预签名 URL 的请求响应
 */
export const getFavoritesCoverUploadSignedUrlService = async (uuid: string, token: string): Promise<GetFavoritesCoverUploadSignedUrlResponseDto> => {
	try {
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 失败，用户校验未通过')
			return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，用户校验未通过' }
		}
		const now = new Date().getTime()
		const fileName = `favorites-cover-${uuid}-${generateSecureRandomString(32)}-${now}`
		try {
			const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 660)
			if (signedUrl) {
				return { success: true, message: '获取用于上传收藏夹封面图的预签名 URL 成功', result: { fileName, signedUrl } }
			}
		} catch (error) {
			logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 失败，请求失败', error)
			return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，请求失败' }
		}
	} catch (error) {
		logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 时出错：', error)
		return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 时出错，未知原因' }
	}
}

/**
 * 检查用户是否有权限操作收藏夹（创建者或编辑者）
 * @param favoritesId 收藏夹 ID
 * @param uid 用户 ID
 * @returns 有权限返回 true，否则返回 false
 */
const checkFavoritesPermission = async (favoritesId: number, uid: number): Promise<boolean> => {
	try {
		const { collectionName, schemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesType> = {
			favoritesId,
		}
		const select: SelectType<FavoritesType> = {
			creator: 1,
			editor: 1,
		}
		const result = await selectDataFromMongoDB<FavoritesType>(where, select, schemaInstance, collectionName)
		if (result.success && result.result && result.result.length > 0) {
			const favorites = result.result[0]
			if (favorites.creator === uid) {
				return true
			}
			if (favorites.editor && favorites.editor.includes(uid)) {
				return true
			}
		}
		return false
	} catch (error) {
		logging('ERROR', '检查收藏夹权限失败：', error)
		return false
	}
}

/**
 * 检查用户是否有权限查看收藏夹（根据可见性设置）
 * @param favoritesId 收藏夹 ID
 * @param viewerUid 查看者用户 ID
 * @param viewerUuid 查看者用户 UUID
 * @returns 有权限返回 true，否则返回 false
 */
const checkFavoritesViewPermission = async (favoritesId: number, viewerUid: number, viewerUuid: string): Promise<boolean> => {
	try {
		const { collectionName, schemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesType> = {
			favoritesId,
		}
		const select: SelectType<FavoritesType> = {
			creator: 1,
			editor: 1,
			favoritesVisibility: 1,
		}
		const result = await selectDataFromMongoDB<FavoritesType>(where, select, schemaInstance, collectionName)
		if (!result.success || !result.result || result.result.length === 0) {
			return false
		}

		const favorites = result.result[0]
		const { creator, editor, favoritesVisibility } = favorites

		// 如果是创建者或维护者，始终可以查看（不受任何可见性设置限制）
		if (creator === viewerUid) {
			return true
		}
		if (editor && editor.includes(viewerUid)) {
			return true
		}

		// 如果不是创建者或维护者，需要检查两层可见性设置

		// 第一层：检查用户整体的收藏夹可见性设置（privary.favorites）
		const creatorUuid = await getUserUuid(creator)
		if (creatorUuid) {
			const { collectionName: userSettingsCollectionName, schemaInstance: userSettingsSchemaInstance } = UserSettingsSchema
			type UserSettings = InferSchemaType<typeof userSettingsSchemaInstance>
			const userSettingsWhere: QueryType<UserSettings> = {
				UUID: creatorUuid,
			}
			const userSettingsSelect: SelectType<UserSettings> = {
				userPrivaryVisibilitiesSetting: 1,
			}
			const userSettingsResult = await selectDataFromMongoDB<UserSettings>(userSettingsWhere, userSettingsSelect, userSettingsSchemaInstance, userSettingsCollectionName)
			if (userSettingsResult.success && userSettingsResult.result && userSettingsResult.result.length > 0) {
				const userSettings = userSettingsResult.result[0]
				const favoritesPrivacySetting = userSettings.userPrivaryVisibilitiesSetting?.find(
					(setting: any) => setting.privaryId === 'privary.favorites'
				)

				if (favoritesPrivacySetting) {
					if (favoritesPrivacySetting.visibilitiesType === 'private') {
						// 用户整体设置为私有，拒绝访问
						return false
					} else if (favoritesPrivacySetting.visibilitiesType === 'following') {
						// 用户整体设置为仅关注者，需要检查是否关注了创建者
						const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
						type Following = InferSchemaType<typeof followingSchemaInstance>
						const followingWhere: QueryType<Following> = {
							followerUuid: viewerUuid,
							followingUuid: creatorUuid,
						}
						const followingSelect: SelectType<Following> = {
							followerUuid: 1,
							followingUuid: 1,
						}
						const followingResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingCollectionName)
						if (!followingResult.success || !followingResult.result || followingResult.result.length === 0) {
							// 未关注，拒绝访问
							return false
						}
						// 已关注，继续检查单个收藏夹的可见性设置
					}
					// 'public' 继续检查单个收藏夹的可见性设置
				}
				// 如果没有设置用户整体可见性，默认视为 'public'，继续检查单个收藏夹的可见性设置
			}
		}

		// 第二层：检查单个收藏夹的可见性设置
		if (favoritesVisibility === -1) {
			// 私有：只有创建者和维护者可以查看（上面已检查）
			return false
		} else if (favoritesVisibility === 0) {
			// 仅关注者：需要检查查看者是否关注了创建者
			if (!creatorUuid) {
				return false
			}

			const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
			type Following = InferSchemaType<typeof followingSchemaInstance>
			const followingWhere: QueryType<Following> = {
				followerUuid: viewerUuid,
				followingUuid: creatorUuid,
			}
			const followingSelect: SelectType<Following> = {
				followerUuid: 1,
				followingUuid: 1,
			}
			const followingResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingCollectionName)
			if (followingResult.success && followingResult.result && followingResult.result.length > 0) {
				return true
			}
			return false
		} else if (favoritesVisibility === 1) {
			// 公开：所有人都可以查看
			return true
		}

		return false
	} catch (error) {
		logging('ERROR', '检查收藏夹查看权限失败：', error)
		return false
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

/**
 * 检查添加内容到收藏夹的请求载荷
 * @param addToFavoritesRequest 添加内容到收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAddToFavoritesRequest = (addToFavoritesRequest: AddToFavoritesRequestDto): boolean => {
	return (
		!!addToFavoritesRequest.favoritesListId &&
		!!addToFavoritesRequest.category &&
		!!addToFavoritesRequest.id
	)
}

/**
 * 检查从收藏夹移除内容的请求载荷
 * @param removeFromFavoritesRequest 从收藏夹移除内容的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkRemoveFromFavoritesRequest = (removeFromFavoritesRequest: RemoveFromFavoritesRequestDto): boolean => {
	return (
		!!removeFromFavoritesRequest.favoritesListId &&
		!!removeFromFavoritesRequest.category &&
		!!removeFromFavoritesRequest.id
	)
}

/**
 * 检查获取收藏夹内容的请求载荷
 * @param getFavoritesDetailRequest 获取收藏夹内容的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFavoritesDetailRequest = (getFavoritesDetailRequest: GetFavoritesDetailRequestDto): boolean => {
	return !!getFavoritesDetailRequest.favoritesListId
}

/**
 * 检查更新收藏夹信息的请求载荷
 * @param updateFavoritesRequest 更新收藏夹信息的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkUpdateFavoritesRequest = (updateFavoritesRequest: UpdateFavoritesRequestDto): boolean => {
	if (!updateFavoritesRequest.favoritesId) {
		return false
	}
	if (updateFavoritesRequest.favoritesTitle !== undefined && updateFavoritesRequest.favoritesTitle.length >= 200) {
		return false
	}
	return true
}

/**
 * 检查删除收藏夹的请求载荷
 * @param deleteFavoritesRequest 删除收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkDeleteFavoritesRequest = (deleteFavoritesRequest: DeleteFavoritesRequestDto): boolean => {
	return !!deleteFavoritesRequest.favoritesId
}

/**
 * 检查调整收藏夹内部排序的请求载荷
 * @param reorderFavoritesDetailRequest 调整收藏夹内部排序的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkReorderFavoritesDetailRequest = (reorderFavoritesDetailRequest: ReorderFavoritesDetailRequestDto): boolean => {
	if (!reorderFavoritesDetailRequest.favoritesListId) {
		return false
	}
	if (!reorderFavoritesDetailRequest.items || reorderFavoritesDetailRequest.items.length === 0) {
		return false
	}
	for (const item of reorderFavoritesDetailRequest.items) {
		if (!item.category || !item.id || item.sortOrder === undefined || item.sortOrder === null) {
			return false
		}
	}
	return true
}
