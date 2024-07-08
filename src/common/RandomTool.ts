import crypto from 'crypto'

/**
 * 生成不可预测的随机字符串，性能较差
 *
 * @param length 生成的随机字符串的长度
 * @returns 随机字符串
 */
export const generateSecureRandomString = (length: number): string => {
	try {
		if (length && typeof length === 'number' && length > 0 && !!Number.isInteger(length)) {
			const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
			let result = ''
			while (length > 0) {
				const bytes = crypto.randomBytes(length)
				for (let i = 0; i < bytes.length && length > 0; i++) {
					const randomValue = bytes[i]
					if (randomValue < 256 - (256 % charset.length)) { // Avoid bias
						result += charset.charAt(randomValue % charset.length)
						length--
					}
				}
			}
			return result
		} else {
			console.error('something error in function generateSecureRandomString, required data length is empty or not > 0 or not Integer')
			return ''
		}
	} catch (e) {
		console.error('something error in function generateSecureRandomString', e)
		return ''
	}
}

/**
 * 生成可能被预测的随机字符串，性能较好 // WARN
 *
 * @param length 生成的随机字符串的长度
 * @returns 随机字符串
 */
export const generateRandomString = (length: number): string => {
	try {
		if (length && typeof length === 'number' && length > 0 && !!Number.isInteger(length)) {
			let text = ''
			const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

			for (let i = 0; i < length; i++)
				text += possible.charAt(Math.floor(Math.random() * possible.length))

			return text
		} else {
			console.error('something error in function generateSecureRandomString, required data length is empty or not > 0 or not Integer')
			return ''
		}
	} catch (e) {
		console.error('something error in function generateRandomString', e)
		return ''
	}
}

/**
 * 返回一个区间中的随机整数（包括区间两端的数）
 * @param num1 第一个数
 * @param num2 第二个数
 * @returns 两个数区间的一个随机整数
 */
export const getRandomNumberInRange = (num1: number, num2: number): number => {
	// 如果 num1 大于 num2，交换它们的值
	if (num1 > num2) {
		[num1, num2] = [num2, num1]
	}
	return Math.floor(Math.random() * (num2 - num1 + 1)) + num1
}

/**
 * 生成不可预测的六位数字验证码
 * @returns 不可预测的六位数字验证码
 */
export const generateSecureVerificationCode = () => {
	const buffer = crypto.randomBytes(6) // 一次性生成6个随机字节
	const code = Array.from(buffer, byte => (byte % 10).toString()).join('') // 从随机字节求模转化为数字
	return code
}
