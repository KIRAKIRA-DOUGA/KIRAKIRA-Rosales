import { limitPageSize, parseInteger } from '../common/ValidTool.js'
import { isPassRbacCheck } from '../service/RbacService.js'
import {
	getUnreadUpvoteNotificationCountService,
	getUpvoteNotificationListService,
	markAllUpvoteNotificationReadService,
	markUpvoteNotificationReadByIdsService,
} from '../service/UpvoteNotificationService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import {
	GetUnreadUpvoteNotificationCountRequestDto,
	GetUpvoteNotificationListRequestDto,
	MarkAllUpvoteNotificationReadRequestDto,
	MarkUpvoteNotificationReadByIdsRequestDto,
	UpvoteNotificationCategory,
} from './UpvoteNotificationControllerDto.js'

const parseCategory = (value: unknown): UpvoteNotificationCategory | undefined => {
	if (value === 'video' || value === 'video_comment') {
		return value
	}
	return undefined
}

/**
 * 获取点赞通知列表（未读或已读）
 */
export const getUpvoteNotificationListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const isReadRaw = ctx.query.isRead as string | undefined
	const category = parseCategory(ctx.query.category)
	const page = parseInteger(ctx.query.page as string) ?? 1
	const pageSize = limitPageSize((ctx.query.pageSize as string) || '20')

	let isRead: boolean | undefined
	if (isReadRaw === undefined || isReadRaw === '') {
		isRead = undefined
	} else if (isReadRaw === 'true' || isReadRaw === '1') {
		isRead = true
	} else if (isReadRaw === 'false' || isReadRaw === '0') {
		isRead = false
	} else {
		ctx.body = { success: false, message: '获取点赞通知列表失败，isRead 参数不合法' }
		await next()
		return
	}

	const request: GetUpvoteNotificationListRequestDto = {
		...(isRead !== undefined ? { isRead } : {}),
		...(category ? { category } : {}),
		pagination: { page, pageSize },
	}

	ctx.body = await getUpvoteNotificationListService(request, uuid, token)
	await next()
}

/**
 * 获取未读点赞通知数
 */
export const getUnreadUpvoteNotificationCountController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const category = parseCategory(ctx.query.category)
	const request: GetUnreadUpvoteNotificationCountRequestDto = {
		...(category ? { category } : {}),
	}

	ctx.body = await getUnreadUpvoteNotificationCountService(request, uuid, token)
	await next()
}

/**
 * 按通知编号标记已读
 */
export const markUpvoteNotificationReadByIdsController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<MarkUpvoteNotificationReadByIdsRequestDto>
	const request: MarkUpvoteNotificationReadByIdsRequestDto = {
		notificationIds: Array.isArray(data.notificationIds) ? data.notificationIds.map(String) : [],
	}

	ctx.body = await markUpvoteNotificationReadByIdsService(request, uuid, token)
	await next()
}

/**
 * 全部已读
 */
export const markAllUpvoteNotificationReadController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<MarkAllUpvoteNotificationReadRequestDto>
	const category = parseCategory(data.category)
	const request: MarkAllUpvoteNotificationReadRequestDto = {
		...(category ? { category } : {}),
	}

	ctx.body = await markAllUpvoteNotificationReadService(request, uuid, token)
	await next()
}
