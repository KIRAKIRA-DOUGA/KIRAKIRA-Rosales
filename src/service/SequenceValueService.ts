import { Schema } from 'mongoose'
import { getNextSequenceValuePool } from '../dbPool/DbClusterPool.js'
import { SequenceValueSchema } from '../dbPool/schema/sequenceSchema.js'

// 自增 ID 的类型
type SequenceIdType = 'user' | 'video'

/**
 * 获取自增 ID 的结果
 * @param success 执行结果，程序执行成功，返回 true，程序执行失败，返回 false
 * @param sequenceId 自增项的 ID 的项
 * @param sequenceValue 自增 ID 的值
 * @param message 额外信息
 */
type SequenceNumberResultType = {
	success: boolean;
	sequenceId?: SequenceIdType;
	sequenceValue?: number;
	message?: string;
}

export const getNextSequenceValueService = async (sequenceId: SequenceIdType): Promise<SequenceNumberResultType> => {
	try {
		if (sequenceId) {
			const { collectionName, schema: sequenceValueSchema } = SequenceValueSchema
			const schema = new Schema(sequenceValueSchema)

			try {
				const getNextSequenceValue = await getNextSequenceValuePool(sequenceId, schema, collectionName)
				const sequenceValue = getNextSequenceValue?.result?.[0]
				if (getNextSequenceValue.success && sequenceValue !== null && sequenceValue !== undefined) {
					return { success: true, sequenceId, sequenceValue, message: '获取自增 ID 成功' }
				} else {
					console.error('ERROR', '程序错误，获取到的自增 ID 为空', { error: getNextSequenceValue.error, message: getNextSequenceValue.message })
					return { success: false, sequenceId, message: '程序错误，获取到的自增 ID 异常' }
				}
			} catch (error) {
				console.error('ERROR', '自增 ID 获取失败，向 MongoDB 查询自增 ID 数据时出现异常：', error)
				return { success: false, sequenceId, message: '程序错误，存取自增 ID 时出现异常' }
			}
		} else {
			console.error('ERROR', '自增 ID 获取失败，必要的参数 sequenceId 为空')
			return { success: false, message: '程序错误，获取自增 ID 时出现异常，缺少必要的参数' }
		}
	} catch (error) {
		console.error('ERROR', '自增 ID 获取失败, getAndAddOneBySequenceId 异常退出：', error)
		return { success: false, message: '程序错误，获取自增 ID 的程序执行时出现异常' }
	}
}
