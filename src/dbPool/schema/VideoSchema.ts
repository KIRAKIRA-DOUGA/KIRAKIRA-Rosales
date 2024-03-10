import { Schema } from 'mongoose'

/**
 * 分P 视频的数据
 */
const VideoPartSchema = {
	/** 分P 视频的顺序 - 非空 */
	id: { type: Number, required: true },
	/** 每 P 视频的标题 - 非空 */
	videoPartTitle: { type: String, required: true },
	/** 每 P 视频的链接 - 非空 */
	link: { type: String, required: true },
	/** 系统专用字段-最后编辑时间 - 非空 */
	editDateTime: { type: Number, required: true },
}

/**
 * 视频 TAG 的数据
 */
const VideoTagSchema = {
	/** 视频的 TAG ID - 非空 */
	tagId: { type: Number, required: true },
	/** 视频 TAG 的名称 - 非空 */
	tag: { type: String, required: true },
	/** TAG 描述 */
	description: String,
	/** 系统专用字段-最后编辑时间 - 非空 */
	editDateTime: { type: Number, required: true },
}

/**
 * 视频数据
 */
class VideoSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** KVID 视频 ID - 非空 - 唯一 */
		videoId: { type: Number, unique: true, required: true },
		/** 视频标题 - 非空 */
		title: { type: String, required: true },
		/** 分 P 视频的数据 - 非空 */
		videoPart: { type: [VideoPartSchema], required: true },
		/** 封面图链接 - 非空 */
		image: { type: String, required: true },
		/** 视频上传的日期，时间戳格式 - 非空 */
		uploadDate: { type: Number, required: true },
		/** 视频播放量 - 非空 */
		watchedCount: { type: Number, required: true },
		/** 视频作者 - 非空 */
		uploader: { type: String, required: true },
		/** 创作者 UID - 非空 */
		uploaderId: { type: Number, required: true },
		/** 视频时长，单位 ms - 非空 */
		duration: { type: Number, required: true },
		/** 视频描述 */
		description: String,
		/** 视频分区 - 非空 */
		videoCategory: { type: String, required: true },
		/** 视频版权 - 非空 */
		copyright: { type: String, required: true },
		/** 视频 TAG - 非空 */
		videoTags: { type: [VideoTagSchema], required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}

export const VideoSchema = new VideoSchemaFactory()
