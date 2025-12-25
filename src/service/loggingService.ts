import { InferSchemaType } from "mongoose";
import { LogSchema } from "../dbPool/schema/LoggingSchema.js";
import { insertData2MongoDB } from "../dbPool/DbClusterPool.js";

/** 输出的日志等级 */
type LogLevel = 'error' | 'warn' | 'info' | 'ERROR' | 'WARN' | 'INFO';

export function logging(logLevel: LogLevel, message: string, error?: Error, meta?: unknown) {
	try {
		const ALLOWED_LOG_LEVEL = ['error', 'warn', 'info']
		const logLevelLowerCase = logLevel.toLowerCase()
		const envLogLevel = process.env.LOG_LEVEL
		const nowDate = new Date()
		const now = nowDate.getTime()
		const nowISOString = nowDate.toISOString()
		const serverEnv = process.env.SERVER_ENV
		let errorStackString = ''

		if (!ALLOWED_LOG_LEVEL.includes(logLevelLowerCase)) {
			console.error('ERROR', 'Unknown log level', message)
			return
		}
		if (!ALLOWED_LOG_LEVEL.includes(envLogLevel)) {
			console.error('ERROR', 'Unknown log level in env', message)
			console.warn('WARN', 'Please check your env setting!')
			return
		}

		switch (logLevelLowerCase) {
			case 'error': {
				console.error('ERROR', `[${nowISOString}] ${message}`, meta || '')
				if (error) {
					if (serverEnv === 'dev') {
						errorStackString = formatErrorStack(error, { maxLines: 100, maxChars: 50000, skipNodeModules: false })
					} else {
						errorStackString = formatErrorStack(error, { maxLines: 10, maxChars: 2000, skipNodeModules: true })
					}
				}

				if (serverEnv !== 'dev') {
					const { collectionName: LogCollectionName, schemaInstance: logSchemaInstance } = LogSchema
					type Log = InferSchemaType<typeof logSchemaInstance>
					const log: Log = {
						logLevel: 'error',
						message,
						meta,
						errorStackString,
						logRecordDateISOString: nowISOString,
						createDateTime: now,
						editDateTime: now,
					}

					insertData2MongoDB(log, logSchemaInstance, LogCollectionName) // 不用 'await', 随缘存
				}
				break
			}
			case 'warn': {
				if (['warn', 'info'].includes(envLogLevel)) return
				console.warn('WARN', `[${nowISOString}] ${message}`, meta || '')
				break
			}
			case 'info': {
				if (['info'].includes(envLogLevel)) return
				console.info('INFO', `[${nowISOString}] ${message}`, meta || '')
				break
			}
		}
		if (error && errorStackString) {
			console.error(errorStackString)
		}
	} catch (error) {
		console.error('ERROR', '日志记录时出错：', error)
	}
}

/**
 * 格式化错误堆栈选项
 */
interface FormatErrorStackOptions {
	/** 最大堆栈行数，默认 10 */
  maxLines?: number;
	/** 最大总字符数，默认 2000 */
  maxChars?: number;
	/** 是否跳过 node_modules 相关堆栈行，默认跳过 */
  skipNodeModules?: boolean;
}

/**
 * 格式化错误堆栈
 * @param error 错误堆栈
 * @param options 格式化选项
 * @returns 错误堆栈字符串
 */
function formatErrorStack(error: unknown, options: FormatErrorStackOptions = {}): string {
	try {
		const { maxLines = 10, maxChars = 2000, skipNodeModules = true } = options

		if (!(error instanceof Error)) {
			return String(error).slice(0, maxChars)
		}

		if (!error.stack) {
			return error.message.slice(0, maxChars)
		}

		let lines = error.stack.split("\n")

		// 第一行：Error: message（必须保留）
		const header = lines.shift()!

		if (skipNodeModules) {
			lines = lines.filter(
				line => !line.includes("node_modules") && !line.includes("node:internal")
			)
		}

		// ① 限制行数
		const limitedLines = lines.slice(0, maxLines)

		let result = [header, ...limitedLines].join("\n")

		// ② 限制总字符数（最后兜底）
		if (result.length > maxChars) {
			result =
				result.slice(0, maxChars - 15) + "\n… [truncated]"
		}

		return result
	} catch (error) {
		console.error('ERROR', 'Error in format error stack, unknown error: ', error)
		return ''
	}
}
