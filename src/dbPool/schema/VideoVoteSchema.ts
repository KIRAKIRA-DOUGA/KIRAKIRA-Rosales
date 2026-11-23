import { Schema } from 'mongoose'

/**
 * 用户对视频的点赞或点踩记录，取消当前状态时删除。
 */
class VideoVoteSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 视频 ID（KVID） - 非空 */
		videoId: { type: Number, required: true },
		/** 点赞或点踩用户的 UUID，与 `videoId` 共同唯一标识这条记录 - 非空 */
		UUID: { type: String, required: true },
		/** 点赞或点踩用户的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 当前状态，`upvote` 表示点赞，`downvote` 表示点踩 - 非空 */
		direction: { type: String, enum: ['upvote', 'downvote'], required: true },
		/** 最近一次写入这条赞踩记录的时间戳（毫秒） - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-votes'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema, { collection: this.collectionName })
		.index({ videoId: 1, UUID: 1 }, { unique: true })
		.index({ videoId: 1, direction: 1 })
}
export const VideoVoteSchema = new VideoVoteSchemaFactory()
