import { getNextSequenceValuePool } from '../dbPool/DbClusterPool.js';

// NOTE 自增序列默认会跳过的值
const __DEFAULT_SEQUENCE_EJECT__: number[] = [9, 42, 233, 404, 2233, 10388, 10492, 114514]

/**
 * 获取自增 ID 的结果
 * @param success 执行结果，程序执行成功，返回 true，程序执行失败，返回 false
 * @param sequenceId 自增项的 ID 的项
 * @param sequenceValue 自增 ID 的值
 * @param message 额外信息
 */
type SequenceNumberResultType = {
	success: boolean;
	sequenceId?: string;
	sequenceValue?: number;
	message?: string;
}

/**
 * 获取自增序列的下一个值
 * @param sequenceId 自增序列的 key
 * @param sequenceDefaultNumber 序列的初始值，默认：0，如果序列已创建，则无效，该值可以为负数
 * @parma sequenceStep 序列的步长，默认：1，每次调用该方法时可以指定不同的步长，该值可以为负数
 * @returns 查询状态和结果，应为自增序列的下一个值
 */
export const getNextSequenceValueService = async (sequenceId: string, sequenceDefaultNumber: number = 0, sequenceStep: number = 1): Promise<SequenceNumberResultType> => {
	try {
		if (sequenceId) {
			try {
				const getNextSequenceValue = await getNextSequenceValuePool(sequenceId, sequenceDefaultNumber, sequenceStep)
				const sequenceValue = getNextSequenceValue?.result
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

/**
 * 获取自增序列的下一个值，但是可以跳过 eject 指定数组中的 “非法值” 直到自增到下一个 “合法” 的值
 * @param sequenceId 自增序列的 key
 * @param eject 创建序列时主动跳过的数字的数组，需要每次调用该函数时指定，如果不指定则会使用 __DEFAULT_SEQUENCE_EJECT__ 作为缺省的跳过数组
 * @param sequenceDefaultNumber 序列的初始值，默认：0，如果序列已创建，则无效，该值可以为负数
 * @param sequenceStep 序列的步长，默认：1，每次调用该方法时可以指定不同的步长，该值可以为负数
 * @returns 查询状态和结果，应为自增序列的下一个值
 */
export const getNextSequenceValueEjectService = async (sequenceId: string, eject: number[] = __DEFAULT_SEQUENCE_EJECT__, sequenceDefaultNumber: number = 0, sequenceStep: number = 1): Promise<SequenceNumberResultType> => {
	try {
		let getNextSequenceValueServiceResult: SequenceNumberResultType
		let nextSequenceValue: number
		do {
			getNextSequenceValueServiceResult = await getNextSequenceValueService(sequenceId, sequenceDefaultNumber, sequenceStep)
			nextSequenceValue = getNextSequenceValueServiceResult?.sequenceValue

			// 如果获取失败或者返回的值为空，则直接跳出循环
			if (!getNextSequenceValueServiceResult.success || nextSequenceValue === null || nextSequenceValue === undefined) {
				console.error('ERROR', '循环获取自增 ID 时出现异常，数据异常')
				return { success: false, sequenceId, message: '循环获取自增 ID 时出现异常，返回的结果可能为空或不成功' }
			}
		} while (eject && eject.includes(nextSequenceValue))
		return { success: true, sequenceId, sequenceValue: nextSequenceValue, message: '获取自增序列成功' }
	} catch (error) {
		console.error('ERROR', '循环获取自增 ID 时出现异常')
		return { success: false, sequenceId, message: '循环获取自增 ID 的程序执行时出现异常' }
	}
}




