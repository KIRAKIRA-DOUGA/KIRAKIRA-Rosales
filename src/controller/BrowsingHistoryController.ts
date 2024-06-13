import { createOrUpdateBrowsingHistoryService, getUserBrowsingHistoryWithFilterService } from '../service/BrowsingHistoryService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { CreateOrUpdateBrowsingHistoryRequestDto, GetUserBrowsingHistoryWithFilterRequestDto } from './BrowsingHistoryControllerDto.js'

/**
 * 更新或创建用户浏览历史
 * @param ctx context
 * @param next context
 */
export const createOrUpdateUserBrowsingHistoryController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateOrUpdateBrowsingHistoryRequestDto>
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const createOrUpdateBrowsingHistoryRequest: CreateOrUpdateBrowsingHistoryRequestDto = {
		/** 用户的 UID - 非空 */
		uid: data.uid,
		/** 浏览的内容的类型，比如说 video, photo 等 - 非空 */
		type: data.type,
		/** 浏览的内容的唯一 ID - 非空 */
		id: data.id,
		/** 浏览的定位锚点，如果是视频就是播放时间，如果是相册可能是上次浏览到相册第n张图片，为了兼容性使用 String */
		anchor: data.anchor ?? null,
	}
	const createBrowsingHistoryResponse = await createOrUpdateBrowsingHistoryService(createOrUpdateBrowsingHistoryRequest, uid, token)
	ctx.body = createBrowsingHistoryResponse
	await next()
}

/**
 * 获取全部或过滤后的用户浏览历史，按对某一内容的最后访问时间降序排序
 * @param ctx context
 * @param next context
 */
export const getUserBrowsingHistoryWithFilterController = async (ctx: koaCtx, next: koaNext) => {
	const videoTitle = ctx.query.videoTitle as string
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const getUserBrowsingHistoryWithFilterRequest: GetUserBrowsingHistoryWithFilterRequestDto = {
		/** 过滤条件 - 视频标题 */
		videoTitle,
	}
	const getUserBrowsingHistoryWithFilterResponse = await getUserBrowsingHistoryWithFilterService(getUserBrowsingHistoryWithFilterRequest, uid, token)
	ctx.body = getUserBrowsingHistoryWithFilterResponse
	await next()
}

