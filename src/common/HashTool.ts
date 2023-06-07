import crypto from 'crypto'

/**
 * 将输入的字符串进行简单的 SHA-256 哈希
 * @param data 输入的字符串
 * @returns hash
 */
export const hashData = async (data: string): Promise<string> => {
	if (data) {
		const encoder = new TextEncoder()
		const dataUint8Array = encoder.encode(data)
		const hashBuffer = await crypto.subtle.digest('SHA-256', dataUint8Array)
		const hashArray = Array.from(new Uint8Array(hashBuffer))
	
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
	} else {
		console.error('something error in function hashData, required data is empty')
		return ''
	}
}
