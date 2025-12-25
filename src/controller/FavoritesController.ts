import { addToFavoritesService, createFavoritesService, deleteFavoritesService, getFavoritesDetailService, getFavoritesService, removeFromFavoritesService, reorderFavoritesDetailService, updateFavoritesService } from '../service/FavoritesService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { parseInteger } from '../common/ValidTool.js'
import { AddToFavoritesRequestDto, CreateFavoritesRequestDto, DeleteFavoritesRequestDto, GetFavoritesDetailRequestDto, RemoveFromFavoritesRequestDto, ReorderFavoritesDetailRequestDto, UpdateFavoritesRequestDto } from './FavoritesControllerDto.js'

/**
 * 创建收藏夹
 * @param ctx context
 * @param next context
 */
export const createFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
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
	const createFavoritesResponse = await createFavoritesService(createFavoritesRequest, uuid, token)
	ctx.body = createFavoritesResponse
	await next()
}

/**
 * 获取当前登录用户的收藏夹列表
 * @param ctx context
 * @param next context
 */
export const getFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	if (!uuid || !token) {
		ctx.body = { success: false, message: '参数不合法：缺少 uuid 或 token' }
		return
	}
	const getFavoritesResponse = await getFavoritesService(uuid, token)
	ctx.body = getFavoritesResponse
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
