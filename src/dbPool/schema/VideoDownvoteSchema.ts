import { Schema } from 'mongoose'

/**
 * 视频点踩数据
 */
export class VideoDownvoteSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** KVID 视频 ID - 非空 */
		videoId: { type: Number, required: true, index: true },
		/** 点踩用户的 UUID，关联用户安全集合的 UUID - 非空 */
		UUID: { type: String, required: true, index: true },
		/** 点踩用户的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 点踩时间 - 非空 */
		downvoteTime: { type: Number, required: true },
		/** 点踩无效化标识（用户取消点踩） */
		invalidFlag: { type: Boolean, required: true, default: false },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-downvote'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)

	// 构造器
	constructor() {
		// 添加视频ID和用户UUID的组合唯一索引，防止重复点踩
		this.schemaInstance.index({ videoId: 1, UUID: 1 }, { unique: true });
	}
}

export const VideoDownvoteSchema = new VideoDownvoteSchemaFactory()