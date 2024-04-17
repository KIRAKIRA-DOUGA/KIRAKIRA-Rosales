// /**
//  * 不同语言所对应的 TAG 名
//  */
// export const VideoTagNameDocument = {
// 	/** TAG 的语言 - 非空，原则上应该唯一 // WARN: 无法指定指定子文档的唯一索引，只能在业务上避免并做校验 */
// 	lang: { type: String, required: true as const },
// 	/** 不同语言所对应的 TAG 名 */
// 	tagName: { type: String, required: true as const },
// }

// /**
//  * 视频 TAG 数据
//  */
// export const VideoTagDocument = {
// 	/** Elasticsearch 索引模板 */
// 	schema: {
// 		/** TAG ID - 非空，唯一 */
// 		tagId: { type: Number, required: true as const },
// 		/** 不同语言所对应的 TAG 名 */
// 		tagNameList: { type: [VideoTagNameDocument], required: true as const },
// 		/** 系统专用字段-最后编辑时间 - 非空 */
// 		editDateTime: { type: Number, required: true as const },
// 	},
// 	/** Elasticsearch 索引名 */
// 	indexName: 'search-kirakira-video-tag-elasticsearch',
// }
