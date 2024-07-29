import { createFavoritesService, getFavoritesService } from '../service/FavoritesService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { CreateFavoritesRequestDto } from './FavoritesControllerDto.js'

/**
 * 创建收藏夹
 * @param ctx context
 * @param next context
 */
export const createFavoritesController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateFavoritesRequestDto>
	const uid = parseInt(ctx.cookies.get('uid'), 10)
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
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const getFavoritesResponse = await getFavoritesService(uid, token)
	ctx.body = getFavoritesResponse
	await next()
}
