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
	/** 发送成功时返回的消息与会话信息 */
	result?: {
		/** 消息 ID */
		messageId: string
		/** 会话 ID */
		conversationId: string
	}
}

/** 会话列表关注关系筛选 */
export type ConversationFilter =
	| 'following' // 我关注的
	| 'notFollowing' // 我未关注的
	| 'follower' // 关注我的
	| 'notFollower' // 未关注我的
	| 'followingAndFollower' // 我关注的且关注我的
	| 'followingAndNotFollower' // 我关注的且未关注我的
	| 'notFollowingAndFollower' // 我未关注的且关注我的
	| 'notFollowingAndNotFollower' // 我未关注的且未关注我的

/** 合法的 conversationFilter 取值 */
export const CONVERSATION_FILTER_VALUES: readonly ConversationFilter[] = [
	'following',
	'notFollowing',
	'follower',
	'notFollower',
	'followingAndFollower',
	'followingAndNotFollower',
	'notFollowingAndFollower',
	'notFollowingAndNotFollower',
]

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
	/** 按关注关系筛选会话（不传=不过滤） */
	conversationFilter?: ConversationFilter
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
		/** 发送者 UID */
		senderUid: number
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
	result?: ConversationInfo[]
	/** 总数 */
	totalCount?: number
}

/**
 * 获取消息列表的请求载荷
 */
export type GetMessageListRequestDto = {
	/** 会话ID */
	conversationId: string
	/** 从哪一条消息往上翻（传入当前列表中“最旧”那条 messageId；服务端内部以 createdDateTime + messageId 复合游标翻页） */
	cursorMessageId?: string
	/** 分页信息 */
	pagination: {
		/** 当前在第几页（IM 场景中建议固定传 1，由 cursorMessageId 控制翻页） */
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
	/** 发送者 UID */
	senderUid: number
	/** 接收者 UID */
	receiverUid: number
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
	/** 创建者 UID */
	createdByUid: number
	/** 最后编辑时间 */
	editedDateTime: number
	/** 最后编辑者 UID */
	editedByUid: number
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
	result?: MessageInfo[]
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
	result?: {
		markedCount: number
	}
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
	result?: {
		totalUnreadCount: number
	}
}

/**
 * 获取 IM 图片上传预签名 URL 的请求响应
 */
export type GetImImageUploadSignedUrlResponseDto = {
	/** 执行结果 */
	success: boolean
	/** 文本消息 */
	message: string
	/** 预签名 URL 与文件名 */
	result?: {
		/** Cloudflare Images 图片 ID（文件名） */
		fileName: string
		/** 用于直传 Cloudflare Images 的预签名 URL */
		signedUrl: string
	}
}
