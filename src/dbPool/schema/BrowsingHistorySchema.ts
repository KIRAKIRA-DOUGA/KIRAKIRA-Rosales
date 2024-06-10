import { Schema } from 'mongoose'

/**
 * 用户浏览历史数据
 */
class BrowsingHistorySchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 浏览的内容的类型，比如说 video, photo 等 - 非空 */
		type: { type: String, required: true },
		/** 浏览的内容的唯一 ID - 非空 */
		id: { type: String, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'browsing-history'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const BrowsingHistorySchema = new BrowsingHistorySchemaFactory()
