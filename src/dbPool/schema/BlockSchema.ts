import { Schema } from 'mongoose'

/**
 * 用户屏蔽数据
 */
class BlockListSchemaFactory {
	schema = {
		/** 黑名单类型 - 非空 */
		type: { type: String, required: true },
		/** 黑名单内容 - 非空 */
		value: { type: String, required: true },
		/** 创建者 UID - 非空 */
		operatorUid: { type: Number, required: true },
		/** 创建者 UUID - 非空 */
		operatorUUID: { type: String, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true, index: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'blocklist'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const BlockListSchema = new BlockListSchemaFactory()

/**
 * 用户取消屏蔽数据
 */
class UnblockListSchemaFactory {
	schema = {
		/** 原来屏蔽的合集 */
		...BlockListSchema.schema,
		/** 操作者 UUID - 非空 */
		_operatorUUID_: { type: String, required: true },
		/** 操作者 UID - 非空 */
		_operatorUid_: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		createDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'unblocklist'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UnblockListSchema = new UnblockListSchemaFactory()

