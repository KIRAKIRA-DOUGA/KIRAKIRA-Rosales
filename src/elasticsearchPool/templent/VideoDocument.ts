/**
 * 视频 TAG 的数据
 */
const VideoTagSchema = {
	/** 视频的 TAG ID - 非空 */
	tagId: { type: Number, required: true as const },
	/** 视频 TAG 的名称 - 非空 */
	tag: { type: String, required: true as const },
	/** TAG 描述 */
	description: { type: String },
	/** 系统专用字段-最后编辑时间 - 非空 */
	editDateTime: { type: Number, required: true as const },
}

/**
 * 视频数据
 */
export const VideoDocument = {
	/** Elasticsearch 索引模板 */
	schema: {
		/** 视频标题 - 非空 */
		title: { type: String, required: true as const },
		/** 视频描述 */
		description: { type: String, required: false as const },
		/** 视频作者 - 非空 */
		uploader: { type: String, required: true as const },
		/** KVID 视频 ID - 非空 */
		kvid: { type: Number, required: true as const },
		/** 视频分区 - 非空 */
		videoCategory: { type: String, required: true as const },
		/** 视频 TAG - 非空 */
		videoTags: { type: [VideoTagSchema], required: true as const },
	},
	/** Elasticsearch 索引名 */
	indexName: 'search-kirakira-video-elasticsearch',
}
