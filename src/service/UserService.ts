import { InferSchemaType, Schema } from 'mongoose'
import { generateSaltedHash } from '../common/HashTool.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { BeforeHashPasswordDataType, UpdateUserEmailRequestDto, UpdateUserEmailResponseDto, UserExistsCheckRequestDto, UserExistsCheckResponseDto, UserLoginRequestDto, UserLoginResponseDto, UserRegistrationRequestDto, UserRegistrationResponseDto } from '../controller/UserControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { DbPoolResultType, QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { UserAuthSchema } from '../dbPool/schema/UserSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'

type HashPasswordResult = {
	passwordHashHash: string;
	salt: string;
}

/**
 * 用户注册
 * @param userRegistrationRequest 用户注册时需要传入的信息（用户名，密码）
 * @returns UserRegistrationResponseDto 用户注册的结果，如果成功会包含 token
 */
export const userRegistrationService = async (userRegistrationRequest: UserRegistrationRequestDto): Promise<UserRegistrationResponseDto> => {
	try {
		if (checkUserRegistrationData(userRegistrationRequest)) {
			const { email, passwordHash, passwordHint } = userRegistrationRequest
			const beforeHashPasswordData: BeforeHashPasswordDataType = { email, passwordHash }
			const { passwordHashHash, salt } = await getHashPasswordAndSalt(beforeHashPasswordData)
			const token = generateSecureRandomString(64)
			if (passwordHashHash && token) {
				const { collectionName, schema: userAuthSchema } = UserAuthSchema
				const schema = new Schema(userAuthSchema)
				const uid = (await getNextSequenceValueService('user')).sequenceValue
				if (uid !== null && uid !== undefined) {
					type User = InferSchemaType<typeof schema>
					const user: User = {
						uid,
						email,
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
 * @param userLoginRequest 用户登录时需要传入的信息（用户名，密码）
 * @return UserLoginResponseDto 用户登录结果，如果登录成功会包含 token
 */
export const userLoginService = async (userLoginRequest: UserLoginRequestDto): Promise<UserLoginResponseDto> => {
	try {
		if (checkUserLoginRequest(userLoginRequest)) {
			const { email, passwordHash } = userLoginRequest

			const { collectionName, schema: userAuthSchema } = UserAuthSchema
			const schema = new Schema(userAuthSchema)
			type User = InferSchemaType<typeof schema>
			const userSaltAndPasswordHintWhere: QueryType<User> = {
				email,
			}

			const userSaltAndPasswordHintSelect: SelectType<User> = {
				email: 1,
				salt: 1,
				passwordHint: 1,
			}

			let saltResult: DbPoolResultType<User>

			try {
				saltResult = await selectDataFromMongoDB(userSaltAndPasswordHintWhere, userSaltAndPasswordHintSelect, schema, collectionName)
			} catch (error) {
				console.error('ERROR', `用户登录（查询用户盐）时出现异常，用户邮箱：【${email}】，错误信息：`, error)
				return { success: false, email, message: '用户登录（初始化用户信息）时出现异常' }
			}

			let salt: string
			let passwordHint: string
			if (saltResult && saltResult.success && saltResult.result) {
				const saltResultLength = saltResult?.result?.length
				if (saltResult?.result && saltResultLength === 1) {
					salt = saltResult.result?.[0].salt
					passwordHint = saltResult.result?.[0].passwordHint
				} else {
					console.error('ERROR', `用户登录失败：盐查询失败，或者结果长度不为 1，用户邮箱：【${email}】`)
					return { success: false, email, message: '用户登录失败：初始化查询结果异常' }
				}
			} else {
				console.error('ERROR', `用户登录失败：盐查询失败，或者结果为空，用户邮箱：【${email}】`)
				return { success: false, email, message: '用户登录失败：初始化查询失败' }
			}

			if (salt) {
				const beforeHashPasswordData: BeforeHashPasswordDataType = { email, passwordHash }
				const passwordHashHash = await getHashPasswordBySalt(beforeHashPasswordData, salt)
				if (passwordHashHash) {
					const userLoginWhere: QueryType<User> = {
						email,
						passwordHashHash,
					}

					const userLoginSelect: SelectType<User> = {
						email: 1,
						uid: 1,
						token: 1,
						passwordHint: 1,
					}
					let result: DbPoolResultType<User>
		
					try {
						result = await selectDataFromMongoDB(userLoginWhere, userLoginSelect, schema, collectionName)
					} catch (error) {
						console.error('ERROR', `用户登录（查询用户信息）时出现异常，用户邮箱：【${email}】，错误信息：`, error)
						return { success: false, email, message: '用户登录（检索用户信息）时出现异常' }
					}

					if (result && result.success && result.result) {
						const resultLength = result.result?.length
						if (resultLength === 1) {
							return { success: true, email: result.result?.[0].email, uid: result.result?.[0].uid, token: result.result?.[0].token, message: '用户登录成功' }
						} else {
							console.error('ERROR', `用户登录失败：查询失败，或者结果长度不为 1，用户邮箱：【${email}】`)
							return { success: false, email, passwordHint, message: '用户登录失败：查询结果异常' }
						}
					} else {
						console.error('ERROR', `用户登录失败：查询失败，或者结果为空，用户邮箱：【${email}】`)
						return { success: false, email, passwordHint, message: '用户登录失败：查询失败' }
					}
				} else {
					console.error('ERROR', `Hash 用户密码时出错，Hash 后的密码为空，用户邮箱：【${email}】`)
					return { success: false, email, passwordHint, message: '用户登录失败：整理密码时出错或非法密码' }
				}
			} else {
				console.error('ERROR', `用户登录失败：盐是空字符串，用户名：【${email}】`)
				return { success: false, email, passwordHint, message: '用户登录失败：初始化查询结果为空' }
			}
		}
	} catch (error) {
		console.error('ERROR', '用户登录时程序异常：', error)
		return { success: false, message: '用户登录时程序异常' }
	}
}

/**
 * 检查一个用户是否存在
 * @param checkUserExistsCheckRequest 检查用户是否存在需要的信息（用户名）
 * @return UserExistsCheckResponseDto 检查结果，如果存在或查询失败则 exists: true
 */
export const userExistsCheckService = async (userExistsCheckRequest: UserExistsCheckRequestDto): Promise<UserExistsCheckResponseDto> => {
	try {
		if (checkUserExistsCheckRequest(userExistsCheckRequest)) {
			const { collectionName, schema: userAuthSchema } = UserAuthSchema
			const schema = new Schema(userAuthSchema)
			type User = InferSchemaType<typeof schema>
			const where: QueryType<User> = {
				email: userExistsCheckRequest.email,
			}
			const select: SelectType<User> = {
				email: 1,
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

export const updateUserEmailService = async (updateUserEmailRequest: UpdateUserEmailRequestDto): Promise<UpdateUserEmailResponseDto> => {
	try {
		if (checkUpdateUserEmailRequest(updateUserEmailRequest)) {
			const { uid, oldEmail, newEmail, passwordHash } = updateUserEmailRequest

			const { collectionName, schema: userAuthSchema } = UserAuthSchema
			const schema = new Schema(userAuthSchema)
			type User = InferSchemaType<typeof schema>
			const userSaltAndPasswordHintWhere: QueryType<User> = {
				uid,
			}

			const userSaltAndPasswordHintSelect: SelectType<User> = {
				email: 1,
				salt: 1,
				passwordHashHash: 1,
			}

			let userInfo: DbPoolResultType<User>

			try {
				userInfo = await selectDataFromMongoDB(userSaltAndPasswordHintWhere, userSaltAndPasswordHintSelect, schema, collectionName)
			} catch (error) {
				console.error('ERROR', `修改用户邮箱（查询用户信息）时出现异常，用户uid：【${uid}】，错误信息：`, error)
				return { success: false, message: '更新用户邮箱时出现异常，无法查询用户信息' }
			}

			if (userInfo && userInfo.success && userInfo.result) {
				const saltResultLength = userInfo?.result?.length
				if (userInfo?.result && saltResultLength === 1) {
					const salt = userInfo.result?.[0].salt
					if (salt) {
						const oldPasswordHashHashInDb = userInfo.result?.[0].passwordHashHash
						const beforeHashPasswordData: BeforeHashPasswordDataType = { email: oldEmail, passwordHash }
						let passwordHashHash: string
						try {
							passwordHashHash = await getHashPasswordBySalt(beforeHashPasswordData, salt)
						} catch (error) {
							console.error('ERROR', '生成用户原始密码时出错', { uid, oldEmail, newEmail, passwordHash }, error)
							return { success: false, message: '用户邮箱更新失败，验证原始密码时出错' }
						}
						if (oldPasswordHashHashInDb && passwordHashHash && oldPasswordHashHashInDb === passwordHashHash) {
							let newPasswordHashHash: string
							try {
								const newPasswordBeforeHashPasswordData: BeforeHashPasswordDataType = { email: newEmail, passwordHash }
								newPasswordHashHash = await getHashPasswordBySalt(newPasswordBeforeHashPasswordData, salt)
							} catch (error) {
								console.error('ERROR', '生成用户新密码时出错', { uid, oldEmail, newEmail, passwordHash }, error)
								return { success: false, message: '用户邮箱更新失败，获取用户身份时出错' }
							}
							if (newPasswordHashHash) {
								const updateUserEmailWhere: QueryType<User> = {
									uid,
								}
								const updateUserEmailUpdate: QueryType<User> = {
									email: newEmail,
									passwordHashHash: newPasswordHashHash,
								}
								try {
									const updateResult = await updateData4MongoDB(updateUserEmailWhere, updateUserEmailUpdate, schema, collectionName)
									if (updateResult && updateResult.success && updateResult.result) {
										if (updateResult.result.matchedCount > 0 && updateResult.result.modifiedCount > 0) {
											return { success: true, message: '用户邮箱更新成功' }
										} else {
											console.error('ERROR', '更新用户邮箱和密码时，更新数量为 0', { uid, oldEmail, newEmail, passwordHash })
											return { success: false, message: '用户邮箱更新失败，无法更新用户邮箱' }
										}
									}
								} catch (error) {
									console.error('ERROR', '更新用户邮箱和密码时出错', { uid, oldEmail, newEmail, passwordHash }, error)
									return { success: false, message: '用户邮箱更新失败，更新用户身份时出错' }
								}
							} else {
								console.error('ERROR', '更新用户邮箱时，未获取到新密码', { uid, oldEmail, newEmail, passwordHash })
								return { success: false, message: '用户邮箱更新失败，无法获取用户身份' }
							}
						} else {
							console.error('ERROR', '更新用户邮箱时，获取到的旧密码为空或数据库中的旧密码和生成的密码不一致', { uid, oldEmail, newEmail, passwordHash })
							return { success: false, message: '用户邮箱更新失败，验证原始密码未通过' }
						}
					} else {
						console.error('ERROR', '更新用户邮箱时出错，为获取到盐', { uid, oldEmail, newEmail, passwordHash })
						return { success: false, message: '用户邮箱更新失败，无法获取用户原始安全数据' }
					}
				} else {
					console.error('ERROR', '更新用户邮箱时失败，原始数据数组长度为 0', { uid, oldEmail, newEmail, passwordHash })
					return { success: false, message: '用户邮箱更新失败，无法获取用户原始信息' }
				}
			} else {
				console.error('ERROR', '更新用户邮箱时失败，未获取到原始数据', { uid, oldEmail, newEmail, passwordHash })
				return { success: false, message: '用户邮箱更新失败，无法获取用户原始信息，数据为空' }
			}
		} else {
			console.error('ERROR', '修改用户邮箱失败，缺少必要参数：', { updateUserEmailRequest })
			return { success: false, message: '修改用户邮箱失败，缺少必要参数' }
		}
	} catch (error) {
		console.error('ERROR', '修改用户邮箱失败，未知错误：', error)
		return { success: false, message: '修改用户邮箱失败，未知错误' }
	}
}



/**
 * 用户注册信息的非空验证
 * @param userRegistrationRequest
 * @returns boolean 如果合法则返回 true
 */
const checkUserRegistrationData = (userRegistrationRequest: UserRegistrationRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (!!userRegistrationRequest.passwordHash && !!userRegistrationRequest.email)
}

/**
 * 生成随机盐，通过盐二次 Hash 密码，让用户密码可以安全存储在 DB 中
 * @param userRegistrationRequest 用户注册时的信息
 * @returns HashPasswordResult 被 Hash 后的密码和盐
 */
const getHashPasswordAndSalt = async (beforeHashPasswordData: BeforeHashPasswordDataType): Promise<HashPasswordResult> => {
	try {
		if (checkUserRegistrationData(beforeHashPasswordData)) {
			const salt = generateSecureRandomString(32)
			const email = beforeHashPasswordData.email
			const passwordHash = beforeHashPasswordData.passwordHash
			if (salt) {
				try {
					const saltHash = await generateSaltedHash(salt, passwordHash)
					if (saltHash) {
						const finalSalt = `${email}-${passwordHash}-${saltHash}`
						if (finalSalt) {
							try {
								const passwordHashHash = await generateSaltedHash(passwordHash, finalSalt)
								if (passwordHashHash) {
									return { passwordHashHash, salt }
								} else {
									console.error('something error in function getHashPasswordAndSalt, required data passwordHashHash is empty')
									return { passwordHashHash: '', salt: '' }
								}
							} catch (error) {
								console.error('something error in function getHashPasswordAndSalt -> generateSaltedHash-2', error)
							}
						} else {
							console.error('something error in function getHashPasswordAndSalt, required data finalSalt is empty')
							return { passwordHashHash: '', salt: '' }
						}
					} else {
						console.error('something error in function getHashPasswordAndSalt, required data saltHash is empty')
						return { passwordHashHash: '', salt: '' }
					}
				} catch (error) {
					console.error('something error in function getHashPasswordAndSalt -> generateSaltedHash-1', error)
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
 * @param beforeHashPasswordData 等待被 Hash 的密码和用户信息
 * @param salt 盐
 * @returns string 被 Hash 后的密码
 */
const getHashPasswordBySalt = async (beforeHashPasswordData: BeforeHashPasswordDataType, salt: string): Promise<string> => {
	try {
		if (checkUserRegistrationData(beforeHashPasswordData)) {
			const email = beforeHashPasswordData.email
			const passwordHash = beforeHashPasswordData.passwordHash
			if (salt) {
				try {
					const saltHash = await generateSaltedHash(salt, passwordHash)
					if (saltHash) {
						const finalSalt = `${email}-${passwordHash}-${saltHash}`
						if (finalSalt) {
							try {
								const passwordHashHash = await generateSaltedHash(passwordHash, finalSalt)
								if (passwordHashHash) {
									return passwordHashHash
								} else {
									console.error('something error in function getHashPasswordBySalt, required data passwordHashHash is empty')
									return ''
								}
							} catch (error) {
								console.error('something error in function getHashPasswordBySalt -> generateSaltedHash-2', error)
							}
						} else {
							console.error('something error in function getHashPasswordBySalt, required data finalSalt is empty')
							return ''
						}
					} else {
						console.error('something error in function getHashPasswordBySalt, required data saltHash is empty')
						return ''
					}
				} catch (error) {
					console.error('something error in function getHashPasswordBySalt -> generateSaltedHash-1', error)
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
 * 用户是否存在验证的请求参数的非空验证
 * @param userExistsCheckRequest
 * @returns boolean 合法则返回 true
 */
const checkUserExistsCheckRequest = (userExistsCheckRequest: UserExistsCheckRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return !!userExistsCheckRequest.email
}

/**
 * 用户登录的请求参数的非空验证
 * @param userExistsCheckRequest
 * @returns boolean 合法则返回 true
 */
const checkUserLoginRequest = (userLoginRequest: UserLoginRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (!!userLoginRequest.email && !!userLoginRequest.passwordHash)
}

/**
 * 用户修改邮箱的请求参数的非空验证
 * @param updateUserEmailRequest
 * @returns boolean 合法则返回 true
 */
const checkUpdateUserEmailRequest = (updateUserEmailRequest: UpdateUserEmailRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (!!updateUserEmailRequest.uid && !!updateUserEmailRequest.oldEmail && !!updateUserEmailRequest.newEmail && !!updateUserEmailRequest.passwordHash)
}
