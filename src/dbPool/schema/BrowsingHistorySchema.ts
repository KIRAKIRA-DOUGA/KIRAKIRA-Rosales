import { Schema } from 'mongoose'

/**
 * 用户浏览历史数据
 */
class BrowsingHistorySchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 用户的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 浏览的内容的类型，比如说 video, photo 等 - 非空 */
		category: { type: String, required: true },
		/** 浏览的内容的唯一 ID - 非空 */
		id: { type: String, required: true },
		/** 浏览的定位锚点，如果是视频就是播放时间，如果是相册可能是上次浏览到相册第n张图片，为了兼容性使用 String */
		anchor: { type: String },
		/** 最后一次查看的时间，用户历史记录页面排序，原则上与下方的系统专用最后编辑时间相同 - 非空 */
		lastUpdateDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'browsing-history'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const BrowsingHistorySchema = new BrowsingHistorySchemaFactory()
