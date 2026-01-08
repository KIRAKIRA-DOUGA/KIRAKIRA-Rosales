import { IM_MESSAGE_TYPE } from '../dbPool/schema/ImSchema.js'

/**
 * 发送消息的请求载荷
 */
export type SendMessageRequestDto = {
	/** 接收者 UID */
	receiverUid: number
	/** 消息类型 */
	messageType: IM_MESSAGE_TYPE
	/** 消息内容 */
	content: string
}

/**
 * 发送消息的请求响应
 */
export type SendMessageResponseDto = {
	success: boolean
	message: string
	messageId?: string
	conversationId?: string
}

/**
 * 获取会话列表的请求载荷
 */
export type GetConversationListRequestDto = {
	/** 分页信息 */
	pagination: {
		/** 当前在第几页 */
		page: number
		/** 一页显示多少条 */
		pageSize: number
	}
}

/**
 * 会话信息
 */
export type ConversationInfo = {
	/** 会话 ID */
	conversationId: string
	/** 对方用户信息 */
	otherUser: {
		uid: number
		uuid: string
		username?: string
		userNickname?: string
		avatar?: string
	}
	/** 最后一条消息 */
	lastMessage?: {
		messageId: string
		messageType: IM_MESSAGE_TYPE
		content: string
		senderUuid: string
		createDateTime: number
	}
	/** 未读消息数 */
	unreadCount: number
	/** 最后消息时间 */
	lastMessageTime?: number
}

/**
 * 获取会话列表的请求响应
 */
export type GetConversationListResponseDto = {
	success: boolean
	message: string
	conversations?: ConversationInfo[]
	totalCount?: number
}

/**
 * 获取消息列表的请求载荷
 */
export type GetMessageListRequestDto = {
	/** 会话ID */
	conversationId: string
	/** 分页信息 */
	pagination: {
		/** 当前在第几页 */
		page: number
		/** 一页显示多少条 */
		pageSize: number
	}
	/** 是否在获取后标记为已读 */
	markAsRead?: boolean
}

/**
 * 消息信息
 */
export type MessageInfo = {
	/** 消息ID */
	messageId: string
	/** 发送者 UUID */
	senderUuid: string
	/** 接收者 UUID */
	receiverUuid: string
	/** 消息类型 */
	messageType: IM_MESSAGE_TYPE
	/** 消息内容 */
	content: string
	/** 是否已读 */
	isRead: boolean
	/** 已读时间 */
	readTime?: number
	/** 是否已撤回 */
	isRecalled: boolean
	/** 撤回时间 */
	recalledTime?: number
	/** 创建时间 */
	createDateTime: number
}

/**
 * 获取消息列表的请求响应
 */
export type GetMessageListResponseDto = {
	success: boolean
	message: string
	messages?: MessageInfo[]
	totalCount?: number
}

/**
 * 标记消息已读的请求载荷
 */
export type MarkMessageReadRequestDto = {
	/** 会话 ID */
	conversationId: string
	/** 消息 ID 列表（如果为空则标记该会话所有未读消息为已读） */
	messageIds?: string[]
}

/**
 * 标记消息已读的请求响应
 */
export type MarkMessageReadResponseDto = {
	success: boolean
	message: string
	markedCount?: number
}

/**
 * 删除会话的请求载荷
 */
export type DeleteConversationRequestDto = {
	/** 会话 ID */
	conversationId: string
}

/**
 * 删除会话的请求响应
 */
export type DeleteConversationResponseDto = {
	success: boolean
	message: string
}

/**
 * 删除消息的请求载荷
 */
export type DeleteMessageRequestDto = {
	/** 消息 ID */
	messageId: string
}

/**
 * 删除消息的请求响应
 */
export type DeleteMessageResponseDto = {
	success: boolean
	message: string
}

/**
 * 撤回消息的请求载荷
 */
export type RecallMessageRequestDto = {
	/** 消息 ID */
	messageId: string
}

/**
 * 撤回消息的请求响应
 */
export type RecallMessageResponseDto = {
	success: boolean
	message: string
}

/**
 * 获取未读消息总数的请求响应
 */
export type GetUnreadMessageCountResponseDto = {
	success: boolean
	message: string
	totalUnreadCount?: number
}

