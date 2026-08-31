import mongoose, { InferSchemaType, PipelineStage } from 'mongoose'
import { CreateFavoritesRequestDto, CreateFavoritesResponseDto, GetFavoritesResponseDto, GetFavoritesByUidRequestDto, GetFavoritesByUidResponseDto, AddToFavoritesRequestDto, AddToFavoritesResponseDto, RemoveFromFavoritesRequestDto, RemoveFromFavoritesResponseDto, GetFavoritesDetailRequestDto, GetFavoritesDetailResponseDto, UpdateFavoritesRequestDto, UpdateFavoritesResponseDto, DeleteFavoritesRequestDto, DeleteFavoritesResponseDto, ReorderFavoritesDetailRequestDto, ReorderFavoritesDetailResponseDto, AddEditorToFavoritesRequestDto, AddEditorToFavoritesResponseDto, RemoveEditorFromFavoritesRequestDto, RemoveEditorFromFavoritesResponseDto, GetFavoritesCoverUploadSignedUrlRequestDto, GetFavoritesCoverUploadSignedUrlResponseDto, CheckFavoritesContentRequestDto, CheckFavoritesContentResponseDto } from '../controller/FavoritesControllerDto.js'
import { BrowsingHistoryCategory } from '../controller/BrowsingHistoryControllerDto.js'
import { insertData2MongoDB, insertManyData2MongoDB, selectDataFromMongoDB, deleteOneDataFromMongoDB, updateData4MongoDB, bulkUpdateData4MongoDB, deleteManyDataFromMongoDB, selectDataByAggregateFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType, UpdateType, UpdateResultType } from '../dbPool/DbClusterPoolTypes.js'
import { FavoritesSchema, FavoritesDetailSchema, RemovedFavoritesSchema, RemovedFavoritesDetailSchema } from '../dbPool/schema/FavoritesSchema.js'
import { UserSettingsSchema } from '../dbPool/schema/UserSchema.js'
import { FollowingSchema } from '../dbPool/schema/FeedSchema.js'
import { VideoCommentSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { VideoSchema } from '../dbPool/schema/VideoSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserExistsByUIDService, checkUserTokenByUuidService, getUserUid, getUserUuid } from './UserService.js'
import { checkVideoExistByKvidService } from './VideoService.js'
import { logging } from './loggingService.js'
import { createCloudflareImageUploadSignedUrl } from '../cloudflare/index.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { parseInteger } from '../common/ValidTool.js'
import { abortAndEndSession, commitAndEndSession, createAndStartSession } from '../common/MongoDBSessionTool.js'

/**
 * 创建收藏夹
 * @param createFavoritesRequest 创建收藏夹的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户安全令牌
 * @returns 创建收藏夹的请求响应
 */
export const createFavoritesService = async (createFavoritesRequest: CreateFavoritesRequestDto, uuid: string, token: string): Promise<CreateFavoritesResponseDto> => {
	try {
		if (!checkCreateFavoritesRequest(createFavoritesRequest)) {
			logging('ERROR', '创建收藏夹失败，参数校验失败', undefined, { createFavoritesRequest, uuid })
			return { success: false, message: '创建收藏夹失败，参数校验失败' }
		}
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '创建收藏夹失败，用户校验失败', undefined, { createFavoritesRequest, uuid })
			return { success: false, message: '创建收藏夹失败，用户校验失败' }
		}
		const uid = await resolveOperatorUidFromUuid(uuid, '创建收藏夹失败，用户 uid 不存在', { createFavoritesRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '创建收藏夹失败，用户 uid 不存在' }
		}

		const { collectionName, schemaInstance } = FavoritesSchema
		const now = new Date().getTime()

		type FavoritesType = InferSchemaType<typeof schemaInstance>

		const countWhere: QueryType<FavoritesType> = {
			creator: uid,
		}
		const countSelect: SelectType<FavoritesType> = {
			favoritesId: 1,
		}
		const countResult = await selectDataFromMongoDB<FavoritesType>(countWhere, countSelect, schemaInstance, collectionName)
		if (countResult.success && countResult.result && countResult.result.length >= 100) {
			logging('ERROR', '创建收藏夹失败，收藏夹数量已达上限（100个）', undefined, { createFavoritesRequest, uuid, uid })
			return { success: false, message: '创建收藏夹失败，收藏夹数量已达上限（100个）' }
		}

		const duplicateWhere: QueryType<FavoritesType> = {
			creator: uid,
			favoritesTitle: createFavoritesRequest.favoritesTitle,
		}
		const duplicateSelect: SelectType<FavoritesType> = {
			favoritesId: 1,
		}
		const duplicateResult = await selectDataFromMongoDB<FavoritesType>(duplicateWhere, duplicateSelect, schemaInstance, collectionName)
		if (duplicateResult.success && duplicateResult.result && duplicateResult.result.length > 0) {
			logging('ERROR', '创建收藏夹失败，已存在同名收藏夹', undefined, { createFavoritesRequest, uuid, uid })
			return { success: false, message: '创建收藏夹失败，不能创建同名收藏夹' }
		}

		const { favoritesTitle, favoritesBio, favoritesCover, favoritesVisibility } = createFavoritesRequest

		// 启动事务
		const session = await createAndStartSession()

		const favoritesId = (await getNextSequenceValueService('favorites', 1, 1, session))?.sequenceValue
		if (!favoritesId) {
			await abortAndEndSession(session)
			logging('ERROR', '创建收藏夹失败，获取序列值失败', undefined, { createFavoritesRequest, uuid, uid })
			return { success: false, message: '创建收藏夹失败，获取序列值失败' }
		}

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
				await commitAndEndSession(session)
				return { success: true, message: '创建收藏夹成功', result: createFavoritesResult.result[0] }
			} else {
				await abortAndEndSession(session)
				logging('ERROR', '创建收藏夹失败，数据存储失败', undefined, { createFavoritesRequest, uuid, uid })
				return { success: false, message: '创建收藏夹失败，数据存储失败' }
			}
		} catch (error) {
			await abortAndEndSession(session)
			logging('ERROR', '创建收藏夹失败，数据存储时出错：', error, { createFavoritesRequest, uuid, uid })
			return { success: false, message: '创建收藏夹失败，数据存储时出错' }
		}
	} catch (error) {
		logging('ERROR', '创建收藏夹失败，未知原因：', error, { createFavoritesRequest, uuid })
		return { success: false, message: '创建收藏夹失败，未知原因' }
	}
}

/**
 * 获取当前登录用户的收藏夹列表
 * @param uuid 用户 UUID
 * @param token 用户安全令牌
 * @returns 获取当前登录用户的收藏夹列表的请求响应
 */
