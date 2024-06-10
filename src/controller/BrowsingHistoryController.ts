import { createBrowsingHistoryService } from '../service/BrowsingHistoryService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { CreateBrowsingHistoryRequestDto } from './BrowsingHistoryControllerDto.js'

/**
 * 创建用户浏览历史
 * @param ctx context
 * @param next context
 */
export const createUserBrowsingHistoryController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateBrowsingHistoryRequestDto>
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const createBrowsingHistoryRequest: CreateBrowsingHistoryRequestDto = {
		/** 用户的 UID - 非空 */
		uid: data.uid,
		/** 浏览的内容的类型，比如说 video, photo 等 - 非空 */
		type: data.type,
		/** 浏览的内容的唯一 ID - 非空 */
		id: data.id,
	}
	const createBrowsingHistoryResponse = await createBrowsingHistoryService(createBrowsingHistoryRequest, uid, token)
	ctx.body = createBrowsingHistoryResponse
	await next()
}

