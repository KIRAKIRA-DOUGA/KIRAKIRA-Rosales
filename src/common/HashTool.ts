import bcrypt from 'bcrypt'

const HASH_ROUND = 8 // Bcrypt Hash 轮次，数值越大越慢，越安全。 // WARN 千万不要改！
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
