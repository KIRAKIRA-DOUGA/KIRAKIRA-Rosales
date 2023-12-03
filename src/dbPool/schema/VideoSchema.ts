/**
 * 分P 视频的数据
 */
const videoPartSchema = {
	/** 非空 - 唯一 - 分P 视频的顺序 */
	id: { type: Number, required: true },
	/** 非空 - 唯一 - 每 P 视频的标题 */
	videoPartTitle: { type: String, required: true },
	/** 非空 - 唯一 - 每 P 视频的链接 */
	link: { type: String, required: true },
	/** 非空 - 系统专用字段-最后编辑时间 */
	editDateTime: { type: Number, required: true },
}

/**
 * 视频数据
 */
const VideoSchema = {
	/** MongoDB Schema */
	schema: {
		/** 非空 - 唯一 - KVID 视频 ID */
		videoId: { type: Number, unique: true, required: true },
		/** 非空 - 视频标题 */
		title: { type: String, required: true },
		/** 非空 - 分 P 视频的数据 */
		videoPart: { type: [videoPartSchema], required: true },
		/** 非空 - 封面图链接 */
		image: { type: String, required: true },
		/** 非空 - 视频上传的日期，时间戳格式 */
		updateDate: { type: Number, required: true },
		/** 非空 - 视频播放量 */
		watchedCount: { type: Number, required: true },
		/** 非空 - 视频作者 ID */
		uploader: { type: String, required: true },
		/** 非空 - 创作者 UID */
		uploaderId: { type: Number, required: true },
		/** 非空 - 视频时长，单位 ms */
		duration: { type: Number, required: true },
		/** 视频描述 */
		description: String,
		/** 非空 - 系统专用字段-最后编辑时间 */
		editDateTime: { type: Number, required: true },
	},
	/** MongoDB 集合名 */
	collectionName: 'video',
}

export default VideoSchema
