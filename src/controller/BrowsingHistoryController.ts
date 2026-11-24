import { createOrUpdateBrowsingHistoryService, getUserBrowsingHistoryWithFilterService } from '../service/BrowsingHistoryService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { CreateOrUpdateBrowsingHistoryRequestDto, GetUserBrowsingHistoryWithFilterRequestDto } from './BrowsingHistoryControllerDto.js'

/**
 * 更新或创建用户浏览历史
 * @param ctx Koa 请求上下文
 * @param next 后续中间件
 * @returns 写入响应并等待后续中间件完成
 */
export const createOrUpdateUserBrowsingHistoryController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateOrUpdateBrowsingHistoryRequestDto>
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const createOrUpdateBrowsingHistoryRequest: CreateOrUpdateBrowsingHistoryRequestDto = {
		category: data.category,
		id: data.id,
		anchor: data.anchor ?? null,
	}
	const createBrowsingHistoryResponse = await createOrUpdateBrowsingHistoryService(createOrUpdateBrowsingHistoryRequest, uuid, token)
	ctx.body = createBrowsingHistoryResponse
	await next()
}

/**
 * 获取全部或过滤后的用户浏览历史，按对某一内容的最后访问时间降序排序
 * @param ctx Koa 请求上下文
 * @param next 后续中间件
 * @returns 写入响应并等待后续中间件完成
 */
export const getUserBrowsingHistoryWithFilterController = async (ctx: koaCtx, next: koaNext) => {
	const videoTitle = ctx.query.videoTitle as string
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const getUserBrowsingHistoryWithFilterRequest: GetUserBrowsingHistoryWithFilterRequestDto = {
		videoTitle,
	}
	const getUserBrowsingHistoryWithFilterResponse = await getUserBrowsingHistoryWithFilterService(getUserBrowsingHistoryWithFilterRequest, uuid, token)
	ctx.body = getUserBrowsingHistoryWithFilterResponse
	await next()
}
