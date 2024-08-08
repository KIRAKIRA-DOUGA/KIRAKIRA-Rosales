import { createVideoTagService, getVideoTagByTagIdService, searchVideoTagService } from '../service/VideoTagService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { CreateVideoTagRequestDto, GetVideoTagByTagIdRequestDto, SearchVideoTagRequestDto } from './VideoTagControllerDto.js'

/**
 * 用户创建视频 TAG
 * @param ctx context
 * @param next context
 */
export const createVideoTagController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateVideoTagRequestDto>
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const createVideoTagRequest: CreateVideoTagRequestDto = {
		/** 不同语言所对应的 TAG 名 */
		tagNameList: data.tagNameList,
	}
	const createVideoTagResponse = await createVideoTagService(createVideoTagRequest, uid, token)
	ctx.body = createVideoTagResponse
	await next()
}


/**
 * 根据 TAG 名在数据库中搜索视频 TAG
 * @param ctx context
 * @param next context
 */
export const searchVideoTagController = async (ctx: koaCtx, next: koaNext) => {
	const tagNameSearchKey = ctx.query.tagName as string
	const searchVideoTagRequest: SearchVideoTagRequestDto = {
		/** 搜索 TAG 的关键词 */
		tagNameSearchKey,
	}
	const searchVideoTagResponse = await searchVideoTagService(searchVideoTagRequest)
	ctx.body = searchVideoTagResponse
	await next()
}


/**
 * 根据 TAG ID 在数据库中匹配视频 TAG
 * @param ctx context
 * @param next context
 */
export const getVideoTagByTagIdController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<GetVideoTagByTagIdRequestDto>
	const getVideoTagByTagIdRequest: GetVideoTagByTagIdRequestDto = {
		tagId: data.tagId ?? [],
	}
	const getVideoTagByTagIdResponse = await getVideoTagByTagIdService(getVideoTagByTagIdRequest)
	ctx.body = getVideoTagByTagIdResponse
	await next()
}
