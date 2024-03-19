import { InferSchemaType } from 'mongoose'
import { createCloudflareImageUploadSignedUrl, createCloudflareR2PutSignedUrl } from '../cloudflare/index.js'
import { generateSaltedHash } from '../common/HashTool.js'
import { isEmptyObject } from '../common/ObjectTool.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { BeforeHashPasswordDataType, CheckUserTokenResponseDto, GetSelfUserInfoRequestDto, GetSelfUserInfoResponseDto, GetUserAvatarUploadSignedUrlResultDto, GetUserInfoByUidRequestDto, GetUserInfoByUidResponseDto, GetUserSettingsResponseDto, UpdateOrCreateUserInfoRequestDto, UpdateOrCreateUserInfoResponseDto, UpdateOrCreateUserSettingsRequestDto, UpdateOrCreateUserSettingsResponseDto, UpdateUserEmailRequestDto, UpdateUserEmailResponseDto, UserExistsCheckRequestDto, UserExistsCheckResponseDto, UserLoginRequestDto, UserLoginResponseDto, UserRegistrationRequestDto, UserRegistrationResponseDto } from '../controller/UserControllerDto.js'
import { findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { DbPoolResultsType, QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { UserAuthSchema, UserInfoSchema, UserSettingsSchema } from '../dbPool/schema/UserSchema.js'
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
				const { collectionName, schemaInstance } = UserAuthSchema
				const uid = (await getNextSequenceValueService('user')).sequenceValue
				if (uid !== null && uid !== undefined) {
					type UserAuth = InferSchemaType<typeof schemaInstance>

					// TODO 添加创建日期字段，先获取用户创建日期，如果没有创建日期则以当前日期为创建日期

					const user: UserAuth = {
						uid,
						email,
						passwordHashHash,
						salt,
						token,
						passwordHint,
						editDateTime: new Date().getTime(),
					}
					try {
						await insertData2MongoDB(user, schemaInstance, collectionName)
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

			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const userSaltAndPasswordHintWhere: QueryType<UserAuth> = {
				email,
			}

			const userSaltAndPasswordHintSelect: SelectType<UserAuth> = {
				email: 1,
				salt: 1,
				passwordHint: 1,
			}

			let saltResult: DbPoolResultsType<UserAuth>

			try {
				saltResult = await selectDataFromMongoDB(userSaltAndPasswordHintWhere, userSaltAndPasswordHintSelect, schemaInstance, collectionName)
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
					const userLoginWhere: QueryType<UserAuth> = {
						email,
						passwordHashHash,
					}

					const userLoginSelect: SelectType<UserAuth> = {
						email: 1,
						uid: 1,
						token: 1,
						passwordHint: 1,
					}
					let result: DbPoolResultsType<UserAuth>

					try {
						result = await selectDataFromMongoDB(userLoginWhere, userLoginSelect, schemaInstance, collectionName)
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
			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const where: QueryType<UserAuth> = {
				email: userExistsCheckRequest.email,
			}
			const select: SelectType<UserAuth> = {
				email: 1,
			}

			let result: DbPoolResultsType<UserAuth>
			try {
				result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
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
 * 修改用户的 email
 * @param updateUserEmailRequest 修改用户的 email 的请求参数
 * @returns 修改用户的 email 的请求响应
 */
export const updateUserEmailService = async (updateUserEmailRequest: UpdateUserEmailRequestDto): Promise<UpdateUserEmailResponseDto> => {
	try {
		if (checkUpdateUserEmailRequest(updateUserEmailRequest)) {
			const { uid, oldEmail, newEmail, passwordHash } = updateUserEmailRequest

			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const userSaltAndPasswordHintWhere: QueryType<UserAuth> = {
				uid,
			}

			const userSaltAndPasswordHintSelect: SelectType<UserAuth> = {
				email: 1,
				salt: 1,
				passwordHashHash: 1,
			}

			let userInfo: DbPoolResultsType<UserAuth>
			try {
				userInfo = await selectDataFromMongoDB(userSaltAndPasswordHintWhere, userSaltAndPasswordHintSelect, schemaInstance, collectionName)
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
								const updateUserEmailWhere: QueryType<UserAuth> = {
									uid,
								}
								const updateUserEmailUpdate: QueryType<UserAuth> = {
									email: newEmail,
									passwordHashHash: newPasswordHashHash,
								}
								try {
									const updateResult = await updateData4MongoDB(updateUserEmailWhere, updateUserEmailUpdate, schemaInstance, collectionName)
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
 * 根据 UID 更新或创建用户信息
 * @param updateUserInfoRequest 更新或创建用户信息时的请求参数
 * @param uid 用户 ID
 * @param token 用户 token
 * @returns 更新或创建用户信息的请求结果
 */
export const updateOrCreateUserInfoService = async (updateOrCreateUserInfoRequest: UpdateOrCreateUserInfoRequestDto, uid: number, token: string): Promise<UpdateOrCreateUserInfoResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			if (checkUpdateOrCreateUserInfoRequest(updateOrCreateUserInfoRequest)) {
				const { collectionName, schemaInstance } = UserInfoSchema
				type UserInfo = InferSchemaType<typeof schemaInstance>
				const updateUserInfoWhere: QueryType<UserInfo> = {
					uid,
				}
				const updateUserInfoUpdate: UserInfo = {
					uid,
					...updateOrCreateUserInfoRequest,
					label: updateOrCreateUserInfoRequest.label,
					userLinkAccounts: updateOrCreateUserInfoRequest.userLinkAccounts,
					editDateTime: new Date().getTime(),
				}
				const updateResult = await findOneAndUpdateData4MongoDB(updateUserInfoWhere, updateUserInfoUpdate, schemaInstance, collectionName)
				if (updateResult && updateResult.success && updateResult.result) {
					return { success: true, message: '更新用户信息成功', result: updateResult.result }
				} else {
					console.error('ERROR', '更新用户信息失败，没有返回用户数据', { updateOrCreateUserInfoRequest, uid })
					return { success: false, message: '更新用户信息失败，没有返回用户数据' }
				}
			} else {
				console.error('ERROR', '更新用户信息时失败，未找到必要的数据，或者关联账户平台类型不合法：', { updateOrCreateUserInfoRequest, uid })
				return { success: false, message: '更新用户数据时失败，必要的数据为空或关联平台信息出错' }
			}
		} else {
			console.error('ERROR', '更新用户数据时失败，token 校验失败，非法用户！', { updateOrCreateUserInfoRequest, uid })
			return { success: false, message: '更新用户数据时失败，非法用户！' }
		}
	} catch (error) {
		console.error('ERROR', '更新用户信息时失败，未知异常', error)
		return { success: false, message: '更新用户数据时失败，未知异常' }
	}
}

/**
 * 获取当前登录的用户信息
 * @param getSelfUserInfoRequest 获取当前登录的用户信息的请求参数
 * @returns 获取到的当前登录的用户信息
 */
export const getSelfUserInfoService = async (getSelfUserInfoRequest: GetSelfUserInfoRequestDto): Promise<GetSelfUserInfoResponseDto> => {
	try {
		const uid = getSelfUserInfoRequest.uid
		const token = getSelfUserInfoRequest.token
		if (uid !== null && uid !== undefined && token) {
			if (await checkUserToken(uid, token)) {
				const { collectionName, schemaInstance } = UserInfoSchema
				type UserInfo = InferSchemaType<typeof schemaInstance>
				const getUserInfoWhere: QueryType<UserInfo> = {
					uid,
				}
				const getUserInfoSelect: SelectType<UserInfo> = {
					uid: 1, // 用户 UID
					label: 1, // 用户标签
					username: 1, // 用户名
					avatar: 1, // 用户头像
					userBannerImage: 1, // 用户的背景图
					signature: 1, // 用户的个性签名
					gender: 1, // 用户的性别
				}
				try {
					const userInfoResult = await selectDataFromMongoDB(getUserInfoWhere, getUserInfoSelect, schemaInstance, collectionName)
					if (userInfoResult && userInfoResult.success) {
						const result = userInfoResult?.result
						if (result?.length === 1 && result?.[0]) {
							return { success: true, message: '获取用户信息成功', result: result[0] }
						} else {
							console.error('ERROR', '获取用户信息时失败，获取到的结果长度不为 1')
							return { success: false, message: '获取用户信息时失败，结果异常' }
						}
					} else {
						console.error('ERROR', '获取用户信息时失败，获取到的结果为空')
						return { success: false, message: '获取用户信息时失败，结果为空' }
					}
				} catch (error) {
					console.error('ERROR', '获取用户信息时失败，查询数据时出错：0', error)
					return { success: false, message: '获取用户信息时失败' }
				}
			} else {
				console.error('ERROR', '获取用户信息时失败，用户的 token 校验未通过，非法用户！')
				return { success: false, message: '获取用户信息时失败，非法用户！' }
			}
		} else {
			console.error('ERROR', '获取用户信息时失败，uid 或 token 为空')
			return { success: false, message: '获取用户信息时失败，必要的参数为空' }
		}
	} catch (error) {
		console.error('ERROR', '获取用户信息时失败，未知错误：', error)
		return { success: false, message: '获取用户信息时失败，未知错误' }
	}
}

/**
 * 通过 uid 获取用户信息
 * @param uid 用户 ID
 * @returns 获取用户信息的请求结果
 */
export const getUserInfoByUidService = async (getUserInfoByUidRequest: GetUserInfoByUidRequestDto): Promise<GetUserInfoByUidResponseDto> => {
	try {
		const uid = getUserInfoByUidRequest?.uid
		if (uid !== null && uid !== undefined) {
			const { collectionName, schemaInstance } = UserInfoSchema
			type UserInfo = InferSchemaType<typeof schemaInstance>
			const getUserInfoWhere: QueryType<UserInfo> = {
				uid,
			}
			const getUserInfoSelect: SelectType<UserInfo> = {
				label: 1, // 用户标签
				username: 1, // 用户名
				avatar: 1, // 用户头像
				userBannerImage: 1, // 用户的背景图
				signature: 1, // 用户的个性签名
				gender: 1, // 用户的性别
			}
			try {
				const userInfoResult = await selectDataFromMongoDB(getUserInfoWhere, getUserInfoSelect, schemaInstance, collectionName)
				if (userInfoResult && userInfoResult.success) {
					const result = userInfoResult?.result
					if (result?.length === 1 && result?.[0]) {
						return { success: true, message: '获取用户信息成功', result: result[0] }
					} else {
						console.error('ERROR', '获取用户信息时失败，获取到的结果长度不为 1')
						return { success: false, message: '获取用户信息时失败，结果异常' }
					}
				} else {
					console.error('ERROR', '获取用户信息时失败，获取到的结果为空')
					return { success: false, message: '获取用户信息时失败，结果为空' }
				}
			} catch (error) {
				console.error('ERROR', '获取用户信息时失败，查询数据时出错：0', error)
				return { success: false, message: '获取用户信息时失败' }
			}
		} else {
			console.error('ERROR', '获取用户信息时失败，uid 或 token 为空')
			return { success: false, message: '获取用户信息时失败，必要的参数为空' }
		}
	} catch (error) {
		console.error('ERROR', '获取用户信息时失败，未知错误：', error)
		return { success: false, message: '获取用户信息时失败，未知错误' }
	}
}

/**
 * 更新用户头像，并获取用于用户上传头像的预签名 URL, 上传限时 60 秒
 * @param uid 用户 ID
 * @param token 用户 token
 * @returns 用于用户上传头像的预签名 URL 的结果
 */
export const getUserAvatarUploadSignedUrlService = async (uid: number, token: string): Promise<GetUserAvatarUploadSignedUrlResultDto> => {
	// TODO 图片上传逻辑需要重写，当前如何用户上传图片失败，仍然会用新头像链接替换数据库中的旧头像链接，而且当前图片没有加入审核流程
	try {
		if (await checkUserToken(uid, token)) {
			const now = new Date().getTime()
			const fileName = `avatar-${uid}-${generateSecureRandomString(32)}-${now}`

			const { collectionName, schemaInstance } = UserInfoSchema
			type UserInfo = InferSchemaType<typeof schemaInstance>
			const updateUserInfoWhere: QueryType<UserInfo> = {
				uid,
			}
			const updateUserInfoUpdate: UserInfo = {
				uid,
				avatar: fileName,
				label: undefined,
				userLinkAccounts: undefined,
				editDateTime: now,
			}
			const updateResult = await findOneAndUpdateData4MongoDB(updateUserInfoWhere, updateUserInfoUpdate, schemaInstance, collectionName)

			if (updateResult.success) {
				const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 180)
				if (signedUrl && fileName) {
					return { success: true, message: '准备开始上传头像', userAvatarUploadSignedUrl: signedUrl, userAvatarFilename: fileName }
				} else {
					// TODO 图片上传逻辑需要重写，当前如何用户上传图片失败，仍然会用新头像链接替换数据库中的旧头像链接，而且当前图片没有加入审核流程
					return { success: false, message: '上传失败，无法生成图片上传 URL，请重新上传头像' }
				}
			} else {
				return { success: false, message: '上传失败，无法更新用户数据' }
			}
		} else {
			console.error('ERROR', '获取上传图片用的预签名 URL 失败，用户不合法', { uid })
			return { success: false, message: '上传失败，无法获取上传权限' }
		}
	} catch (error) {
		console.error('ERROR', '获取上传图片用的预签名 URL 失败，错误信息', error, { uid })
	}
}

/**
 * 获取用户个性设置数据
 * @param uid 用户 ID
 * @param token 用户 token
 * @returns 用户个性设置数据
 */
export const getUserSettingsService = async (uid: number, token: string): Promise<GetUserSettingsResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			const { collectionName, schemaInstance } = UserSettingsSchema
			type UserSettings = InferSchemaType<typeof schemaInstance>
			const getUserSettingsWhere: QueryType<UserSettings> = {
				uid,
			}
			const getUserSettingsSelect: SelectType<UserSettings> = {
				uid: 1,
				enableCookie: 1,
				themeType: 1,
				themeColor: 1,
				wallpaper: 1,
				coloredSideBar: 1,
				dataSaverMode: 1,
				noSearchRecommendations: 1,
				noRelatedVideos: 1,
				noRecentSearch: 1,
				noViewHistory: 1,
				openInNewWindow: 1,
				currentLocale: 1,
				timezone: 1,
				unitSystemType: 1,
				devMode: 1,
				showCssDoodle: 1,
				sharpAppearanceMode: 1,
				flatAppearanceMode: 1,
				userLinkAccountsPrivacySetting: 1,
				userWebsitePrivacySetting: 1,
				editDateTime: 1,
			}
			try {
				const userSettingsResult = await selectDataFromMongoDB(getUserSettingsWhere, getUserSettingsSelect, schemaInstance, collectionName)
				const userSettings = userSettingsResult?.result?.[0]
				if (userSettingsResult?.success && userSettings) {
					return { success: true, message: '获取用户设置成功！', userSettings }
				} else {
					console.error('ERROR', '获取用户个性设置失败，晨讯成功，但获取数据失败或数据为空：', { uid })
					return { success: false, message: '获取用户个性设置失败，数据查询未成功' }
				}
			} catch (error) {
				console.error('ERROR', '获取用户个性设置失败，查询数据时出错：', { uid })
				return { success: false, message: '获取用户个性设置失败，查询数据时出错' }
			}
		} else {
			console.error('ERROR', '获取用户个性设置失败，用户验证时未通过：', { uid })
			return { success: false, message: '获取用户个性设置失败，用户验证时未通过' }
		}
	} catch (error) {
		console.error('ERROR', '获取用户个性设置失败，未知异常：', error)
		return { success: false, message: '获取用户个性设置失败，未知异常' }
	}
}


/**
 * 根据 UID 更新或创建用户设置
 * @param updateOrCreateUserSettingsRequest 更新或创建用户设置时的请求参数
 * @param uid 用户 ID
 * @param token 用户 token
 * @returns 更新或创建用户设置的请求结果
 */
export const updateOrCreateUserSettingsService = async (updateOrCreateUserSettingsRequest: UpdateOrCreateUserSettingsRequestDto, uid: number, token: string): Promise<UpdateOrCreateUserSettingsResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			if (checkUpdateOrCreateUserSettingsRequest(updateOrCreateUserSettingsRequest)) {
				const { collectionName, schemaInstance } = UserSettingsSchema
				type UserSettings = InferSchemaType<typeof schemaInstance>
				const updateOrCreateUserSettingsWhere: QueryType<UserSettings> = {
					uid,
				}
				const updateOrCreateUserSettingsUpdate: UserSettings = {
					uid,
					...updateOrCreateUserSettingsRequest,
					userLinkAccountsPrivacySetting: updateOrCreateUserSettingsRequest.userLinkAccountsPrivacySetting,
					editDateTime: new Date().getTime(),
				}
				const updateResult = await findOneAndUpdateData4MongoDB(updateOrCreateUserSettingsWhere, updateOrCreateUserSettingsUpdate, schemaInstance, collectionName)
				const userSettings = updateResult?.result?.[0]
				if (updateResult?.success) {
					return { success: true, message: '更新或创建用户设置成功', userSettings: userSettings || updateOrCreateUserSettingsUpdate }
				} else {
					console.error('ERROR', '更新或创建用户设置失败，没有返回用户设置数据', { updateOrCreateUserSettingsRequest, uid })
					return { success: false, message: '更新或创建用户设置失败，没有返回用户设置数据' }
				}
			} else {
				console.error('ERROR', '更新或创建用户设置失败，未找到必要的数据，或者关联账户平台类型不合法：', { updateOrCreateUserSettingsRequest, uid })
				return { success: false, message: '更新或创建用户设置失败，必要的数据为空或关联平台信息出错' }
			}
		} else {
			console.error('ERROR', '更新或创建用户设置失败，token 校验失败，非法用户！', { updateOrCreateUserSettingsRequest, uid })
			return { success: false, message: '更新或创建用户设置失败，非法用户！' }
		}
	} catch (error) {
		console.error('ERROR', '更新或创建用户设置时失败，未知异常', error)
		return { success: false, message: '更新或创建用户设置失败，未知异常' }
	}
}





/**
 * 用户校验
 * @param uid 用户 ID, 为空时会导致校验失败
 * @param token 用户 ID 对应的 token，为空时会导致校验失败
 * @returns 校验结果
 */
export const checkUserTokenService = async (uid: number, token: string): Promise<CheckUserTokenResponseDto> => {
	try {
		if (uid !== undefined && uid !== null && token) {
			const checkUserTokenResult = await checkUserToken(uid, token)
			if (checkUserTokenResult) {
				return { success: true, message: '用户校验成功', userTokenOk: true }
			} else {
				console.error('ERROR', `用户校验失败！非法用户！用户 UID：${uid}`)
				return { success: false, message: '用户校验失败！非法用户！', userTokenOk: false }
			}
		} else {
			console.error('ERROR', `用户校验失败！用户 uid 或 token 不存在，用户 UID：${uid}`)
			return { success: false, message: '用户校验失败！', userTokenOk: false }
		}
	} catch {
		console.error('ERROR', `用户校验异常！用户 UID：${uid}`)
		return { success: false, message: '用户校验异常！', userTokenOk: false }
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
	return (
		updateUserEmailRequest.uid !== null && updateUserEmailRequest.uid !== undefined
		&& !!updateUserEmailRequest.oldEmail
		&& !!updateUserEmailRequest.newEmail
		&& !!updateUserEmailRequest.passwordHash
	)
}

/**
 * 检查用户 Token，检查 Token 和用户 id 是否吻合，判断用户是否已注册
 * @param uid 用户 ID
 * @param token 用户 Token
 * @returns boolean 如果验证通过则为 true，不通过为 false
 */
const checkUserToken = async (uid: number, token: string): Promise<boolean> => {
	try {
		if (uid !== null && !Number.isNaN(uid) && uid !== undefined && token) {
			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const userTokenWhere: QueryType<UserAuth> = {
				uid,
				token,
			}
			const userTokenSelect: SelectType<UserAuth> = {
				uid: 1,
			}
			try {
				const userInfo = await selectDataFromMongoDB(userTokenWhere, userTokenSelect, schemaInstance, collectionName)
				if (userInfo && userInfo.success) {
					if (userInfo.result?.length === 1) {
						return true
					} else {
						console.error('ERROR', `查询用户 Token 时，用户信息长度不为 1，用户uid：【${uid}】`)
						return false
					}
				} else {
					console.error('ERROR', `查询用户 Token 时未查询到用户信息，用户uid：【${uid}】，错误描述：${userInfo.message}，错误信息：${userInfo.error}`)
					return false
				}
			} catch (error) {
				console.error('ERROR', `查询用户 Token 时出错，用户uid：【${uid}】，错误信息：`, error)
				return false
			}
		} else {
			console.error('ERROR', `查询用户 Token 时出错，必要的参数 uid 或 token为空：【${uid}】`)
			return false
		}
	} catch (error) {
		console.error('ERROR', '查询用户 Token 时出错，未知错误：', error)
		return false
	}
}


// WARN // TODO 或许这些数据放到环境变量里更好？
const ALLOWED_ACCOUNT_TYPE = [
	'X', // Twitter → X
	'qq',
	'wechat',
	'bili', // 哔哩哔哩
	'niconico',
	'youtube',
	'otomadwiki', // 音 MAD 维基
	'weibo', // 新浪微博
	'NECM', // 网易云音乐
	'discord',
	'telegram',
	'midishow',
	'linkedin',
	'facebook',
	'ins', // Instagram
	'douyin', // 抖音
	'tiktok', // TikTok
	'pixiv',
	'coub',
	'github',
]

/**
 * 检查更新或创建用户信息的请求参数
 * @param updateOrCreateUserInfoRequest 更新或创建用户信息的请求参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkUpdateOrCreateUserInfoRequest = (updateOrCreateUserInfoRequest: UpdateOrCreateUserInfoRequestDto): boolean => {
	// TODO 也许我们应该在未来为其添加更多验证以避免可能的注入风险

	if (!updateOrCreateUserInfoRequest || isEmptyObject(updateOrCreateUserInfoRequest)) {
		return false
	}

	if (updateOrCreateUserInfoRequest.userLinkAccounts) {
		if (updateOrCreateUserInfoRequest.userLinkAccounts.every(account => ALLOWED_ACCOUNT_TYPE.includes(account.accountType))) {
			return false
		}
	}

	return true
}

/**
 * 检查更新或创建用户设置时的请求参数
 * @param updateOrCreateUserSettingsRequest 更新或创建用户设置时的请求参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkUpdateOrCreateUserSettingsRequest = (updateOrCreateUserSettingsRequest: UpdateOrCreateUserSettingsRequestDto): boolean => {
	// TODO 也许我们应该在未来为其添加更多验证以避免可能的注入风险

	if (!updateOrCreateUserSettingsRequest || isEmptyObject(updateOrCreateUserSettingsRequest)) {
		return false
	}

	if (updateOrCreateUserSettingsRequest.userLinkAccountsPrivacySetting) {
		if (updateOrCreateUserSettingsRequest.userLinkAccountsPrivacySetting.every(account => ALLOWED_ACCOUNT_TYPE.includes(account.accountType))) {
			return false
		}
	}

	return true
}
