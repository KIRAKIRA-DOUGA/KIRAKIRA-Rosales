import crypto from 'crypto'
import util from 'util'


/**
 * 将输入的字符串进行简单的 SHA-256 哈希
 * 
 * @param data 输入的字符串
 * @returns hash
 */
export const hashData = async (data: string): Promise<string> => {
	if (data) {
		const encoder = new TextEncoder()
		const dataUint8Array = encoder.encode(data)
		const hashBuffer = await crypto.subtle.digest('SHA-256', dataUint8Array)
			.catch(e => {
				console.error('something error in function hashData -> crypto.subtle.digest', e)
			}) as Buffer
		const hashArray = Array.from(new Uint8Array(hashBuffer))
	
		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
	} else {
		console.error('something error in function hashData, required data is empty')
		return ''
	}
}



/**
 * 生成加盐 hash
 * 
 * @param data 被 hash 的字符串
 * @param salt 盐
 * @returns 加盐hash
 */
const scrypt = util.promisify(crypto.scrypt)
export const generateSaltedHash = async (data: string, salt: string): Promise<string> => {
	const hash = await scrypt(data, salt, 64)
		.catch(e => {
			console.error('something error in function generateSaltedHash -> scrypt', e)
		}) as Buffer
	return hash.toString('hex')
}

