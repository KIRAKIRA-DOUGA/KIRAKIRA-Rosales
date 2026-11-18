import mongoose, { ClientSession } from 'mongoose'

/**
 * 创建并启动事务
 * @returns 一个已经启动的事务
 * @throws error 创建或启动事务失败
 */
export const createAndStartSession = async (): Promise<ClientSession> => {
	try {
		const session = await mongoose.startSession()
		session.startTransaction()
		return session
	} catch (error) {
		throw new Error('启动 MongoDB Session 失败', error)
	}
}

/**
 * 回滚并结束事务
 * @param session 事务 session
 * @returns 成功回滚并结束事务返回 true，否则返回 false
 */
export const abortAndEndSession = async (session: ClientSession): Promise<boolean> => {
	if (!session) {
		return false
	}

	if (!session.inTransaction()) {
		return false
	}

	await session.abortTransaction()
	session.endSession()
	return true
}

/**
 * 提交并结束事务
 * @param session 事务 session
 * @returns 成功提交并结束事务返回 true，否则返回 false
 */
export const commitAndEndSession = async (session: ClientSession): Promise<boolean> => {
	if (!session) {
		return false
	}

	await session.commitTransaction()
	session.endSession()
}
