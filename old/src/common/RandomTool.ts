import crypto from 'crypto';

/**
 * 生成不可预测的随机字符串，性能较差
 * 
 * @param length 生成的随机字符串的长度
 * @returns 随机字符串
 */
export const generateSecureRandomString = (length: number): string => {
	try {
		if (length && typeof length === 'number' && length > 0 && !!Number.isInteger(length)) {
			const charset = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"
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
			let text = "";
			const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
	
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