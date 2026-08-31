import { createFavoritesService, getFavoritesService, getFavoritesByUidService, addToFavoritesService, removeFromFavoritesService, getFavoritesDetailService, updateFavoritesService, deleteFavoritesService, reorderFavoritesDetailService, addEditorToFavoritesService, removeEditorFromFavoritesService, getFavoritesCoverUploadSignedUrlService, checkFavoritesContentService } from '../service/FavoritesService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { limitPageSize, parseInteger } from '../common/ValidTool.js'
import { CreateFavoritesRequestDto, GetFavoritesByUidRequestDto, AddToFavoritesRequestDto, RemoveFromFavoritesRequestDto, GetFavoritesDetailRequestDto, UpdateFavoritesRequestDto, DeleteFavoritesRequestDto, ReorderFavoritesDetailRequestDto, AddEditorToFavoritesRequestDto, RemoveEditorFromFavoritesRequestDto, GetFavoritesCoverUploadSignedUrlRequestDto, CheckFavoritesContentRequestDto } from './FavoritesControllerDto.js'
import { BrowsingHistoryCategory } from './BrowsingHistoryControllerDto.js'

/**
 * 创建收藏夹
 * @param ctx context
 * @param next context
 */
export const createFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateFavoritesRequestDto>
	const uuid = ctx.cookies.get('uuid')
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
	const getFavoritesResponse = await getFavoritesService(uuid, token)
	ctx.body = getFavoritesResponse
	await next()
}

/**
 * 获取指定用户的收藏夹列表（公开收藏夹可匿名访问；私有/仅关注者需登录）
 * @param ctx context
 * @param next context
 */
export const getFavoritesByUidController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInteger(ctx.query.uid as string)
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
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
 * 获取收藏夹内容列表（公开收藏夹可匿名访问；私有/仅关注者需登录）
 * @param ctx context
 * @param next context
 */
export const getFavoritesDetailController = async (ctx: koaCtx, next: koaNext) => {
	const favoritesListId = parseInteger(ctx.query.favoritesListId as string)
	const category = ctx.query.category as BrowsingHistoryCategory | undefined
	const sortOrder = parseInteger(ctx.query.sortOrder as string) as 1 | -1 | undefined
	const page = ctx.query.page as string
	const pageSize = ctx.query.pageSize as string
	const finalPageSize = limitPageSize(pageSize)
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const getFavoritesDetailRequest: GetFavoritesDetailRequestDto = {
		favoritesListId: favoritesListId ?? -1,
		category: category || undefined,
		sortOrder: sortOrder === 1 || sortOrder === -1 ? sortOrder : 1,
		pagination: {
			page: parseInteger(page || '1') ?? 1,
			pageSize: finalPageSize ?? 50,
		},
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
	const removeEditorFromFavoritesRequest: RemoveEditorFromFavoritesRequestDto = {
		favoritesId: data.favoritesId ?? -1,
		editorUid: data.editorUid ?? -1,
	}
	const removeEditorFromFavoritesResponse = await removeEditorFromFavoritesService(removeEditorFromFavoritesRequest, uuid, token)
	ctx.body = removeEditorFromFavoritesResponse
	await next()
}

/**
 * 获取用于上传收藏夹封面图的预签名 URL
 * @param ctx context
 * @param next context
 * @returns 用于上传收藏夹封面图的预签名 URL 请求响应
 */
export const getFavoritesCoverUploadSignedUrlController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const favoritesId = parseInteger(ctx.query.favoritesId as string)
	const getFavoritesCoverUploadSignedUrlRequest: GetFavoritesCoverUploadSignedUrlRequestDto = {
		favoritesId: favoritesId ?? -1,
	}
	ctx.body = await getFavoritesCoverUploadSignedUrlService(getFavoritesCoverUploadSignedUrlRequest, uuid, token)
	await next()
}

/**
 * 检查当前用户是否已收藏某内容，以及收藏在哪些收藏夹中
 * @param ctx context
 * @param next context
 */
export const checkFavoritesContentController = async (ctx: koaCtx, next: koaNext) => {
	const category = ctx.query.category as BrowsingHistoryCategory
	const id = ctx.query.id as string
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const checkFavoritesContentRequest: CheckFavoritesContentRequestDto = {
		category,
		id: id ?? '',
	}
	ctx.body = await checkFavoritesContentService(checkFavoritesContentRequest, uuid, token)
	await next()
}
