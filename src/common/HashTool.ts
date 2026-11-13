import bcrypt from 'bcrypt'

const HASH_ROUND = 8 // Bcrypt Hash 轮次，数值越大越慢，越安全。 // WARN 千万不要改！否则所有用户都无法登录
/**
 * 使用 Bcrypt Hash 一个字符串
 * @param password 原密码
 * @returns 被 Hash 的字符串
 */
export function hashStringSync(originString: string): string {
	return bcrypt.hashSync(originString, HASH_ROUND)
}

/**
 * 校验被 Bcrypt Hash 过的字符串
 * @param originString 原字符串
 * @param hashedString 被 Bcrypt Hash 过的字符串
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
export function compareStringSync(originString: string, hashedString: string): boolean {
	return bcrypt.compareSync(originString, hashedString)
}
