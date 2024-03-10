import { Schema } from 'mongoose'

/**
 * 自增序列
 */
export class SequenceValueSchemaFactory {
	schema = {
		/** 自增的项，比如：videoId */
		_id: { type: String, unique: true, required: true },
		/** 自增的值 */
		sequenceValue: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'sequence-value'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}

export const SequenceValueSchema = new SequenceValueSchemaFactory()
