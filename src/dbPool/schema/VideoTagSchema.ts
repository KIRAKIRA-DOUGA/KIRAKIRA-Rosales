import { Schema } from 'mongoose'

const VideoTagNameSchema = {
	/** TAG 名称 - 非空 */
	name: { type: String, required: true },
	/** 是否为该语言默认名 - 非空 */
	isDefault: { type: Boolean, required: true },
	/** 是否为 TAG 原名 - 非空 */
	isOriginalTagName: { type: Boolean, required: false },
}

/**
 * 不同语言所对应的 TAG 名
 */
export const MultilingualVideoTagNameSchema = {
	/** TAG 的语言 - 非空，原则上应该唯一 // WARN: 无法指定指定子文档的唯一索引，只能在业务上避免并做校验 */
	lang: { type: String, required: true },
	/** 不同语言所对应的 TAG 名 */
	tagName: { type: [VideoTagNameSchema], required: true },
}

/**
 * 视频 TAG 数据
 */
class VideoTagSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** TAG ID - 非空，唯一 */
		tagId: { type: Number, required: true, unique: true },
		/** 不同语言所对应的 TAG 名 */
		tagNameList: { type: [MultilingualVideoTagNameSchema], required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-tag'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const VideoTagSchema = new VideoTagSchemaFactory()
