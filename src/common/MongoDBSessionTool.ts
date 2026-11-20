import mongoose, { ClientSession } from 'mongoose'
import { logging } from '../service/loggingService.js'

/**
 * 创建会话并启动事务
 * @returns 已启动事务的会话
 */
export const createAndStartSession = async (): Promise<ClientSession> => {
	const session = await mongoose.startSession()
	try {
		session.startTransaction()
		return session
	} catch (error) {
		await session.endSession().catch(closeError => logging('ERROR', '事务启动失败后关闭 MongoDB 会话出错', closeError, undefined, { recordingLogs: false }))
		throw error
	}
}

/**
 * 回滚仍在进行的事务并关闭会话
 * @param session 事务会话
 * @returns 是否实际回滚了事务
 */
export const abortAndEndSession = async (session: ClientSession): Promise<boolean> => {
	if (!session || session.hasEnded) {
		return false
	}

	try {
		if (!session.inTransaction()) {
			return false
		}
		await session.abortTransaction()
		return true
	} finally {
		await session.endSession().catch(error => logging('ERROR', '回滚后关闭 MongoDB 会话出错', error, undefined, { recordingLogs: false }))
	}
}

/**
 * 提交事务并关闭会话
 * @param session 事务会话
 * @returns 提交成功返回 true，未提供会话返回 false。提交失败时抛出原始错误。
 */
export const commitAndEndSession = async (session: ClientSession): Promise<boolean> => {
	if (!session) {
		return false
	}

	try {
		await session.commitTransaction()
	} catch (error) {
		// 提交出错时驱动可能已结束事务。只回滚仍在进行的事务，保留原始提交错误。
		await abortAndEndSession(session).catch(abortError => logging('ERROR', '提交失败后回滚 MongoDB 事务出错', abortError, undefined, { recordingLogs: false }))
		throw error
	}

	// 数据库已确认提交。关闭会话的错误单独记录。
	await session.endSession().catch(error => logging('ERROR', '提交后关闭 MongoDB 会话出错', error, undefined, { recordingLogs: false }))
	return true
}
