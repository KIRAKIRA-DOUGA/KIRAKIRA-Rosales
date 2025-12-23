import mongoose, { InferSchemaType } from 'mongoose'
import { AddToFavoritesRequestDto, AddToFavoritesResponseDto, CreateFavoritesRequestDto, CreateFavoritesResponseDto, DeleteFavoritesRequestDto, DeleteFavoritesResponseDto, GetFavoritesDetailRequestDto, GetFavoritesDetailResponseDto, GetFavoritesResponseDto, RemoveFromFavoritesRequestDto, RemoveFromFavoritesResponseDto, ReorderFavoritesDetailRequestDto, ReorderFavoritesDetailResponseDto, UpdateFavoritesRequestDto, UpdateFavoritesResponseDto } from '../controller/FavoritesControllerDto.js'
import { deleteDataFromMongoDB, findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { OrderByType, QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { FavoritesDetailSchema, FavoritesSchema } from '../dbPool/schema/FavoritesSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { checkUserTokenService } from './UserService.js'

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
						console.error('ERROR', '创建收藏夹失败，数据存储失败')
						return { success: false, message: '创建收藏夹失败，数据存储失败' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '创建收藏夹失败，数据存储时出错：', error)
					return { success: false, message: '创建收藏夹失败，数据存储时出错' }
				}
			} else {
				console.error('ERROR', '创建收藏夹失败，用户校验失败')
				return { success: false, message: '创建收藏夹失败，用户校验失败' }
			}
		} else {
			console.error('ERROR', '创建收藏夹失败，数据校验失败')
			return { success: false, message: '创建收藏夹失败，数据校验失败' }
		}
	} catch (error) {
		console.error('ERROR', '创建收藏夹失败，未知原因：', error)
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
					console.error('ERROR', '获取收藏夹失败，请求收藏夹数据失败')
					return { success: false, message: '获取收藏夹失败，请求收藏夹数据失败' }
				}
			} catch (error) {
				console.error('ERROR', '获取收藏夹失败，请求收藏夹数据时出错', error)
				return { success: false, message: '获取收藏夹失败，请求收藏夹数据时出错' }
			}
		} else {
			console.error('ERROR', '获取收藏夹失败，用户校验失败')
			return { success: false, message: '获取收藏夹失败，用户校验失败' }
		}
	} catch (error) {
		console.error('ERROR', '获取收藏夹失败，未知原因：', error)
		return { success: false, message: '获取收藏夹失败，未知原因' }
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
		console.error('ERROR', '检查收藏夹权限失败：', error)
		return false
	}
}

/**
 * 添加内容到收藏夹
 * @param addToFavoritesRequest 添加内容到收藏夹的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 添加内容到收藏夹的请求响应
 */
export const addToFavoritesService = async (addToFavoritesRequest: AddToFavoritesRequestDto, uid: number, token: string): Promise<AddToFavoritesResponseDto> => {
	try {
		if (!checkAddToFavoritesRequest(addToFavoritesRequest)) {
			console.error('ERROR', '添加内容到收藏夹失败，参数校验失败')
			return { success: false, message: '添加内容到收藏夹失败，参数校验失败' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			console.error('ERROR', '添加内容到收藏夹失败，用户校验失败')
			return { success: false, message: '添加内容到收藏夹失败，用户校验失败' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(addToFavoritesRequest.favoritesListId, uid))) {
			console.error('ERROR', '添加内容到收藏夹失败，没有权限操作该收藏夹')
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
				console.error('ERROR', '添加内容到收藏夹失败，数据存储失败')
				return { success: false, message: '添加内容到收藏夹失败，数据存储失败' }
			}
		} catch (error) {
			console.error('ERROR', '添加内容到收藏夹失败，数据存储时出错：', error)
			return { success: false, message: '添加内容到收藏夹失败，数据存储时出错' }
		}
	} catch (error) {
		console.error('ERROR', '添加内容到收藏夹失败，未知原因：', error)
		return { success: false, message: '添加内容到收藏夹失败，未知原因' }
	}
}

/**
 * 从收藏夹移除内容
 * @param removeFromFavoritesRequest 从收藏夹移除内容的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 从收藏夹移除内容的请求响应
 */
