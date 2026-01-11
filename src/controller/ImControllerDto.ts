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
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
	message: string
	/** 消息 ID */
	messageId?: string
	/** 会话 ID */
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
		/** 用户 UID */
		uid: number
		/** 用户名 */
		username?: string
		/** 用户昵称 */
		userNickname?: string
		/** 用户头像 */
		avatar?: string
	}
	/** 最后一条消息 */
	lastMessage?: {
		/** 消息 ID */
		messageId: string
		/** 消息类型 */
		messageType: IM_MESSAGE_TYPE
		/** 消息内容 */
		content: string
		/** 发送者 UUID */
		senderUuid: string
		/** 是否已撤回 */
		isRecalled: boolean
		/** 是否已删除（当前用户是否删除了这条消息） */
		isDeleted: boolean
		/** 创建时间 */
		createdDateTime: number
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
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
	message: string
	/** 会话列表 */
	conversations?: ConversationInfo[]
	/** 总数 */
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
	createdDateTime: number
	/** 创建者 UUID */
	createdBy: string
	/** 最后编辑时间 */
	editedDateTime: number
	/** 最后编辑者 UUID */
	editedBy: string
}

/**
 * 获取消息列表的请求响应
 */
export type GetMessageListResponseDto = {
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
	message: string
	/** 消息列表 */
	messages?: MessageInfo[]
	/** 总数 */
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
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
	message: string
	/** 已标记的消息数量 */
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
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
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
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
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
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
	message: string
}

/**
 * 获取未读消息总数的请求响应
 */
export type GetUnreadMessageCountResponseDto = {
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
	message: string
	/** 未读消息总数 */
	totalUnreadCount?: number
}

