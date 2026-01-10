import { Schema } from 'mongoose'

/**
 * IM消息类型枚举
 */
export enum IM_MESSAGE_TYPE {
	/** 文本消息 */
	text = 'text',
	/** 图片消息（预留） */
	image = 'image',
	/** 文件消息（预留） */
	file = 'file',
}

/**
 * IM会话表
 * 存储两个用户之间的会话信息
 */
class ImConversationSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 会话ID - 非空 - 唯一 */
		conversationId: { type: String, required: true, unique: true },
		/** 用户1的UUID - 非空 */
		user1Uuid: { type: String, required: true },
		/** 用户2的UUID - 非空 */
		user2Uuid: { type: String, required: true },
		/** 最后一条消息的ID */
		lastMessageId: { type: String },
		/** 最后一条消息的时间 */
		lastMessageTime: { type: Number },
		/** 用户1的未读消息数 - 非空 */
		user1UnreadCount: { type: Number, required: true, default: 0 },
		/** 用户2的未读消息数 - 非空 */
		user2UnreadCount: { type: Number, required: true, default: 0 },
		/** 用户1是否已删除会话 - 非空 */
		user1Deleted: { type: Boolean, required: true, default: false },
		/** 用户1删除会话的时间 */
		user1DeletedTime: { type: Number },
		/** 用户2是否已删除会话 - 非空 */
		user2Deleted: { type: Boolean, required: true, default: false },
		/** 用户2删除会话的时间 */
		user2DeletedTime: { type: Number },
		/** 系统专用字段-创建时间 - 非空 */
		createdDateTime: { type: Number, required: true },
		/** 系统专用字段-创建者 - 非空 */
		createdBy: { type: String, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editedDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑者 - 非空 */
		editedBy: { type: String, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'im-conversation'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
	
	constructor() {
		// 添加复合索引：确保两个用户之间只有一个会话
		this.schemaInstance.index({ user1Uuid: 1, user2Uuid: 1 }, { unique: true })
		// 添加索引：用于查询用户的会话列表
		this.schemaInstance.index({ user1Uuid: 1, editedDateTime: -1 })
		this.schemaInstance.index({ user2Uuid: 1, editedDateTime: -1 })
	}
}
export const ImConversationSchema = new ImConversationSchemaFactory()

/**
 * IM消息表
 * 存储具体的消息内容
 */
class ImMessageSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 消息ID - 非空 - 唯一 */
		messageId: { type: String, required: true, unique: true },
		/** 会话ID - 非空 */
		conversationId: { type: String, required: true },
		/** 发送者UUID - 非空 */
		senderUuid: { type: String, required: true },
		/** 接收者UUID - 非空 */
		receiverUuid: { type: String, required: true },
		/** 消息类型 - 非空 */
		messageType: { type: String, enum: Object.values(IM_MESSAGE_TYPE), required: true },
		/** 消息内容（文本消息时存储文本，其他类型存储文件URL等） - 非空 */
		content: { type: String, required: true },
		/** 是否已读 - 非空 */
		isRead: { type: Boolean, required: true, default: false },
		/** 已读时间 */
		readTime: { type: Number },
		/** 发送者是否已删除 - 非空 */
		senderDeleted: { type: Boolean, required: true, default: false },
		/** 接收者是否已删除 - 非空 */
		receiverDeleted: { type: Boolean, required: true, default: false },
		/** 是否已撤回 - 非空 */
		isRecalled: { type: Boolean, required: true, default: false },
		/** 撤回时间 */
		recalledTime: { type: Number },
		/** 系统专用字段-创建时间 - 非空 */
		createdDateTime: { type: Number, required: true },
		/** 系统专用字段-创建者 - 非空 */
		createdBy: { type: String, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editedDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑者 - 非空 */
		editedBy: { type: String, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'im-message'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
	
	constructor() {
		// 添加索引：用于查询会话的消息列表
		this.schemaInstance.index({ conversationId: 1, createdDateTime: -1 })
		// 添加索引：用于查询用户的未读消息
		this.schemaInstance.index({ receiverUuid: 1, isRead: 1, createdDateTime: -1 })
	}
}
export const ImMessageSchema = new ImMessageSchemaFactory()