export const removeFromFavoritesService = async (removeFromFavoritesRequest: RemoveFromFavoritesRequestDto, uid: number, token: string): Promise<RemoveFromFavoritesResponseDto> => {
	try {
		if (!checkRemoveFromFavoritesRequest(removeFromFavoritesRequest)) {
			console.error('ERROR', '从收藏夹移除内容失败，参数校验失败')
			return { success: false, message: '从收藏夹移除内容失败，参数校验失败' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			console.error('ERROR', '从收藏夹移除内容失败，用户校验失败')
			return { success: false, message: '从收藏夹移除内容失败，用户校验失败' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(removeFromFavoritesRequest.favoritesListId, uid))) {
			console.error('ERROR', '从收藏夹移除内容失败，没有权限操作该收藏夹')
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
				console.error('ERROR', '从收藏夹移除内容失败，未找到要删除的内容')
				return { success: false, message: '从收藏夹移除内容失败，未找到要删除的内容' }
			}
		} catch (error) {
			console.error('ERROR', '从收藏夹移除内容失败，删除数据时出错：', error)
			return { success: false, message: '从收藏夹移除内容失败，删除数据时出错' }
		}
	} catch (error) {
		console.error('ERROR', '从收藏夹移除内容失败，未知原因：', error)
		return { success: false, message: '从收藏夹移除内容失败，未知原因' }
	}
}

/**
 * 获取收藏夹内容列表
 * @param getFavoritesDetailRequest 获取收藏夹内容的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 获取收藏夹内容的请求响应
 */
export const getFavoritesDetailService = async (getFavoritesDetailRequest: GetFavoritesDetailRequestDto, uid: number, token: string): Promise<GetFavoritesDetailResponseDto> => {
	try {
		if (!checkGetFavoritesDetailRequest(getFavoritesDetailRequest)) {
			console.error('ERROR', '获取收藏夹内容失败，参数校验失败')
			return { success: false, message: '获取收藏夹内容失败，参数校验失败' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			console.error('ERROR', '获取收藏夹内容失败，用户校验失败')
			return { success: false, message: '获取收藏夹内容失败，用户校验失败' }
		}

		// 检查用户是否有权限查看该收藏夹
		if (!(await checkFavoritesPermission(getFavoritesDetailRequest.favoritesListId, uid))) {
			console.error('ERROR', '获取收藏夹内容失败，没有权限查看该收藏夹')
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
				console.error('ERROR', '获取收藏夹内容失败，查询数据失败')
				return { success: false, message: '获取收藏夹内容失败，查询数据失败' }
			}
		} catch (error) {
			console.error('ERROR', '获取收藏夹内容失败，查询数据时出错：', error)
			return { success: false, message: '获取收藏夹内容失败，查询数据时出错' }
		}
	} catch (error) {
		console.error('ERROR', '获取收藏夹内容失败，未知原因：', error)
		return { success: false, message: '获取收藏夹内容失败，未知原因' }
	}
}

/**
 * 更新收藏夹信息
 * @param updateFavoritesRequest 更新收藏夹信息的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 更新收藏夹信息的请求响应
 */
