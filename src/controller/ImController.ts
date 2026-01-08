import { koaCtx, koaNext } from '../type/koaTypes.js'
import { isPassRbacCheck } from '../service/RbacService.js'
import {
	sendMessageService,
	getConversationListService,
	getMessageListService,
	markMessageReadService,
	deleteConversationService,
	deleteMessageService,
	getUnreadMessageCountService,
	recallMessageService,
} from '../service/ImService.js'
import {
	SendMessageRequestDto,
	GetConversationListRequestDto,
	GetMessageListRequestDto,
	MarkMessageReadRequestDto,
	DeleteConversationRequestDto,
	DeleteMessageRequestDto,
	GetUnreadMessageCountRequestDto,
	RecallMessageRequestDto,
} from './ImControllerDto.js'
import { IM_MESSAGE_TYPE } from '../dbPool/schema/ImSchema.js'

/**
 * 发送消息
 */
export const sendMessageController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const data = ctx.request.body as Partial<SendMessageRequestDto>
	
	const sendMessageRequest: SendMessageRequestDto = {
		receiverUid: data.receiverUid ?? -1,
		messageType: data.messageType ?? IM_MESSAGE_TYPE.text,
		content: data.content ?? '',
	}
	
	const sendMessageResult = await sendMessageService(sendMessageRequest, uuid, token)
	ctx.body = sendMessageResult
	await next()
}

/**
 * 获取会话列表
 */
export const getConversationListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const getConversationListRequest: GetConversationListRequestDto = {
		page: ctx.query.page ? parseInt(ctx.query.page as string) : undefined,
		pageSize: ctx.query.pageSize ? parseInt(ctx.query.pageSize as string) : undefined,
	}
	
	const getConversationListResult = await getConversationListService(getConversationListRequest, uuid, token)
	ctx.body = getConversationListResult
	await next()
}

/**
 * 获取消息列表
 */
export const getMessageListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const getMessageListRequest: GetMessageListRequestDto = {
		conversationId: ctx.query.conversationId as string,
		page: ctx.query.page ? parseInt(ctx.query.page as string) : undefined,
		pageSize: ctx.query.pageSize ? parseInt(ctx.query.pageSize as string) : undefined,
		markAsRead: ctx.query.markAsRead === 'true',
	}
	
	const getMessageListResult = await getMessageListService(getMessageListRequest, uuid, token)
	ctx.body = getMessageListResult
	await next()
}

/**
 * 标记消息已读
 */
export const markMessageReadController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const data = ctx.request.body as Partial<MarkMessageReadRequestDto>
	
	const markMessageReadRequest: MarkMessageReadRequestDto = {
		conversationId: data.conversationId ?? '',
		messageIds: data.messageIds,
	}
	
	const markMessageReadResult = await markMessageReadService(markMessageReadRequest, uuid, token)
	ctx.body = markMessageReadResult
	await next()
}

/**
 * 删除会话
 */
export const deleteConversationController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const data = ctx.request.body as Partial<DeleteConversationRequestDto>
	
	const deleteConversationRequest: DeleteConversationRequestDto = {
		conversationId: data.conversationId ?? '',
	}
	
	const deleteConversationResult = await deleteConversationService(deleteConversationRequest, uuid, token)
	ctx.body = deleteConversationResult
	await next()
}

/**
 * 删除消息
 */
export const deleteMessageController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const data = ctx.request.body as Partial<DeleteMessageRequestDto>
	
	const deleteMessageRequest: DeleteMessageRequestDto = {
		messageId: data.messageId ?? '',
	}
	
	const deleteMessageResult = await deleteMessageService(deleteMessageRequest, uuid, token)
	ctx.body = deleteMessageResult
	await next()
}

/**
 * 获取未读消息总数
 */
export const getUnreadMessageCountController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const getUnreadMessageCountRequest: GetUnreadMessageCountRequestDto = {}
	
	const getUnreadMessageCountResult = await getUnreadMessageCountService(getUnreadMessageCountRequest, uuid, token)
	ctx.body = getUnreadMessageCountResult
	await next()
}

/**
 * 撤回消息
 */
export const recallMessageController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	
	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}
	
	const data = ctx.request.body as Partial<RecallMessageRequestDto>
	
	const recallMessageRequest: RecallMessageRequestDto = {
		messageId: data.messageId ?? '',
	}
	
	const recallMessageResult = await recallMessageService(recallMessageRequest, uuid, token)
	ctx.body = recallMessageResult
	await next()
}

