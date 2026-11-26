import mongoose, { ClientSession } from 'mongoose'
import { logging } from '../service/loggingService.js'

/**
 * 创建会话并启动事务
 * @returns 已启动事务的会话。创建会话或启动事务失败时返回 false，调用方应立即结束本次操作。
 */
export const createAndStartSession = async (): Promise<ClientSession | false> => {
	let session: ClientSession
	try {
		session = await mongoose.startSession()
	} catch (error) {
		logging('ERROR', '创建 MongoDB 会话失败', error, undefined, { recordingLogs: false })
		return false
	}

	try {
		session.startTransaction()
		return session
	} catch (startError) {
		logging('ERROR', '启动 MongoDB 事务失败', startError, undefined, { recordingLogs: false })
		try {
			await session.endSession()
		} catch (closeError) {
			logging('ERROR', '事务启动失败后关闭 MongoDB 会话出错', closeError, undefined, { recordingLogs: false })
		}
		return false
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
		try {
			await session.endSession()
		} catch (closeError) {
			logging('ERROR', '回滚后关闭 MongoDB 会话出错', closeError, undefined, { recordingLogs: false })
		}
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
	} catch (commitError) {
		// 数据库可能已经提交，只是客户端没收到确认。只有会话仍处于事务中时才能回滚。
		try {
			await abortAndEndSession(session)
		} catch (abortError) {
			logging('ERROR', '提交失败后回滚 MongoDB 事务出错', abortError, undefined, { recordingLogs: false })
		}
		throw commitError
	}

	// 数据库已确认提交。关闭会话的错误单独记录。
	try {
		await session.endSession()
	} catch (closeError) {
		logging('ERROR', '提交后关闭 MongoDB 会话出错', closeError, undefined, { recordingLogs: false })
	}
	return true
}
