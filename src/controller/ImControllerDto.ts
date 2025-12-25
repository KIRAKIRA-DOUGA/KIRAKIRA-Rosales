import { IM_MESSAGE_TYPE } from '../dbPool/schema/ImSchema.js'

/**
 * 发送消息请求DTO
 */
export type SendMessageRequestDto = {
	/** 接收者UID */
	receiverUid: number
	/** 消息类型 */
	messageType: IM_MESSAGE_TYPE
	/** 消息内容 */
	content: string
}

/**
 * 发送消息响应DTO
 */
export type SendMessageResponseDto = {
	success: boolean
	message: string
	messageId?: string
	conversationId?: string
}

/**
 * 获取会话列表请求DTO
 */
export type GetConversationListRequestDto = {
	/** 分页：页码 */
	page?: number
	/** 分页：每页数量 */
	pageSize?: number
}

/**
 * 会话信息
 */
export type ConversationInfo = {
	/** 会话ID */
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
 * 获取会话列表响应DTO
 */
export type GetConversationListResponseDto = {
	success: boolean
	message: string
	conversations?: ConversationInfo[]
	totalCount?: number
}

/**
 * 获取消息列表请求DTO
 */
export type GetMessageListRequestDto = {
	/** 会话ID */
	conversationId: string
	/** 分页：页码 */
	page?: number
	/** 分页：每页数量 */
	pageSize?: number
	/** 是否在获取后标记为已读 */
	markAsRead?: boolean
}

/**
 * 消息信息
 */
export type MessageInfo = {
	/** 消息ID */
	messageId: string
	/** 发送者UUID */
	senderUuid: string
	/** 接收者UUID */
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
 * 获取消息列表响应DTO
 */
export type GetMessageListResponseDto = {
	success: boolean
	message: string
	messages?: MessageInfo[]
	totalCount?: number
}

/**
 * 标记消息已读请求DTO
 */
export type MarkMessageReadRequestDto = {
	/** 会话ID */
	conversationId: string
	/** 消息ID列表（如果为空则标记该会话所有未读消息为已读） */
	messageIds?: string[]
}

/**
 * 标记消息已读响应DTO
 */
export type MarkMessageReadResponseDto = {
	success: boolean
	message: string
	markedCount?: number
}

/**
 * 删除会话请求DTO
 */
export type DeleteConversationRequestDto = {
	/** 会话ID */
	conversationId: string
}

/**
 * 删除会话响应DTO
 */
export type DeleteConversationResponseDto = {
	success: boolean
	message: string
}

/**
 * 删除消息请求DTO
 */
export type DeleteMessageRequestDto = {
	/** 消息ID */
	messageId: string
}

/**
 * 删除消息响应DTO
 */
export type DeleteMessageResponseDto = {
	success: boolean
	message: string
}

/**
 * 撤回消息请求DTO
 */
export type RecallMessageRequestDto = {
	/** 消息ID */
	messageId: string
}

/**
 * 撤回消息响应DTO
 */
export type RecallMessageResponseDto = {
	success: boolean
	message: string
}

/**
 * 获取未读消息总数请求DTO
 */
export type GetUnreadMessageCountRequestDto = {
	// 无需参数
}

/**
 * 获取未读消息总数响应DTO
 */
export type GetUnreadMessageCountResponseDto = {
	success: boolean
	message: string
	totalUnreadCount?: number
}