export const getFavoritesService = async (uuid: string, token: string): Promise<GetFavoritesResponseDto> => {
	try {
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取收藏夹失败，用户校验失败', undefined, { uuid })
			return { success: false, message: '获取收藏夹失败，用户校验失败' }
		}
		const uid = await resolveOperatorUidFromUuid(uuid, '获取收藏夹失败，用户 uid 不存在', { uuid })
		if (uid === undefined) {
			return { success: false, message: '获取收藏夹失败，用户 uid 不存在' }
		}

		const { collectionName, schemaInstance } = FavoritesSchema

		type FavoritesType = InferSchemaType<typeof schemaInstance>

		const getFavoritesQuery = {
			$or: [
				{ creator: uid },
				{ editor: uid },
			],
		} as QueryType<FavoritesType>

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
				logging('ERROR', '获取收藏夹失败，请求收藏夹数据失败', undefined, { uuid, uid })
				return { success: false, message: '获取收藏夹失败，请求收藏夹数据失败' }
			}
		} catch (error) {
			logging('ERROR', '获取收藏夹失败，请求收藏夹数据时出错', error, { uuid, uid })
			return { success: false, message: '获取收藏夹失败，请求收藏夹数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '获取收藏夹失败，未知原因：', error, { uuid })
		return { success: false, message: '获取收藏夹失败，未知原因' }
	}
}

/**
 * 获取指定用户的收藏夹列表（公开收藏夹可匿名访问；私有/仅关注者需有效登录）
 * @param getFavoritesByUidRequest 获取指定用户收藏夹列表的请求载荷
 * @param uuid 查看者用户 UUID（可选，匿名访问公开收藏夹时可为空）
 * @param token 查看者用户 Token（可选）
 * @returns 获取指定用户收藏夹列表的请求响应
 */
