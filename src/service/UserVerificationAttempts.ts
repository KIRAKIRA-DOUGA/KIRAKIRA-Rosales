import mongoose, { Schema, Model } from 'mongoose'

/** Claim an attempt before checking the code. The condition and increment are one database operation. */
const claimAttempt = async (schema: Schema, collectionName: string, where: object, count: object, maxAttempts: number, update: object): Promise<boolean> => {
	const model: Model<unknown> = mongoose.models[collectionName] || mongoose.model(collectionName, schema)
	const result = await model.findOneAndUpdate(
		{ ...where, $expr: { $lt: [count, maxAttempts] } },
		[{ $set: update }],
		{ new: true, upsert: false },
	)
	return result !== null
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
