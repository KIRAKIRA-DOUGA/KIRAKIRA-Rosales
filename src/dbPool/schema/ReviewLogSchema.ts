import { Schema } from 'mongoose'

/**
 * 内容审核记录
 */
class ReviewLogSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 被审核内容所属用户 UUID - 非空 */
		ownerUUID: { type: String, required: true, index: true },
		/** 被审核内容所属用户 UID - 非空 */
		ownerUid: { type: Number, required: true, index: true },
		/** 审核人 UUID - 非空 */
		reviewerUUID: { type: String, required: true },
		/** 审核人 UID - 非空 */
		reviewerUid: { type: Number, required: true },
		/** 审核目标类型：video/comment/danmaku 等 - 非空 */
		targetType: { type: String, required: true, index: true },
		/** 审核目标 ID：视频为 videoId，评论为 commentRoute，弹幕为 danmakuId 等 - 非空 */
		targetId: { type: String, required: true },
		/** 审核动作：approve/reject - 非空 */
		action: { type: String, required: true },
		/** 审核备注/原因 - 非空，允许为空字符串 */
		reason: { type: String, required: true, default: '' },
		/** 额外信息（如视频标题快照等）- 可选 */
		extra: { type: Schema.Types.Mixed },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true, index: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}

	/** MongoDB 集合名 */
	collectionName = 'review-log'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}

export const ReviewLogSchema = new ReviewLogSchemaFactory()



