import type { Schema } from 'mongoose'
import { findOneAndUpdateWithOperators4MongoDB } from '../dbPool/DbClusterPool.js'

// 检查剩余次数和扣除一次机会必须由同一次数据库更新完成。
const claimAttempt = async (schema: Schema, collectionName: string, where: object, count: object, maxAttempts: number, update: object): Promise<boolean> => {
	const result = await findOneAndUpdateWithOperators4MongoDB(
		{ ...where, $expr: { $lt: [count, maxAttempts] } },
		[{ $set: update }],
		schema,
		collectionName,
	)
	return result.success && !!result.result
}

/**
 * 占用一次当日邮箱验证码验证机会。
 * @param schema 验证记录的 MongoDB Schema
 * @param collectionName 验证记录的集合名
 * @param where 定位验证记录的条件
 * @param now 当前时间戳，单位为毫秒
 * @param maxAttempts 允许的最大尝试次数
 * @returns 本次请求是否取得验证机会
 */
export const claimEmailVerificationAttempt = async (schema: Schema, collectionName: string, where: object, now: number, maxAttempts: number): Promise<boolean> => {
	const dayStart = new Date(now)
	dayStart.setHours(0, 0, 0, 0)
	// 旧记录没有最后尝试时间，使用创建时间判断是否跨日。
	const count = { $cond: [
		{ $lt: [{ $ifNull: ['$lastVerifierAttemptDate', '$verificationCreatedDate'] }, dayStart.getTime()] },
		0,
		{ $ifNull: ['$totalVerifierTimesToday', 0] },
	] }
	return claimAttempt(schema, collectionName, where, count, maxAttempts, {
		totalVerifierTimesToday: { $add: [count, 1] },
		lastVerifierAttemptDate: now,
	})
}

/**
 * 占用一次 TOTP 验证机会，冷却期结束后重新计数。
 * @param schema 验证记录的 MongoDB Schema
 * @param collectionName 验证记录的集合名
 * @param where 定位验证记录的条件
 * @param now 当前时间戳，单位为毫秒
 * @param maxAttempts 允许的最大尝试次数
 * @param lockTime 冷却时间，单位为毫秒
 * @returns 本次请求是否取得验证机会
 */
export const claimTotpVerificationAttempt = async (schema: Schema, collectionName: string, where: object, now: number, maxAttempts: number, lockTime: number): Promise<boolean> => {
	const count = { $cond: [
		{ $gte: [{ $subtract: [now, { $ifNull: ['$lastAttemptTime', 0] }] }, lockTime] },
		0,
		{ $ifNull: ['$attempts', 0] },
	] }
	return claimAttempt(schema, collectionName, where, count, maxAttempts, {
		attempts: { $add: [count, 1] },
		lastAttemptTime: now,
	})
}
