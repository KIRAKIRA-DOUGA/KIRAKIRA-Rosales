import { createFavoritesService, getFavoritesService, getFavoritesByUidService, addToFavoritesService, removeFromFavoritesService, getFavoritesDetailService, updateFavoritesService, deleteFavoritesService, reorderFavoritesDetailService, addEditorToFavoritesService, removeEditorFromFavoritesService } from '../service/FavoritesService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { parseInteger } from '../common/ValidTool.js'
import { CreateFavoritesRequestDto, GetFavoritesByUidRequestDto, AddToFavoritesRequestDto, RemoveFromFavoritesRequestDto, GetFavoritesDetailRequestDto, UpdateFavoritesRequestDto, DeleteFavoritesRequestDto, ReorderFavoritesDetailRequestDto, AddEditorToFavoritesRequestDto, RemoveEditorFromFavoritesRequestDto } from './FavoritesControllerDto.js'

/**
 * 创建收藏夹
 * @param ctx context
 * @param next context
 */
export const createFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateFavoritesRequestDto>
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')
	const createFavoritesRequest: CreateFavoritesRequestDto = {
		/** 收藏夹标题 - 非空 */
		favoritesTitle: data?.favoritesTitle ?? '',
		/** 收藏夹简介 */
		favoritesBio: data.favoritesBio,
		/** 收藏夹封面 */
		favoritesCover: data.favoritesCover,
		/** 收藏夹可见性，默认 -1（私有） */
		favoritesVisibility: data.favoritesVisibility ?? -1,
	}
	const createFavoritesResponse = await createFavoritesService(createFavoritesRequest, uid, token)
	ctx.body = createFavoritesResponse
	await next()
}

/**
 * 获取当前登录用户的收藏夹列表
 * @param ctx context
 * @param next context
 */
export const getFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInteger(ctx.cookies.get('uid'))
	const token = ctx.cookies.get('token')
	const getFavoritesResponse = await getFavoritesService(uid, token)
	ctx.body = getFavoritesResponse
	await next()
}

/**
 * 获取指定用户的收藏夹列表（需要验证用户整体可见性设置）
 * @param ctx context
 * @param next context
 */
export const getFavoritesByUidController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInteger(ctx.query.uid as string)
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	if (!uid || uid < 1) {
		ctx.body = { success: false, message: '参数不合法：uid 无效' }
		return
	}
	const getFavoritesByUidRequest: GetFavoritesByUidRequestDto = {
		uid,
	}
	const getFavoritesByUidResponse = await getFavoritesByUidService(getFavoritesByUidRequest, uuid, token)
	ctx.body = getFavoritesByUidResponse
	await next()
}

/**
 * 添加内容到收藏夹
 * @param ctx context
 * @param next context
 */
export const addToFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<AddToFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const addToFavoritesRequest: AddToFavoritesRequestDto = {
		favoritesListId: data.favoritesListId ?? -1,
		category: data.category ?? 'video',
		id: data.id ?? '',
	}
	const addToFavoritesResponse = await addToFavoritesService(addToFavoritesRequest, uuid, token)
	ctx.body = addToFavoritesResponse
	await next()
}

/**
 * 从收藏夹移除内容
 * @param ctx context
 * @param next context
 */
export const removeFromFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<RemoveFromFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const removeFromFavoritesRequest: RemoveFromFavoritesRequestDto = {
		favoritesListId: data.favoritesListId ?? -1,
		category: data.category ?? 'video',
		id: data.id ?? '',
	}
	const removeFromFavoritesResponse = await removeFromFavoritesService(removeFromFavoritesRequest, uuid, token)
	ctx.body = removeFromFavoritesResponse
	await next()
}

/**
 * 获取收藏夹内容列表
 * @param ctx context
 * @param next context
 */
export const getFavoritesDetailController = async (ctx: koaCtx, next: koaNext) => {
	const favoritesListId = parseInteger(ctx.query.favoritesListId as string)
	const sortOrder = parseInteger(ctx.query.sortOrder as string) as 1 | -1 | undefined
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const getFavoritesDetailRequest: GetFavoritesDetailRequestDto = {
		favoritesListId: favoritesListId ?? -1,
		sortOrder: sortOrder === 1 || sortOrder === -1 ? sortOrder : 1,
	}
	const getFavoritesDetailResponse = await getFavoritesDetailService(getFavoritesDetailRequest, uuid, token)
	ctx.body = getFavoritesDetailResponse
	await next()
}

/**
 * 更新收藏夹信息
 * @param ctx context
 * @param next context
 */
export const updateFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UpdateFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const updateFavoritesRequest: UpdateFavoritesRequestDto = {
		favoritesId: data.favoritesId ?? -1,
		favoritesTitle: data.favoritesTitle,
		favoritesBio: data.favoritesBio,
		favoritesCover: data.favoritesCover,
		favoritesVisibility: data.favoritesVisibility,
	}
	const updateFavoritesResponse = await updateFavoritesService(updateFavoritesRequest, uuid, token)
	ctx.body = updateFavoritesResponse
	await next()
}

/**
 * 删除收藏夹
 * @param ctx context
 * @param next context
 */
export const deleteFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<DeleteFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const deleteFavoritesRequest: DeleteFavoritesRequestDto = {
		favoritesId: data.favoritesId ?? -1,
	}
	const deleteFavoritesResponse = await deleteFavoritesService(deleteFavoritesRequest, uuid, token)
	ctx.body = deleteFavoritesResponse
	await next()
}

/**
 * 调整收藏夹内部排序
 * @param ctx context
 * @param next context
 */
export const reorderFavoritesDetailController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<ReorderFavoritesDetailRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const reorderFavoritesDetailRequest: ReorderFavoritesDetailRequestDto = {
		favoritesListId: data.favoritesListId ?? -1,
		items: data.items ?? [],
	}
	const reorderFavoritesDetailResponse = await reorderFavoritesDetailService(reorderFavoritesDetailRequest, uuid, token)
	ctx.body = reorderFavoritesDetailResponse
	await next()
}

/**
 * 添加维护者到收藏夹
 * @param ctx context
 * @param next context
 */
export const addEditorToFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<AddEditorToFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const addEditorToFavoritesRequest: AddEditorToFavoritesRequestDto = {
		favoritesId: data.favoritesId ?? -1,
		editorUid: data.editorUid ?? -1,
	}
	const addEditorToFavoritesResponse = await addEditorToFavoritesService(addEditorToFavoritesRequest, uuid, token)
	ctx.body = addEditorToFavoritesResponse
	await next()
}

/**
 * 移除收藏夹维护者
 * @param ctx context
 * @param next context
 */
export const removeEditorFromFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<RemoveEditorFromFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const removeEditorFromFavoritesRequest: RemoveEditorFromFavoritesRequestDto = {
		favoritesId: data.favoritesId ?? -1,
		editorUid: data.editorUid ?? -1,
	}
	const removeEditorFromFavoritesResponse = await removeEditorFromFavoritesService(removeEditorFromFavoritesRequest, uuid, token)
	ctx.body = removeEditorFromFavoritesResponse
	await next()
}
