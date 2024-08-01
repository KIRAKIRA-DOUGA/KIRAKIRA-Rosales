import mongoose, { InferSchemaType } from 'mongoose'
import { createCloudflareImageUploadSignedUrl, createCloudflareR2PutSignedUrl } from '../cloudflare/index.js'
import { isInvalidEmail, sendMail } from '../common/EmailTool.js'
import { comparePasswordSync, hashPasswordSync } from '../common/HashTool.js'
import { isEmptyObject } from '../common/ObjectTool.js'
import { generateSecureRandomString, generateSecureVerificationNumberCode, generateSecureVerificationStringCode } from '../common/RandomTool.js'
import { CheckInvitationCodeRequestDto, CheckInvitationCodeResponseDto, CheckUsernameRequestDto, CheckUsernameResponseDto, CheckUserTokenResponseDto, CreateInvitationCodeResponseDto, GetMyInvitationCodeResponseDto, GetSelfUserInfoRequestDto, GetSelfUserInfoResponseDto, GetUserAvatarUploadSignedUrlResponseDto, GetUserInfoByUidRequestDto, GetUserInfoByUidResponseDto, GetUserSettingsResponseDto, RequestSendChangeEmailVerificationCodeRequestDto, RequestSendChangeEmailVerificationCodeResponseDto, RequestSendChangePasswordVerificationCodeRequestDto, RequestSendChangePasswordVerificationCodeResponseDto, RequestSendVerificationCodeRequestDto, RequestSendVerificationCodeResponseDto, UpdateOrCreateUserInfoRequestDto, UpdateOrCreateUserInfoResponseDto, UpdateOrCreateUserSettingsRequestDto, UpdateOrCreateUserSettingsResponseDto, UpdateUserEmailRequestDto, UpdateUserEmailResponseDto, UpdateUserPasswordRequestDto, UpdateUserPasswordResponseDto, UseInvitationCodeDto, UseInvitationCodeResultDto, UserExistsCheckRequestDto, UserExistsCheckResponseDto, UserLoginRequestDto, UserLoginResponseDto, UserRegistrationRequestDto, UserRegistrationResponseDto } from '../controller/UserControllerDto.js'
import { findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { DbPoolResultsType, QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { UserAuthSchema, UserChangeEmailVerificationCodeSchema, UserChangePasswordVerificationCodeSchema, UserInfoSchema, UserInvitationCodeSchema, UserSettingsSchema, UserVerificationCodeSchema } from '../dbPool/schema/UserSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'

/**
 * 用户注册
 * @param userRegistrationRequest 用户注册时需要传入的信息（用户名，密码）
 * @returns UserRegistrationResponseDto 用户注册的结果，如果成功会包含 token
 */
export const userRegistrationService = async (userRegistrationRequest: UserRegistrationRequestDto): Promise<UserRegistrationResponseDto> => {
	try {
		if (checkUserRegistrationData(userRegistrationRequest)) {
			if (!(await checkInvitationCodeService({ invitationCode: userRegistrationRequest.invitationCode })).isAvailableInvitationCode) { // DELETEME 仅在 beta 测试中使用
				console.error('ERROR', '用户注册失败：邀请码无效')
				return { success: false, message: '用户注册失败：邀请码无效' }
			}
			const { email, passwordHash, passwordHint, verificationCode, username, userNickname } = userRegistrationRequest
			const emailLowerCase = email.toLowerCase()

			if (email && emailLowerCase && verificationCode) {
				// 启动事务
				const session = await mongoose.startSession()
				session.startTransaction()

				const now = new Date().getTime()
				const { collectionName, schemaInstance } = UserAuthSchema
				type UserAuth = InferSchemaType<typeof schemaInstance>

				const userAuthWhere: QueryType<UserAuth> = { emailLowerCase }
				const userAuthSelect: SelectType<UserAuth> = { emailLowerCase: 1 }
				try {
					const useAuthResult = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, schemaInstance, collectionName, { session })
					if (useAuthResult.result && useAuthResult.result.length >= 1) {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '用户注册失败：用户邮箱重复：', { email, emailLowerCase })
						return { success: false, message: '用户注册失败：用户邮箱重复' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '用户注册失败：用户邮箱查重时出现异常：', error, { email, emailLowerCase })
					return { success: false, message: '用户注册失败：用户邮箱查重时出现异常' }
				}

				const { collectionName: userVerificationCodeCollectionName, schemaInstance: userVerificationCodeSchemaInstance } = UserVerificationCodeSchema
				type UserVerificationCode = InferSchemaType<typeof userVerificationCodeSchemaInstance>
				const verificationCodeWhere: QueryType<UserVerificationCode> = {
					emailLowerCase,
					verificationCode,
					overtimeAt: { $gte: now },
				}

				const verificationCodeSelect: SelectType<UserVerificationCode> = {
					emailLowerCase: 1, // 用户邮箱
				}

				try {
					const verificationCodeResult = await selectDataFromMongoDB<UserVerificationCode>(verificationCodeWhere, verificationCodeSelect, userVerificationCodeSchemaInstance, userVerificationCodeCollectionName, { session })
					if (!verificationCodeResult.success || verificationCodeResult.result?.length !== 1) {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '用户注册失败：验证失败')
						return { success: false, message: '用户注册失败：验证失败' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '用户注册失败：请求验证失败')
					return { success: false, message: '用户注册失败：请求验证失败' }
				}

				const passwordHashHash = hashPasswordSync(passwordHash)
				const token = generateSecureRandomString(64)
				const uid = (await getNextSequenceValueService('user')).sequenceValue

				const userAuthData: UserAuth = {
					uid,
					email,
					emailLowerCase,
					passwordHashHash,
					token,
					passwordHint,
					role: 'user', // newbie will always be user role.
					userCreateDateTime: now,
					editDateTime: now,
				}

				const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaInstance } = UserInfoSchema
				type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>
				const userInfoData: UserInfo = {
					uid,
					username,
					userNickname,
					label: [] as UserInfo['label'], // TODO: Mongoose issue: #12420
					userLinkAccounts: [] as UserInfo['userLinkAccounts'], // TODO: Mongoose issue: #12420
					editDateTime: now,
				}

				try {
					const saveUserAuthResult = await insertData2MongoDB(userAuthData, schemaInstance, collectionName, { session })
					const saveUserInfoResult = await insertData2MongoDB(userInfoData, userInfoSchemaInstance, userInfoCollectionName, { session })
					if (saveUserAuthResult.success && saveUserInfoResult.success) {
						const invitationCode = userRegistrationRequest.invitationCode
						if (invitationCode) {
							const useInvitationCodeDto: UseInvitationCodeDto = { invitationCode, registrantUid: uid }
							try {
								const useInvitationCodeResult = await useInvitationCode(useInvitationCodeDto)
								if (!useInvitationCodeResult.success) {
									console.error('ERROR', '用户使用邀请码时出错：更新邀请码使用者失败')
								}
							} catch (error) {
								console.error('ERROR', '用户使用邀请码时出错：更新邀请码使用者时出错：', error)
							}
						}
						await session.commitTransaction()
						session.endSession()
						return { success: true, uid, token, message: '用户注册成功' }
					} else {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '用户注册失败：向 MongoDB 插入数据失败：')
						return { success: false, message: '用户注册失败：保存数据失败' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '用户注册失败：向 MongoDB 插入数据时出现异常：', error)
					return { success: false, message: '用户注册失败：无法保存用户资料' }
				}
			} else {
				console.error('ERROR', '用户注册失败：email 或 emailLowerCase 或 verificationCode 可能为空')
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
			const emailLowerCase = email.toLowerCase()

			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>

			const userLoginWhere: QueryType<UserAuth> = { emailLowerCase }

			const userLoginSelect: SelectType<UserAuth> = {
				email: 1,
				uid: 1,
				token: 1,
				passwordHint: 1,
				passwordHashHash: 1,
			}

			try {
				const userAuthResult = await selectDataFromMongoDB<UserAuth>(userLoginWhere, userLoginSelect, schemaInstance, collectionName)
				if (userAuthResult?.result && userAuthResult.result?.length === 1) {
					const userAuthInfo = userAuthResult.result[0]
					const isCorrectPassword = comparePasswordSync(passwordHash, userAuthInfo.passwordHashHash)
					if (isCorrectPassword && userAuthInfo.email && userAuthInfo.token && userAuthInfo.uid !== undefined && userAuthInfo.uid !== null) {
						return { success: true, email: userAuthInfo.email, uid: userAuthInfo.uid, token: userAuthInfo.token, message: '用户登录成功' }
					} else {
						return { success: false, email, passwordHint: userAuthInfo.passwordHint, message: '用户密码错误' }
					}
				} else {
					console.error('ERROR', `用户登录（查询用户信息）时出现异常，用户邮箱：【${email}】，用户未注册或信息异常'`)
					return { success: false, email, message: '用户未注册或信息异常' }
				}
			} catch (error) {
				console.error('ERROR', `用户登录（查询用户信息）时出现异常，用户邮箱：【${email}】，错误信息：`, error)
				return { success: false, email, message: '用户登录（检索用户信息）时出现异常' }
			}
		} else {
			console.error('ERROR', '用户登录时程序异常：用户信息校验未通过')
			return { success: false, message: '用户信息校验未通过' }
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
				emailLowerCase: userExistsCheckRequest.email.toLowerCase(),
			}
			const select: SelectType<UserAuth> = {
				emailLowerCase: 1,
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
 * @param uid 用户 ID
 * @param token 用户 token
 * @returns 修改用户的 email 的请求响应
 */
export const updateUserEmailService = async (updateUserEmailRequest: UpdateUserEmailRequestDto, cookieUid: number, cookieToken: string): Promise<UpdateUserEmailResponseDto> => {
	try {
		// TODO: 向旧邮箱发送邮件以验证
		if (await checkUserToken(cookieUid, cookieToken)) {
			if (checkUpdateUserEmailRequest(updateUserEmailRequest)) {
				const { uid, oldEmail, newEmail, passwordHash, verificationCode } = updateUserEmailRequest
				const now = new Date().getTime()

				if (cookieUid !== uid) {
					console.error('ERROR', '更新用户邮箱失败，cookie 中的 UID 与修改邮箱时使用的 UID 不同', { cookieUid, uid, oldEmail })
					return { success: false, message: '更新用户邮箱失败，未指定正确的用户' }
				}

				const oldEmailLowerCase = oldEmail.toLowerCase()
				const newEmailLowerCase = newEmail.toLowerCase()

				// 启动事务
				const session = await mongoose.startSession()
				session.startTransaction()

				const { collectionName, schemaInstance } = UserAuthSchema
				type UserAuth = InferSchemaType<typeof schemaInstance>

				const userAuthWhere: QueryType<UserAuth> = { uid, emailLowerCase: oldEmailLowerCase, cookieToken } // 使用 uid, emailLowerCase 和 token 确保用户更新的是自己的邮箱，而不是其他用户的
				const userAuthSelect: SelectType<UserAuth> = { passwordHashHash: 1, emailLowerCase: 1 }
				try {
					const userAuthResult = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, schemaInstance, collectionName, { session })
					const userAuthData = userAuthResult.result
					if (userAuthData) {
						if (userAuthData.length !== 1) { // 确保只更新一个用户的邮箱
							console.error('ERROR', '更新用户邮箱失败，匹配到零个或多个用户', { uid, oldEmail })
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							return { success: false, message: '更新用户邮箱失败，无法找到正确的用户' }
						}

						const isCorrectPassword = comparePasswordSync(passwordHash, userAuthData[0].passwordHashHash) // 确保更新邮箱时输入的密码正确
						if (!isCorrectPassword) {
							console.error('ERROR', '更新用户邮箱失败，用户密码不正确', { uid, oldEmail })
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							return { success: false, message: '更新用户邮箱失败，用户密码不正确' }
						}
					}
				} catch (error) {
					console.error('ERROR', '更新用户邮箱失败，校验用户密码时程序出现异常', error, { uid, oldEmail })
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					return { success: false, message: '用户注册失败：校验用户密码失败' }
				}

				try {
					const { collectionName: userChangeEmailVerificationCodeCollectionName, schemaInstance: userChangeEmailVerificationCodeSchemaInstance } = UserChangeEmailVerificationCodeSchema
					type UserChangeEmailVerificationCode = InferSchemaType<typeof userChangeEmailVerificationCodeSchemaInstance>
					const verificationCodeWhere: QueryType<UserChangeEmailVerificationCode> = {
						emailLowerCase: oldEmailLowerCase,
						verificationCode,
						overtimeAt: { $gte: now },
					}

					const verificationCodeSelect: SelectType<UserChangeEmailVerificationCode> = {
						emailLowerCase: 1, // 用户邮箱
					}

					const verificationCodeResult = await selectDataFromMongoDB<UserChangeEmailVerificationCode>(verificationCodeWhere, verificationCodeSelect, userChangeEmailVerificationCodeSchemaInstance, userChangeEmailVerificationCodeCollectionName, { session })
					if (!verificationCodeResult.success || verificationCodeResult.result?.length !== 1) {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '修改邮箱失败：验证失败')
						return { success: false, message: '修改邮箱失败：验证失败' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '修改邮箱失败：请求验证失败')
					return { success: false, message: '修改邮箱失败：请求验证失败' }
				}

				const updateUserEmailWhere: QueryType<UserAuth> = {
					uid,
				}
				const updateUserEmailUpdate: QueryType<UserAuth> = {
					email: newEmail,
					emailLowerCase: newEmailLowerCase,
					editDateTime: new Date().getTime(),
				}
				try {
					const updateResult = await updateData4MongoDB(updateUserEmailWhere, updateUserEmailUpdate, schemaInstance, collectionName)
					if (updateResult && updateResult.success && updateResult.result) {
						if (updateResult.result.matchedCount > 0 && updateResult.result.modifiedCount > 0) {
							await session.commitTransaction()
							session.endSession()
							return { success: true, message: '用户邮箱更新成功' }
						} else {
							console.error('ERROR', '更新用户邮箱时，更新数量为 0', { uid, oldEmail, newEmail })
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							return { success: false, message: '用户邮箱更新失败，无法更新用户邮箱' }
						}
					} else {
						console.error('ERROR', '更新用户邮箱时，更新数量为 0', { uid, oldEmail, newEmail })
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						return { success: false, message: '用户邮箱更新失败，无法更新用户邮箱' }
					}
				} catch (error) {
					console.error('ERROR', '更新用户邮箱出错', { uid, oldEmail, newEmail }, error)
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					return { success: false, message: '用户邮箱更新失败，更新用户身份时出错' }
				}
			} else {
				console.error('ERROR', '更新用户邮箱时失败，未获取到原始数据')
				return { success: false, message: '用户邮箱更新失败，无法获取用户原始信息，数据可能为空' }
			}
		} else {
			console.error('ERROR', '更新用户邮箱时失败，用户不合法')
			return { success: false, message: '用户邮箱更新失败，用户不合法' }
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
					label: updateOrCreateUserInfoRequest.label as UserInfo['label'], // TODO: Mongoose issue: #12420
					userLinkAccounts: updateOrCreateUserInfoRequest.userLinkAccounts as UserInfo['userLinkAccounts'], // TODO: Mongoose issue: #12420
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
				const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
				type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
				const userAuthWhere: QueryType<UserAuth> = { uid }
				const userAuthSelect: SelectType<UserAuth> = {
					email: 1, // 用户邮箱
					userCreateDateTime: 1, // 用户创建日期
					role: 1, // 用户的角色
				}

				const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaInstance } = UserInfoSchema
				type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>
				const getUserInfoWhere: QueryType<UserInfo> = { uid }
				const getUserInfoSelect: SelectType<UserInfo> = {
					uid: 1, // 用户 UID
					label: 1, // 用户标签
					username: 1, // 用户名
					userNickname: 1, // 用户昵称
					avatar: 1, // 用户头像
					userBannerImage: 1, // 用户的背景图
					signature: 1, // 用户的个性签名
					gender: 1, // 用户的性别
				}

				try {
					const userAuthPromise = selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, userAuthSchemaInstance, userAuthCollectionName)
					const userInfoPromise = selectDataFromMongoDB(getUserInfoWhere, getUserInfoSelect, userInfoSchemaInstance, userInfoCollectionName)
					const [userAuthResult, userInfoResult] = await Promise.all([userAuthPromise, userInfoPromise])
					if (userInfoResult && userAuthResult && userInfoResult.success && userAuthResult.success) {
						const userAuth = userAuthResult?.result
						const userInfo = userInfoResult?.result
						if (userAuth?.length === 0 || userInfo?.length === 0) {
							return { success: true, message: '用户未填写用户信息', result: { uid, email: userAuth?.[0]?.email, userCreateDateTime: userAuth[0].userCreateDateTime, role: userAuth[0].role } }
						} else if (userAuth?.length === 1 && userAuth?.[0] && userInfo?.length === 1 && userInfo?.[0]) {
							return { success: true, message: '获取用户信息成功', result: { ...userInfo[0], email: userAuth[0].email, userCreateDateTime: userAuth[0].userCreateDateTime, role: userAuth[0].role } }
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
 * 通过 uid 获取（其他）用户信息
 * @param uid 用户 ID
 * @returns 获取用户信息的请求结果
 */
export const getUserInfoByUidService = async (getUserInfoByUidRequest: GetUserInfoByUidRequestDto): Promise<GetUserInfoByUidResponseDto> => {
	try {
		const uid = getUserInfoByUidRequest?.uid
		if (uid !== null && uid !== undefined) {
			const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
			const userAuthWhere: QueryType<UserAuth> = { uid }
			const userAuthSelect: SelectType<UserAuth> = {
				userCreateDateTime: 1, // 用户创建日期
				role: 1, // 用户的角色
			}

			const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaInstance } = UserInfoSchema
			type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>
			const getUserInfoWhere: QueryType<UserInfo> = { uid }
			const getUserInfoSelect: SelectType<UserInfo> = {
				label: 1, // 用户标签
				username: 1, // 用户名
				userNickname: 1, // 用户昵称
				avatar: 1, // 用户头像
				userBannerImage: 1, // 用户的背景图
				signature: 1, // 用户的个性签名
				gender: 1, // 用户的性别
			}

			try {
				const userAuthPromise = selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, userAuthSchemaInstance, userAuthCollectionName)
				const userInfoPromise = selectDataFromMongoDB(getUserInfoWhere, getUserInfoSelect, userInfoSchemaInstance, userInfoCollectionName)
				const [userAuthResult, userInfoResult] = await Promise.all([userAuthPromise, userInfoPromise])
				if (userAuthResult && userAuthResult.success && userInfoResult && userInfoResult.success) {
					const userAuth = userAuthResult?.result
					const userInfo = userInfoResult?.result
					if (userInfo?.length === 1 && userInfo?.[0]) {
						return { success: true, message: '获取用户信息成功', result: { ...userInfo[0], userCreateDateTime: userAuth[0].userCreateDateTime, role: userAuth[0].role } }
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
export const getUserAvatarUploadSignedUrlService = async (uid: number, token: string): Promise<GetUserAvatarUploadSignedUrlResponseDto> => {
	// TODO 图片上传逻辑需要重写，当前如何用户上传图片失败，仍然会用新头像链接替换数据库中的旧头像链接，而且当前图片没有加入审核流程
	try {
		if (await checkUserToken(uid, token)) {
			const now = new Date().getTime()
			const fileName = `avatar-${uid}-${generateSecureRandomString(32)}-${now}`
			const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 660)
			if (signedUrl && fileName) {
				return { success: true, message: '准备开始上传头像', userAvatarUploadSignedUrl: signedUrl, userAvatarFilename: fileName }
			} else {
				// TODO 图片上传逻辑需要重写，当前如何用户上传图片失败，仍然会用新头像链接替换数据库中的旧头像链接，而且当前图片没有加入审核流程
				return { success: false, message: '上传失败，无法生成图片上传 URL，请重新上传头像' }
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
				themeColorCustom: 1,
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
					console.error('ERROR', '获取用户个性设置失败，查询成功，但获取数据失败或数据为空：', { uid })
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
					userLinkAccountsPrivacySetting: updateOrCreateUserSettingsRequest.userLinkAccountsPrivacySetting as UserSettings['userLinkAccountsPrivacySetting'], // TODO: Mongoose issue: #12420
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
 * 请求发送验证码
 * @param requestSendVerificationCodeRequest 请求发送验证码的请求载荷
 * @returns 请求发送验证码的请求响应
 */
export const RequestSendVerificationCodeService = async (requestSendVerificationCodeRequest: RequestSendVerificationCodeRequestDto): Promise<RequestSendVerificationCodeResponseDto> => {
	try {
		if (checkRequestSendVerificationCodeRequest(requestSendVerificationCodeRequest)) {
			const { email, clientLanguage } = requestSendVerificationCodeRequest
			const emailLowerCase = email.toLowerCase()
			const nowTime = new Date().getTime()
			const todayStart = new Date()
			todayStart.setHours(0, 0, 0, 0)
			const { collectionName, schemaInstance } = UserVerificationCodeSchema
			type UserVerificationCode = InferSchemaType<typeof schemaInstance>
			const requestSendVerificationCodeWhere: QueryType<UserVerificationCode> = {
				emailLowerCase,
			}

			const requestSendVerificationCodeSelect: SelectType<UserVerificationCode> = {
				emailLowerCase: 1, // 用户邮箱
				attemptsTimes: 1,
				lastRequestDateTime: 1, // 用户上一次请求验证码的时间，用于防止滥用
			}

			// 启动事务
			const session = await mongoose.startSession()
			session.startTransaction()

			try {
				const requestSendVerificationCodeResult = await selectDataFromMongoDB<UserVerificationCode>(requestSendVerificationCodeWhere, requestSendVerificationCodeSelect, schemaInstance, collectionName, { session })
				if (requestSendVerificationCodeResult.success) {
					const lastRequestDateTime = requestSendVerificationCodeResult.result?.[0]?.lastRequestDateTime ?? 0
					const attemptsTimes = requestSendVerificationCodeResult.result?.[0]?.attemptsTimes ?? 0
					if (requestSendVerificationCodeResult.result.length === 0 || lastRequestDateTime + 60000 < nowTime) {
						const lastRequestDate = new Date(lastRequestDateTime)
						if (requestSendVerificationCodeResult.result.length === 0 || todayStart > lastRequestDate || attemptsTimes < 5) { // ! 每天五次机会
							const verificationCode = generateSecureVerificationNumberCode(6) // 生成六位随机数验证码
							let newAttemptsTimes = attemptsTimes + 1
							if (todayStart > lastRequestDate) {
								newAttemptsTimes = 0
							}

							const requestSendVerificationCodeUpdate: UserVerificationCode = {
								emailLowerCase,
								verificationCode,
								overtimeAt: nowTime + 1800000, // 当前时间加上 1800000 毫秒（30 分钟）作为新的过期时间
								attemptsTimes: newAttemptsTimes,
								lastRequestDateTime: nowTime,
								editDateTime: nowTime,
							}
							const updateResult = await findOneAndUpdateData4MongoDB(requestSendVerificationCodeWhere, requestSendVerificationCodeUpdate, schemaInstance, collectionName, { session })
							if (updateResult.success) {
								// TODO: 使用多语言 email title and text
								try {
									const mailTitleCHS = 'KIRAKIRA 注册验证码'
									const mailTitleEN = 'KIRAKIRA Registration Verification Code'
									const correctMailTitle = clientLanguage === 'zh-Hans-CN' ? mailTitleCHS : mailTitleEN

									const mailHtmlCHS = `
											<p>你的注册验证码是：<strong>${verificationCode}</strong></p>
											欢迎来到 KIRAKIRA，使用这个验证码来完成注册吧！
											<br>
											验证码 30 分钟内有效。请注意安全，不要向他人泄露你的验证码。
										`
									const mailHtmlEN = `
											<p>Your registration verification code is: <strong>${verificationCode}</strong></p>
											Welcome to KIRAKIRA. You can use this verification code to register your account.
											<br>
											Verification code is valid for 30 minutes. Please ensure do not disclose your verification code to others.
											<br>
											<br>
											To stop receiving notifications, please contact the KIRAKIRA support team.
										`
									const correctMailHTML = clientLanguage === 'zh-Hans-CN' ? mailHtmlCHS : mailHtmlEN
									const sendMailResult = await sendMail(email, correctMailTitle, { html: correctMailHTML })
									if (sendMailResult.success) {
										await session.commitTransaction()
										session.endSession()
										return { success: true, isTimeout: false, message: '注册验证码已发送至您注册时使用的邮箱，请注意查收，如未收到，请检查垃圾箱或联系 KIRAKIRA 客服。' }
									} else {
										if (session.inTransaction()) {
											await session.abortTransaction()
										}
										session.endSession()
										console.error('ERROR', '请求发送注册验证码失败，邮件发送失败')
										return { success: false, isTimeout: true, message: '请求发送注册验证码失败，邮件发送失败' }
									}
								} catch (error) {
									if (session.inTransaction()) {
										await session.abortTransaction()
									}
									session.endSession()
									console.error('ERROR', '请求发送注册验证码失败，邮件发送时出错', error)
									return { success: false, isTimeout: true, message: '请求发送注册验证码失败，邮件发送时出错' }
								}
							} else {
								if (session.inTransaction()) {
									await session.abortTransaction()
								}
								session.endSession()
								console.error('ERROR', '请求发送注册验证码失败，更新或新增用户验证码失败')
								return { success: false, isTimeout: false, message: '请求发送注册验证码失败，更新或新增用户验证码失败' }
							}
						} else {
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							console.warn('WARN', 'WARNING', '请求发送注册验证码失败，已达本日重复次数上限，请稍后再试')
							return { success: true, isTimeout: true, message: '请求发送注册验证码失败，已达本日重复次数上限，请稍后再试' }
						}
					} else {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.warn('WARN', 'WARNING', '请求发送注册验证码失败，未超过邮件超时时间，请稍后再试')
						return { success: true, isTimeout: true, message: '请求发送注册验证码失败，未超过邮件超时时间，请稍后再试' }
					}
				} else {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '请求发送注册验证码失败，获取验证码失败')
					return { success: false, isTimeout: false, message: '请求发注册送验证码失败，获取验证码失败' }
				}
			} catch (error) {
				if (session.inTransaction()) {
					await session.abortTransaction()
				}
				session.endSession()
				console.error('ERROR', '请求发送注册验证码失败，检查超时时间时出错', error)
				return { success: false, isTimeout: false, message: '请求发送注册验证码失败，检查超时时间时出错' }
			}
		} else {
			console.error('ERROR', '请求发送注册验证码失败，参数不合法')
			return { success: false, isTimeout: false, message: '请求发送注册验证码失败，参数不合法' }
		}
	} catch (error) {
		console.error('ERROR', '请求发送注册验证码失败，未知错误', error)
		return { success: false, isTimeout: false, message: '请求发送注册验证码失败，未知错误' }
	}
}

/**
 * 生成邀请码
 * @param uid 申请生成邀请码的用户
 * @param token 申请生成邀请码的用户 token
 * @returns 生成的邀请码
 */
export const createInvitationCodeService = async (uid: number, token: string): Promise<CreateInvitationCodeResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			const nowTime = new Date().getTime()
			const sevenDaysInMillis = 7 * 24 * 60 * 60 * 1000 // 将七天的时间转换为毫秒
			const { collectionName, schemaInstance } = UserInvitationCodeSchema
			type UserInvitationCode = InferSchemaType<typeof schemaInstance>
			const userInvitationCodeWhere: QueryType<UserInvitationCode> = {
				creatorUid: uid,
				generationDateTime: { $gt: nowTime - sevenDaysInMillis },
			}

			const userInvitationCodeSelect: SelectType<UserInvitationCode> = {
				creatorUid: 1,
			}

			try {
				const userInvitationCodeSelectResult = await selectDataFromMongoDB<UserInvitationCode>(userInvitationCodeWhere, userInvitationCodeSelect, schemaInstance, collectionName)
				const isAdmin = await checkUserRoleService(uid, 'admin')
				if (isAdmin || (userInvitationCodeSelectResult.success && userInvitationCodeSelectResult.result?.length === 0)) { // 是管理员或者没有找到一天内的邀请码，则可以生成邀请码。
					try {
						const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
						let finalInvitationCode = ''
						while (true) { // 不断循环生成邀请码，直到生成一个不重复的邀请码
							const invitationCodePart1 = generateSecureVerificationStringCode(4, charset)
							const invitationCodePart2 = generateSecureVerificationStringCode(4, charset)
							const newInvitationCode = `KIRA-${invitationCodePart1}-${invitationCodePart2}`

							const userInvitationCodeDuplicationCheckWhere: QueryType<UserInvitationCode> = {
								invitationCode: newInvitationCode,
							}

							const userInvitationCodeDuplicationCheckSelect: SelectType<UserInvitationCode> = {
								creatorUid: 1,
							}

							const userInvitationCodeDuplicationCheckResult = await selectDataFromMongoDB<UserInvitationCode>(userInvitationCodeDuplicationCheckWhere, userInvitationCodeDuplicationCheckSelect, schemaInstance, collectionName)
							const noSame = userInvitationCodeDuplicationCheckResult.result?.length === 0
							if (noSame) {
								finalInvitationCode = newInvitationCode
								break
							}
						}

						if (finalInvitationCode) {
							const userInvitationCode: UserInvitationCode = {
								creatorUid: uid,
								isPending: false,
								disabled: false,
								invitationCode: finalInvitationCode,
								generationDateTime: nowTime,
								editDateTime: nowTime,
								createDateTime: nowTime,
							}

							try {
								const insertResult = await insertData2MongoDB(userInvitationCode, schemaInstance, collectionName)
								if (insertResult.success) {
									return { success: true, isCoolingDown: true, message: '生成邀请码成功', invitationCodeResult: userInvitationCode }
								} else {
									console.error('ERROR', '生成邀请码失败，存储邀请码失败', { uid })
									return { success: false, isCoolingDown: true, message: '生成邀请码失败，存储邀请码失败' }
								}
							} catch (error) {
								console.error('ERROR', '生成邀请码失败，存储邀请码时出错', error, { uid })
								return { success: false, isCoolingDown: true, message: '生成邀请码失败，存储邀请码时出错' }
							}
						} else {
							console.error('ERROR', '生成邀请码失败，生成不重复的新邀请码失败', { uid })
							return { success: false, isCoolingDown: true, message: '生成邀请码失败，生成不重复的新邀请码失败' }
						}
					} catch (error) {
						console.error('ERROR', '生成邀请码失败，生成不重复的新邀请码时出错', error, { uid })
						return { success: false, isCoolingDown: true, message: '生成邀请码失败，生成不重复的新邀请码时出错' }
					}
				} else {
					console.warn('WARN', 'WARNING', '生成邀请码失败，未超出邀请码生成期限，正在冷却中', { uid })
					return { success: true, isCoolingDown: false, message: '生成邀请码失败，未超出邀请码生成期限，正在冷却中' }
				}
			} catch (error) {
				console.error('ERROR', '生成邀请码失败，查询是否超出邀请码生成期限时出错', error, { uid })
				return { success: false, isCoolingDown: true, message: '生成邀请码失败，查询是否超出邀请码生成期限出错' }
			}
		} else {
			console.error('ERROR', '生成邀请码失败，非法用户！', { uid })
			return { success: false, isCoolingDown: true, message: '生成邀请码失败，非法用户！' }
		}
	} catch (error) {
		console.error('ERROR', '生成邀请码失败，未知错误', error)
		return { success: false, isCoolingDown: true, message: '生成邀请码失败，未知错误' }
	}
}

/**
 * 获取自己的邀请码列表
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 获取自己的邀请码列表的请求结果
 */
export const getMyInvitationCodeService = async (uid: number, token: string): Promise<GetMyInvitationCodeResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			const { collectionName, schemaInstance } = UserInvitationCodeSchema
			type UserInvitationCode = InferSchemaType<typeof schemaInstance>
			const myInvitationCodeWhere: QueryType<UserInvitationCode> = {
				creatorUid: uid,
			}

			const myInvitationCodeSelect: SelectType<UserInvitationCode> = {
				creatorUid: 1,
				invitationCode: 1,
				generationDateTime: 1,
				isPending: 1,
				assignee: 1,
				usedDateTime: 1,
			}

			try {
				const myInvitationCodeResult = await selectDataFromMongoDB<UserInvitationCode>(myInvitationCodeWhere, myInvitationCodeSelect, schemaInstance, collectionName)
				if (myInvitationCodeResult.success) {
					if (myInvitationCodeResult.result?.length >= 0) {
						return { success: true, message: '自己的邀请码列表为空', invitationCodeResult: myInvitationCodeResult.result }
					} else {
						return { success: true, message: '自己的邀请码列表为空', invitationCodeResult: [] }
					}
				} else {
					console.error('ERROR', '获取自己的邀请码失败，请求失败', { uid })
					return { success: false, message: '获取自己的邀请码失败，请求失败！', invitationCodeResult: [] }
				}
			} catch (error) {
				console.error('ERROR', '获取自己的邀请码失败，请求时出错', { uid, error })
				return { success: false, message: '获取自己的邀请码失败，请求时出错！', invitationCodeResult: [] }
			}
		} else {
			console.error('ERROR', '获取自己的邀请码失败，非法用户！', { uid })
			return { success: false, message: '获取自己的邀请码失败，非法用户！', invitationCodeResult: [] }
		}
	} catch (error) {
		console.error('ERROR', '获取自己的邀请码失败，未知错误', error)
		return { success: false, message: '获取自己的邀请码失败，未知错误', invitationCodeResult: [] }
	}
}

/**
 * 使用邀请码注册
 * @param userInvitationCodeDto 使用邀请码注册的参数
 * @returns 使用邀请码注册的结果
 */
const useInvitationCode = async (useInvitationCodeDto: UseInvitationCodeDto): Promise<UseInvitationCodeResultDto> => {
	try {
		if (checkUseInvitationCodeDto(useInvitationCodeDto)) {
			const nowTime = new Date().getTime()
			const { collectionName, schemaInstance } = UserInvitationCodeSchema
			type UserInvitationCode = InferSchemaType<typeof schemaInstance>

			const useInvitationCodeWhere: QueryType<UserInvitationCode> = {
				invitationCode: useInvitationCodeDto.invitationCode,
				assignee: undefined,
				disabled: false,
			}
			const useInvitationCodeUpdate: UpdateType<UserInvitationCode> = {
				assignee: useInvitationCodeDto.registrantUid,
				usedDateTime: nowTime,
				editDateTime: nowTime,
			}

			try {
				const updateResult = await findOneAndUpdateData4MongoDB(useInvitationCodeWhere, useInvitationCodeUpdate, schemaInstance, collectionName)
				if (updateResult.success) {
					return { success: true, message: '已使用邀请码注册' }
				} else {
					console.error('ERROR', '使用邀请码注册，使用邀请码失败')
					return { success: false, message: '使用邀请码注册，使用邀请码失败' }
				}
			} catch (error) {
				console.error('ERROR', '使用邀请码注册，使用邀请码时出错', error)
				return { success: false, message: '使用邀请码注册，使用邀请码时出错' }
			}
		} else {
			console.error('ERROR', '使用邀请码注册，参数不合法')
			return { success: false, message: '使用邀请码注册，参数不合法' }
		}
	} catch (error) {
		console.error('ERROR', '使用邀请码注册，未知错误', error)
		return { success: false, message: '使用邀请码注册，未知错误' }
	}
}

/**
 * 检查一个邀请码是否可用
 * @param checkInvitationCodeRequestDto 检查一个邀请码是否可用的请求载荷
 * @returns 检查一个邀请码是否可用的请求响应
 */
export const checkInvitationCodeService = async (checkInvitationCodeRequestDto: CheckInvitationCodeRequestDto): Promise<CheckInvitationCodeResponseDto> => {
	try {
		if (checkCheckInvitationCodeRequestDto(checkInvitationCodeRequestDto)) {
			const { collectionName, schemaInstance } = UserInvitationCodeSchema
			type UserInvitationCode = InferSchemaType<typeof schemaInstance>
			const checkInvitationCodeWhere: QueryType<UserInvitationCode> = {
				invitationCode: checkInvitationCodeRequestDto.invitationCode,
				assignee: undefined,
				disabled: false,
			}

			const checkInvitationCodeSelect: SelectType<UserInvitationCode> = {
				invitationCode: 1,
			}

			try {
				const checkInvitationCodeResult = await selectDataFromMongoDB<UserInvitationCode>(checkInvitationCodeWhere, checkInvitationCodeSelect, schemaInstance, collectionName)
				if (checkInvitationCodeResult.success) {
					if (checkInvitationCodeResult.result?.length === 1) {
						return { success: true, isAvailableInvitationCode: true, message: '邀请码检查通过' }
					} else {
						return { success: true, isAvailableInvitationCode: false, message: '邀请码检查未通过' }
					}
				} else {
					console.error('ERROR', '检查邀请码可用性失败，请求失败')
					return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，请求失败！' }
				}
			} catch (error) {
				console.error('ERROR', '检查邀请码可用性失败，请求时出错')
				return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，请求时出错！' }
			}
		} else {
			console.error('ERROR', '检查邀请码可用性失败，参数不合法')
			return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，参数不合法' }
		}
	} catch (error) {
		console.error('ERROR', '检查邀请码可用性失败，未知错误', error)
		return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，未知错误' }
	}
}

/**
 * 请求发送修改邮箱的邮箱验证码
 * @param requestSendChangeEmailVerificationCodeRequest 请求发送修改邮箱的邮箱验证码的请求载荷
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 请求发送修改邮箱的邮箱验证码的请求响应
 */
export const requestSendChangeEmailVerificationCodeService = async (requestSendChangeEmailVerificationCodeRequest: RequestSendChangeEmailVerificationCodeRequestDto, uid: number, token: string): Promise<RequestSendChangeEmailVerificationCodeResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			if (checkRequestSendChangeEmailVerificationCodeRequest(requestSendChangeEmailVerificationCodeRequest)) {
				const { clientLanguage } = requestSendChangeEmailVerificationCodeRequest
				try {
					const getSelfUserInfoRequest = {
						uid,
						token,
					}
					const selfUserInfoResult = await getSelfUserInfoService(getSelfUserInfoRequest)
					const email = selfUserInfoResult.result.email
					if (selfUserInfoResult.success && email) {
						const emailLowerCase = email.toLowerCase()
						const nowTime = new Date().getTime()
						const todayStart = new Date()
						todayStart.setHours(0, 0, 0, 0)
						const { collectionName, schemaInstance } = UserChangeEmailVerificationCodeSchema
						type UserVerificationCode = InferSchemaType<typeof schemaInstance>
						const requestSendVerificationCodeWhere: QueryType<UserVerificationCode> = {
							emailLowerCase,
						}

						const requestSendVerificationCodeSelect: SelectType<UserVerificationCode> = {
							emailLowerCase: 1, // 用户邮箱
							attemptsTimes: 1,
							lastRequestDateTime: 1, // 用户上一次请求验证码的时间，用于防止滥用
						}

						// 启动事务
						const session = await mongoose.startSession()
						session.startTransaction()

						try {
							const requestSendVerificationCodeResult = await selectDataFromMongoDB<UserVerificationCode>(requestSendVerificationCodeWhere, requestSendVerificationCodeSelect, schemaInstance, collectionName, { session })
							if (requestSendVerificationCodeResult.success) {
								const lastRequestDateTime = requestSendVerificationCodeResult.result?.[0]?.lastRequestDateTime ?? 0
								const attemptsTimes = requestSendVerificationCodeResult.result?.[0]?.attemptsTimes ?? 0
								if (requestSendVerificationCodeResult.result.length === 0 || lastRequestDateTime + 60000 < nowTime) {
									const lastRequestDate = new Date(lastRequestDateTime)
									if (requestSendVerificationCodeResult.result.length === 0 || todayStart > lastRequestDate || attemptsTimes < 10) { // ! 每天十次机会
										const verificationCode = generateSecureVerificationNumberCode(6) // 生成六位随机数验证码
										let newAttemptsTimes = attemptsTimes + 1
										if (todayStart > lastRequestDate) {
											newAttemptsTimes = 0
										}

										const requestSendVerificationCodeUpdate: UserVerificationCode = {
											emailLowerCase,
											verificationCode,
											overtimeAt: nowTime + 1800000, // 当前时间加上 1800000 毫秒（30 分钟）作为新的过期时间
											attemptsTimes: newAttemptsTimes,
											lastRequestDateTime: nowTime,
											editDateTime: nowTime,
										}
										const updateResult = await findOneAndUpdateData4MongoDB(requestSendVerificationCodeWhere, requestSendVerificationCodeUpdate, schemaInstance, collectionName, { session })
										if (updateResult.success) {
											// TODO: 使用多语言 email title and text
											try {
												const mailTitleCHS = 'KIRAKIRA 更改邮箱验证码'
												const mailTitleEN = 'KIRAKIRA Change Email Verification Code'
												const correctMailTitle = clientLanguage === 'zh-Hans-CN' ? mailTitleCHS : mailTitleEN

												const mailHtmlCHS = `
														<p>你更改邮箱的验证码是：<strong>${verificationCode}</strong></p>
														<br>
														验证码 30 分钟内有效。请注意安全，不要向他人泄露你的验证码。
													`
												const mailHtmlEN = `
														<p>Your change email verification code is: <strong>${verificationCode}</strong></p>
														<br>
														Verification code is valid for 30 minutes. Please ensure do not disclose your verification code to others.
														<br>
														<br>
														To stop receiving notifications, please contact the KIRAKIRA support team.
													`
												const correctMailHTML = clientLanguage === 'zh-Hans-CN' ? mailHtmlCHS : mailHtmlEN
												const sendMailResult = await sendMail(email, correctMailTitle, { html: correctMailHTML })
												if (sendMailResult.success) {
													await session.commitTransaction()
													session.endSession()
													return { success: true, isCoolingDown: false, message: '修改邮箱的验证码已发送至您注册时使用的邮箱，请注意查收，如未收到，请检查垃圾箱或联系 KIRAKIRA 客服。' }
												} else {
													if (session.inTransaction()) {
														await session.abortTransaction()
													}
													session.endSession()
													console.error('ERROR', '请求发送修改邮箱的验证码失败，邮件发送失败')
													return { success: false, isCoolingDown: true, message: '请求发送修改邮箱的验证码失败，邮件发送失败' }
												}
											} catch (error) {
												if (session.inTransaction()) {
													await session.abortTransaction()
												}
												session.endSession()
												console.error('ERROR', '请求发送修改邮箱的验证码失败，邮件发送时出错', error)
												return { success: false, isCoolingDown: true, message: '请求发送修改邮箱的验证码失败，邮件发送时出错' }
											}
										} else {
											if (session.inTransaction()) {
												await session.abortTransaction()
											}
											session.endSession()
											console.error('ERROR', '请求发送修改邮箱的验证码失败，更新或新增用户验证码失败')
											return { success: false, isCoolingDown: false, message: '请求发送修改邮箱的验证码失败，更新或新增用户验证码失败' }
										}
									} else {
										if (session.inTransaction()) {
											await session.abortTransaction()
										}
										session.endSession()
										console.warn('WARN', 'WARNING', '请求发送修改邮箱的验证码失败，已达本日重试次数上限，请稍后再试')
										return { success: true, isCoolingDown: true, message: '请求发送修改邮箱的验证码失败，已达本日重试次数上限，请稍后再试' }
									}
								} else {
									if (session.inTransaction()) {
										await session.abortTransaction()
									}
									session.endSession()
									console.warn('WARN', 'WARNING', '请求发送修改邮箱的验证码失败，未超过邮件超时时间，请稍后再试')
									return { success: true, isCoolingDown: true, message: '请求发送修改邮箱的验证码失败，未超过邮件超时时间，请稍后再试' }
								}
							} else {
								if (session.inTransaction()) {
									await session.abortTransaction()
								}
								session.endSession()
								console.error('ERROR', '请求发送修改邮箱的验证码失败，获取验证码失败')
								return { success: false, isCoolingDown: false, message: '请求发送修改邮箱的验证码失败，获取验证码失败' }
							}
						} catch (error) {
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							console.error('ERROR', '请求发送修改邮箱的验证码失败，检查超时时间时出错', error)
							return { success: false, isCoolingDown: false, message: '请求发送修改邮箱的验证码失败，检查超时时间时出错' }
						}
					} else {
						console.error('ERROR', '发送更新邮箱的验证码失败，获取用户旧邮箱失败', { uid })
						return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，获取用户旧邮箱失败' }
					}
				} catch (error) {
					console.error('ERROR', '发送更新邮箱的验证码失败，获取用户旧邮箱时出错', { error, uid })
					return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，获取用户旧邮箱时出错' }
				}
			} else {
				console.error('ERROR', '发送更新邮箱的验证码失败，参数不合法！', { uid })
				return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，参数不合法！' }
			}
		} else {
			console.error('ERROR', '发送更新邮箱的验证码失败，非法用户！', { uid })
			return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，非法用户！' }
		}
	} catch (error) {
		console.error('ERROR', '发送更新邮箱的验证码失败，未知错误', error)
		return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，未知错误' }
	}
}

/**
 * 请求发送修改密码的邮箱验证码
 * @param requestSendChangePasswordVerificationCodeRequest 请求发送修改密码的邮箱验证码的请求载荷
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 请求发送修改密码的邮箱验证码的请求响应
 */
export const requestSendChangePasswordVerificationCodeService = async (requestSendChangePasswordVerificationCodeRequest: RequestSendChangePasswordVerificationCodeRequestDto, uid: number, token: string): Promise<RequestSendChangePasswordVerificationCodeResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			if (checkRequestSendChangePasswordVerificationCodeRequest(requestSendChangePasswordVerificationCodeRequest)) {
				const { clientLanguage } = requestSendChangePasswordVerificationCodeRequest
				try {
					const getSelfUserInfoRequest = {
						uid,
						token,
					}
					const selfUserInfoResult = await getSelfUserInfoService(getSelfUserInfoRequest)
					const email = selfUserInfoResult.result.email
					if (selfUserInfoResult.success && email) {
						const emailLowerCase = email.toLowerCase()
						const nowTime = new Date().getTime()
						const todayStart = new Date()
						todayStart.setHours(0, 0, 0, 0)
						const { collectionName, schemaInstance } = UserChangePasswordVerificationCodeSchema
						type UserChangePasswordVerificationCode = InferSchemaType<typeof schemaInstance>
						const requestSendVerificationCodeWhere: QueryType<UserChangePasswordVerificationCode> = {
							emailLowerCase,
						}

						const requestSendVerificationCodeSelect: SelectType<UserChangePasswordVerificationCode> = {
							emailLowerCase: 1, // 用户邮箱
							attemptsTimes: 1,
							lastRequestDateTime: 1, // 用户上一次请求验证码的时间，用于防止滥用
						}

						// 启动事务
						const session = await mongoose.startSession()
						session.startTransaction()

						try {
							const requestSendVerificationCodeResult = await selectDataFromMongoDB<UserChangePasswordVerificationCode>(requestSendVerificationCodeWhere, requestSendVerificationCodeSelect, schemaInstance, collectionName, { session })
							if (requestSendVerificationCodeResult.success) {
								const lastRequestDateTime = requestSendVerificationCodeResult.result?.[0]?.lastRequestDateTime ?? 0
								const attemptsTimes = requestSendVerificationCodeResult.result?.[0]?.attemptsTimes ?? 0
								if (requestSendVerificationCodeResult.result.length === 0 || lastRequestDateTime + 60000 < nowTime) {
									const lastRequestDate = new Date(lastRequestDateTime)
									if (requestSendVerificationCodeResult.result.length === 0 || todayStart > lastRequestDate || attemptsTimes < 3) { // ! 每天三次机会
										const verificationCode = generateSecureVerificationNumberCode(6) // 生成六位随机数验证码
										let newAttemptsTimes = attemptsTimes + 1
										if (todayStart > lastRequestDate) {
											newAttemptsTimes = 0
										}

										const requestSendVerificationCodeUpdate: UserChangePasswordVerificationCode = {
											uid,
											emailLowerCase,
											verificationCode,
											overtimeAt: nowTime + 1800000, // 当前时间加上 1800000 毫秒（30 分钟）作为新的过期时间
											attemptsTimes: newAttemptsTimes,
											lastRequestDateTime: nowTime,
											editDateTime: nowTime,
										}
										const updateResult = await findOneAndUpdateData4MongoDB(requestSendVerificationCodeWhere, requestSendVerificationCodeUpdate, schemaInstance, collectionName, { session })
										if (updateResult.success) {
											// TODO: 使用多语言 email title and text
											try {
												const mailTitleCHS = 'KIRAKIRA 更改密码验证码'
												const mailTitleEN = 'KIRAKIRA Change Password Verification Code'
												const correctMailTitle = clientLanguage === 'zh-Hans-CN' ? mailTitleCHS : mailTitleEN

												const mailHtmlCHS = `
														<p>你更改密码的验证码是：<strong>${verificationCode}</strong></p>
														<br>
														验证码 30 分钟内有效。请注意安全，不要向他人泄露你的验证码。
													`
												const mailHtmlEN = `
														<p>Your change password verification code is: <strong>${verificationCode}</strong></p>
														<br>
														Verification code is valid for 30 minutes. Please ensure do not disclose your verification code to others.
														<br>
														<br>
														To stop receiving notifications, please contact the KIRAKIRA support team.
													`
												const correctMailHTML = clientLanguage === 'zh-Hans-CN' ? mailHtmlCHS : mailHtmlEN
												const sendMailResult = await sendMail(email, correctMailTitle, { html: correctMailHTML })
												if (sendMailResult.success) {
													await session.commitTransaction()
													session.endSession()
													return { success: true, isCoolingDown: false, message: '修改密码的验证码已发送至您注册时使用的邮箱，请注意查收，如未收到，请检查垃圾箱或联系 KIRAKIRA 客服。' }
												} else {
													if (session.inTransaction()) {
														await session.abortTransaction()
													}
													session.endSession()
													console.error('ERROR', '请求发送修改密码的验证码失败，邮件发送失败')
													return { success: false, isCoolingDown: true, message: '请求发送修改密码的验证码失败，邮件发送失败' }
												}
											} catch (error) {
												if (session.inTransaction()) {
													await session.abortTransaction()
												}
												session.endSession()
												console.error('ERROR', '请求发送修改密码的验证码失败，邮件发送时出错', error)
												return { success: false, isCoolingDown: true, message: '请求发送修改密码的验证码失败，邮件发送时出错' }
											}
										} else {
											if (session.inTransaction()) {
												await session.abortTransaction()
											}
											session.endSession()
											console.error('ERROR', '请求发送修改密码的验证码失败，更新或新增用户验证码失败')
											return { success: false, isCoolingDown: false, message: '请求发送修改密码的验证码失败，更新或新增用户验证码失败' }
										}
									} else {
										if (session.inTransaction()) {
											await session.abortTransaction()
										}
										session.endSession()
										console.warn('WARN', 'WARNING', '请求发送修改密码的验证码失败，已达本日重试次数上限，请稍后再试')
										return { success: true, isCoolingDown: true, message: '请求发送修改密码的验证码失败，已达本日重试次数上限，请稍后再试' }
									}
								} else {
									if (session.inTransaction()) {
										await session.abortTransaction()
									}
									session.endSession()
									console.warn('WARN', 'WARNING', '请求发送修改密码的验证码失败，未超过邮件超时时间，请稍后再试')
									return { success: true, isCoolingDown: true, message: '请求发送修改密码的验证码失败，未超过邮件超时时间，请稍后再试' }
								}
							} else {
								if (session.inTransaction()) {
									await session.abortTransaction()
								}
								session.endSession()
								console.error('ERROR', '请求发送修改密码的验证码失败，获取验证码失败')
								return { success: false, isCoolingDown: false, message: '请求发送修改密码的验证码失败，获取验证码失败' }
							}
						} catch (error) {
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							console.error('ERROR', '请求发送修改邮箱的验证码失败，检查超时时间时出错', error)
							return { success: false, isCoolingDown: false, message: '请求发送修改邮箱的验证码失败，检查超时时间时出错' }
						}
					} else {
						console.error('ERROR', '发送更新邮箱的验证码失败，获取用户旧邮箱失败', { uid })
						return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，获取用户旧邮箱失败' }
					}
				} catch (error) {
					console.error('ERROR', '发送更新邮箱的验证码失败，获取用户旧邮箱时出错', { error, uid })
					return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，获取用户旧邮箱时出错' }
				}
			} else {
				console.error('ERROR', '发送更新邮箱的验证码失败，参数不合法！', { uid })
				return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，参数不合法！' }
			}
		} else {
			console.error('ERROR', '发送更新邮箱的验证码失败，非法用户！', { uid })
			return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，非法用户！' }
		}
	} catch (error) {
		console.error('ERROR', '发送更新邮箱的验证码失败，未知错误', error)
		return { success: false, isCoolingDown: false, message: '发送更新邮箱的验证码失败，未知错误' }
	}
}

/**
 * 更新密码
 * @param updateUserPasswordRequest 更新密码的请求载荷
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 更新密码的请求响应
 */
export const changePasswordService = async (updateUserPasswordRequest: UpdateUserPasswordRequestDto, uid: number, token: string): Promise<UpdateUserPasswordResponseDto> => {
	try {
		if (checkUpdateUserPasswordRequest(updateUserPasswordRequest)) {
			if (await checkUserToken(uid, token)) {
				const { oldPasswordHash, newPasswordHash, verificationCode } = updateUserPasswordRequest
				const now = new Date().getTime()

				const { collectionName: userChangePasswordVerificationCodeCollectionName, schemaInstance: userChangePasswordVerificationCodeInstance } = UserChangePasswordVerificationCodeSchema
				type UserChangePasswordVerificationCode = InferSchemaType<typeof userChangePasswordVerificationCodeInstance>

				const userChangePasswordVerificationCodeWhere: QueryType<UserChangePasswordVerificationCode> = {
					uid,
					verificationCode,
					overtimeAt: { $gte: now },
				}
				const userChangePasswordVerificationCodeSelect: SelectType<UserChangePasswordVerificationCode> = {
					emailLowerCase: 1, // 用户邮箱
				}

				// 启动事务
				const session = await mongoose.startSession()
				session.startTransaction()

				try {
					const verificationCodeResult = await selectDataFromMongoDB<UserChangePasswordVerificationCode>(userChangePasswordVerificationCodeWhere, userChangePasswordVerificationCodeSelect, userChangePasswordVerificationCodeInstance, userChangePasswordVerificationCodeCollectionName, { session })
					if (!verificationCodeResult.success || verificationCodeResult.result?.length !== 1) {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '修改密码时出错，验证失败')
						return { success: false, message: '修改密码时出错，验证失败' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '修改密码时出错，请求验证失败')
					return { success: false, message: '修改密码时出错，请求验证失败' }
				}

				const { collectionName, schemaInstance } = UserAuthSchema
				type UserAuth = InferSchemaType<typeof schemaInstance>

				const changePasswordWhere: QueryType<UserAuth> = { uid }
				const changePasswordSelect: SelectType<UserAuth> = {
					email: 1,
					uid: 1,
					passwordHashHash: 1,
				}

				try {
					const userAuthResult = await selectDataFromMongoDB<UserAuth>(changePasswordWhere, changePasswordSelect, schemaInstance, collectionName, { session })
					if (userAuthResult?.result && userAuthResult.result?.length === 1) {
						const userAuthInfo = userAuthResult.result[0]
						const isCorrectPassword = comparePasswordSync(oldPasswordHash, userAuthInfo.passwordHashHash)
						if (isCorrectPassword) {
							const newPasswordHashHash = hashPasswordSync(newPasswordHash)
							if (newPasswordHashHash) {
								const changePasswordUpdate: UpdateType<UserAuth> = {
									passwordHashHash: newPasswordHashHash,
									editDateTime: now,
								}
								try {
									const updateResult = await findOneAndUpdateData4MongoDB(changePasswordWhere, changePasswordUpdate, schemaInstance, collectionName, { session })
									if (updateResult.success) {
										await session.commitTransaction()
										session.endSession()
										return { success: true, message: '密码已更新！' }
									} else {
										if (session.inTransaction()) {
											await session.abortTransaction()
										}
										session.endSession()
										console.error('ERROR', '修改密码失败，更新密码失败', { uid })
										return { success: false, message: '修改密码时出错，更新密码失败' }
									}
								} catch (error) {
									if (session.inTransaction()) {
										await session.abortTransaction()
									}
									session.endSession()
									console.error('ERROR', '修改密码时出错，更新密码时出错', { uid, error })
									return { success: false, message: '修改密码时出错，更新密码时出错' }
								}
							} else {
								if (session.inTransaction()) {
									await session.abortTransaction()
								}
								session.endSession()
								console.error('ERROR', '修改密码失败，未能散列新密码', { uid })
								return { success: false, message: '修改密码失败，未能散列新密码' }
							}
						} else {
							if (session.inTransaction()) {
								await session.abortTransaction()
							}
							session.endSession()
							console.error('ERROR', '修改密码失败，密码校验未通过', { uid })
							return { success: false, message: '修改密码失败，密码校验未通过' }
						}
					} else {
						if (session.inTransaction()) {
							await session.abortTransaction()
						}
						session.endSession()
						console.error('ERROR', '修改密码失败，密码校验结果为空或不为一！', { uid })
						return { success: false, message: '修改密码失败，密码校验结果不正确' }
					}
				} catch (error) {
					if (session.inTransaction()) {
						await session.abortTransaction()
					}
					session.endSession()
					console.error('ERROR', '修改密码时出错，密码校验时出错！', { uid, error })
					return { success: false, message: '修改密码时出错，密码校验时出错！' }
				}
			} else {
				console.error('ERROR', '修改密码失败，非法用户！', { uid })
				return { success: false, message: '修改密码失败，非法用户！' }
			}
		} else {
			console.error('ERROR', '修改密码失败，参数不合法！', { uid })
			return { success: false, message: '修改密码失败，参数不合法！' }
		}
	} catch (error) {
		console.error('ERROR', '修改密码时出错，未知错误', error)
		return { success: false, message: '修改密码时出错，未知错误' }
	}
}

/**
 * 验证某个用户是否是某个角色
 * @param uid 用户 ID, 为空时会导致校验失败
 * @param role 用户的角色
 * @returns 校验结果，如果用户是这个角色返回 true，否则返回 false
 */
export const checkUserRoleService = async (uid: number, role: string): Promise<boolean> => {
	try {
		if (uid !== undefined && uid !== null && role) {
			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const userTokenWhere: QueryType<UserAuth> = {
				uid,
				role,
			}
			const userTokenSelect: SelectType<UserAuth> = {
				uid: 1,
			}

			try {
				const checkUserRoleResult = await selectDataFromMongoDB(userTokenWhere, userTokenSelect, schemaInstance, collectionName)
				if (checkUserRoleResult && checkUserRoleResult.success) {
					if (checkUserRoleResult.result?.length === 1) {
						return true
					} else {
						console.error('ERROR', `验证用户角色时，用户信息长度不为 1，用户uid：【${uid}】`)
						return false
					}
				} else {
					console.error('ERROR', `验证用户角色时未查询到用户信息，用户uid：【${uid}】`)
					return false
				}
			} catch (error) {
				console.error('ERROR', `验证用户角色时出错，用户uid：【${uid}】，错误信息：`, error)
				return false
			}
		} else {
			console.error('ERROR', `验证用户角色失败！用户 uid 或 role 不存在，用户 UID：${uid}`)
			return false
		}
	} catch (error) {
		console.error('ERROR', `验证用户角色失败！用户 UID：${uid}`, error)
		return false
	}
}

/**
 * 检查用户名是否可用
 * @param checkUsernameRequest 检查用户名是否可用的请求载荷
 * @returns 检查用户名是否可用的请求响应
 */
export const checkUsernameService = async (checkUsernameRequest: CheckUsernameRequestDto): Promise<CheckUsernameResponseDto> => {
	try {
		if (checkCheckUsernameRequest(checkUsernameRequest)) {
			const { username } = checkUsernameRequest
			const { collectionName, schemaInstance } = UserInfoSchema
			type UserInfo = InferSchemaType<typeof schemaInstance>
			const checkUsernameWhere: QueryType<UserInfo> = {
				username,
			}
			const checkUsernameSelete: SelectType<UserInfo> = {
				uid: 1,
			}
			try {
				const checkUsername = await selectDataFromMongoDB(checkUsernameWhere, checkUsernameSelete, schemaInstance, collectionName)
				if (checkUsername.success) {
					if (checkUsername.result?.length === 0) {
						return { success: true, message: '用户名可用', isAvailableUsername: true }
					} else {
						return { success: true, message: '用户名重复', isAvailableUsername: false }
					}
				} else {
					console.error('ERROR', '检查用户名失败，请求用户数据失败')
					return { success: false, message: '检查用户名失败，请求用户数据失败', isAvailableUsername: false }
				}
			} catch (error) {
				console.error('ERROR', '检查用户名时出错，请求用户数据出错', error)
				return { success: false, message: '检查用户名时出错，请求用户数据出错', isAvailableUsername: false }
			}
		} else {
			console.error('ERROR', '检查用户名失败，参数不合法')
			return { success: false, message: '检查用户名失败，参数不合法', isAvailableUsername: false }
		}
	} catch (error) {
		console.error('ERROR', '检查用户名时出错，未知错误', error)
		return { success: false, message: '检查用户名时出错，未知错误', isAvailableUsername: false }
	}
}

/**
 * 校验用户注册信息
 * @param userRegistrationRequest
 * @returns boolean 如果合法则返回 true
 */
const checkUserRegistrationData = (userRegistrationRequest: UserRegistrationRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (
		true
		&& !!userRegistrationRequest.passwordHash && !!userRegistrationRequest.email && !isInvalidEmail(userRegistrationRequest.email)
		&& !!userRegistrationRequest.verificationCode
		&& !!userRegistrationRequest.username
	)
}

/**
 * 用户是否存在验证的请求参数的非空验证
 * @param userExistsCheckRequest
 * @returns boolean 合法则返回 true
 */
const checkUserExistsCheckRequest = (userExistsCheckRequest: UserExistsCheckRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (!!userExistsCheckRequest.email && !isInvalidEmail(userExistsCheckRequest.email))
}

/**
 * 用户登录的请求参数的校验
 * @param userExistsCheckRequest
 * @returns boolean 合法则返回 true
 */
const checkUserLoginRequest = (userLoginRequest: UserLoginRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (!!userLoginRequest.email && !isInvalidEmail(userLoginRequest.email) && !!userLoginRequest.passwordHash)
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
		&& !!updateUserEmailRequest.oldEmail && !isInvalidEmail(updateUserEmailRequest.oldEmail)
		&& !!updateUserEmailRequest.newEmail && !isInvalidEmail(updateUserEmailRequest.newEmail)
		&& !!updateUserEmailRequest.passwordHash
		&& !!updateUserEmailRequest.verificationCode
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

	if (updateOrCreateUserInfoRequest?.userLinkAccounts?.some(account => !ALLOWED_ACCOUNT_TYPE.includes(account.accountType))) {
		return false
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

	if (updateOrCreateUserSettingsRequest?.userLinkAccountsPrivacySetting?.some(account => !ALLOWED_ACCOUNT_TYPE.includes(account.accountType))) {
		return false
	}

	return true
}

/**
 * 检查请求发送验证码的请求参数
 * @param requestSendVerificationCodeRequest 请求发送验证码的请求参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkRequestSendVerificationCodeRequest = (requestSendVerificationCodeRequest: RequestSendVerificationCodeRequestDto): boolean => {
	return (!isInvalidEmail(requestSendVerificationCodeRequest.email))
}

/**
 * 检查使用邀请码注册的参数
 * @param useInvitationCodeDto 使用邀请码注册的参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkUseInvitationCodeDto = (useInvitationCodeDto: UseInvitationCodeDto): boolean => {
	return (
		useInvitationCodeDto.registrantUid !== null && useInvitationCodeDto.registrantUid !== undefined
		&& !!useInvitationCodeDto.invitationCode
	)
}

/**
 * 检查检查一个邀请码是否可用的请求载荷
 * @param checkInvitationCodeRequestDto 检查一个邀请码是否可用的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkCheckInvitationCodeRequestDto = (checkInvitationCodeRequestDto: CheckInvitationCodeRequestDto): boolean => {
	const invitationCodeRegex = /^KIRA-[A-Z0-9]{4}-[A-Z0-9]{4}$/
	return (!!checkInvitationCodeRequestDto.invitationCode && invitationCodeRegex.test(checkInvitationCodeRequestDto.invitationCode))
}

/**
 * 验证请求发送修改邮箱的邮箱验证码的请求载荷
 * @param requestSendChangeEmailVerificationCodeRequest 请求发送修改邮箱的邮箱验证码的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkRequestSendChangeEmailVerificationCodeRequest = (requestSendChangeEmailVerificationCodeRequest: RequestSendChangeEmailVerificationCodeRequestDto): boolean => {
	return true
}

/**
 * 验证请求发送修改密码的邮箱验证码的请求载荷
 * @param requestSendChangePasswordVerificationCodeRequest 请求发送修改密码的邮箱验证码的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkRequestSendChangePasswordVerificationCodeRequest = (requestSendChangePasswordVerificationCodeRequest: RequestSendChangePasswordVerificationCodeRequestDto): boolean => {
	return true
}

/**
 * 验证修改密码的请求载荷
 * @param updateUserPasswordRequest 修改密码的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkUpdateUserPasswordRequest = (updateUserPasswordRequest: UpdateUserPasswordRequestDto): boolean => {
	return (
		true
		&& !!updateUserPasswordRequest.newPasswordHash
		&& !!updateUserPasswordRequest.oldPasswordHash
		&& !!updateUserPasswordRequest.verificationCode && updateUserPasswordRequest.verificationCode.length === 6
	)
}

/**
 * 检查检查用户名失败的请求载荷
 * @param checkUsernameRequest 检查用户名失败的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkCheckUsernameRequest = (checkUsernameRequest: CheckUsernameRequestDto): boolean => {
	return (!!checkUsernameRequest.username && checkUsernameRequest.username?.length <= 200 && checkUsernameRequest.username?.length > 0)
}