export const updateFavoritesService = async (updateFavoritesRequest: UpdateFavoritesRequestDto, uid: number, token: string): Promise<UpdateFavoritesResponseDto> => {
	try {
		if (!checkUpdateFavoritesRequest(updateFavoritesRequest)) {
			console.error('ERROR', '更新收藏夹信息失败，参数校验失败')
			return { success: false, message: '更新收藏夹信息失败，参数校验失败' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			console.error('ERROR', '更新收藏夹信息失败，用户校验失败')
			return { success: false, message: '更新收藏夹信息失败，用户校验失败' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(updateFavoritesRequest.favoritesId, uid))) {
			console.error('ERROR', '更新收藏夹信息失败，没有权限操作该收藏夹')
			return { success: false, message: '更新收藏夹信息失败，没有权限操作该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesSchema
		type FavoritesType = InferSchemaType<typeof schemaInstance>
		const where: QueryType<FavoritesType> = {
			favoritesId: updateFavoritesRequest.favoritesId,
		}
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
				console.error('ERROR', '更新收藏夹信息失败，更新数据失败')
				return { success: false, message: '更新收藏夹信息失败，更新数据失败' }
			}
		} catch (error) {
			console.error('ERROR', '更新收藏夹信息失败，更新数据时出错：', error)
			return { success: false, message: '更新收藏夹信息失败，更新数据时出错' }
		}
	} catch (error) {
		console.error('ERROR', '更新收藏夹信息失败，未知原因：', error)
		return { success: false, message: '更新收藏夹信息失败，未知原因' }
	}
}

/**
 * 删除收藏夹
 * @param deleteFavoritesRequest 删除收藏夹的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 删除收藏夹的请求响应
 */
export const deleteFavoritesService = async (deleteFavoritesRequest: DeleteFavoritesRequestDto, uid: number, token: string): Promise<DeleteFavoritesResponseDto> => {
	try {
		if (!checkDeleteFavoritesRequest(deleteFavoritesRequest)) {
			console.error('ERROR', '删除收藏夹失败，参数校验失败')
			return { success: false, message: '删除收藏夹失败，参数校验失败' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			console.error('ERROR', '删除收藏夹失败，用户校验失败')
			return { success: false, message: '删除收藏夹失败，用户校验失败' }
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
			console.error('ERROR', '删除收藏夹失败，收藏夹不存在')
			return { success: false, message: '删除收藏夹失败，收藏夹不存在' }
		}
		if (checkResult.result[0].creator !== uid) {
			console.error('ERROR', '删除收藏夹失败，只有创建者可以删除收藏夹')
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
			console.error('ERROR', '删除收藏夹失败，删除数据时出错：', error)
			return { success: false, message: '删除收藏夹失败，删除数据时出错' }
		}
	} catch (error) {
		console.error('ERROR', '删除收藏夹失败，未知原因：', error)
		return { success: false, message: '删除收藏夹失败，未知原因' }
	}
}

/**
 * 调整收藏夹内部排序
 * @param reorderFavoritesDetailRequest 调整收藏夹内部排序的请求载荷
 * @param uid 用户 ID
 * @param token 用户安全令牌
 * @returns 调整收藏夹内部排序的请求响应
 */
export const reorderFavoritesDetailService = async (reorderFavoritesDetailRequest: ReorderFavoritesDetailRequestDto, uid: number, token: string): Promise<ReorderFavoritesDetailResponseDto> => {
	try {
		if (!checkReorderFavoritesDetailRequest(reorderFavoritesDetailRequest)) {
			console.error('ERROR', '调整收藏夹内部排序失败，参数校验失败')
			return { success: false, message: '调整收藏夹内部排序失败，参数校验失败' }
		}

		if (!(await checkUserTokenService(uid, token)).success) {
			console.error('ERROR', '调整收藏夹内部排序失败，用户校验失败')
			return { success: false, message: '调整收藏夹内部排序失败，用户校验失败' }
		}

		// 检查用户是否有权限操作该收藏夹
		if (!(await checkFavoritesPermission(reorderFavoritesDetailRequest.favoritesListId, uid))) {
			console.error('ERROR', '调整收藏夹内部排序失败，没有权限操作该收藏夹')
			return { success: false, message: '调整收藏夹内部排序失败，没有权限操作该收藏夹' }
		}

		const { collectionName, schemaInstance } = FavoritesDetailSchema
		type FavoritesDetailType = InferSchemaType<typeof schemaInstance>
		const now = new Date().getTime()

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		try {
			// 批量更新排序顺序
			for (const item of reorderFavoritesDetailRequest.items) {
				const where: QueryType<FavoritesDetailType> = {
					favoritesListId: reorderFavoritesDetailRequest.favoritesListId,
					category: item.category,
					id: item.id,
				}
				const update: UpdateType<FavoritesDetailType> = {
					sortOrder: item.sortOrder,
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
			console.error('ERROR', '调整收藏夹内部排序失败，更新数据时出错：', error)
			return { success: false, message: '调整收藏夹内部排序失败，更新数据时出错' }
		}
	} catch (error) {
		console.error('ERROR', '调整收藏夹内部排序失败，未知原因：', error)
		return { success: false, message: '调整收藏夹内部排序失败，未知原因' }
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

// /**
//  * 更新或创建用户浏览历史
//  * @param createBrowsingHistoryRequest 更新或创建用户浏览历史请求载荷
//  * @param uid 用户 ID
//  * @param token 用户安全令牌
//  * @returns 更新或创建用户浏览历史响应结果
//  */
// export const createOrUpdateBrowsingHistoryService = async (createOrUpdateBrowsingHistoryRequest: CreateOrUpdateBrowsingHistoryRequestDto, uid: number, token: string): Promise<CreateOrUpdateBrowsingHistoryResponseDto> => {
// 	try {
// 		if (checkCreateOrUpdateBrowsingHistoryRequest(createOrUpdateBrowsingHistoryRequest)) {
// 			if (createOrUpdateBrowsingHistoryRequest.uid === uid) {
// 				if ((await checkUserTokenService(uid, token)).success) {
// 					const { collectionName, schemaInstance } = BrowsingHistorySchema
// 					type BrowsingHistoryType = InferSchemaType<typeof schemaInstance>

// 					const uid = createOrUpdateBrowsingHistoryRequest.uid
// 					const category = createOrUpdateBrowsingHistoryRequest.category
// 					const id = createOrUpdateBrowsingHistoryRequest.id
// 					const anchor = createOrUpdateBrowsingHistoryRequest.anchor
// 					const nowDate = new Date().getTime()

// 					// 搜索数据
// 					const BrowsingHistoryWhere: QueryType<BrowsingHistoryType> = {
// 						uid,
// 						category,
// 						id,
// 					}

// 					// 准备上传到 MongoDB 的数据
// 					const BrowsingHistoryData: BrowsingHistoryType = {
// 						uid,
// 						category,
// 						id,
// 						anchor,
// 						lastUpdateDateTime: nowDate,
// 						editDateTime: nowDate,
// 					}

// 					try {
// 						const insert2MongoDResult = await findOneAndUpdateData4MongoDB(BrowsingHistoryWhere, BrowsingHistoryData, schemaInstance, collectionName)
// 						const result = insert2MongoDResult.result
// 						if (insert2MongoDResult.success && result) {
// 							return { success: true, message: '更新或创建用户浏览历史成功', result: result as CreateOrUpdateBrowsingHistoryResponseDto['result'] }
// 						}
// 					} catch (error) {
// 						console.error('ERROR', '更新或创建用户浏览历史时出错，插入数据时出错')
// 						return { success: false, message: '更新或创建用户浏览历史时出错，插入数据时出错' }
// 					}
// 				} else {
// 					console.error('ERROR', '更新或创建用户浏览历史时出错，用户校验失败')
// 					return { success: false, message: '更新或创建用户浏览历史时出错，用户校验失败' }
// 				}
// 			} else {
// 				console.error('ERROR', '更新或创建用户浏览历史时出错，查看历史记录的目标用户与当前登录用户不一致，不允许查看其他用户的历史记录！')
// 				return { success: false, message: '更新或创建用户浏览历史时出错，查看历史记录的目标用户与当前登录用户不一致，不允许查看其他用户的历史记录！' }
// 			}
// 		} else {
// 			console.error('ERROR', '更新或创建用户浏览历史时出错，参数不合法')
// 			return { success: false, message: '更新或创建用户浏览历史时出错，参数不合法' }
// 		}
// 	} catch (error) {
// 		console.error('ERROR', '更新或创建用户浏览历史时出错，未知原因：', error)
// 		return { success: false, message: '更新或创建用户浏览历史时出错，未知原因' }
// 	}
// }

// /**
//  * 获取全部或过滤后的用户浏览历史，按对某一内容的最后访问时间降序排序
//  * @param getUserBrowsingHistoryWithFilterRequest 获取用户浏览历史的请求载荷
//  * @param uid 用户 ID
//  * @param token 用户安全令牌
//  * @returns 获取用户浏览历史的请求响应，全部或过滤后的用户浏览历史
//  */
// export const getUserBrowsingHistoryWithFilterService = async (getUserBrowsingHistoryWithFilterRequest: GetUserBrowsingHistoryWithFilterRequestDto, uid: number, token: string): Promise<GetUserBrowsingHistoryWithFilterResponseDto> => {
// 	try {
// 		if (checkGetUserBrowsingHistoryWithFilterRequest(getUserBrowsingHistoryWithFilterRequest)) {
// 			if ((await checkUserTokenService(uid, token)).success) {
// 				const { collectionName, schemaInstance } = BrowsingHistorySchema

// 				// TODO: 下方这个 Aggregate 只适用于视频例是记录的搜索
// 				const videoHistoryAggregateProps: PipelineStage[] = [
// 					{
// 						$match: {
// 							category: 'video',
// 							uid,
// 						},
// 					},
// 					{
// 						$addFields: {
// 							id_number: { $toInt: '$id' }, // 将 video_id 从字符串转换为数字
// 						},
// 					},
// 					{
// 						$lookup: {
// 							from: 'videos',
// 							localField: 'id_number',
// 							foreignField: 'videoId',
// 							as: 'video_info',
// 						},
// 					},
// 					{
// 						$unwind: '$video_info',
// 					},
// 					{
// 						$match: {
// 							'video_info.title': { $regex: getUserBrowsingHistoryWithFilterRequest.videoTitle ?? '', $options: 'i' }, // 使用正则表达式进行模糊查询，不区分大小写
// 						},
// 					},
// 					{
// 						$lookup: {
// 							from: 'user-infos',
// 							localField: 'video_info.uploaderId', // 假设视频表中有 author_id 字段
// 							foreignField: 'uid',
// 							as: 'uploader_info',
// 						},
// 					},
// 					{
// 						$unwind: '$uploader_info',
// 					},
// 					{
// 						$sort: {
// 							lastUpdateDateTime: -1, // 按 lastUpdateDateTime 降序排序
// 						},
// 					},
// 					{
// 						$project: {
// 							uid: 1,
// 							category: 1,
// 							id: '$id_number',
// 							anchor: 1,
// 							videoId: '$video_info.videoId',
// 							title: '$video_info.title',
// 							image: '$video_info.image',
// 							uploadDate: '$video_info.uploadDate',
// 							watchedCount: '$video_info.watchedCount',
// 							uploader: '$uploader_info.username',
// 							uploaderId: '$uploader_info.uid',
// 							duration: '$video_info.duration',
// 							description: '$video_info.description',
// 							lastUpdateDateTime: '$lastUpdateDateTime',
// 						},
// 					},
// 				]

// 				try {
// 					const result = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, videoHistoryAggregateProps)
// 					const browsingHistory = result.result
// 					if (result.success && browsingHistory) {
// 						if (browsingHistory.length > 0) {
// 							return { success: true, message: '获取用户浏览历史成功', result: browsingHistory }
// 						} else {
// 							return { success: true, message: '用户的浏览历史为空', result: [] }
// 						}
// 					} else {
// 						console.error('ERROR', '获取用户浏览历史时出错，未获取到数据')
// 						return { success: false, message: '获取用户浏览历史时出错，未获取到数据' }
// 					}
// 				} catch (error) {
// 					console.error('ERROR', '获取用户浏览历史时出错，获取用户浏览历史数据失败')
// 					return { success: false, message: '获取用户浏览历史时出错，获取用户浏览历史数据失败' }
// 				}
// 			} else {
// 				console.error('ERROR', '获取用户浏览历史时出错，用户校验失败')
// 				return { success: false, message: '获取用户浏览历史时出错，用户校验失败' }
// 			}
// 		} else {
// 			console.error('ERROR', '获取用户浏览历史时出错，请求参数不合法')
// 			return { success: false, message: '获取用户浏览历史时出错，请求参数不合法' }
// 		}
// 	} catch (error) {
// 		console.error('ERROR', '获取用户浏览历史时出错，未知原因：', error)
// 		return { success: false, message: '获取用户浏览历史时出错，未知原因' }
// 	}
// }

// /**
//  * 校验创建用户浏览历史的请求参数
//  * @param createBrowsingHistoryRequest 创建用户浏览历史的请求参数
//  * @returns 合法返回 true, 不合法返回 false
//  */
// const checkCreateOrUpdateBrowsingHistoryRequest = (createOrUpdateBrowsingHistoryRequest: CreateOrUpdateBrowsingHistoryRequestDto): boolean => {
// 	return (
// 		createOrUpdateBrowsingHistoryRequest.uid !== undefined && createOrUpdateBrowsingHistoryRequest.uid !== null && createOrUpdateBrowsingHistoryRequest.uid >= 0
// 		&& (createOrUpdateBrowsingHistoryRequest.category === 'video' || createOrUpdateBrowsingHistoryRequest.category === 'photo' || createOrUpdateBrowsingHistoryRequest.category === 'comment')
// 		&& !!createOrUpdateBrowsingHistoryRequest.id
// 	)
// }

// /**
//  * 校验获取用户浏览历史的请求载荷
//  * @param getUserBrowsingHistoryWithFilterRequest 获取用户浏览历史的请求载荷
//  * @returns 合法返回 true, 不合法返回 false
//  */
// const checkGetUserBrowsingHistoryWithFilterRequest = (getUserBrowsingHistoryWithFilterRequest: GetUserBrowsingHistoryWithFilterRequestDto): boolean => {
// 	if (getUserBrowsingHistoryWithFilterRequest.videoTitle && getUserBrowsingHistoryWithFilterRequest.videoTitle.length > 200) { // 视频标题过滤字段存在，且长度大于 200 视为不合法
// 		return false
// 	} else {
// 		return true
// 	}
// }
