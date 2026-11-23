import { Schema } from 'mongoose'

/**
 * 父评论中保存的子评论路由、点赞数和楼层
 */
const VideoSubCommentIdSchema = {
	/** 评论的路由 - 非空 */ /** 如：1.2.3（第一号视频的第二个评论的第三个子回复） */
	commentRoute: { type: String, required: true },
	/** 子评论点赞数 - 非空 */
	upvoteCount: { type: String, default: 0, required: true },
	/** 评论楼层数 - 非空 */
	commentIndex: { type: Number, required: true },
}

// /**
//  * 视频的子评论，不止是一级子评论
//  */
// export const VideoSubCommentSchema = {
// 	/** MongoDB Schema */
// 	schema: {
// 		/** 评论的路由 - 非空 */ /** 如：1.2.3（第一号视频的第二个评论的第三个子回复） */
// 		commentRoute: { type: String, required: true },
// 		/** 父评论 ID */
// 		parentCommentsId: { type: String, required: true },
// 		/** KVID 视频 ID - 非空 */
// 		videoId: { type: Number, required: true },
// 		/** 评论发送者的用户的 UID - 非空 */
// 		uid: { type: Number, required: true },
// 		/** 发送评论的时间 - 非空 */
// 		time: { type: Number, required: true },
// 		/** 评论正文 - 非空 */
// 		text: { type: String, required: true },
// 		/** 评论点赞数 - 非空 */ /** 默认：0 —— 没人点赞 ＞﹏＜ */
// 		upvoteCount: { type: Number, default: 0, required: true },
// 		/** 评论点踩数 - 非空 */ /** 默认：0 —— 没有反对票！ */
// 		downvote: { type: Number, default: 0, required: true },
// 		/** 评论楼层数 - 非空 */
// 		commentIndex: { type: Number, required: true },
// 		/** 子评论 */
// 		subComments: [VideoSubCommentIdSchema],
// 		/** 该评论的下一级子评论数量 */
// 		subCommentsCount: { type: Number, required: true },
// 		/** 系统专用字段-最后编辑时间 - 非空 */
// 		editDateTime: { type: Number, required: true },
// 	},
// 	/** MongoDB 集合名 */
// 	collectionName: 'video-sub-comment',
// }

/**
 * 视频评论数据
 */
class VideoCommentSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 评论的业务唯一标识，例如 `1.2.3` 表示 1 号视频第 2 条评论的第 3 条回复 - 非空 */
		commentRoute: { type: String, required: true, unique: true },
		/** KVID 视频 ID - 非空 */
		videoId: { type: Number, required: true },
		/** 评论发送者的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 评论发送者的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 发送评论的时间 - 非空 */
		emitTime: { type: Number, required: true },
		/** 评论正文 - 非空 */
		text: { type: String, required: true },
		/** 评论点赞数 - 非空 */ /** 默认：0 —— 没人点赞 ＞﹏＜ */
		upvoteCount: { type: Number, default: 0, required: true },
		/** 评论点踩数 - 非空 */ /** 默认：0 —— 没有反对票！ */
		downvoteCount: { type: Number, default: 0, required: true },
		/** 增减或修正赞踩计数时加 1，防止旧统计覆盖已更新的数量。 */
		voteRevision: { type: Number },
		/** 评论楼层数 - 非空 */
		commentIndex: { type: Number, required: true },
		/** 子评论 */
		subComments: [VideoSubCommentIdSchema],
		/** 该评论的下一级子评论数量 */
		subCommentsCount: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-comment'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const VideoCommentSchema = new VideoCommentSchemaFactory()

/**
 * 已删除的视频评论，保留原评论的 `commentRoute` 并记录删除操作人。
 */
class RemovedVideoCommentSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 原来的视频评论数据集合 */
		...VideoCommentSchema.schema,
		/** 操作者 UUID - 非空 */
		_operatorUUID_: { type: String, required: true },
		/** 操作者 UID - 非空 */
		_operatorUid_: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'removed-video-comment'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const RemovedVideoCommentSchema = new RemovedVideoCommentSchemaFactory()

/**
 * 用户对视频评论的点赞或点踩记录，取消当前状态时删除。
 */
class VideoCommentVoteSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 被点赞或点踩的评论的业务唯一标识，例如 `13.2` - 非空 */
		commentRoute: { type: String, required: true },
		/** 点赞或点踩用户的 UID，与 `commentRoute` 共同唯一标识这条记录 - 非空 */
		uid: { type: Number, required: true },
		/** 点赞或点踩用户的 UUID，供评论列表查询该用户的赞踩状态 - 非空 */
		UUID: { type: String, required: true },
		/** 当前状态，`upvote` 表示点赞，`downvote` 表示点踩 - 非空 */
		direction: { type: String, enum: ['upvote', 'downvote'], required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-comment-route-votes'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema, { collection: this.collectionName })
		.index({ commentRoute: 1, uid: 1 }, { unique: true })
		.index({ commentRoute: 1, direction: 1 })
		.index({ UUID: 1, commentRoute: 1 })
}
export const VideoCommentVoteSchema = new VideoCommentVoteSchemaFactory()
