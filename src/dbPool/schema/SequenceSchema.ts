/**
 * 自增序列
 * @param _id 自增的项，比如：videoId
 * @param sequenceValue 自增的值
 */
export const SequenceValueSchema = {
	schema: {
		_id: { type: String, unique: true, required: true }, // 例如 'videoId'
		sequenceValue: { type: Number, required: true },
	},
	collectionName: 'sequence-value',
}
