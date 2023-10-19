import { InferSchemaType, Schema } from 'mongoose'
import { generateSaltedHash } from '../common/HashTool.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { UserExistsCheckDataDto, UserExistsCheckResultDto, UserLoginDataDto, UserLoginResultDto, UserRegistrationDataDto, UserRegistrationResultDto } from '../controller/UserControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { DbPoolResultType, QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { UserAuthSchema } from '../dbPool/schema/UserSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'

type HashPasswordResult = {
	passwordHashHash: string;
	salt: string;
}

/**
 * 用户注册
 * @param userRegistrationData 用户注册时需要传入的信息（用户名，密码）
 * @returns 用户注册的结果，如果成功会包含 token
 */
export const userRegistrationService = async (userRegistrationData: UserRegistrationDataDto): Promise<UserRegistrationResultDto> => {
	try {
		if (checkUserRegistrationData(userRegistrationData)) {
			const { passwordHashHash, salt } = await getHashPasswordAndSalt(userRegistrationData)
			const { username, passwordHint } = userRegistrationData
			const token = generateSecureRandomString(64)
			if (passwordHashHash && token) {
				const { collectionName, schema: userAuthSchema } = UserAuthSchema
				const schema = new Schema(userAuthSchema)
				const uid = (await getNextSequenceValueService('user')).sequenceValue
				if (uid !== null && uid !== undefined) {
					type User = InferSchemaType<typeof schema>
					const user: User = {
						uid,
						username,
						passwordHashHash,
						salt,
						token,
						passwordHint,
						editDateTime: new Date().getTime(),
					}
					try {
						await insertData2MongoDB(user, schema, collectionName)
					} catch (error) {
						console.error('ERROR', '用户注册失败：向 MongoDB 插入数据时出现异常：', error)
						return { success: false, message: '用户注册失败：无法保存用户资料' }
					}
					return { success: true, uid, token, message: '用户注册成功' }
				} else {
					console.error('ERROR', '用户注册失败：UID 获取失败：')
					return { success: false, message: '用户注册失败：生成用户 ID 失败' }
				}
			} else {
				console.error('ERROR', '用户注册失败：passwordHashHash 或 token 可能为空')
				return { success: false, message: '用户注册失败：生成账户资料时失败' }
			}
		} else {
			console.error('ERROR', '用户注册失败：userRegistrationData 的非空验证没有通过')
			return { success: false, message: '用户注册失败：非空验证没有通过' }
		}
	} catch (error) {
		console.error('userRegistrationService 函数中出现异常', error)
		return { success: false, message: '用户注册失败：程序异常终止' }
	}
}

/**
 * 用户登录
 * @param userLoginData 用户登录时需要传入的信息（用户名，密码）
 * @return userLoginResultDto 用户登录结果，如果登录成功会包含 token
 */
export const userLoginService = async (userLoginData: UserLoginDataDto): Promise<UserLoginResultDto> => {
	try {
		if (checkUserExistsCheckData(userLoginData)) {
			const username = userLoginData.username

			const { collectionName, schema: userAuthSchema } = UserAuthSchema
			const schema = new Schema(userAuthSchema)
			type User = InferSchemaType<typeof schema>
			const userSaltAndPasswordHintWhere: QueryType<User> = {
				username: userLoginData.username,
			}

			const userSaltAndPasswordHintSelect: SelectType<User> = {
				username: 1,
				salt: 1,
				passwordHint: 1,
			}

			let saltResult: DbPoolResultType<User>

			try {
				saltResult = await selectDataFromMongoDB(userSaltAndPasswordHintWhere, userSaltAndPasswordHintSelect, schema, collectionName)
			} catch (error) {
				console.error('ERROR', `用户登录（查询用户盐）时出现异常，用户名：【${username}】，错误信息：`, error)
				return { success: false, username, message: '用户登录（初始化用户信息）时出现异常' }
			}

			let salt: string
			let passwordHint: string
			if (saltResult && saltResult.success && saltResult.result) {
				const saltResultLength = saltResult?.result?.length
				if (saltResult?.result && saltResultLength === 1) {
					salt = saltResult.result?.[0].salt
					passwordHint = saltResult.result?.[0].passwordHint
				} else {
					console.error('ERROR', `用户登录失败：盐查询失败，或者结果长度不为 1，用户名：【${username}】`)
					return { success: false, username, message: '用户登录失败：初始化查询结果异常' }
				}
			} else {
				console.error('ERROR', `用户登录失败：盐查询失败，或者结果为空，用户名：【${username}】`)
				return { success: false, username, message: '用户登录失败：初始化查询失败' }
			}

			if (salt) {
				const passwordHashHash = await getHashPasswordBySalt(userLoginData, salt)
				if (passwordHashHash) {
					const userLoginWhere: QueryType<User> = {
						username: userLoginData.username,
						passwordHashHash,
					}

					const userLoginSelect: SelectType<User> = {
						username: 1,
						uid: 1,
						token: 1,
						passwordHint: 1,
					}
					let result: DbPoolResultType<User>
		
					try {
						result = await selectDataFromMongoDB(userLoginWhere, userLoginSelect, schema, collectionName)
					} catch (error) {
						console.error('ERROR', `用户登录（查询用户信息）时出现异常，用户名：【${username}】，错误信息：`, error)
						return { success: false, username, message: '用户登录（检索用户信息）时出现异常' }
					}

					if (result && result.success && result.result) {
						const resultLength = result.result?.length
						if (resultLength === 1) {
							return { success: true, username: result.result?.[0].username, uid: result.result?.[0].uid, token: result.result?.[0].token, message: '用户登录成功' }
						} else {
							console.error('ERROR', `用户登录失败：查询失败，或者结果长度不为 1，用户名：【${username}】`)
							return { success: false, username, passwordHint, message: '用户登录失败：查询结果异常' }
						}
					} else {
						console.error('ERROR', `用户登录失败：查询失败，或者结果为空，用户名：【${username}】`)
						return { success: false, username, passwordHint, message: '用户登录失败：查询失败' }
					}
				} else {
					console.error('ERROR', `Hash 用户密码时出错，Hash 后的密码为空，用户名：【${username}】`)
					return { success: false, username, passwordHint, message: '用户登录失败：整理密码时出错或非法密码' }
				}
			} else {
				console.error('ERROR', `用户登录失败：盐是空字符串，用户名：【${username}】`)
				return { success: false, username, passwordHint, message: '用户登录失败：初始化查询结果为空' }
			}
		}
	} catch (error) {
		console.error('ERROR', '用户登录时程序异常：', error)
		return { success: false, message: '用户登录时程序异常' }
	}
}

/**
 * 检查一个用户是否存在
 * @param checkUserExistsCheckData 检查用户是否存在需要的信息（用户名）
 * @return checkUserExistsCheckResultDto 检查结果，如果存在或查询失败则 exists: true
 */
export const checkUserExistsCheckService = async (serExistsCheckData: UserExistsCheckDataDto): Promise<UserExistsCheckResultDto> => {
	try {
		if (checkUserExistsCheckData(serExistsCheckData)) {
			const { collectionName, schema: userAuthSchema } = UserAuthSchema
			const schema = new Schema(userAuthSchema)
			type User = InferSchemaType<typeof schema>
			const where: QueryType<User> = {
				username: serExistsCheckData.username,
			}
			const select: SelectType<User> = {
				username: 1,
			}
			let result: DbPoolResultType<User>

			try {
				result = await selectDataFromMongoDB(where, select, schema, collectionName)
			} catch (error) {
				console.error('ERROR', '验证用户是否存在（查询用户）时出现异常：', error)
				return { success: false, exists: true, message: '验证用户是否存在时出现异常' }
			}

			if (result && result.success && result.result) {
				if (result.result?.length > 0) {
					return { success: true, exists: true, message: '用户已存在' }
				} else {
					return { success: true, exists: false, message: '用户不存在' }
				}
			} else {
				return { success: false, exists: true, message: '查询失败' }
			}
		}
	} catch (error) {
		console.error('ERROR', '查询用户是否存在时出错：', error)
		return { success: false, exists: true, message: '验证用户是否存在时程序异常' }
	}
}



/**
 * 用户注册信息的非空验证
 * @param userRegistrationData
 * @returns boolean 如果合法则返回 true
 */
const checkUserRegistrationData = (userRegistrationData: UserRegistrationDataDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (!!userRegistrationData.passwordHash && !!userRegistrationData.username)
}

/**
 * 生成随机盐，通过盐二次 Hash 密码，让用户密码可以安全存储在 DB 中
 * @param userRegistrationData | UserLoginDataDto 用户注册或者登录时的信息
 * @returns HashPasswordResult 被 Hash 后的密码和盐
 */
const getHashPasswordAndSalt = async (userRegistrationData: UserRegistrationDataDto | UserLoginDataDto): Promise<HashPasswordResult> => {
	try {
		if (checkUserRegistrationData(userRegistrationData)) {
			const salt = generateSecureRandomString(32)
			const username = userRegistrationData.username
			const passwordHash = userRegistrationData.passwordHash
			if (salt) {
				const saltHash = await generateSaltedHash(salt, passwordHash)
					.catch(e => {
						console.error('something error in function getHashPasswordAndSalt -> generateSaltedHash-1', e)
					})
				if (saltHash) {
					const finalSalt = `${username}-${passwordHash}-${saltHash}`
					if (finalSalt) {
						const passwordHashHash = await generateSaltedHash(passwordHash, finalSalt)
							.catch(e => {
								console.error('something error in function getHashPasswordAndSalt -> generateSaltedHash-2', e)
							})
						if (passwordHashHash) {
							return { passwordHashHash, salt }
						} else {
							console.error('something error in function getHashPasswordAndSalt, required data passwordHashHash is empty')
							return { passwordHashHash: '', salt: '' }
						}
					} else {
						console.error('something error in function getHashPasswordAndSalt, required data finalSalt is empty')
						return { passwordHashHash: '', salt: '' }
					}
				} else {
					console.error('something error in function getHashPasswordAndSalt, required data saltHash is empty')
					return { passwordHashHash: '', salt: '' }
				}
			} else {
				console.error('something error in function getHashPasswordAndSalt, required data salt is empty')
				return { passwordHashHash: '', salt: '' }
			}
		} else {
			console.error('something error in function getHashPasswordAndSalt, checkUserLoginData result is false')
			return { passwordHashHash: '', salt: '' }
		}
	} catch (e) {
		console.error('something error in function getHashPasswordAndSalt', e)
		return { passwordHashHash: '', salt: '' }
	}
}

/**
 * 通过用户传入的盐，二次 Hash 密码，获取的结果将与数据库中的值比对是否一致
 * @param userRegistrationData | UserLoginDataDto 用户注册或者登录时的信息
 * @param salt 盐
 * @returns string 被 Hash 后的密码
 */
const getHashPasswordBySalt = async (userRegistrationData: UserRegistrationDataDto | UserLoginDataDto, salt: string): Promise<string> => {
	try {
		if (checkUserRegistrationData(userRegistrationData)) {
			const username = userRegistrationData.username
			const passwordHash = userRegistrationData.passwordHash
			if (salt) {
				const saltHash = await generateSaltedHash(salt, passwordHash)
					.catch(e => {
						console.error('something error in function getHashPasswordBySalt -> generateSaltedHash-1', e)
					})
				if (saltHash) {
					const finalSalt = `${username}-${passwordHash}-${saltHash}`
					if (finalSalt) {
						const passwordHashHash = await generateSaltedHash(passwordHash, finalSalt)
							.catch(e => {
								console.error('something error in function getHashPasswordBySalt -> generateSaltedHash-2', e)
							})
						if (passwordHashHash) {
							return passwordHashHash
						} else {
							console.error('something error in function getHashPasswordBySalt, required data passwordHashHash is empty')
							return ''
						}
					} else {
						console.error('something error in function getHashPasswordBySalt, required data finalSalt is empty')
						return ''
					}
				} else {
					console.error('something error in function getHashPasswordBySalt, required data saltHash is empty')
					return ''
				}
			} else {
				console.error('something error in function getHashPasswordBySalt, required data salt is empty')
				return ''
			}
		} else {
			console.error('something error in function getHashPasswordBySalt, checkUserLoginData result is false')
			return ''
		}
	} catch (e) {
		console.error('something error in function getHashPasswordBySalt', e)
		return ''
	}
}

/**
 * 用户是否存在验证的参数的非空验证
 * @param checkUserExistsCheckData
 * @returns boolean 合法则返回 true
 */
const checkUserExistsCheckData = (userExistsCheckData: UserExistsCheckDataDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return !!userExistsCheckData.username
}
