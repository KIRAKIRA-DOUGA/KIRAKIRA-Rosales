import mongoose, { InferSchemaType } from 'mongoose'
import { CreateFavoritesRequestDto, CreateFavoritesResponseDto, GetFavoritesResponseDto, GetFavoritesByUidRequestDto, GetFavoritesByUidResponseDto, AddToFavoritesRequestDto, AddToFavoritesResponseDto, RemoveFromFavoritesRequestDto, RemoveFromFavoritesResponseDto, GetFavoritesDetailRequestDto, GetFavoritesDetailResponseDto, UpdateFavoritesRequestDto, UpdateFavoritesResponseDto, DeleteFavoritesRequestDto, DeleteFavoritesResponseDto, ReorderFavoritesDetailRequestDto, ReorderFavoritesDetailResponseDto, AddEditorToFavoritesRequestDto, AddEditorToFavoritesResponseDto, RemoveEditorFromFavoritesRequestDto, RemoveEditorFromFavoritesResponseDto, GetFavoritesCoverUploadSignedUrlRequestDto, GetFavoritesCoverUploadSignedUrlResponseDto } from '../controller/FavoritesControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB, deleteDataFromMongoDB, updateData4MongoDB, deleteManyDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType, OrderByType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { FavoritesSchema, FavoritesDetailSchema, RemovedFavoritesSchema, RemovedFavoritesDetailSchema } from '../dbPool/schema/FavoritesSchema.js'
import { UserSettingsSchema } from '../dbPool/schema/UserSchema.js'
import { FollowingSchema } from '../dbPool/schema/FeedSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserTokenService, checkUserTokenByUuidService, checkUserExistsByUIDService, getUserUid, getUserUuid } from './UserService.js'
import { logging } from './loggingService.js'
import { createCloudflareImageUploadSignedUrl } from '../cloudflare/index.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { abortAndEndSession, commitAndEndSession, createAndStartSession } from '../common/MongoDBSessionTool.js'

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
				const session = await createAndStartSession()

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
						await commitAndEndSession(session)
						return { success: true, message: '创建收藏夹成功', result: createFavoritesResult.result[0] }
					} else {
						await abortAndEndSession(session)
						logging('ERROR', '创建收藏夹失败，数据存储失败')
						return { success: false, message: '创建收藏夹失败，数据存储失败' }
					}
				} catch (error) {
					await abortAndEndSession(session)
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
 * 获取指定用户的收藏夹列表（需要验证用户整体可见性设置）
 * @param getFavoritesByUidRequest 获取指定用户收藏夹列表的请求载荷
 * @param uuid 查看者用户 UUID
 * @param token 查看者用户 Token
 * @returns 获取指定用户收藏夹列表的请求响应
 */
export const getFavoritesByUidService = async (getFavoritesByUidRequest: GetFavoritesByUidRequestDto, uuid: string, token: string): Promise<GetFavoritesByUidResponseDto> => {
	try {
		const targetUid = getFavoritesByUidRequest.uid
		if (!targetUid || !uuid || !token) {
			logging('ERROR', '获取指定用户收藏夹列表失败，参数缺失', undefined, { getFavoritesByUidRequest, uuid })
			return { success: false, message: '获取指定用户收藏夹列表失败，参数缺失' }
		}
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取指定用户收藏夹列表失败，用户校验失败', undefined, { getFavoritesByUidRequest, uuid })
			return { success: false, message: '获取指定用户收藏夹列表失败，用户校验失败' }
		}

		const targetUuid = await getUserUuid(targetUid)
		if (!targetUuid) {
			logging('ERROR', '获取指定用户收藏夹列表失败，目标用户不存在', undefined, { getFavoritesByUidRequest, uuid })
			return { success: false, message: '获取指定用户收藏夹列表失败，目标用户不存在' }
		}

		const viewerUid = await getUserUid(uuid)
		if (!viewerUid) {
			logging('ERROR', '获取指定用户收藏夹列表失败，查看者用户ID不存在', undefined, { getFavoritesByUidRequest, uuid })
			return { success: false, message: '获取指定用户收藏夹列表失败，查看者用户ID不存在' }
		}

		// 如果是查看自己的收藏夹，直接返回所有收藏夹
		if (targetUid === viewerUid) {
			return await getFavoritesService(viewerUid, token)
		}

		// 先获取收藏夹列表，检查查看者是否是任何收藏夹的维护者
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

		const getFavoritesResult = await selectDataFromMongoDB<FavoritesType>(getFavoritesQuery, getFavoritesSelect, schemaInstance, collectionName)
		const favorites = getFavoritesResult?.result
		if (!getFavoritesResult.success || !favorites) {
			logging('ERROR', '获取指定用户收藏夹列表失败，查询收藏夹数据失败', undefined, { getFavoritesByUidRequest, uuid, viewerUid, targetUid })
			return { success: false, message: '获取指定用户收藏夹列表失败，查询收藏夹数据失败' }
		}

		// 检查查看者是否是任何收藏夹的维护者
		const isEditor = favorites.some(fav => fav.editor && fav.editor.includes(viewerUid))

		// 第一层验证：检查用户整体的收藏夹可见性设置（privary.favorites）
		// 如果查看者是维护者，可以绕过第一层验证
		if (!isEditor) {
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
						logging('ERROR', '获取指定用户收藏夹列表失败，该用户的收藏夹设置为私有', undefined, { getFavoritesByUidRequest, uuid, viewerUid, targetUid })
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
							logging('ERROR', '获取指定用户收藏夹列表失败，需要关注该用户才能查看收藏夹', undefined, { getFavoritesByUidRequest, uuid, viewerUid, targetUid })
							return { success: false, message: '获取指定用户收藏夹列表失败，需要关注该用户才能查看收藏夹' }
						}
						// 已关注，继续获取收藏夹列表
					}
					// 'public' 继续获取收藏夹列表
				}
				// 如果没有设置用户整体可见性，默认视为 'public'，继续获取收藏夹列表
			}
		}

		// 第二层验证：过滤收藏夹列表
		// 所有者或维护者可以看到他们有权限的收藏夹，即使隐私设置不允许
		// 非所有者非维护者需要检查可见性权限
		try {
			const visibleFavorites = []
			for (const fav of favorites) {
				// 如果是创建者（所有者），直接可以看到
				if (fav.creator === viewerUid) {
					visibleFavorites.push(fav)
				}
				// 如果是维护者，直接可以看到
				else if (fav.editor && fav.editor.includes(viewerUid)) {
					visibleFavorites.push(fav)
				}
				// 非所有者非维护者，需要检查可见性权限
				else {
					if (await checkFavoritesViewPermission(fav.favoritesId, viewerUid, uuid)) {
						visibleFavorites.push(fav)
					}
				}
			}
			return { success: true, message: '获取指定用户收藏夹列表成功', result: visibleFavorites }
		} catch (error) {
			logging('ERROR', '获取指定用户收藏夹列表失败，查询收藏夹数据时出错', error, { getFavoritesByUidRequest, uuid, viewerUid, targetUid })
			return { success: false, message: '获取指定用户收藏夹列表失败，查询收藏夹数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '获取指定用户收藏夹列表失败，未知原因：', error, { getFavoritesByUidRequest, uuid })
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
			logging('ERROR', '添加内容到收藏夹失败，参数校验失败', undefined, { addToFavoritesRequest, uuid })
			return { success: false, message: '添加内容到收藏夹失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '添加内容到收藏夹失败，用户校验失败', undefined, { addToFavoritesRequest, uuid })
			return { success: false, message: '添加内容到收藏夹失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(addToFavoritesRequest.favoritesListId, uid))) {
			logging('ERROR', '添加内容到收藏夹失败，没有权限操作该收藏夹', undefined, { addToFavoritesRequest, uuid, uid })
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
		const favoritesDetailCollection = mongoose.connection.collection(collectionName)
		const favoritesDetailsCount = await favoritesDetailCollection.countDocuments({
			favoritesListId: addToFavoritesRequest.favoritesListId,
		})
		if (favoritesDetailsCount >= 5000) {
			logging('ERROR', '添加内容到收藏夹失败，收藏夹内内容数量已达上限（5000个）', undefined, { addToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加内容到收藏夹失败，收藏夹内内容数量已达上限（5000个）' }
		}

		// 获取当前收藏夹中的最大 sortOrder
		const maxSortOrderDocument = await favoritesDetailCollection.findOne(
			{
				favoritesListId: addToFavoritesRequest.favoritesListId,
			},
			{
				projection: {
					sortOrder: 1,
				},
				sort: {
					sortOrder: -1,
				},
			}
		)
		const newSortOrder = (maxSortOrderDocument?.sortOrder || 0) + (maxSortOrderDocument ? 1 : 0)

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
				logging('ERROR', '添加内容到收藏夹失败，数据存储失败', undefined, { addToFavoritesRequest, uuid, uid })
				return { success: false, message: '添加内容到收藏夹失败，数据存储失败' }
			}
		} catch (error) {
			logging('ERROR', '添加内容到收藏夹失败，数据存储时出错：', error, { addToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加内容到收藏夹失败，数据存储时出错' }
		}
	} catch (error) {
		logging('ERROR', '添加内容到收藏夹失败，未知原因：', error, { addToFavoritesRequest, uuid })
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
			logging('ERROR', '从收藏夹移除内容失败，参数校验失败', undefined, { removeFromFavoritesRequest, uuid })
			return { success: false, message: '从收藏夹移除内容失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '从收藏夹移除内容失败，用户校验失败', undefined, { removeFromFavoritesRequest, uuid })
			return { success: false, message: '从收藏夹移除内容失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(removeFromFavoritesRequest.favoritesListId, uid))) {
			logging('ERROR', '从收藏夹移除内容失败，没有权限操作该收藏夹', undefined, { removeFromFavoritesRequest, uuid, uid })
			return { success: false, message: '从收藏夹移除内容失败，没有权限操作该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesDetailType> = {
			favoritesListId: removeFromFavoritesRequest.favoritesListId,
			category: removeFromFavoritesRequest.category,
			id: removeFromFavoritesRequest.id,
		}

		// 启动事务
		const session = await createAndStartSession()

		try {
			const option = { session }

			// 1. 查询要删除的记录
			const select: SelectType<FavoritesDetailType> = {
				favoritesListId: 1,
				operator: 1,
				category: 1,
				id: 1,
				addedDateTime: 1,
				sortOrder: 1,
				editDateTime: 1,
			}
			const queryResult = await selectDataFromMongoDB<FavoritesDetailType>(where, select, schemaInstance, collectionName, option)
			if (!queryResult.success || !queryResult.result || queryResult.result.length === 0) {
				await abortAndEndSession(session)
				logging('ERROR', '从收藏夹移除内容失败，未找到要删除的内容', undefined, { removeFromFavoritesRequest, uuid, uid })
				return { success: false, message: '从收藏夹移除内容失败，未找到要删除的内容' }
			}

			const detailData = queryResult.result[0]
			const now = new Date().getTime()

			// 2. 将记录移到废弃集合（每次删除都创建新记录，保留完整的删除历史）
			const { collectionName: removedDetailCollectionName, schemaInstance: removedDetailSchemaInstance } = RemovedFavoritesDetailSchema
			type RemovedFavoritesDetailType = InferSchemaType<typeof removedDetailSchemaInstance>
			const removedDetailData: RemovedFavoritesDetailType = {
				...detailData as FavoritesDetailType,
				_operatorUUID_: uuid,
				_operatorUid_: uid,
				editDateTime: now,
			}
			const saveRemovedResult = await insertData2MongoDB<RemovedFavoritesDetailType>(
				removedDetailData,
				removedDetailSchemaInstance,
				removedDetailCollectionName,
				option
			)
			if (!saveRemovedResult.success) {
				await abortAndEndSession(session)
				logging('ERROR', '从收藏夹移除内容失败，保存废弃记录失败', undefined, { removeFromFavoritesRequest, uuid, uid })
				return { success: false, message: '从收藏夹移除内容失败，保存废弃记录失败' }
			}

			// 3. 从原集合删除记录
			const deleteResult = await deleteDataFromMongoDB<FavoritesDetailType>(where, schemaInstance, collectionName, option)
			if (!deleteResult.success || !deleteResult.result || deleteResult.result.deletedCount === 0) {
				await abortAndEndSession(session)
				logging('ERROR', '从收藏夹移除内容失败，删除数据失败', undefined, { removeFromFavoritesRequest, uuid, uid })
				return { success: false, message: '从收藏夹移除内容失败，删除数据失败' }
			}

			await commitAndEndSession(session)
			return { success: true, message: '从收藏夹移除内容成功' }
		} catch (error) {
			await abortAndEndSession(session)
			logging('ERROR', '从收藏夹移除内容失败，删除数据时出错：', error, { removeFromFavoritesRequest, uuid, uid })
			return { success: false, message: '从收藏夹移除内容失败，删除数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '从收藏夹移除内容失败，未知原因：', error, { removeFromFavoritesRequest, uuid })
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
			logging('ERROR', '获取收藏夹内容失败，参数校验失败', undefined, { getFavoritesDetailRequest, uuid })
			return { success: false, message: '获取收藏夹内容失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取收藏夹内容失败，用户校验失败', undefined, { getFavoritesDetailRequest, uuid })
			return { success: false, message: '获取收藏夹内容失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

		// 检查用户是否有权限查看该收藏夹（根据可见性设置）
		if (!(await checkFavoritesViewPermission(getFavoritesDetailRequest.favoritesListId, uid, uuid)) && !(await checkFavoritesPermission(getFavoritesDetailRequest.favoritesListId, uid))) {
			logging('ERROR', '获取收藏夹内容失败，没有权限查看该收藏夹', undefined, { getFavoritesDetailRequest, uuid, uid })
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
					logging('ERROR', '获取收藏夹内容失败，查询数据失败', undefined, { getFavoritesDetailRequest, uuid, uid })
					return { success: false, message: '获取收藏夹内容失败，查询数据失败' }
				}
			} catch (error) {
				logging('ERROR', '获取收藏夹内容失败，查询数据时出错：', error, { getFavoritesDetailRequest, uuid, uid })
				return { success: false, message: '获取收藏夹内容失败，查询数据时出错' }
			}
		} catch (error) {
			logging('ERROR', '获取收藏夹内容失败，未知原因：', error, { getFavoritesDetailRequest, uuid })
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
			logging('ERROR', '更新收藏夹信息失败，参数校验失败', undefined, { updateFavoritesRequest, uuid })
			return { success: false, message: '更新收藏夹信息失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '更新收藏夹信息失败，用户校验失败', undefined, { updateFavoritesRequest, uuid })
			return { success: false, message: '更新收藏夹信息失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

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
			logging('ERROR', '更新收藏夹信息失败，收藏夹不存在', undefined, { updateFavoritesRequest, uuid, uid })
			return { success: false, message: '更新收藏夹信息失败，收藏夹不存在' }
		}
		if (checkResult.result[0].creator !== uid) {
			logging('ERROR', '更新收藏夹信息失败，只有创建者可以修改收藏夹信息', undefined, { updateFavoritesRequest, uuid, uid })
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
				logging('ERROR', '更新收藏夹信息失败，更新数据失败', undefined, { updateFavoritesRequest, uuid, uid })
				return { success: false, message: '更新收藏夹信息失败，更新数据失败' }
			}
		} catch (error) {
			logging('ERROR', '更新收藏夹信息失败，更新数据时出错：', error, { updateFavoritesRequest, uuid, uid })
			return { success: false, message: '更新收藏夹信息失败，更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '更新收藏夹信息失败，未知原因：', error, { updateFavoritesRequest, uuid })
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
			logging('ERROR', '删除收藏夹失败，参数校验失败', undefined, { deleteFavoritesRequest, uuid })
			return { success: false, message: '删除收藏夹失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除收藏夹失败，用户校验失败', undefined, { deleteFavoritesRequest, uuid })
			return { success: false, message: '删除收藏夹失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

		// 检查用户是否有权限操作该收藏夹（只有创建者可以删除）
		const { collectionName: favoritesCollectionName, schemaInstance: favoritesSchemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof favoritesSchemaInstance>
		const checkWhere: QueryType<FavoritesType> = {
			favoritesId: deleteFavoritesRequest.favoritesId,
		}
		const checkSelect: SelectType<FavoritesType> = {
			favoritesId: 1,
			creator: 1,
			editor: 1,
			favoritesTitle: 1,
			favoritesBio: 1,
			favoritesCover: 1,
			favoritesVisibility: 1,
			favoritesCreateDateTime: 1,
			createDateTime: 1,
			editDateTime: 1,
		}
		const checkResult = await selectDataFromMongoDB<FavoritesType>(checkWhere, checkSelect, favoritesSchemaInstance, favoritesCollectionName)
		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '删除收藏夹失败，收藏夹不存在', undefined, { deleteFavoritesRequest, uuid, uid })
			return { success: false, message: '删除收藏夹失败，收藏夹不存在' }
		}
		if (checkResult.result[0].creator !== uid) {
			logging('ERROR', '删除收藏夹失败，只有创建者可以删除收藏夹', undefined, { deleteFavoritesRequest, uuid, uid })
			return { success: false, message: '删除收藏夹失败，只有创建者可以删除收藏夹' }
		}

		const favoritesData = checkResult.result[0]
		const now = new Date().getTime()

		// 启动事务
		const session = await createAndStartSession()

		try {
			const option = { session }

			// 1. 获取收藏夹明细数据
			const { collectionName: detailCollectionName, schemaInstance: detailSchemaInstance } = FavoritesDetailSchema
			type FavoritesDetailType = InferSchemaType<typeof detailSchemaInstance>
			const detailWhere: QueryType<FavoritesDetailType> = {
				favoritesListId: deleteFavoritesRequest.favoritesId,
			}
			const detailSelect: SelectType<FavoritesDetailType> = {
				favoritesListId: 1,
				operator: 1,
				category: 1,
				id: 1,
				addedDateTime: 1,
				sortOrder: 1,
				editDateTime: 1,
			}
			const detailResult = await selectDataFromMongoDB<FavoritesDetailType>(detailWhere, detailSelect, detailSchemaInstance, detailCollectionName, option)

			// 2. 将收藏夹明细移到废弃集合
			if (detailResult.success && detailResult.result && detailResult.result.length > 0) {
				const { collectionName: removedDetailCollectionName, schemaInstance: removedDetailSchemaInstance } = RemovedFavoritesDetailSchema
				type RemovedFavoritesDetailType = InferSchemaType<typeof removedDetailSchemaInstance>
				for (const detail of detailResult.result) {
					const removedDetailData: RemovedFavoritesDetailType = {
						...detail as FavoritesDetailType,
						_operatorUUID_: uuid,
						_operatorUid_: uid,
						editDateTime: now,
					}
					await insertData2MongoDB<RemovedFavoritesDetailType>(removedDetailData, removedDetailSchemaInstance, removedDetailCollectionName, option)
				}
			}

			// 3. 将收藏夹移到废弃集合
			const { collectionName: removedFavoritesCollectionName, schemaInstance: removedFavoritesSchemaInstance } = RemovedFavoritesSchema
			type RemovedFavoritesType = InferSchemaType<typeof removedFavoritesSchemaInstance>
			const removedFavoritesData: RemovedFavoritesType = {
				...favoritesData as FavoritesType,
				_operatorUUID_: uuid,
				_operatorUid_: uid,
				editDateTime: now,
			}
			const saveRemovedFavoritesResult = await insertData2MongoDB<RemovedFavoritesType>(removedFavoritesData, removedFavoritesSchemaInstance, removedFavoritesCollectionName, option)
			if (!saveRemovedFavoritesResult.success) {
				await abortAndEndSession(session)
				logging('ERROR', '删除收藏夹失败，保存废弃记录失败', undefined, { deleteFavoritesRequest, uuid, uid, favoritesId: deleteFavoritesRequest.favoritesId })
				return { success: false, message: '删除收藏夹失败，保存废弃记录失败' }
			}

			// 4. 从原集合删除收藏夹明细
			const deleteDetailResult = await deleteManyDataFromMongoDB<FavoritesDetailType>(detailWhere, detailSchemaInstance, detailCollectionName, option)
			if (!deleteDetailResult.success) {
				await abortAndEndSession(session)
				return { success: false, message: '删除收藏夹失败，删除明细数据时出错' }
			}

			// 5. 从原集合删除收藏夹
			const deleteFavoritesResult = await deleteManyDataFromMongoDB<FavoritesType>(checkWhere, favoritesSchemaInstance, favoritesCollectionName, option)
			if (!deleteFavoritesResult.success) {
				await abortAndEndSession(session)
				return { success: false, message: '删除收藏夹失败，删除收藏夹数据时出错' }
			}

			await commitAndEndSession(session)
			return { success: true, message: '删除收藏夹成功' }
		} catch (error) {
			await abortAndEndSession(session)
			logging('ERROR', '删除收藏夹失败，删除数据时出错：', error, { deleteFavoritesRequest, uuid, uid })
			return { success: false, message: '删除收藏夹失败，删除数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '删除收藏夹失败，未知原因：', error, { deleteFavoritesRequest, uuid })
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
			logging('ERROR', '调整收藏夹内部排序失败，参数校验失败', undefined, { reorderFavoritesDetailRequest, uuid })
			return { success: false, message: '调整收藏夹内部排序失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '调整收藏夹内部排序失败，用户校验失败', undefined, { reorderFavoritesDetailRequest, uuid })
			return { success: false, message: '调整收藏夹内部排序失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(reorderFavoritesDetailRequest.favoritesListId, uid))) {
			logging('ERROR', '调整收藏夹内部排序失败，没有权限操作该收藏夹', undefined, { reorderFavoritesDetailRequest, uuid, uid })
			return { success: false, message: '调整收藏夹内部排序失败，没有权限操作该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const now = new Date().getTime()

		// 启动事务
		const session = await createAndStartSession()

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
				await abortAndEndSession(session)
				logging('ERROR', '调整收藏夹内部排序失败，读取现有数据失败', undefined, { reorderFavoritesDetailRequest, uuid, uid })
				return { success: false, message: '调整收藏夹内部排序失败，读取现有数据失败' }
			}

			const existing = existingResult.result ?? []
			if (existing.length === 0) {
				await commitAndEndSession(session)
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
					await abortAndEndSession(session)
					logging('ERROR', '调整收藏夹内部排序失败，存在不存在的收藏项', undefined, { reorderFavoritesDetailRequest, uuid, uid, item })
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
				const updateResult = await updateData4MongoDB<FavoritesDetailType>(where, update, schemaInstance, collectionName, { session })
				if (!updateResult.success) {
					await abortAndEndSession(session)
					logging('ERROR', '调整收藏夹内部排序失败，更新数据失败', undefined, { reorderFavoritesDetailRequest, uuid, uid, item })
					return { success: false, message: '调整收藏夹内部排序失败，更新数据失败' }
				}
			}

			await commitAndEndSession(session)
			return { success: true, message: '调整收藏夹内部排序成功' }
		} catch (error) {
			await abortAndEndSession(session)
			logging('ERROR', '调整收藏夹内部排序失败，更新数据时出错：', error, { reorderFavoritesDetailRequest, uuid, uid })
			return { success: false, message: '调整收藏夹内部排序失败，更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '调整收藏夹内部排序失败，未知原因：', error, { reorderFavoritesDetailRequest, uuid })
		return { success: false, message: '调整收藏夹内部排序失败，未知原因' }
	}
}

/**
 * 添加维护者到收藏夹
 * @param addEditorToFavoritesRequest 添加维护者到收藏夹的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 添加维护者到收藏夹的请求响应
 */
export const addEditorToFavoritesService = async (addEditorToFavoritesRequest: AddEditorToFavoritesRequestDto, uuid: string, token: string): Promise<AddEditorToFavoritesResponseDto> => {
	try {
		if (!checkAddEditorToFavoritesRequest(addEditorToFavoritesRequest)) {
			logging('ERROR', '添加维护者到收藏夹失败，参数校验失败', undefined, { addEditorToFavoritesRequest, uuid })
			return { success: false, message: '添加维护者到收藏夹失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '添加维护者到收藏夹失败，用户校验失败', undefined, { addEditorToFavoritesRequest, uuid })
			return { success: false, message: '添加维护者到收藏夹失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

		// 检查用户是否有权限操作该收藏夹（只有创建者可以添加维护者）
		const { collectionName, schemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesType> = {
			favoritesId: addEditorToFavoritesRequest.favoritesId,
		}
		const select: SelectType<FavoritesType> = {
			creator: 1,
			editor: 1,
		}
		const checkResult = await selectDataFromMongoDB<FavoritesType>(where, select, schemaInstance, collectionName)
		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '添加维护者到收藏夹失败，收藏夹不存在', undefined, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，收藏夹不存在' }
		}

		const favorites = checkResult.result[0]
		if (favorites.creator !== uid) {
			logging('ERROR', '添加维护者到收藏夹失败，只有创建者可以添加维护者', undefined, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，只有创建者可以添加维护者' }
		}

		// 检查要添加的用户是否已经是维护者
		if (favorites.editor && favorites.editor.includes(addEditorToFavoritesRequest.editorUid)) {
			logging('ERROR', '添加维护者到收藏夹失败，该用户已经是维护者', undefined, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，该用户已经是维护者' }
		}

		// 检查要添加的用户是否是创建者
		if (favorites.creator === addEditorToFavoritesRequest.editorUid) {
			logging('ERROR', '添加维护者到收藏夹失败，不能将创建者添加为维护者', undefined, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，不能将创建者添加为维护者' }
		}

		// 更新维护者列表
		const update: UpdateType<FavoritesType> = {
			editDateTime: new Date().getTime(),
		}
		if (favorites.editor && Array.isArray(favorites.editor)) {
			update.editor = [...favorites.editor, addEditorToFavoritesRequest.editorUid]
		} else {
			update.editor = [addEditorToFavoritesRequest.editorUid]
		}

		try {
			const updateResult = await updateData4MongoDB<FavoritesType>(where, update, schemaInstance, collectionName)
			if (updateResult.success && updateResult.result && updateResult.result.modifiedCount > 0) {
				// 重新查询更新后的数据
				const getSelect: SelectType<FavoritesType> = {
					favoritesId: 1,
					creator: 1,
					editor: 1,
					favoritesTitle: 1,
					favoritesBio: 1,
					favoritesCover: 1,
					favoritesVisibility: 1,
					favoritesCreateDateTime: 1,
				}
				const getResult = await selectDataFromMongoDB<FavoritesType>(where, getSelect, schemaInstance, collectionName)
				if (getResult.success && getResult.result && getResult.result.length > 0) {
					return { success: true, message: '添加维护者到收藏夹成功', result: getResult.result[0] }
				} else {
					return { success: true, message: '添加维护者到收藏夹成功' }
				}
			} else {
				logging('ERROR', '添加维护者到收藏夹失败，更新数据失败', undefined, { addEditorToFavoritesRequest, uuid, uid })
				return { success: false, message: '添加维护者到收藏夹失败，更新数据失败' }
			}
		} catch (error) {
			logging('ERROR', '添加维护者到收藏夹失败，更新数据时出错：', error, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '添加维护者到收藏夹失败，未知原因：', error, { addEditorToFavoritesRequest, uuid })
		return { success: false, message: '添加维护者到收藏夹失败，未知原因' }
	}
}

/**
 * 移除收藏夹维护者
 * @param removeEditorFromFavoritesRequest 移除收藏夹维护者的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 移除收藏夹维护者的请求响应
 */
export const removeEditorFromFavoritesService = async (removeEditorFromFavoritesRequest: RemoveEditorFromFavoritesRequestDto, uuid: string, token: string): Promise<RemoveEditorFromFavoritesResponseDto> => {
	try {
		if (!checkRemoveEditorFromFavoritesRequest(removeEditorFromFavoritesRequest)) {
			logging('ERROR', '移除收藏夹维护者失败，参数校验失败', undefined, { removeEditorFromFavoritesRequest, uuid })
			return { success: false, message: '移除收藏夹维护者失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '移除收藏夹维护者失败，用户校验失败', undefined, { removeEditorFromFavoritesRequest, uuid })
			return { success: false, message: '移除收藏夹维护者失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)

		// 检查用户是否有权限操作该收藏夹（只有创建者可以移除维护者）
		const { collectionName, schemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesType> = {
			favoritesId: removeEditorFromFavoritesRequest.favoritesId,
		}
		const select: SelectType<FavoritesType> = {
			creator: 1,
			editor: 1,
		}
		const checkResult = await selectDataFromMongoDB<FavoritesType>(where, select, schemaInstance, collectionName)
		if (!checkResult.success || !checkResult.result || checkResult.result.length === 0) {
			logging('ERROR', '移除收藏夹维护者失败，收藏夹不存在', undefined, { removeEditorFromFavoritesRequest, uuid, uid })
			return { success: false, message: '移除收藏夹维护者失败，收藏夹不存在' }
		}

		const favorites = checkResult.result[0]
		if (favorites.creator !== uid) {
			logging('ERROR', '移除收藏夹维护者失败，只有创建者可以移除维护者', undefined, { removeEditorFromFavoritesRequest, uuid, uid })
			return { success: false, message: '移除收藏夹维护者失败，只有创建者可以移除维护者' }
		}

		// 检查要移除的用户是否是维护者
		if (!favorites.editor || !favorites.editor.includes(removeEditorFromFavoritesRequest.editorUid)) {
			logging('ERROR', '移除收藏夹维护者失败，该用户不是维护者', undefined, { removeEditorFromFavoritesRequest, uuid, uid })
			return { success: false, message: '移除收藏夹维护者失败，该用户不是维护者' }
		}

		// 更新维护者列表
		const update: UpdateType<FavoritesType> = {
			editDateTime: new Date().getTime(),
			editor: favorites.editor.filter(editorUid => editorUid !== removeEditorFromFavoritesRequest.editorUid),
		}

		try {
			const updateResult = await updateData4MongoDB<FavoritesType>(where, update, schemaInstance, collectionName)
			if (updateResult.success && updateResult.result && updateResult.result.modifiedCount > 0) {
				// 重新查询更新后的数据
				const getSelect: SelectType<FavoritesType> = {
					favoritesId: 1,
					creator: 1,
					editor: 1,
					favoritesTitle: 1,
					favoritesBio: 1,
					favoritesCover: 1,
					favoritesVisibility: 1,
					favoritesCreateDateTime: 1,
				}
				const getResult = await selectDataFromMongoDB<FavoritesType>(where, getSelect, schemaInstance, collectionName)
				if (getResult.success && getResult.result && getResult.result.length > 0) {
					return { success: true, message: '移除收藏夹维护者成功', result: getResult.result[0] }
				} else {
					return { success: true, message: '移除收藏夹维护者成功' }
				}
			} else {
				logging('ERROR', '移除收藏夹维护者失败，更新数据失败', undefined, { removeEditorFromFavoritesRequest, uuid, uid })
				return { success: false, message: '移除收藏夹维护者失败，更新数据失败' }
			}
		} catch (error) {
			logging('ERROR', '移除收藏夹维护者失败，更新数据时出错：', error, { removeEditorFromFavoritesRequest, uuid, uid })
			return { success: false, message: '移除收藏夹维护者失败，更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '移除收藏夹维护者失败，未知原因：', error, { removeEditorFromFavoritesRequest, uuid })
		return { success: false, message: '移除收藏夹维护者失败，未知原因' }
	}
}

/**
 * 获取用于上传收藏夹封面图的预签名 URL
 * @param getFavoritesCoverUploadSignedUrlRequest 获取用于上传收藏夹封面图的预签名 URL 的请求载荷
 * @param uid 用户 ID
 * @param token 用户的 token
 * @returns GetFavoritesCoverUploadSignedUrlResponseDto 获取用于上传收藏夹封面图的预签名 URL 的请求响应
 */
export const getFavoritesCoverUploadSignedUrlService = async (getFavoritesCoverUploadSignedUrlRequest: GetFavoritesCoverUploadSignedUrlRequestDto, uid: number, token: string): Promise<GetFavoritesCoverUploadSignedUrlResponseDto> => {
	// TODO 图片上传逻辑需要重写，当前如何用户上传图片失败，仍然会用新封面链接替换数据库中的旧封面链接，而且当前图片没有加入审核流程
	try {
		if ((await checkUserTokenService(uid, token)).success) {
			// 检查用户是否有权限操作该收藏夹（只有创建者和维护者可以上传封面）
			if (!(await checkFavoritesPermission(getFavoritesCoverUploadSignedUrlRequest.favoritesId, uid))) {
				logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 失败，没有权限操作该收藏夹', undefined, { getFavoritesCoverUploadSignedUrlRequest, uid })
				return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，没有权限操作该收藏夹' }
			}
			const now = new Date().getTime()
			const fileName = `favorites-cover-${uid}-${getFavoritesCoverUploadSignedUrlRequest.favoritesId}-${generateSecureRandomString(32)}-${now}`
			const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 660)
			if (signedUrl && fileName) {
				return { success: true, message: '准备开始上传收藏夹封面', result: { fileName, signedUrl } }
			} else {
				// TODO 图片上传逻辑需要重写，当前如何用户上传图片失败，仍然会用新封面链接替换数据库中的旧封面链接，而且当前图片没有加入审核流程
				return { success: false, message: '上传失败，无法生成图片上传 URL，请重新上传收藏夹封面' }
			}
		} else {
			logging('ERROR', '获取上传收藏夹封面用的预签名 URL 失败，用户不合法', undefined, { uid })
			return { success: false, message: '上传失败，无法获取上传权限' }
		}
	} catch (error) {
		logging('ERROR', '获取上传收藏夹封面用的预签名 URL 失败，错误信息', error, { uid })
		return { success: false, message: '上传失败，无法获取上传权限' }
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
	return (!!addToFavoritesRequest.favoritesListId && addToFavoritesRequest.favoritesListId > 0 && !!addToFavoritesRequest.category && !!addToFavoritesRequest.id)
}

/**
 * 检查从收藏夹移除内容的请求载荷
 * @param removeFromFavoritesRequest 从收藏夹移除内容的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkRemoveFromFavoritesRequest = (removeFromFavoritesRequest: RemoveFromFavoritesRequestDto): boolean => {
	return (!!removeFromFavoritesRequest.favoritesListId && removeFromFavoritesRequest.favoritesListId > 0 && !!removeFromFavoritesRequest.category && !!removeFromFavoritesRequest.id && removeFromFavoritesRequest.id.length > 0)
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

/**
 * 检查删除收藏夹的请求载荷
 * @param deleteFavoritesRequest 删除收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkDeleteFavoritesRequest = (deleteFavoritesRequest: DeleteFavoritesRequestDto): boolean => {
	return !!deleteFavoritesRequest.favoritesId
}

/**
 * 检查添加维护者到收藏夹的请求载荷
 * @param addEditorToFavoritesRequest 添加维护者到收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAddEditorToFavoritesRequest = (addEditorToFavoritesRequest: AddEditorToFavoritesRequestDto): boolean => {
	return (!!addEditorToFavoritesRequest.favoritesId && !!addEditorToFavoritesRequest.editorUid)
}

/**
 * 检查移除收藏夹维护者的请求载荷
 * @param removeEditorFromFavoritesRequest 移除收藏夹维护者的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkRemoveEditorFromFavoritesRequest = (removeEditorFromFavoritesRequest: RemoveEditorFromFavoritesRequestDto): boolean => {
	return (!!removeEditorFromFavoritesRequest.favoritesId && !!removeEditorFromFavoritesRequest.editorUid)
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
		logging('ERROR', '检查收藏夹查看权限失败：', error, { favoritesId, viewerUid, viewerUuid })
		return false
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
		logging('ERROR', '检查收藏夹权限失败：', error, { favoritesId, uid })
		return false
	}
}
