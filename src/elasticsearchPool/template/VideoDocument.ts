const VideoTagNameDocument = {
	/** TAG 名称 - 非空 */
	name: { type: String, required: true as const },
	/** 是否为该语言默认名 - 非空 */
	isDefault: { type: Boolean, required: true as const },
	/** 是否为 TAG 原名 - 非空 */
	isOriginalTagName: { type: Boolean, required: false as const },
}

/**
 * 不同语言所对应的 TAG 名
 */
const MultilingualVideoTagNameDocument = {
	/** TAG 的语言 - 非空，原则上应该唯一 // WARN: 无法指定指定子文档的唯一索引，只能在业务上避免并做校验 */
	lang: { type: String, required: true as const },
	/** 不同语言所对应的 TAG 名 */
	tagName: { type: [VideoTagNameDocument], required: true as const },
}

/**
 * 视频 TAG 数据
 */
const VideoTagDocument = {
	/** Elasticsearch 索引模板 */
	schema: {
		/** TAG ID - 非空，唯一 */
		tagId: { type: Number, required: true as const },
		/** 不同语言所对应的 TAG 名 */
		tagNameList: { type: [MultilingualVideoTagNameDocument], required: true as const },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true as const },
	},
	/** Elasticsearch 索引名 */
	indexName: 'search-kirakira-video-tag-elasticsearch',
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
		/** KVID 视频 ID - 非空 */
		kvid: { type: Number, required: true as const },
		/** 视频分区 - 非空 */
		videoCategory: { type: String, required: true as const },
		/** 视频 TAG - 非空 */
		videoTagList: { type: [VideoTagDocument], required: true as const },
	},
	/** Elasticsearch 索引名 */
	indexName: 'search-kirakira-video-elasticsearch',
}