export const getFavoritesByUidService = async (getFavoritesByUidRequest: GetFavoritesByUidRequestDto, uuid?: string, token?: string): Promise<GetFavoritesByUidResponseDto> => {
	try {
		if (!checkGetFavoritesByUidRequest(getFavoritesByUidRequest)) {
			logging('ERROR', '获取指定用户收藏夹列表失败，参数校验失败', undefined, { getFavoritesByUidRequest, uuid })
			return { success: false, message: '获取指定用户收藏夹列表失败，参数校验失败' }
		}
		const targetUid = getFavoritesByUidRequest.uid

		const viewerAuth = await resolveOptionalViewerAuth(uuid, token, '获取指定用户收藏夹列表失败', { getFavoritesByUidRequest, uuid })
		if (viewerAuth.status === 'invalid') {
			return { success: false, message: viewerAuth.message }
		}

		const targetUuid = await getUserUuid(targetUid)
		if (!targetUuid) {
			logging('ERROR', '获取指定用户收藏夹列表失败，目标用户不存在', undefined, { getFavoritesByUidRequest, uuid })
			return { success: false, message: '获取指定用户收藏夹列表失败，目标用户不存在' }
		}

		// 如果是查看自己的收藏夹，直接返回所有收藏夹
		if (viewerAuth.status === 'authenticated' && targetUid === viewerAuth.uid) {
			return await getFavoritesService(viewerAuth.uuid, token as string)
		}

		const viewerUid = viewerAuth.status === 'authenticated' ? viewerAuth.uid : undefined
		const viewerUuid = viewerAuth.status === 'authenticated' ? viewerAuth.uuid : undefined

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
		const isEditor = viewerUid !== undefined && favorites.some(fav => fav.editor && fav.editor.includes(viewerUid))

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
					setting => setting.privaryId === 'privary.favorites'
				)

				if (favoritesPrivacySetting) {
					if (favoritesPrivacySetting.visibilitiesType === 'private') {
						logging('ERROR', '获取指定用户收藏夹列表失败，该用户的收藏夹设置为私有', undefined, { getFavoritesByUidRequest, uuid, viewerUid, targetUid })
						return { success: false, message: '获取指定用户收藏夹列表失败，该用户的收藏夹设置为私有' }
					} else if (favoritesPrivacySetting.visibilitiesType === 'following') {
						if (!viewerUuid) {
							logging('ERROR', '获取指定用户收藏夹列表失败，需要登录并关注该用户才能查看收藏夹', undefined, { getFavoritesByUidRequest, targetUid })
							return { success: false, message: '获取指定用户收藏夹列表失败，需要登录并关注该用户才能查看收藏夹' }
						}
						// 需要检查是否关注了目标用户
						const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
						type Following = InferSchemaType<typeof followingSchemaInstance>
						const followingWhere: QueryType<Following> = {
							followerUuid: viewerUuid,
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
		// 非所有者非维护者需要检查可见性权限（匿名仅能看到公开收藏夹）
		try {
			const visibleFavorites = []
			for (const fav of favorites) {
				// 如果是维护者，直接可以看到
				if (viewerUid !== undefined && fav.editor && fav.editor.includes(viewerUid)) {
					visibleFavorites.push(fav)
				}
				// 非所有者非维护者（含匿名），需要检查可见性权限
				else if (await checkFavoritesViewPermission(fav.favoritesId, viewerUid, viewerUuid)) {
					visibleFavorites.push(fav)
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

		const uid = await resolveOperatorUidFromUuid(uuid, '添加内容到收藏夹失败，用户 uid 不存在', { addToFavoritesRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '添加内容到收藏夹失败，用户 uid 不存在' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(addToFavoritesRequest.favoritesListId, uid))) {
			logging('ERROR', '添加内容到收藏夹失败，没有权限操作该收藏夹', undefined, { addToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加内容到收藏夹失败，没有权限操作该收藏夹' }
		}

		// 检查收藏的内容是否存在
		const contentExistsResult = await checkFavoritesContentExists(addToFavoritesRequest.category, addToFavoritesRequest.id)
		if (!contentExistsResult.success) {
			logging('ERROR', '添加内容到收藏夹失败，内容不存在或类型暂不支持', undefined, { addToFavoritesRequest, uuid, uid, message: contentExistsResult.message })
			return { success: false, message: contentExistsResult.message ?? '添加内容到收藏夹失败，内容不存在或类型暂不支持' }
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
		const checkSelect: SelectType<FavoritesDetailType> = {
			favoritesListId: 1,
		}
		const checkResult = await selectDataFromMongoDB<FavoritesDetailType>(checkWhere, checkSelect, schemaInstance, collectionName)
		if (checkResult.success && checkResult.result && checkResult.result.length > 0) {
			return { success: false, message: '添加内容到收藏夹失败，该内容已存在于收藏夹中' }
		}

		// 检查收藏夹内的内容数量是否达到上限（5000个）
		const favoritesDetailsCountPipeline: PipelineStage[] = [
			{
				$match: {
					favoritesListId: addToFavoritesRequest.favoritesListId,
				},
			},
			{
				$count: 'totalCount',
			},
		]
		const favoritesDetailsCountResult = await selectDataByAggregateFromMongoDB<{ totalCount: number }>(schemaInstance, collectionName, favoritesDetailsCountPipeline)
		const favoritesDetailsCount = favoritesDetailsCountResult.result?.[0]?.totalCount ?? 0
		if (favoritesDetailsCount >= 5000) {
			logging('ERROR', '添加内容到收藏夹失败，收藏夹内内容数量已达上限（5000个）', undefined, { addToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加内容到收藏夹失败，收藏夹内内容数量已达上限（5000个）' }
		}

		// 获取当前收藏夹中的最大 sortOrder
		const maxSortOrderResult = await selectDataFromMongoDB<FavoritesDetailType>(
			{ favoritesListId: addToFavoritesRequest.favoritesListId },
			{ sortOrder: 1 },
			schemaInstance,
			collectionName,
			undefined,
			{ sortOrder: -1 },
			{ page: 1, pageSize: 1 },
		)
		const maxSortOrderDocument = maxSortOrderResult.result?.[0]
		const newSortOrder = maxSortOrderDocument ? maxSortOrderDocument.sortOrder + 1 : 1

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
			if (isMongoDuplicateKeyError(error)) {
				return { success: false, message: '添加内容到收藏夹失败，该内容已存在于收藏夹中' }
			}
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

		const uid = await resolveOperatorUidFromUuid(uuid, '从收藏夹移除内容失败，用户 uid 不存在', { removeFromFavoritesRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '从收藏夹移除内容失败，用户 uid 不存在' }
		}

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
			const deleteResult = await deleteOneDataFromMongoDB<FavoritesDetailType>(where, schemaInstance, collectionName, option)
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
 * 获取收藏夹内容列表（公开收藏夹可匿名访问；私有/仅关注者需有效登录）
 * 可通过 category 筛选 video | photo | comment；不传则返回全部类型
 * @param getFavoritesDetailRequest 获取收藏夹内容的请求载荷
 * @param uuid 用户 UUID（可选，匿名访问公开收藏夹时可为空）
 * @param token 用户 Token（可选）
 * @returns 获取收藏夹内容的请求响应
 */
export const getFavoritesDetailService = async (getFavoritesDetailRequest: GetFavoritesDetailRequestDto, uuid?: string, token?: string): Promise<GetFavoritesDetailResponseDto> => {
	try {
		if (!checkGetFavoritesDetailRequest(getFavoritesDetailRequest)) {
			logging('ERROR', '获取收藏夹内容失败，参数校验失败', undefined, { getFavoritesDetailRequest, uuid })
			return { success: false, message: '获取收藏夹内容失败，参数校验失败' }
		}

		const viewerAuth = await resolveOptionalViewerAuth(uuid, token, '获取收藏夹内容失败', { getFavoritesDetailRequest, uuid })
		if (viewerAuth.status === 'invalid') {
			return { success: false, message: viewerAuth.message }
		}

		const viewerUid = viewerAuth.status === 'authenticated' ? viewerAuth.uid : undefined
		const viewerUuid = viewerAuth.status === 'authenticated' ? viewerAuth.uuid : undefined

		// 检查用户是否有权限查看该收藏夹（根据可见性设置；匿名仅可查看公开收藏夹）
		const canView = await checkFavoritesViewPermission(getFavoritesDetailRequest.favoritesListId, viewerUid, viewerUuid)
		const canEdit = viewerUid !== undefined && await checkFavoritesPermission(getFavoritesDetailRequest.favoritesListId, viewerUid)
		if (!canView && !canEdit) {
			logging('ERROR', '获取收藏夹内容失败，没有权限查看该收藏夹', undefined, { getFavoritesDetailRequest, uuid, viewerUid })
			return { success: false, message: '获取收藏夹内容失败，没有权限查看该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesDetailType> = {
			favoritesListId: getFavoritesDetailRequest.favoritesListId,
			...(getFavoritesDetailRequest.category ? { category: getFavoritesDetailRequest.category } : {}),
		}
		const sortOrder = getFavoritesDetailRequest.sortOrder ?? 1

		let skip = 0
		let pageSize: number | undefined = undefined
		if (getFavoritesDetailRequest.pagination.page > 0 && getFavoritesDetailRequest.pagination.pageSize > 0) {
			skip = (getFavoritesDetailRequest.pagination.page - 1) * getFavoritesDetailRequest.pagination.pageSize
			pageSize = getFavoritesDetailRequest.pagination.pageSize
		}

		const favoritesDetailCountPipeline: PipelineStage[] = [
			{ $match: where },
			{ $count: 'totalCount' },
		]
		const favoritesDetailListPipeline: PipelineStage[] = [
			{ $match: where },
			{ $sort: { sortOrder } },
			{ $skip: skip },
			...(pageSize ? [{ $limit: pageSize }] : []),
			{
				$project: {
					favoritesListId: 1,
					operator: 1,
					category: 1,
					id: 1,
					addedDateTime: 1,
					sortOrder: 1,
					editDateTime: 1,
				},
			},
		]

		try {
			const favoritesDetailCountResult = await selectDataByAggregateFromMongoDB<{ totalCount: number }>(schemaInstance, collectionName, favoritesDetailCountPipeline)
			const favoritesDetailListResult = await selectDataByAggregateFromMongoDB<FavoritesDetailType>(schemaInstance, collectionName, favoritesDetailListPipeline)
			if (favoritesDetailCountResult.success && favoritesDetailListResult.success) {
				const detailRows = favoritesDetailListResult.result ?? []
				const result = await attachFavoritesDetailContent(detailRows)
				return {
					success: true,
					message: '获取收藏夹内容成功',
					totalCount: favoritesDetailCountResult.result?.[0]?.totalCount ?? 0,
					result,
				}
			} else {
				logging('ERROR', '获取收藏夹内容失败，查询数据失败', undefined, { getFavoritesDetailRequest, uuid, viewerUid })
				return { success: false, message: '获取收藏夹内容失败，查询数据失败' }
			}
		} catch (error) {
			logging('ERROR', '获取收藏夹内容失败，查询数据时出错：', error, { getFavoritesDetailRequest, uuid, viewerUid })
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

		const uid = await resolveOperatorUidFromUuid(uuid, '更新收藏夹信息失败，用户 uid 不存在', { updateFavoritesRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '更新收藏夹信息失败，用户 uid 不存在' }
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
			logging('ERROR', '更新收藏夹信息失败，收藏夹不存在', undefined, { updateFavoritesRequest, uuid, uid })
			return { success: false, message: '更新收藏夹信息失败，收藏夹不存在' }
		}
		if (checkResult.result[0].creator !== uid) {
			logging('ERROR', '更新收藏夹信息失败，只有创建者可以修改收藏夹信息', undefined, { updateFavoritesRequest, uuid, uid })
			return { success: false, message: '更新收藏夹信息失败，只有创建者可以修改收藏夹信息' }
		}

		if (updateFavoritesRequest.favoritesTitle !== undefined) {
			const duplicateWhere: QueryType<FavoritesType> = {
				creator: uid,
				favoritesTitle: updateFavoritesRequest.favoritesTitle,
			}
			const duplicateSelect: SelectType<FavoritesType> = {
				favoritesId: 1,
			}
			const duplicateResult = await selectDataFromMongoDB<FavoritesType>(duplicateWhere, duplicateSelect, favoritesSchemaInstance, favoritesCollectionName)
			if (duplicateResult.success && duplicateResult.result?.some(item => item.favoritesId !== updateFavoritesRequest.favoritesId)) {
				logging('ERROR', '更新收藏夹信息失败，已存在同名收藏夹', undefined, { updateFavoritesRequest, uuid, uid })
				return { success: false, message: '更新收藏夹信息失败，不能与其他收藏夹同名' }
			}
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
			return await resolveFavoritesUpdateServiceResponse(
				updateResult,
				where,
				schemaInstance,
				collectionName,
				{
					success: '更新收藏夹信息成功',
					noChange: '更新收藏夹信息成功，数据无需更新',
					notMatched: '更新收藏夹信息失败，未匹配到数据',
					updateFailed: '更新收藏夹信息失败，更新数据失败',
				},
				{ updateFavoritesRequest, uuid, uid },
			)
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

		const uid = await resolveOperatorUidFromUuid(uuid, '删除收藏夹失败，用户 uid 不存在', { deleteFavoritesRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '删除收藏夹失败，用户 uid 不存在' }
		}

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
				const removedDetailDataList: RemovedFavoritesDetailType[] = detailResult.result.map(detail => ({
					...detail as FavoritesDetailType,
					_operatorUUID_: uuid,
					_operatorUid_: uid,
					editDateTime: now,
				}))
				const saveRemovedDetailResult = await insertManyData2MongoDB<RemovedFavoritesDetailType>(
					removedDetailDataList,
					removedDetailSchemaInstance,
					removedDetailCollectionName,
					option
				)
				if (!saveRemovedDetailResult.success || !saveRemovedDetailResult.result || saveRemovedDetailResult.result.length !== removedDetailDataList.length) {
					await abortAndEndSession(session)
					logging('ERROR', '删除收藏夹失败，批量保存废弃明细记录失败', undefined, { deleteFavoritesRequest, uuid, uid, favoritesId: deleteFavoritesRequest.favoritesId, expectedCount: removedDetailDataList.length, insertedCount: saveRemovedDetailResult.result?.length })
					return { success: false, message: '删除收藏夹失败，批量保存废弃明细记录失败' }
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

		const uid = await resolveOperatorUidFromUuid(uuid, '调整收藏夹内部排序失败，用户 uid 不存在', { reorderFavoritesDetailRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '调整收藏夹内部排序失败，用户 uid 不存在' }
		}

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
					keyOf(String(item.category), String(item.id)),
					{
						category: String(item.category),
						id: String(item.id),
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
			const pendingUpdates: { where: QueryType<FavoritesDetailType>; update: UpdateType<FavoritesDetailType> }[] = []
			for (const item of workingList) {
				const finalOrder = finalOrders.get(keyOf(item.category, item.id))!
				if (finalOrder === item.currentOrder) {
					continue // 无需更新
				}
				pendingUpdates.push({
					where: {
						favoritesListId: reorderFavoritesDetailRequest.favoritesListId,
						category: item.category,
						id: item.id,
					},
					update: {
						sortOrder: finalOrder,
						editDateTime: now,
					},
				})
			}

			if (pendingUpdates.length > 0) {
				const updateResult = await bulkUpdateData4MongoDB<FavoritesDetailType>(pendingUpdates, schemaInstance, collectionName, { session })
				if (!updateResult.success || !updateResult.result || updateResult.result.matchedCount !== pendingUpdates.length) {
					await abortAndEndSession(session)
					logging('ERROR', '调整收藏夹内部排序失败，批量更新数据失败', undefined, { reorderFavoritesDetailRequest, uuid, uid, expectedCount: pendingUpdates.length, matchedCount: updateResult.result?.matchedCount, modifiedCount: updateResult.result?.modifiedCount })
					return { success: false, message: '调整收藏夹内部排序失败，批量更新数据失败' }
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

		const uid = await resolveOperatorUidFromUuid(uuid, '添加维护者到收藏夹失败，用户 uid 不存在', { addEditorToFavoritesRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '添加维护者到收藏夹失败，用户 uid 不存在' }
		}

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

		// 检查要添加的用户是否是创建者
		if (favorites.creator === addEditorToFavoritesRequest.editorUid) {
			logging('ERROR', '添加维护者到收藏夹失败，不能将创建者添加为维护者', undefined, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，不能将创建者添加为维护者' }
		}

		// 检查目标用户是否存在
		const editorExistsResult = await checkUserExistsByUIDService({ uid: addEditorToFavoritesRequest.editorUid })
		if (!editorExistsResult.success) {
			logging('ERROR', '添加维护者到收藏夹失败，查询目标用户是否存在时失败', undefined, { addEditorToFavoritesRequest, uuid, uid, editorExistsResult })
			return { success: false, message: '添加维护者到收藏夹失败，查询目标用户是否存在时失败' }
		}
		if (!editorExistsResult.exists) {
			logging('ERROR', '添加维护者到收藏夹失败，目标用户不存在', undefined, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，目标用户不存在' }
		}

		// 检查要添加的用户是否已经是维护者
		if (favorites.editor && favorites.editor.includes(addEditorToFavoritesRequest.editorUid)) {
			logging('ERROR', '添加维护者到收藏夹失败，该用户已经是维护者', undefined, { addEditorToFavoritesRequest, uuid, uid })
			return { success: false, message: '添加维护者到收藏夹失败，该用户已经是维护者' }
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
			return await resolveFavoritesUpdateServiceResponse(
				updateResult,
				where,
				schemaInstance,
				collectionName,
				{
					success: '添加维护者到收藏夹成功',
					noChange: '添加维护者到收藏夹成功，数据无需更新',
					notMatched: '添加维护者到收藏夹失败，未匹配到数据',
					updateFailed: '添加维护者到收藏夹失败，更新数据失败',
				},
				{ addEditorToFavoritesRequest, uuid, uid },
			)
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
		if (!uuid || !token) {
			logging('ERROR', '移除收藏夹维护者失败，参数不合法：缺少 uuid 或 token', undefined, { removeEditorFromFavoritesRequest, uuid })
			return { success: false, message: '移除收藏夹维护者失败，参数不合法：缺少 uuid 或 token' }
		}

		if (!checkRemoveEditorFromFavoritesRequest(removeEditorFromFavoritesRequest)) {
			logging('ERROR', '移除收藏夹维护者失败，参数校验失败', undefined, { removeEditorFromFavoritesRequest, uuid })
			return { success: false, message: '移除收藏夹维护者失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '移除收藏夹维护者失败，用户校验失败', undefined, { removeEditorFromFavoritesRequest, uuid })
			return { success: false, message: '移除收藏夹维护者失败，用户校验失败' }
		}

		const uid = await resolveOperatorUidFromUuid(uuid, '移除收藏夹维护者失败，用户 uid 不存在', { removeEditorFromFavoritesRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '移除收藏夹维护者失败，用户 uid 不存在' }
		}

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
			return await resolveFavoritesUpdateServiceResponse(
				updateResult,
				where,
				schemaInstance,
				collectionName,
				{
					success: '移除收藏夹维护者成功',
					noChange: '移除收藏夹维护者成功，数据无需更新',
					notMatched: '移除收藏夹维护者失败，未匹配到数据',
					updateFailed: '移除收藏夹维护者失败，更新数据失败',
				},
				{ removeEditorFromFavoritesRequest, uuid, uid },
			)
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
 * @param uuid 用户 UUID
 * @param token 用户的 token
 * @returns GetFavoritesCoverUploadSignedUrlResponseDto 获取用于上传收藏夹封面图的预签名 URL 的请求响应
 */
export const getFavoritesCoverUploadSignedUrlService = async (getFavoritesCoverUploadSignedUrlRequest: GetFavoritesCoverUploadSignedUrlRequestDto, uuid: string, token: string): Promise<GetFavoritesCoverUploadSignedUrlResponseDto> => {
	try {
		if (!checkGetFavoritesCoverUploadSignedUrlRequest(getFavoritesCoverUploadSignedUrlRequest)) {
			logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 失败，参数校验失败', undefined, { getFavoritesCoverUploadSignedUrlRequest, uuid })
			return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，参数校验失败' }
		}
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 失败，用户校验失败', undefined, { getFavoritesCoverUploadSignedUrlRequest, uuid })
			return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，用户校验失败' }
		}
		const uid = await resolveOperatorUidFromUuid(uuid, '获取用于上传收藏夹封面图的预签名 URL 失败，用户 uid 不存在', { getFavoritesCoverUploadSignedUrlRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，用户 uid 不存在' }
		}
		// 检查用户是否有权限操作该收藏夹（只有创建者和维护者可以上传封面）
		if (!(await checkFavoritesPermission(getFavoritesCoverUploadSignedUrlRequest.favoritesId, uid))) {
			logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 失败，没有权限操作该收藏夹', undefined, { getFavoritesCoverUploadSignedUrlRequest, uuid, uid })
			return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，没有权限操作该收藏夹' }
		}
		const now = new Date().getTime()
		const fileName = `favorites-cover-${uid}-${getFavoritesCoverUploadSignedUrlRequest.favoritesId}-${generateSecureRandomString(32)}-${now}`
		const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 660)
		if (signedUrl && fileName) {
			return { success: true, message: '准备开始上传收藏夹封面', result: { fileName, signedUrl } }
		}
		// TODO 图片上传逻辑需要重写，当前如何用户上传图片失败，仍然会用新封面链接替换数据库中的旧封面链接，而且当前图片没有加入审核流程
		return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，无法生成图片上传 URL' }
	} catch (error) {
		logging('ERROR', '获取用于上传收藏夹封面图的预签名 URL 失败，未知原因', error, { uuid, getFavoritesCoverUploadSignedUrlRequest })
		return { success: false, message: '获取用于上传收藏夹封面图的预签名 URL 失败，未知原因' }
	}
}

/**
 * 检查当前用户是否已收藏某内容，以及收藏在哪些收藏夹中
 * @param checkFavoritesContentRequest 检查收藏状态的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 检查收藏状态的请求响应
 */
export const checkFavoritesContentService = async (checkFavoritesContentRequest: CheckFavoritesContentRequestDto, uuid: string, token: string): Promise<CheckFavoritesContentResponseDto> => {
	try {
		if (!checkCheckFavoritesContentRequest(checkFavoritesContentRequest)) {
			logging('ERROR', '检查收藏状态失败，参数校验失败', undefined, { checkFavoritesContentRequest, uuid })
			return { success: false, message: '检查收藏状态失败，参数校验失败' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '检查收藏状态失败，用户校验失败', undefined, { checkFavoritesContentRequest, uuid })
			return { success: false, message: '检查收藏状态失败，用户校验失败' }
		}

		const uid = await resolveOperatorUidFromUuid(uuid, '检查收藏状态失败，用户 uid 不存在', { checkFavoritesContentRequest, uuid })
		if (uid === undefined) {
			return { success: false, message: '检查收藏状态失败，用户 uid 不存在' }
		}

		const { category, id } = checkFavoritesContentRequest
		const { collectionName: detailCollectionName, schemaInstance: detailSchemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof detailSchemaInstance>
		const detailWhere: QueryType<FavoritesDetailType> = {
			operator: uid,
			category,
			id,
		}
		const detailSelect: SelectType<FavoritesDetailType> = {
			favoritesListId: 1,
		}
		const detailResult = await selectDataFromMongoDB<FavoritesDetailType>(detailWhere, detailSelect, detailSchemaInstance, detailCollectionName)
		if (!detailResult.success || !detailResult.result) {
			logging('ERROR', '检查收藏状态失败，查询收藏明细失败', undefined, { checkFavoritesContentRequest, uuid, uid })
			return { success: false, message: '检查收藏状态失败，查询收藏明细失败' }
		}

		const favoritesListIds = [...new Set(detailResult.result.map(item => item.favoritesListId))]
		if (favoritesListIds.length === 0) {
			return { success: true, message: '当前用户未收藏该内容', isFavorited: false, result: [] }
		}

		const { collectionName: favoritesCollectionName, schemaInstance: favoritesSchemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof favoritesSchemaInstance>
		const favoritesSelect: SelectType<FavoritesType> = {
			favoritesId: 1,
			creator: 1,
			editor: 1,
			favoritesTitle: 1,
			favoritesBio: 1,
			favoritesCover: 1,
			favoritesVisibility: 1,
			favoritesCreateDateTime: 1,
		}
		const visibleFavorites: FavoritesType[] = []
		for (const favoritesListId of favoritesListIds) {
			const favoritesWhere: QueryType<FavoritesType> = {
				favoritesId: favoritesListId,
			}
			const favoritesResult = await selectDataFromMongoDB<FavoritesType>(favoritesWhere, favoritesSelect, favoritesSchemaInstance, favoritesCollectionName)
			if (!favoritesResult.success || !favoritesResult.result || favoritesResult.result.length === 0) {
				continue
			}
			const favorites = favoritesResult.result[0]
			if (await checkFavoritesPermission(favoritesListId, uid) || await checkFavoritesViewPermission(favoritesListId, uid, uuid)) {
				visibleFavorites.push(favorites)
			}
		}

		return {
			success: true,
			message: visibleFavorites.length > 0 ? '检查收藏状态成功' : '当前用户未收藏该内容',
			isFavorited: visibleFavorites.length > 0,
			result: visibleFavorites,
		}
	} catch (error) {
		logging('ERROR', '检查收藏状态失败，未知原因：', error, { checkFavoritesContentRequest, uuid })
		return { success: false, message: '检查收藏状态失败，未知原因' }
	}
}

/**
 * 从 uuid 解析操作用户 uid，解析失败时记录日志并返回 undefined
 * @param uuid 用户 UUID
 * @param logMessage 日志与返回给调用方的错误语义
 * @param logContext 附加日志上下文
 * @returns 合法 uid，或 undefined
 */
const resolveOperatorUidFromUuid = async (uuid: string, logMessage: string, logContext?: Record<string, unknown>): Promise<number | undefined> => {
	const uid = await getUserUid(uuid)
	if (uid === undefined || uid === null || uid < 1) {
		logging('ERROR', logMessage, undefined, logContext)
		return undefined
	}
	return uid
}

type OptionalViewerAuthResult =
	| { status: 'authenticated'; uuid: string; uid: number }
	| { status: 'anonymous' }
	| { status: 'invalid'; message: string }

/**
 * 解析可选登录态：两端都空视为匿名；仅一端有值或校验失败视为非法；两端齐全且校验通过视为已登录
 * @param uuid 用户 UUID（可空）
 * @param token 用户 Token（可空）
 * @param failMessagePrefix 失败时的错误消息前缀
 * @param logContext 附加日志上下文
 */
const resolveOptionalViewerAuth = async (
	uuid: string | undefined,
	token: string | undefined,
	failMessagePrefix: string,
	logContext?: Record<string, unknown>,
): Promise<OptionalViewerAuthResult> => {
	const hasUuid = !!uuid
	const hasToken = !!token
	if (!hasUuid && !hasToken) {
		return { status: 'anonymous' }
	}
	if (!hasUuid || !hasToken) {
		logging('ERROR', `${failMessagePrefix}，参数校验失败`, undefined, logContext)
		return { status: 'invalid', message: `${failMessagePrefix}，参数校验失败` }
	}
	if (!(await checkUserTokenByUuidService(uuid, token)).success) {
		logging('ERROR', `${failMessagePrefix}，用户校验失败`, undefined, logContext)
		return { status: 'invalid', message: `${failMessagePrefix}，用户校验失败` }
	}
	const uid = await resolveOperatorUidFromUuid(uuid, `${failMessagePrefix}，用户 uid 不存在`, logContext)
	if (uid === undefined) {
		return { status: 'invalid', message: `${failMessagePrefix}，用户 uid 不存在` }
	}
	return { status: 'authenticated', uuid, uid }
}

/**
 * 检查收藏夹 ID 是否为合法正整数
 * @param id 收藏夹 ID
 * @returns 合法返回 true，否则 false
 */
const isValidFavoritesId = (id: number | undefined | null): boolean => {
	return typeof id === 'number' && id > 0
}

/**
 * 检查用户 UID 是否为合法正整数
 * @param uid 用户 UID
 * @returns 合法返回 true，否则 false
 */
const isValidUserId = (uid: number | undefined | null): boolean => {
	return typeof uid === 'number' && Number.isFinite(uid) && uid > 0
}

/**
 * 判断 MongoDB 错误是否为唯一索引冲突
 * @param error 捕获到的错误
 * @returns 是唯一索引冲突返回 true，否则 false
 */
const isMongoDuplicateKeyError = (error: unknown): boolean => {
	const hasDuplicateKeyCode = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') {
			return false
		}
		const candidate = value as { code?: number; error?: { code?: number } }
		return candidate.code === 11000 || candidate.error?.code === 11000
	}
	return hasDuplicateKeyCode(error) || (typeof error === 'object' && error !== null && hasDuplicateKeyCode((error as { error?: unknown }).error))
}

type FavoritesUpdateServiceMessages = {
	success: string
	noChange: string
	notMatched: string
	updateFailed: string
}

/**
 * 按 DbClusterPool 更新语义构造收藏夹更新类接口的响应
 */
const resolveFavoritesUpdateServiceResponse = async (
	updateResult: UpdateResultType,
	where: QueryType<InferSchemaType<typeof FavoritesSchema.schemaInstance>>,
	schemaInstance: typeof FavoritesSchema.schemaInstance,
	collectionName: string,
	messages: FavoritesUpdateServiceMessages,
	logContext?: Record<string, unknown>,
) => {
	type FavoritesType = InferSchemaType<typeof schemaInstance>
	const summarySelect: SelectType<FavoritesType> = {
		favoritesId: 1,
		creator: 1,
		editor: 1,
		favoritesTitle: 1,
		favoritesBio: 1,
		favoritesCover: 1,
		favoritesVisibility: 1,
		favoritesCreateDateTime: 1,
	}

	if (updateResult.success && updateResult.result) {
		const { matchedCount, modifiedCount } = updateResult.result
		if (matchedCount > 0) {
			const getResult = await selectDataFromMongoDB<FavoritesType>(where, summarySelect, schemaInstance, collectionName)
			const result = getResult.success && getResult.result && getResult.result.length > 0 ? getResult.result[0] : undefined
			if (modifiedCount > 0) {
				return { success: true as const, message: messages.success, ...(result ? { result } : {}) }
			}
			logging('WARN', messages.noChange, undefined, logContext)
			return { success: true as const, message: messages.noChange, ...(result ? { result } : {}) }
		}
		logging('ERROR', messages.notMatched, undefined, logContext)
		return { success: false as const, message: messages.notMatched }
	}

	logging('ERROR', messages.updateFailed, undefined, logContext)
	return { success: false as const, message: messages.updateFailed }
}

/**
 * 检查收藏夹可见性是否为合法枚举值：1 公开，0 仅关注者，-1 私有
 * @param favoritesVisibility 收藏夹可见性
 * @returns 合法返回 true，否则 false
 */
const isValidFavoritesVisibility = (favoritesVisibility: number | undefined | null): boolean => {
	return favoritesVisibility === 1 || favoritesVisibility === 0 || favoritesVisibility === -1
}

/**
 * 检查创建收藏夹的请求载荷
 * @param createFavoritesRequest  创建收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateFavoritesRequest = (createFavoritesRequest: CreateFavoritesRequestDto): boolean => {
	return (
		!!createFavoritesRequest.favoritesTitle
		&& createFavoritesRequest.favoritesTitle.length < 200
		&& isValidFavoritesVisibility(createFavoritesRequest.favoritesVisibility)
	)
}

/**
 * 检查添加内容到收藏夹的请求载荷
 * @param addToFavoritesRequest 添加内容到收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAddToFavoritesRequest = (addToFavoritesRequest: AddToFavoritesRequestDto): boolean => {
	return (
		isValidFavoritesId(addToFavoritesRequest.favoritesListId)
		&& isSupportedFavoritesCategory(addToFavoritesRequest.category)
		&& !!addToFavoritesRequest.id
	)
}

/**
 * 检查从收藏夹移除内容的请求载荷
 * @param removeFromFavoritesRequest 从收藏夹移除内容的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkRemoveFromFavoritesRequest = (removeFromFavoritesRequest: RemoveFromFavoritesRequestDto): boolean => {
	return (isValidFavoritesId(removeFromFavoritesRequest.favoritesListId) && !!removeFromFavoritesRequest.category && !!removeFromFavoritesRequest.id && removeFromFavoritesRequest.id.length > 0)
}

/**
 * 检查获取收藏夹内容的请求载荷
 * @param getFavoritesDetailRequest 获取收藏夹内容的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFavoritesDetailRequest = (getFavoritesDetailRequest: GetFavoritesDetailRequestDto): boolean => {
	if (!isValidFavoritesId(getFavoritesDetailRequest.favoritesListId)) {
		return false
	}
	if (getFavoritesDetailRequest.pagination.page <= 0 || getFavoritesDetailRequest.pagination.pageSize <= 0) {
		return false
	}
	// category 可选；传入时必须是 video | photo | comment（含可读的 photo）
	if (getFavoritesDetailRequest.category !== undefined && !isSupportedFavoritesCategory(getFavoritesDetailRequest.category)) {
		return false
	}
	return true
}

/**
 * 检查收藏状态查询的请求载荷
 * @param checkFavoritesContentRequest 检查收藏状态的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCheckFavoritesContentRequest = (checkFavoritesContentRequest: CheckFavoritesContentRequestDto): boolean => {
	return isSupportedFavoritesCategory(checkFavoritesContentRequest.category) && !!checkFavoritesContentRequest.id && checkFavoritesContentRequest.id.length > 0
}

/**
 * 判断收藏内容类型是否为当前后端支持的类型
 * @param category 收藏内容类型
 * @returns 是否支持
 */
const isSupportedFavoritesCategory = (category: BrowsingHistoryCategory): boolean => {
	return category === 'video' || category === 'photo' || category === 'comment'
}

type FavoritesDetailRow = {
	_id?: unknown
	favoritesListId: number
	operator: number
	category: string
	id: string
	addedDateTime: number
	sortOrder: number
	editDateTime: number
}

type FavoritesDetailResponseItem = NonNullable<GetFavoritesDetailResponseDto['result']>[number]

/**
 * 为收藏夹明细批量附带内容摘要（视频标题/封面、评论正文），放入嵌套 content 字段
 * @param rows 原始收藏明细行
 * @returns 带 content 结构的明细列表
 */
const attachFavoritesDetailContent = async (rows: FavoritesDetailRow[]): Promise<FavoritesDetailResponseItem[]> => {
	const videoIds = [...new Set(
		rows
			.filter(row => row.category === 'video')
			.map(row => parseInteger(row.id))
			.filter((videoId): videoId is number => typeof videoId === 'number' && videoId > 0),
	)]
	const commentIds = [...new Set(
		rows
			.filter(row => row.category === 'comment' && mongoose.isValidObjectId(row.id))
			.map(row => row.id),
	)]

	const videoMap = new Map<number, { title: string; image: string }>()
	if (videoIds.length > 0) {
		const { collectionName, schemaInstance } = VideoSchema
		type Video = InferSchemaType<typeof schemaInstance>
		const videoWhere = {
			videoId: { $in: videoIds },
		} as QueryType<Video>
		const videoSelect: SelectType<Video> = {
			videoId: 1,
			title: 1,
			image: 1,
		}
		const videoResult = await selectDataFromMongoDB<Video>(videoWhere, videoSelect, schemaInstance, collectionName)
		if (videoResult.success && videoResult.result) {
			for (const video of videoResult.result) {
				videoMap.set(video.videoId, { title: video.title, image: video.image })
			}
		}
	}

	const commentMap = new Map<string, { text: string }>()
	if (commentIds.length > 0) {
		const { collectionName, schemaInstance } = VideoCommentSchema
		type VideoComment = InferSchemaType<typeof schemaInstance>
		const commentWhere = {
			_id: { $in: commentIds },
		} as QueryType<VideoComment>
		const commentSelect: SelectType<VideoComment> = {
			text: 1,
		}
		const commentResult = await selectDataFromMongoDB<VideoComment>(commentWhere, commentSelect, schemaInstance, collectionName)
		if (commentResult.success && commentResult.result) {
			for (const comment of commentResult.result) {
				const commentId = String((comment as { _id?: unknown })._id ?? '')
				if (commentId) {
					commentMap.set(commentId, { text: comment.text })
				}
			}
		}
	}

	return rows.map(row => {
		const category = row.category as BrowsingHistoryCategory
		const content: FavoritesDetailResponseItem['content'] = {
			category,
			id: row.id,
			available: false,
		}

		if (category === 'video') {
			const videoId = parseInteger(row.id)
			const videoMeta = videoId ? videoMap.get(videoId) : undefined
			content.available = !!videoMeta
			content.title = videoMeta?.title ?? ''
			content.image = videoMeta?.image ?? ''
		} else if (category === 'comment') {
			const commentMeta = commentMap.get(row.id)
			content.available = !!commentMeta
			content.text = commentMeta?.text ?? ''
		}
		// photo：相册未实现，仅保留 category/id，available 恒为 false

		return {
			_id: row._id !== undefined && row._id !== null ? String(row._id) : undefined,
			favoritesListId: row.favoritesListId,
			operator: row.operator,
			addedDateTime: row.addedDateTime,
			sortOrder: row.sortOrder,
			editDateTime: row.editDateTime,
			content,
		}
	})
}

/**
 * 检查要收藏的内容是否存在
 * @param category 内容类型
 * @param id 内容 ID
 * @returns 检查结果
 */
const checkFavoritesContentExists = async (category: BrowsingHistoryCategory, id: string): Promise<{ success: boolean; message?: string }> => {
	if (category === 'photo') {
		return { success: false, message: '添加内容到收藏夹失败，photo 为预留类型，当前后端尚未实现相册功能，暂不支持收藏' }
	}

	if (category === 'video') {
		const videoId = parseInteger(id)
		if (!videoId || videoId <= 0) {
			return { success: false, message: '添加内容到收藏夹失败，视频 ID 不合法' }
		}
		const checkVideoExistResult = await checkVideoExistByKvidService({ videoId })
		if (!checkVideoExistResult.success || !checkVideoExistResult.exist) {
			return { success: false, message: '添加内容到收藏夹失败，视频不存在' }
		}
		return { success: true }
	}

	if (category === 'comment') {
		if (!mongoose.isValidObjectId(id)) {
			return { success: false, message: '添加内容到收藏夹失败，评论 ID 不合法' }
		}
		const { collectionName, schemaInstance } = VideoCommentSchema
		type VideoComment = InferSchemaType<typeof schemaInstance>
		const commentWhere: QueryType<VideoComment> = {
			_id: id,
		}
		const commentSelect: SelectType<VideoComment> = {
			commentRoute: 1,
		}
		const commentResult = await selectDataFromMongoDB<VideoComment>(commentWhere, commentSelect, schemaInstance, collectionName)
		if (!commentResult.success || !commentResult.result || commentResult.result.length !== 1) {
			return { success: false, message: '添加内容到收藏夹失败，评论不存在' }
		}
		return { success: true }
	}

	return { success: false, message: '添加内容到收藏夹失败，不支持的内容类型' }
}

/**
 * 检查更新收藏夹信息的请求载荷
 * @param updateFavoritesRequest 更新收藏夹信息的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkUpdateFavoritesRequest = (updateFavoritesRequest: UpdateFavoritesRequestDto): boolean => {
	if (!isValidFavoritesId(updateFavoritesRequest.favoritesId)) {
		return false
	}
	if (updateFavoritesRequest.favoritesTitle !== undefined && updateFavoritesRequest.favoritesTitle.length >= 200) {
		return false
	}
	if (updateFavoritesRequest.favoritesVisibility !== undefined && !isValidFavoritesVisibility(updateFavoritesRequest.favoritesVisibility)) {
		return false
	}
	const hasUpdatableField = updateFavoritesRequest.favoritesTitle !== undefined
		|| updateFavoritesRequest.favoritesBio !== undefined
		|| updateFavoritesRequest.favoritesCover !== undefined
		|| updateFavoritesRequest.favoritesVisibility !== undefined
	return hasUpdatableField
}

/**
 * 检查获取指定用户收藏夹列表的请求载荷
 * @param getFavoritesByUidRequest 获取指定用户收藏夹列表的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFavoritesByUidRequest = (getFavoritesByUidRequest: GetFavoritesByUidRequestDto): boolean => {
	return isValidUserId(getFavoritesByUidRequest.uid)
}

/**
 * 检查获取收藏夹封面上传预签名 URL 的请求载荷
 * @param getFavoritesCoverUploadSignedUrlRequest 获取收藏夹封面上传预签名 URL 的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFavoritesCoverUploadSignedUrlRequest = (getFavoritesCoverUploadSignedUrlRequest: GetFavoritesCoverUploadSignedUrlRequestDto): boolean => {
	return isValidFavoritesId(getFavoritesCoverUploadSignedUrlRequest.favoritesId)
}

/**
 * 检查调整收藏夹内部排序的请求载荷
 * @param reorderFavoritesDetailRequest 调整收藏夹内部排序的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkReorderFavoritesDetailRequest = (reorderFavoritesDetailRequest: ReorderFavoritesDetailRequestDto): boolean => {
	if (!isValidFavoritesId(reorderFavoritesDetailRequest.favoritesListId)) {
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
	return isValidFavoritesId(deleteFavoritesRequest.favoritesId)
}

/**
 * 检查添加维护者到收藏夹的请求载荷
 * @param addEditorToFavoritesRequest 添加维护者到收藏夹的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAddEditorToFavoritesRequest = (addEditorToFavoritesRequest: AddEditorToFavoritesRequestDto): boolean => {
	return isValidFavoritesId(addEditorToFavoritesRequest.favoritesId) && typeof addEditorToFavoritesRequest.editorUid === 'number' && addEditorToFavoritesRequest.editorUid > 0
}

/**
 * 检查移除收藏夹维护者的请求载荷
 * @param removeEditorFromFavoritesRequest 移除收藏夹维护者的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkRemoveEditorFromFavoritesRequest = (removeEditorFromFavoritesRequest: RemoveEditorFromFavoritesRequestDto): boolean => {
	return isValidFavoritesId(removeEditorFromFavoritesRequest.favoritesId) && typeof removeEditorFromFavoritesRequest.editorUid === 'number' && removeEditorFromFavoritesRequest.editorUid > 0
}

/**
 * 检查用户是否有权限查看收藏夹（根据可见性设置）
 * @param favoritesId 收藏夹 ID
 * @param viewerUid 查看者用户 ID（匿名访问时可为空）
 * @param viewerUuid 查看者用户 UUID（匿名访问时可为空）
 * @returns 有权限返回 true，否则返回 false
 */
const checkFavoritesViewPermission = async (favoritesId: number, viewerUid?: number, viewerUuid?: string): Promise<boolean> => {
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
		if (viewerUid !== undefined && creator === viewerUid) {
			return true
		}
		if (viewerUid !== undefined && editor && editor.includes(viewerUid)) {
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
					setting => setting.privaryId === 'privary.favorites'
				)

				if (favoritesPrivacySetting) {
					if (favoritesPrivacySetting.visibilitiesType === 'private') {
						// 用户整体设置为私有，拒绝访问
						return false
					} else if (favoritesPrivacySetting.visibilitiesType === 'following') {
						// 用户整体设置为仅关注者，匿名无法通过；登录用户需要检查是否关注了创建者
						if (!viewerUuid) {
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
			// 仅关注者：匿名无法通过；登录用户需要检查查看者是否关注了创建者
			if (!viewerUuid || !creatorUuid) {
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
			// 公开：所有人都可以查看（含匿名）
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
