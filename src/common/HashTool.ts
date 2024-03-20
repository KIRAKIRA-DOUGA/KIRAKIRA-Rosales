import bcrypt from 'bcrypt'

const HASH_ROUND = 8 // Bcrypt Hash 轮次，数值越大越慢，越安全。

/**
 * 使用 Bcrypt Hash 一个密码
 * @param password 原密码
 * @returns 被 Hash 的密码
 */
export function hashPasswordSync(password: string): string {
	return bcrypt.hashSync(password, HASH_ROUND)
}

/**
 * 校验被 Bcrypt Hash 过的密码
 * @param passwordOrigin 原密码
 * @param passwordHash 被 Bcrypt Hash 过的密码
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
export function comparePasswordSync(passwordOrigin: string, passwordHash: string): boolean {
	return bcrypt.compareSync(passwordOrigin, passwordHash)
}


// /**
//  * 将输入的字符串进行简单的 SHA-256 哈希
//  *
//  * @param data 输入的字符串
//  * @returns hash
//  */
// export const hashData = async (data: string): Promise<string> => {
// 	if (data) {
// 		const encoder = new TextEncoder()
// 		const dataUint8Array = encoder.encode(data)
// 		const hashBuffer = await crypto.subtle.digest('SHA-256', dataUint8Array)
// 			.catch(e => {
// 				console.error('something error in function hashData -> crypto.subtle.digest', e)
// 			}) as Buffer
// 		const hashArray = Array.from(new Uint8Array(hashBuffer))

// 		return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
// 	} else {
// 		console.error('something error in function hashData, required data is empty')
// 		return ''
// 	}
// }



// const scrypt = util.promisify(crypto.scrypt)
// /**
//  * 生成加盐 hash
//  *
//  * @param data 被 hash 的字符串
//  * @param salt 盐
//  * @returns 加盐hash
//  */
// export const generateSaltedHash = async (data: string, salt: string): Promise<string> => {
// 	const hash = await scrypt(data, salt, 64)
// 		.catch(e => {
// 			console.error('something error in function generateSaltedHash -> scrypt', e)
// 		}) as Buffer
// 	return hash.toString('hex')
// }

