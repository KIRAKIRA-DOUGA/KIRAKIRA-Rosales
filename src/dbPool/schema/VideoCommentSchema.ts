import { Schema } from 'mongoose'

/**
 * 在父评论或子评论中存储的子评论 ID
 */
const VideoSubCommentIdSchema = {
	/** 评论的路由 - 非空 */ /** 如：1.2.3（第一号视频的第二个评论的第三个子回复） */
	commentRoute: { type: String, required: true },
	/** 评论 ID - 非空 */
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
		/** 评论的路由 - 非空 - 唯一 */ /** 如：1.2.3（第一号视频的第二个评论的第三个子回复） */
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
 * 已删除的视频评论数据
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
 * 视频评论点赞
 */
class VideoCommentUpvoteSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** KVID 视频 ID - 非空 */
		videoId: { type: Number, required: true },
		/** 评论的ID - 非空 */
		commentId: { type: String, required: true },
		/** 评论点赞者的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 评论点赞者的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 评论点赞无效化标识（用户取消点赞） */
		invalidFlag: { type: Boolean, required: true },
		/** 系统专用字段-删除标识 - 非空 */
		deleteFlag: { type: Boolean, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-comment-upvote'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const VideoCommentUpvoteSchema = new VideoCommentUpvoteSchemaFactory()


/**
 * 视频评论点踩
 */
class VideoCommentDownvoteSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** KVID 视频 ID - 非空 */
		videoId: { type: Number, required: true },
		/** 评论的ID - 非空 */
		commentId: { type: String, required: true },
		/** 评论点踩者的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 评论点踩者的用户的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 评论点踩无效化标识（用户取消点踩） */
		invalidFlag: { type: Boolean, required: true },
		/** 系统专用字段-删除标识 - 非空 */
		deleteFlag: { type: Boolean, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-comment-downvote'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}

export const VideoCommentDownvoteSchema = new VideoCommentDownvoteSchemaFactory()
