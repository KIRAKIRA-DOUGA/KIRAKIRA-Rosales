import { Schema } from 'mongoose'

/**
 * 点赞通知数据（单表软删）
 * category: video = 视频点赞；video_comment = 视频评论点赞
 */
class UpvoteNotificationSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 通知接收者 UUID（作者 / 评论作者）- 非空 */
		receiverUuid: { type: String, required: true, index: true },
		/** 通知接收者 UID - 非空 */
		receiverUid: { type: Number, required: true },
		/** 点赞者 UUID - 非空 */
		likerUuid: { type: String, required: true, index: true },
		/** 点赞者 UID - 非空 */
		likerUid: { type: Number, required: true },
		/** 媒体性质 - 非空 - 如 video / video_comment */
		category: { type: String, required: true, index: true },
		/**
		 * 目标唯一编号 - 非空
		 * video: 字符串形式的 videoId；video_comment: commentId（MongoDB _id）
		 */
		targetId: { type: String, required: true },
		/** KVID 视频 ID - 非空（评论赞冗余，便于跳转） */
		videoId: { type: Number, required: true, index: true },
		/** 评论 ID（仅 video_comment） */
		commentId: { type: String },
		/** 是否已读 - 非空 - 一旦为 true 永久已读 */
		isRead: { type: Boolean, required: true, default: false, index: true },
		/** 软删标记（取消赞 / 内容删除级联）- 非空 */
		deletedFlag: { type: Boolean, required: true, default: false, index: true },
		/** 最近点赞生效时间 - 非空 */
		upvoteTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'upvote-notification'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)

	constructor() {
		// 同一接收者 + 点赞者 + 性质 + 目标 全局唯一一条
		this.schemaInstance.index(
			{ receiverUuid: 1, likerUuid: 1, category: 1, targetId: 1 },
			{ unique: true },
		)
		this.schemaInstance.index({ receiverUuid: 1, deletedFlag: 1, isRead: 1, upvoteTime: -1 })
	}
}
export const UpvoteNotificationSchema = new UpvoteNotificationSchemaFactory()
