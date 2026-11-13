import type { Schema } from 'mongoose'
import { findOneAndUpdateWithOperators4MongoDB } from '../dbPool/DbClusterPool.js'

/** Claim an attempt before checking the code. The condition and increment are one database operation. */
const claimAttempt = async (schema: Schema, collectionName: string, where: object, count: object, maxAttempts: number, update: object): Promise<boolean> => {
	const result = await findOneAndUpdateWithOperators4MongoDB(
		{ ...where, $expr: { $lt: [count, maxAttempts] } },
		[{ $set: update }],
		schema,
		collectionName,
	)
	return result.success && !!result.result
}

export const claimEmailVerificationAttempt = async (schema: Schema, collectionName: string, where: object, now: number, maxAttempts: number): Promise<boolean> => {
	const dayStart = new Date(now)
	dayStart.setHours(0, 0, 0, 0)
	// Older records have no attempt timestamp; their creation date is the migration fallback.
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
