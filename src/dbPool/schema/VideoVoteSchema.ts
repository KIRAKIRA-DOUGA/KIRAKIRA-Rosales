import { Schema } from 'mongoose'

/** 每个用户对一个视频只保留当前的点赞或点踩，取消后删除记录。 */
class VideoVoteSchemaFactory {
	schema = {
		videoId: { type: Number, required: true },
		UUID: { type: String, required: true },
		uid: { type: Number, required: true },
		direction: { type: String, enum: ['upvote', 'downvote'], required: true },
		editDateTime: { type: Number, required: true },
	}
	collectionName = 'video-votes'
	schemaInstance = new Schema(this.schema, { collection: this.collectionName })
		.index({ videoId: 1, UUID: 1 }, { unique: true })
		.index({ videoId: 1, direction: 1 })
}
export const VideoVoteSchema = new VideoVoteSchemaFactory()
