import { Schema } from 'mongoose';

/**
 * 日志数据
 */
class LogSchemaFactory {
	schema = {
		/** 日志等级 - 非空 */
		logLevel: { type: String, required: true, index: true },
		/** 日志信息 - 非空 */
		message: { type: String, required: true },
		/** 错误的元数据 - 默认：{} */
		meta: { type: Schema.Types.Mixed, default: {}, },
		/** 错误堆栈字符串 */
		errorStackString: { type: String },
		/** ISO 格式的日志记录时间 */
		logRecordDateISOString: { type: String, required: true, index: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true, index: true },
		/** 系统专用字段-最后修改时间 - 非空 */
		editDateTime: { type: Number, required: true, index: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'log'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const LogSchema = new LogSchemaFactory()
