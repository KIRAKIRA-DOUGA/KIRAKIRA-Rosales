import mongoose, { InferSchemaType, PipelineStage, ClientSession, Model } from 'mongoose'
import { createCloudflareImageUploadSignedUrl } from '../cloudflare/index.js'
import { isInvalidEmail, sendMail } from '../common/EmailTool.js'
import { compareStringSync, hashStringSync } from '../common/HashTool.js'
import { isEmptyObject } from '../common/ObjectTool.js'
import { parseInteger, validateNameField } from '../common/ValidTool.js'
import { generateRandomString, generateSecureRandomString, generateSecureVerificationNumberCode, generateSecureVerificationStringCode } from '../common/RandomTool.js'
import {
	AdminClearUserInfoRequestDto,
	AdminClearUserInfoResponseDto,
	AdminGetUserInfoRequestDto,
	AdminGetUserInfoResponseDto,
	ApproveUserInfoRequestDto,
	ApproveUserInfoResponseDto,
	CheckInvitationCodeRequestDto,
	CheckInvitationCodeResponseDto,
	CheckUsernameRequestDto,
	CheckUsernameResponseDto,
	CheckUserTokenResponseDto,
	CreateInvitationCodeResponseDto,
	DeleteTotpAuthenticatorByTotpVerificationCodeResponseDto,
	GetBlockedUserResponseDto,
	GetMyInvitationCodeResponseDto,
	CheckUserHave2FAResponseDto,
	GetUserAvatarUploadSignedUrlResponseDto,
	GetUserInfoByUidRequestDto,
	GetUserInfoByUidResponseDto,
	GetUserSettingsResponseDto,
	UpdateOrCreateUserInfoRequestDto,
	UpdateOrCreateUserInfoResponseDto,
	UpdateOrCreateUserSettingsRequestDto,
	UpdateOrCreateUserSettingsResponseDto,
	UpdateUserEmailRequestDto,
	UpdateUserEmailResponseDto,
	UpdateUserPasswordRequestDto,
	UpdateUserPasswordResponseDto,
	UseInvitationCodeDto,
	UseInvitationCodeResultDto,
	UserLoginRequestDto,
	UserLoginResponseDto,
	UserRegistrationRequestDto,
	UserRegistrationResponseDto,
	GetSelfUserInfoByUuidResponseDto,
	GetSelfUserInfoByUuidRequestDto,
	CreateUserTotpAuthenticatorResponseDto,
	DeleteTotpAuthenticatorByTotpVerificationCodeRequestDto,
	ConfirmUserTotpAuthenticatorRequestDto,
	ConfirmUserTotpAuthenticatorResponseDto,
	CheckUserHave2FARequestDto,
	CreateUserEmailAuthenticatorResponseDto,
	DeleteUserEmailAuthenticatorRequestDto,
	DeleteUserEmailAuthenticatorResponseDto,
	UserExistsCheckByUIDRequestDto,
	UserExistsCheckByUIDResponseDto,
	UserEmailExistsCheckRequestDto,
	UserEmailExistsCheckResponseDto,
	CheckUserExistsByUuidRequestDto,
	CheckUserExistsByUuidResponseDto,
	AdminEditUserInfoRequestDto,
	AdminEditUserInfoResponseDto,
	GetBlockedUserRequestDto,
	AdminGetUserByInvitationCodeResponseDto,
	ForgotPasswordRequestDto,
	ForgotPasswordResponseDto,
	SendGeneral2FAEmailVerificationCodeRequestDto,
	SendGeneral2FAEmailVerificationCodeResponseDto,
	SendGeneralEmailVerificationCodeRequestDto,
	SendGeneralEmailVerificationCodeResponseDto,
	AdminRotationAllUserTokenResponseDto,
	AdminRotationAllUserDataBootstrapHintResponseDto,
	GetUserBootstrapDataByHintResponseDto,
	GetUserBootstrapDataByHintRequestDto,
} from '../controller/UserControllerDto.js'
import { findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB, selectDataByAggregateFromMongoDB, deleteOneDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { DbPoolResultsType, QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import {
	UserAuthSchema,
	UserTotpAuthenticatorSchema,
	UserInfoSchema,
	UserInvitationCodeSchema,
	UserSettingsSchema,
	General2FAEmailVerificationCodeSchema,
	GeneralEmailVerificationCodeSchema
} from '../dbPool/schema/UserSchema.js'
import { getNextSequenceValueService } from './SequenceValueService.js'
import { authenticator } from 'otplib'
import { getI18nLanguagePack, supportedLanguageList } from '../common/i18n.js'
import { abortAndEndSession, commitAndEndSession, createAndStartSession } from '../common/MongoDBSessionTool.js'
import { StorageClassAnalysisSchemaVersion } from '@aws-sdk/client-s3'
import { FollowingSchema } from '../dbPool/schema/FeedSchema.js'
import { checkBlockUserService, checkIsBlockedByOtherUserService } from './BlockService.js'
import { isToday } from '../common/DateTool.js'
import { logging } from './loggingService.js'

authenticator.options = { window: parseInteger(process.env.TOTP_ADDITIONAL_WINDOWS, 1) || 1 } // 设置 TOTP 宽裕窗口，默认为 1

/**
 * 用户注册
 * @param userRegistrationRequest 用户注册时需要传入的信息（用户名，密码）
 * @returns UserRegistrationResponseDto 用户注册的结果，如果成功会包含 token
 */
export const userRegistrationService = async (userRegistrationRequest: UserRegistrationRequestDto): Promise<UserRegistrationResponseDto> => {
	try {
		if (!checkUserRegistrationData(userRegistrationRequest)) {
			const errorMessage = '用户注册失败：提交的用户信息不合法'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const { email, passwordHash, passwordHint, verificationCode, username, userNickname, invitationCode } = userRegistrationRequest
		const emailLowerCase = email.toLowerCase()
		const usernameStandardized = username.trim().normalize();
		const now = new Date().getTime()

		if (!invitationCode || !(await checkInvitationCodeService({ invitationCode })).isAvailableInvitationCode) { // DELETEME 仅在 beta 测试中使用
			const errorMessage = '用户注册失败：未提供邀请码或邀请码无效'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const session = await createAndStartSession() // 启动事务

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		const userAuthWhere: QueryType<UserAuth> = {
			emailLowerCase,
		}
		const userAuthSelect: SelectType<UserAuth> = {
			emailLowerCase: 1
		}
		try {
			const useAuthResult = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, userAuthSchemaInstance, userAuthCollectionName, { session })
			if (useAuthResult.result && useAuthResult.result.length >= 1) {
				const errorMessage = '用户注册失败：用户邮箱重复'
				logging('ERROR', errorMessage, undefined, { email, emailLowerCase })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage }
			}
		} catch (error) {
			const errorMessage = '用户注册失败：用户邮箱查重时出现异常'
			logging('ERROR', errorMessage, error, { email, emailLowerCase })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const EmailVerifier = new GeneralEmailVerifier(emailLowerCase, verificationCode)
		const emailVerificationResult = await EmailVerifier.verify({ isResetAttemptsImmediately: true, exclusiveBusinessName: 'registration' })
		if (!emailVerificationResult.success) {
			const errorMessage = `用户注册失败：用户邮箱查重时出现异常：${emailVerificationResult.message}`
			logging('ERROR', errorMessage)
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const passwordHashHash = hashStringSync(passwordHash)
		const token = generateSecureRandomString(64)
		const userDataBootstrapHint = generateSecureRandomString(64)
		const uid = (await getNextSequenceValueService('user', 1, 1, session)).sequenceValue
		const uuid = generateRandomString(24)

		const userAuthData: UserAuth = {
			UUID: uuid,
			uid,
			email,
			emailLowerCase,
			passwordHashHash,
			token,
			userDataBootstrapHint,
			passwordUpdateDateTime: now,
			passwordHint,
			roles: ['user'], // newbie will always has a 'user' roles.
			authenticatorType: 'none', // 刚注册的用户默认没有开启 2FA
			userCreateDateTime: now,
			editDateTime: now,
		}

		const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaInstance } = UserInfoSchema
		type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>
		const userInfoData: UserInfo = {
			UUID: uuid,
			uid,
			username: usernameStandardized,
			userNickname,
			label: [] as UserInfo['label'], // TODO: Mongoose issue: #12420
			userLinkedAccounts: [] as UserInfo['userLinkedAccounts'], // TODO: Mongoose issue: #12420
			isUpdatedAfterReview: true,
			editDateTime: now,
			createDateTime: now,
		}

		const { collectionName: userSettingsCollectionName, schemaInstance: userSettingsSchemaInstance } = UserSettingsSchema
		type UserSettings = InferSchemaType<typeof userSettingsSchemaInstance>
		const userSettingsData: UserSettings = {
			UUID: uuid,
			uid,
			userPrivaryVisibilitiesSetting: [] as UserSettings['userPrivaryVisibilitiesSetting'], // TODO: Mongoose issue: #12420
			userLinkedAccountsVisibilitiesSetting: [] as UserSettings['userLinkedAccountsVisibilitiesSetting'], // TODO: Mongoose issue: #12420
			editDateTime: now,
			createDateTime: now,
		}

		try {
			const saveUserAuthResult = await insertData2MongoDB(userAuthData, userAuthSchemaInstance, userAuthCollectionName, { session })
			const saveUserInfoResult = await insertData2MongoDB(userInfoData, userInfoSchemaInstance, userInfoCollectionName, { session })
			const saveUserSettingsResult = await insertData2MongoDB(userSettingsData, userSettingsSchemaInstance, userSettingsCollectionName, { session })

			if (!saveUserAuthResult.success || !saveUserInfoResult.success || !saveUserSettingsResult.success) {
				const errorMessage = '用户注册失败：保存用户数据失败'
				logging('ERROR', errorMessage)
				await abortAndEndSession(session)
				return { success: false, message: errorMessage }
			}

			if (invitationCode) {
				const useInvitationCodeDto: UseInvitationCodeDto = {
					invitationCode,
					registrantUid: uid,
					registrantUUID: uuid,
				}
				try {
					const useInvitationCodeResult = await useInvitationCode(useInvitationCodeDto)
					if (!useInvitationCodeResult.success) {
						logging('ERROR', '用户使用邀请码时出错：更新邀请码使用者失败')
					}
				} catch (error) {
					logging('ERROR', '用户使用邀请码时出错：更新邀请码使用者时出错：', error)
				}
			}

			await commitAndEndSession(session)
			return { success: true, uid, token, UUID: uuid, message: '用户注册成功' }
		} catch (error) {
			const errorMessage = '用户注册失败：无法保存用户资料'
			logging('ERROR', errorMessage, error)
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}
	} catch (error) {
		const errorMessage = '用户注册失败，未知错误'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage }
	}
}

/**
 * 用户登录
 * @param userLoginRequest 用户登录时需要传入的信息（用户名，密码）
 * @return UserLoginResponseDto 用户登录结果，如果登录成功会包含 token
 */
export const userLoginService = async (userLoginRequest: UserLoginRequestDto): Promise<UserLoginResponseDto> => {
	try {
		// 1. 检查请求参数是否合法
		if (!checkUserLoginRequest(userLoginRequest)) {
			const errorMessage = '用户登录失败：提交的用户信息不合法'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const { email, passwordHash, clientOtp, verificationCode } = userLoginRequest
		const emailLowerCase = email.toLowerCase()
		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>

		const userLoginWhere: QueryType<UserAuth> = { emailLowerCase }
		const userLoginSelect: SelectType<UserAuth> = {
			email: 1,
			UUID: 1,
			uid: 1,
			token: 1,
			userDataBootstrapHint: 1,
			passwordHint: 1,
			passwordHashHash: 1,
			authenticatorType: 1,
		}

		// 2. 获取用户安全信息
		const userAuthResult = await selectDataFromMongoDB<UserAuth>(userLoginWhere, userLoginSelect, schemaInstance, collectionName)
		if (!userAuthResult?.result || userAuthResult.result?.length !== 1) {
			const warningMessage = '用户登录失败：用户未注册或信息异常'
			logging('warn', warningMessage, undefined, { email })
			return { success: false, email, message: warningMessage }
		}

		const userAuthData = userAuthResult.result[0]
		const { userDataBootstrapHint, token, uid, UUID: uuid, authenticatorType } = userAuthData
		if (!token || !userDataBootstrapHint || uid === null || uid === undefined || !uuid) {
			const errorMessage = '登录失败，未能获取用户安全信息'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		// 3. 检查用户密码是否正确
		const isCorrectPassword = compareStringSync(passwordHash, userAuthData.passwordHashHash)
		if (!isCorrectPassword) {
			const errorMessage = '登录失败'
			logging('warn', errorMessage, undefined, { uuid })
			return { success: false, email, passwordHint: userAuthData.passwordHint, message: errorMessage }
		}

		let currentAuthenticatorType: 'email' | 'totp' | 'none' = 'none';
		// 4. 判断用户是否启用了 2FA
		if (authenticatorType === 'totp') { // 4.1 TOTP 2FA
			if (!clientOtp) {
				const errormMessage = '登录失败，启用了 TOTP 但用户未提供验证码'
				logging('ERROR', errormMessage, undefined, { authenticatorType } )
				return { success: false, message: errormMessage, authenticatorType }
			}

			const TotpVerifier = new General2FATotpVerifier(uuid, clientOtp)
			const verificationResult = await TotpVerifier.verify({ isResetAttemptsImmediately: true, isAllowBackupCode: true, isAllowRecoveryCodeAndDeleteTotp: true })
			if (!verificationResult.success) {
				const errorMessage = `登录失败，TOTP 验证失败：${verificationResult.message}`
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage, authenticatorType }
			}

			currentAuthenticatorType = 'totp'
		} else if (authenticatorType === 'email') { // 4.2 Email 2FA
			if (!verificationCode) {
				const errorMessage = '登录失败，启用了邮箱验证但用户未提供验证码'
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage, authenticatorType }
			}

			if (verificationCode.length !== 6) {
				const errorMessage = '登录失败，验证码长度错误'
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage, authenticatorType }
			}

			const EmailVerifier = new GeneralEmailVerifier(emailLowerCase, verificationCode)
			const verificationResult = await EmailVerifier.verify({ isResetAttemptsImmediately: true, exclusiveBusinessName: 'login' })
			if (!verificationResult.success) {
				const errorMessage = `登录失败，邮箱验证码验证失败：${verificationResult.message}`
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage, authenticatorType }
			}

			currentAuthenticatorType = 'email'
		} else { // 4.3 未启用 2FA
			currentAuthenticatorType = 'none'
		}

		return { success: true, email, uid, token, userDataBootstrapHint, UUID: uuid, message: '用户登录成功', authenticatorType: currentAuthenticatorType }
	} catch (error) {
		const errormMessage = '登录失败，用户登录时程序异常'
		logging('ERROR', errormMessage, error)
		return { success: false, message: errormMessage }
	}
}

/**
 * 检查一个用户邮箱是否存在（检查一个邮箱是否已经注册）
 * @param checkUserExistsCheckRequest 检查用户是否存在需要的信息（用户邮箱）
 * @return UserExistsCheckResponseDto 检查结果，如果存在或查询失败则 exists: true
 */
export const userEmailExistsCheckService = async (userEmailExistsCheckRequest: UserEmailExistsCheckRequestDto): Promise<UserEmailExistsCheckResponseDto> => {
	try {
		if (checkUserEmailExistsCheckRequest(userEmailExistsCheckRequest)) {
			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const where: QueryType<UserAuth> = {
				emailLowerCase: userEmailExistsCheckRequest.email.toLowerCase(),
			}
			const select: SelectType<UserAuth> = {
				emailLowerCase: 1,
			}

			let result: DbPoolResultsType<UserAuth>
			try {
				result = await selectDataFromMongoDB<UserAuth>(where, select, schemaInstance, collectionName)
			} catch (error) {
				logging('ERROR', '验证用户邮箱是否存在（查询用户）时出现异常：', error)
				return { success: false, exists: false, message: '验证用户邮箱是否存在时出现异常' }
			}

			if (result && result.success && result.result) {
				if (result.result?.length > 0) {
					return { success: true, exists: true, message: '用户邮箱已存在' }
				} else {
					return { success: true, exists: false, message: '用户邮箱不存在' }
				}
			} else {
				return { success: false, exists: false, message: '邮箱查询失败' }
			}
		} else {
			logging('ERROR', '查询用户邮箱是否存在时失败：参数不合法')
			return { success: false, exists: false, message: '查询用户邮箱是否存在时失败：参数不合法' }
		}
	} catch (error) {
		logging('ERROR', '查询用户邮箱是否存在时出错：未知错误', error)
		return { success: false, exists: false, message: '查询用户邮箱是否存在时出错：未知错误' }
	}
}

/**
 * 修改用户的 email
 * @param updateUserEmailRequest 修改用户的 email 的请求参数
 * @param cookieUuid 用户 uuid
 * @param cookieToken 用户 token
 * @returns 修改用户的 email 的请求响应
 */
export const updateUserEmailService = async (updateUserEmailRequest: UpdateUserEmailRequestDto, cookieUuid: string, cookieToken: string): Promise<UpdateUserEmailResponseDto> => {
	try {
		if (!checkUpdateUserEmailRequest(updateUserEmailRequest)) {
			logging('ERROR', '更新用户邮箱时失败，请求参数不合法')
			return { success: false, message: '用户邮箱更新失败，请求参数不合法' }
		}

		if (!await checkUserTokenByUUID(cookieUuid, cookieToken)) {
			logging('ERROR', '更新用户邮箱时失败，用户不合法')
			return { success: false, message: '用户邮箱更新失败，用户不合法' }
		}

		const { oldEmail, newEmail, passwordHash, changeEmailVerificationCode, changeEmailNewEmailVerificationCode } = updateUserEmailRequest
		const oldEmailLowerCase = oldEmail.toLowerCase()
		const newEmailLowerCase = newEmail.toLowerCase()
		const now = new Date().getTime()

		if (oldEmailLowerCase === newEmailLowerCase) {
			logging('ERROR', '更新用户邮箱时失败，旧邮箱和新邮箱相同', undefined, { cookieUuid, oldEmail, newEmail })
			return { success: false, message: '更新用户邮箱失败，旧邮箱和新邮箱不能相同' }
		}

		// 启动事务
		const session = await createAndStartSession()

		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>
		const userAuthWhere: QueryType<UserAuth> = { UUID: cookieUuid, emailLowerCase: oldEmailLowerCase, token: cookieToken } // 使用 uuid, emailLowerCase 和 token 确保用户更新的是自己的邮箱，而不是其他用户的
		const userAuthSelect: SelectType<UserAuth> = { passwordHashHash: 1, emailLowerCase: 1, authenticatorType: 1 }
		const userAuthResult = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, schemaInstance, collectionName, { session })
		const userAuthData = userAuthResult.result

		if (!userAuthData) {
			const errorMessage = '更新用户邮箱失败，未能获取用户信息'
			logging('ERROR', errorMessage, undefined, { cookieUuid, oldEmail })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		if (userAuthData.length !== 1) { // 确保只更新一个用户的邮箱
			const errorMessage = '更新用户邮箱失败，无法找到正确的用户'
			logging('ERROR', errorMessage, undefined, { cookieUuid, oldEmail })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const { passwordHashHash } = userAuthData[0]
		const isCorrectPassword = compareStringSync(passwordHash, passwordHashHash) // 确保更新邮箱时输入的密码正确
		if (!isCorrectPassword) {
			const errorMessage = '更新用户邮箱失败，用户密码不正确'
			logging('ERROR', errorMessage, undefined, { cookieUuid, oldEmail })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const Verifier = new General2FAVerifier(cookieUuid, changeEmailVerificationCode, cookieToken)
		const verificationResult = await Verifier.verify({ isResetAttemptsImmediately: true, isStrictMode: true, exclusiveBusinessName: 'update-email' })
		if (!verificationResult.success) {
			const errorMessage = `更新用户邮箱失败，用户验证失败：${verificationResult.message}`
			logging('ERROR', errorMessage)
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const NewEmailVerifier = new GeneralEmailVerifier(newEmailLowerCase, changeEmailNewEmailVerificationCode, cookieUuid, cookieToken)
		const newEmailVerificationResult = await NewEmailVerifier.verify({ isResetAttemptsImmediately: true, exclusiveBusinessName: 'update-email' })
		if (!newEmailVerificationResult.success) {
			const errorMessage = `更新用户邮箱失败，新邮箱验证码验证失败：${newEmailVerificationResult.message}`
			logging('ERROR', errorMessage)
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const updateUserEmailWhere: QueryType<UserAuth> = {
			UUID: cookieUuid,
		}
		const updateUserEmailUpdate: QueryType<UserAuth> = {
			email: newEmail,
			emailLowerCase: newEmailLowerCase,
			editDateTime: now,
		}
		try {
			const updateResult = await updateData4MongoDB(updateUserEmailWhere, updateUserEmailUpdate, schemaInstance, collectionName)

			if (!updateResult || !updateResult.success || !updateResult.result) {
				logging('ERROR', '更新用户邮箱时，更新数量为 0', undefined, { cookieUuid, oldEmail, newEmail })
				await abortAndEndSession(session)
				return { success: false, message: '用户邮箱更新失败，无法更新用户邮箱' }
			}

			await commitAndEndSession(session)
			return { success: true, message: '用户邮箱更新成功' }
		} catch (error) {
			logging('ERROR', '更新用户邮箱出错', undefined, { cookieUuid, oldEmail, newEmail }, error)
			await abortAndEndSession(session)
			return { success: false, message: '用户邮箱更新失败，更新用户身份时出错' }
		}
	} catch (error) {
		logging('ERROR', '修改用户邮箱失败，未知错误：', error)
		return { success: false, message: '修改用户邮箱失败，未知错误' }
	}
}

/**
 * 根据 UUID 更新或创建用户信息
 * @param updateUserInfoRequest 更新或创建用户信息时的请求参数
 * @param uuid 用户 UUID
 * @param token 用户 token
 * @returns 更新或创建用户信息的请求结果
 */
export const updateOrCreateUserInfoService = async (updateOrCreateUserInfoRequest: UpdateOrCreateUserInfoRequestDto, uuid: string, token: string): Promise<UpdateOrCreateUserInfoResponseDto> => {
	try {
		if (!checkUpdateOrCreateUserInfoRequest(updateOrCreateUserInfoRequest)) {
			logging('ERROR', '更新用户信息时失败，参数校验未通过', undefined, { updateOrCreateUserInfoRequest, uuid })
			return { success: false, message: '更新用户数据时失败，参数校验未通过' }
		}

		if (!await checkUserTokenByUUID(uuid, token)) {
			logging('ERROR', '更新用户信息时失败，token 校验失败，非法用户！', undefined, { updateOrCreateUserInfoRequest, uuid })
			return { success: false, message: '更新用户数据时失败，非法用户！' }
		}

		const { collectionName, schemaInstance } = UserInfoSchema
		type UserInfo = InferSchemaType<typeof schemaInstance>
		const { username, userNickname, signature } = updateOrCreateUserInfoRequest

		const usernameStandardized = username.trim().normalize();

		if (usernameStandardized) {
			const checkUserNameResult = await checkUsernameService({ username: usernameStandardized }, [uuid]) // exclude self when check duplicate username
			if (!checkUserNameResult.success || !checkUserNameResult.isAvailableUsername) {
				logging('ERROR', '更新用户信息失败，用户重名', undefined, { updateOrCreateUserInfoRequest, uuid })
				return { success: false, message: '更新用户信息失败，用户重名' }
			}
		}

		if (userNickname && !validateNameField(userNickname)) {
			logging('ERROR', '更新用户信息失败，用户昵称不合法，用户 UUID:', undefined, { uuid })
			return { success: false, message: '更新用户信息失败，用户昵称不合法' }
		}

		if (!!signature) {
			const maxSignatureLength = 200
			if (signature.length > maxSignatureLength) {
				logging('ERROR', '更新用户信息失败，用户签名过长，用户 UUID:', undefined, { uuid, signatureLength: signature.length, maxSignatureLength })
				return { success: false, message: `更新用户信息失败，用户签名过长，最大长度为 ${maxSignatureLength} 个字符` }
			}
		}

		const updateUserInfoWhere: QueryType<UserInfo> = {
			UUID: uuid,
		}
		const updateUserInfoUpdate: UpdateType<UserInfo> = {
			...updateOrCreateUserInfoRequest,
			username: usernameStandardized, // username 经过了特殊处理，所以需要覆盖前面展开的 updateOrCreateUserInfoRequest
			label: updateOrCreateUserInfoRequest.label as UserInfo['label'], // TODO: Mongoose issue: #12420
			userLinkedAccounts: updateOrCreateUserInfoRequest.userLinkedAccounts as UserInfo['userLinkedAccounts'], // TODO: Mongoose issue: #12420
			isUpdatedAfterReview: true,
			editOperatorUUID: uuid,
			editDateTime: new Date().getTime(),
		}
		const updateResult = await findOneAndUpdateData4MongoDB(updateUserInfoWhere, updateUserInfoUpdate, schemaInstance, collectionName)

		if (!updateResult || !updateResult.success || !updateResult.result) {
			logging('ERROR', '更新用户信息失败，没有返回用户数据', undefined, { updateOrCreateUserInfoRequest, uuid })
			return { success: false, message: '更新用户信息失败，没有返回用户数据' }
		}

		return { success: true, message: '更新用户信息成功', result: updateResult.result }
	} catch (error) {
		logging('ERROR', '更新用户信息时失败，未知异常', error)
		return { success: false, message: '更新用户数据时失败，未知异常' }
	}
}

/**
 * 根据 UID 获取用户是否存在
 * @param UserExistsCheckByUIDRequestDto 获取用户是否存在的请求参数
 * @returns 获取用户是否存在的请求结果
 */
export const checkUserExistsByUIDService = async (userExistsCheckByUIDRequest: UserExistsCheckByUIDRequestDto): Promise<UserExistsCheckByUIDResponseDto> => {
	try {
		if (!!userExistsCheckByUIDRequest.uid) {
			const { uid } = userExistsCheckByUIDRequest
			const { collectionName, schemaInstance } = UserInfoSchema
			type UserInfo = InferSchemaType<typeof schemaInstance>
			const where: QueryType<UserInfo> = { uid }
			const select: SelectType<UserInfo> = { uid: 1 }
			const result = await selectDataFromMongoDB<UserInfo>(where, select, schemaInstance, collectionName)
			if (result.success) {
				if (result.result?.length === 1) {
					return { success: true, exists: true, message: '用户存在' }
				} else {
					return { success: true, exists: false, message: '用户不存在' }
				}
			} else {
				logging('ERROR', '获取用户是否存在时失败，查询失败')
				return { success: false, exists: false, message: '获取用户是否存在时失败，查询失败' }
			}
		} else {
			logging('ERROR', '获取用户是否存在时失败，请求参数不合法')
			return { success: false, exists: false, message: '获取用户是否存在时失败，请求参数不合法' }
		}
	} catch (error) {
		logging('ERROR', '获取用户是否存在时失败，未知异常', error)
		return { success: false, exists: false, message: '获取用户是否存在时失败，未知异常' }
	}
}

/**
 * 通过 UUID 获取当前登录的用户信息
 * @param getSelfUserInfoRequest 通过 UUID 获取当前登录的用户信息的请求参数
 * @returns 通过 UUID 获取当前登录的用户信息的请求响应
 */
export const getSelfUserInfoByUuidService = async (getSelfUserInfoByUuidRequest: GetSelfUserInfoByUuidRequestDto): Promise<GetSelfUserInfoByUuidResponseDto> => {
	try {
		const { uuid, token } = getSelfUserInfoByUuidRequest
		if (!uuid || !token) {
			const errorMessage = '通过 UUID 获取用户信息失败，uuid 或 token 为空'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		if (!await checkUserTokenByUUID(uuid, token)) {
			const errorMessage = '通过 UUID 获取用户信息时失败，用户的 token 校验未通过，非法用户！'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const selfUserInfoPipeline: PipelineStage[] = [
			{
				$match: {
					UUID: uuid
				},
			},
			{
				$lookup: {
					from: 'user-infos',
					localField: 'UUID',
					foreignField: 'UUID',
					as: 'user_info_data'
				}
			},
			{
				$unwind: {
					path: '$user_info_data',
					preserveNullAndEmptyArrays: true // 保留没有用户信息的用户
				},
			},
			{
				$lookup: {
					from: 'user-invitation-codes',
					localField: 'UUID',
					foreignField: 'assigneeUUID',
					as: 'invitation_codes_data'
				},
			},
			{
				$unwind: {
					path: '$invitation_codes_data',
					preserveNullAndEmptyArrays: true
				},
			},
			{
				$project: {
					uid: 1, // 用户 UID
					uuid: '$UUID', // 用户 UUID
					email: 1, // 用户邮箱
					userCreateDateTime: 1, // 用户创建日期
					passwordUpdateDateTime: 1, // 密码最后更新时间
					roles: 1, // 用户的角色
					authenticatorType: 1, // 2FA 的类型
					userDataBootstrapHint: 1, // 用户数据初始化提示标识。
					invitationCode: '$invitation_codes_data.invitationCode', // 用户的邀请码
					username: '$user_info_data.username', // 用户名
					userNickname: '$user_info_data.userNickname', // 用户昵称
					avatar: '$user_info_data.avatar', // 用户头像
					userBannerImage: '$user_info_data.userBannerImage', // 用户的背景图
					signature: '$user_info_data.signature', // 用户的个性签名
					gender: '$user_info_data.gender', // 用户的性别
					label: '$user_info_data.label', // 用户标签
					userBirthday: '$user_info_data.userBirthday', // 用户的生日
					// userProfileMarkdown: '$user_info_data.userProfileMarkdown', // 用户主页 Markdown
					// userLinkedAccounts: '$user_info_data.userLinkedAccounts', // 用户的关联账户
					// userWebsite: '$user_info_data.userWebsite', // 用户的关联网站
				}
			}
		]

		try {
			const userSelfInfoResult = await selectDataByAggregateFromMongoDB<UserAuth>(userAuthSchemaInstance, userAuthCollectionName, selfUserInfoPipeline)
			if (
				false
				|| !userSelfInfoResult
				|| !userSelfInfoResult.success
				|| !userSelfInfoResult.result
				|| userSelfInfoResult.result.length !== 1
			) {
				const errorMessage = '通过 UID 获取用户信息时失败，查询数据时出错'
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage }
			}

			const userInfo = userSelfInfoResult.result[0]
			return {
				success: true,
				message: '获取用户信息成功',
				result: userInfo,
			}
		} catch (error) {
			const errorMessage = '通过 UUID 获取用户信息时出错，查询数据时出错。'
			logging('ERROR', errorMessage, error)
			return { success: false, message: errorMessage }
		}
	} catch (error) {
		const errorMessage = '通过 UUID 获取用户信息时出错，未知错误。'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage }
	}
}

/**
 * 根据 uid 和标识获取用户初始化数据
 * @param getSelfUserInfoRequest 根据 uid 和标识获取用户初始化数据的请求参数
 * @returns 根据 uid 和标识获取用户初始化数据的请求响应
 */
export const getUserBootstrapDataByHintService = async (getUserBootstrapDataByHintRequest: GetUserBootstrapDataByHintRequestDto): Promise<GetUserBootstrapDataByHintResponseDto> => {
	try {
		const { uid, userDataBootstrapHint } = getUserBootstrapDataByHintRequest
		if (!userDataBootstrapHint) {
			const errorMessage = '根据 uid 和标识获取用户初始化数据失败，uid 或 userDataBootstrapHint 为空'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		if (!await checkUserBootstrapHintByUid(uid, userDataBootstrapHint)) {
			const errorMessage = '根据 uid 和标识获取用户初始化数据失败，用户的 userDataBootstrapHint 校验未通过，非法用户！'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const selfUserInfoPipeline: PipelineStage[] = [
			{
				$match: {
					uid
				},
			},
			{
				$lookup: {
					from: 'user-infos',
					localField: 'UUID',
					foreignField: 'UUID',
					as: 'user_info_data'
				}
			},
			{
				$unwind: {
					path: '$user_info_data',
					preserveNullAndEmptyArrays: true // 保留没有用户信息的用户
				},
			},
			{
				$lookup: {
					from: 'user-settings',
					localField: 'UUID',
					foreignField: 'UUID',
					as: 'user_settings_data'
				},
			},
			{
				$unwind: {
					path: '$user_settings_data',
					preserveNullAndEmptyArrays: true // 保留没有用户设置信息的用户
				},
			},
			{
				$project: {
					uid: 1, // 用户 UID
					uuid: '$UUID', // 用户 UUID
					userCreateDateTime: 1, // 用户创建日期
					passwordUpdateDateTime: 1, // 密码最后更新时间
					roles: 1, // 用户的角色
					authenticatorType: 1, // 2FA 的类型
					userDataBootstrapHint: 1, // 用户数据初始化提示标识。
					username: '$user_info_data.username', // 用户名
					userNickname: '$user_info_data.userNickname', // 用户昵称
					avatar: '$user_info_data.avatar', // 用户头像
					userBannerImage: '$user_info_data.userBannerImage', // 用户的背景图
					signature: '$user_info_data.signature', // 用户的个性签名

					enableCookie: '$user_settings_data.enableCookie', // 是否允许 cookie
					themeType: '$user_settings_data.themeType', // 主题类型
					themeColor: '$user_settings_data.themeColor', // 主题颜色
					themeColorCustom: '$user_settings_data.themeColorCustom', // 用户自定义主题颜色
					wallpaper: '$user_settings_data.wallpaper', // TODO: 背景图 URL
					coloredSideBar: '$user_settings_data.coloredSideBar', // 是否启用彩色导航栏
					dataSaverMode: '$user_settings_data.dataSaverMode', // 节流模式
					noSearchRecommendations: '$user_settings_data.noSearchRecommendations', // 是否禁用搜索推荐
					noRelatedVideos: '$user_settings_data.noRelatedVideos', // 禁用相关视频推荐
					noRecentSearch: '$user_settings_data.noRecentSearch', // 禁用搜索历史
					noViewHistory: '$user_settings_data.noViewHistory', // 禁用观看历史
					openInNewWindow: '$user_settings_data.openInNewWindow', // 在新窗口中打开链接
					currentLocale: '$user_settings_data.currentLocale', // 当前语言环境
					timezone: '$user_settings_data.timezone', // 时区
					unitSystemType: '$user_settings_data.unitSystemType', // 单位系统类型
					devMode: '$user_settings_data.devMode', // 是否进入开发者模式
					sharpAppearanceMode: '$user_settings_data.sharpAppearanceMode', // 实验性：启用直角模式
					flatAppearanceMode: '$user_settings_data.flatAppearanceMode', // 实验性：启用扁平模式
				}
			}
		]

		try {
			const userBootstrapDataResult = await selectDataByAggregateFromMongoDB<UserAuth>(userAuthSchemaInstance, userAuthCollectionName, selfUserInfoPipeline)
			if (
				false
				|| !userBootstrapDataResult
				|| !userBootstrapDataResult.success
				|| !userBootstrapDataResult.result
				|| userBootstrapDataResult.result.length !== 1
			) {
				const errorMessage = '通过 UID 获取用户信息时失败，查询数据时出错'
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage }
			}

			const userBootstrapData = userBootstrapDataResult.result[0]
			return {
				success: true,
				message: '获取用户信息成功',
				result: userBootstrapData,
			}
		} catch (error) {
			const errorMessage = '通过 UUID 获取用户信息时出错，查询数据时出错。'
			logging('ERROR', errorMessage, error)
			return { success: false, message: errorMessage }
		}
	} catch (error) {
		const errorMessage = '通过 UUID 获取用户信息时出错，未知错误。'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage }
	}
}

/**
 * 通过 uid 获取（其他）用户信息
 * @param getUserInfoByUidRequest 通过 UID 获取用户信息的请求载荷
 * @param selectorUuid 发起请求者的 UUID
 * @param selectorToken 发起请求者的 token
 * @returns 获取用户信息的请求结果
 */
export const getUserInfoByUidService = async (getUserInfoByUidRequest: GetUserInfoByUidRequestDto, selectorUuid?: string, selectorToken?: string): Promise<GetUserInfoByUidResponseDto> => {
	try {
		const { uid } = getUserInfoByUidRequest
		let isHidden = false
		let isBlockedByOther = false

		if (uid === null || uid === undefined) {
			logging('ERROR', '获取用户信息时失败，传入的 uid 或 token 为空')
			return { success: false, message: '获取用户信息时失败，必要的参数为空', isBlockedByOther, isBlocked: false, isHidden }
		}

		const checkBlockUserResult = await checkBlockUserService({ uid }, selectorUuid, selectorToken)
		const checkIsBlockedByOtherUserResult = await checkIsBlockedByOtherUserService({ targetUid: uid }, selectorUuid, selectorToken)

		// 1. 检查目标用户是否已经被当前用户隐藏
		if (checkBlockUserResult.isHidden) {
			isHidden = true
		}

		// 2. 检查当前用户是否已经被目标用户屏蔽
		if (checkIsBlockedByOtherUserResult.isBlocked) {
			isBlockedByOther = true
		}

		// 3. 检查当前用户是否与目标用户双向屏蔽
		if (checkBlockUserResult.isBlocked && checkIsBlockedByOtherUserResult.isBlocked) {
			return { success: true, message: '获取用户信息时失败，你与该用户已双向屏蔽', isBlockedByOther, isBlocked: true, isHidden }
		}

		// 4. 检查目标用户是否已经被当前用户屏蔽
		if (checkBlockUserResult.isBlocked) {
			return { success: true, message: '获取用户信息时失败，你已屏蔽该用户', isBlockedByOther, isBlocked: true, isHidden }
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		const userAuthWhere: QueryType<UserAuth> = { uid }
		const userAuthSelect: SelectType<UserAuth> = {
			UUID: 1, // UUID
			userCreateDateTime: 1, // 用户创建日期
			roles: 1, // 用户的角色
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
			const session = await createAndStartSession()
			const userAuthPromise = selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, userAuthSchemaInstance, userAuthCollectionName)
			const userInfoPromise = selectDataFromMongoDB<UserInfo>(getUserInfoWhere, getUserInfoSelect, userInfoSchemaInstance, userInfoCollectionName)
			const [userAuthResult, userInfoResult] = await Promise.all([userAuthPromise, userInfoPromise])
			if (!userAuthResult || !userAuthResult.success || !userInfoResult || !userInfoResult.success) {
				await abortAndEndSession(session)
				logging('ERROR', '获取用户信息时失败，获取到的结果为空')
				return { success: false, message: '获取用户信息时失败，结果为空', isBlockedByOther, isBlocked: false, isHidden }
			}
			const userAuth = userAuthResult?.result
			const uuid = userAuth?.[0]?.UUID
			const userInfo = userInfoResult?.result
			if (userInfo?.length !== 1 || !userInfo[0] || userAuth?.length !== 1 || !uuid) {
				await abortAndEndSession(session)
				logging('ERROR', '获取用户信息时失败，获取到的结果长度不为 1')
				return { success: false, message: '获取用户信息时失败，结果异常', isBlockedByOther, isBlocked: false, isHidden }
			}

			let isSelf = uuid === selectorUuid // 查询的用户是否是自己。
			let isFollowing = false; // 是否已关注该用户，默认没有被关注。
			if ( selectorUuid && selectorToken && !isSelf && await checkUserTokenByUUID(selectorUuid, selectorToken)) { // 如果传递了 uuid 和 token，而且用户不是自己，且校验通过，则检查被获取信息的用户是否是已被关注。
				const { collectionName: followingSchemaCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
				type Following = InferSchemaType<typeof followingSchemaInstance>

				const followingWhere: QueryType<Following> = {
					followerUuid: selectorUuid,
					followingUuid: uuid,
				}
				const followingSelect: SelectType<Following> = {
					followerUuid: 1,
					followingUuid: 1,
					followingType: 1,
				}

				const selectFollowingDataResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingSchemaCollectionName, { session })
				const followingResult = selectFollowingDataResult?.result
				if (selectFollowingDataResult.success && followingResult.length === 1) {
					isFollowing = true
				}
			}

			await commitAndEndSession(session)
			return {
				success: true,
				message: '获取用户信息成功',
				result: {
					...userInfo[0],
					userCreateDateTime: userAuth[0].userCreateDateTime,
					roles: userAuth[0].roles,
					isFollowing,
					isSelf,
				},
				isBlockedByOther,
				isBlocked: false,
				isHidden,
			}
		} catch (error) {
			logging('ERROR', '获取用户信息时失败，查询数据时出错：', error)
			return { success: false, message: '获取用户信息时失败', isBlockedByOther, isBlocked: false, isHidden }
		}
	} catch (error) {
		logging('ERROR', '获取用户信息时失败，未知错误：', error)
		return { success: false, message: '获取用户信息时失败，未知错误', isBlockedByOther: false, isBlocked: false, isHidden: false }
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
			logging('ERROR', '获取上传图片用的预签名 URL 失败，用户不合法', undefined, { uid })
			return { success: false, message: '上传失败，无法获取上传权限' }
		}
	} catch (error) {
		logging('ERROR', '获取上传图片用的预签名 URL 失败，错误信息', error, { uid })
	}
}

/**
 * 获取用户个性设置数据
 * @param uid 用户 ID
 * @param token 用户 token
 * @returns 用户个性设置数据
 */
export const getUserSettingsService = async (uuid: string, token: string): Promise<GetUserSettingsResponseDto> => {
	try {
		if (!await checkUserTokenByUUID(uuid, token)) {
			const errorMessage = '获取用户个性设置失败，用户验证时未通过'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage }
		}

		const { collectionName, schemaInstance } = UserSettingsSchema
		type UserSettings = InferSchemaType<typeof schemaInstance>
		const getUserSettingsWhere: QueryType<UserSettings> = {
			UUID: uuid,
		}
		const getUserSettingsSelect: SelectType<UserSettings> = {
			uid: 1,
			enableCookie: 1,
			themeType: 1,
			themeColor: 1,
			themeColorCustom: 1,
			wallpaper: 1, // TODO
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
			userPrivaryVisibilitiesSetting: 1,
			userLinkedAccountsVisibilitiesSetting: 1,
			userWebsitePrivacySetting: 1,
			editDateTime: 1,
		}

		const userSettingsResult = await selectDataFromMongoDB<UserSettings>(getUserSettingsWhere, getUserSettingsSelect, schemaInstance, collectionName)

		if (!userSettingsResult.success || !userSettingsResult.result || userSettingsResult.result.length !== 1) {
			const errorMessage = '获取用户个性设置失败，查询未成功'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage }
		}

		const userSettings = userSettingsResult.result[0]
		return {
			success: true,
			message: '获取用户设置成功！',
			userSettings: {
				...userSettings,
				themeType: userSettings.themeType as 'light' | 'dark' | 'system',
				dataSaverMode: userSettings.dataSaverMode as 'limit' | 'standard' | 'preview',
				userWebsitePrivacySetting: userSettings.userWebsitePrivacySetting as 'public' | 'private' | 'following',
				userPrivaryVisibilitiesSetting: userSettings.userPrivaryVisibilitiesSetting as GetUserSettingsResponseDto['userSettings']['userPrivaryVisibilitiesSetting'],
				userLinkedAccountsVisibilitiesSetting: userSettings.userLinkedAccountsVisibilitiesSetting as GetUserSettingsResponseDto['userSettings']['userLinkedAccountsVisibilitiesSetting'],
			}
		}
	} catch (error) {
		const errorMessage = '获取用户个性设置失败，未知异常！'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage }
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
		const now = new Date().getTime();
		if (await checkUserToken(uid, token)) {
			const UUID = await getUserUuid(uid)
			if (!UUID) {
				logging('ERROR', '更新或创建用户设置失败，UUID 不存在', undefined, { updateOrCreateUserSettingsRequest, uid })
				return { success: false, message: '更新或创建用户设置失败，UUID 不存在' }
			}

			if (checkUpdateOrCreateUserSettingsRequest(updateOrCreateUserSettingsRequest)) {
				const { collectionName, schemaInstance } = UserSettingsSchema
				type UserSettings = InferSchemaType<typeof schemaInstance>
				const updateOrCreateUserSettingsWhere: QueryType<UserSettings> = {
					uid,
				}
				const updateOrCreateUserSettingsUpdate: UpdateType<UserSettings> = {
					...updateOrCreateUserSettingsRequest,
					userPrivaryVisibilitiesSetting: updateOrCreateUserSettingsRequest.userPrivaryVisibilitiesSetting as UserSettings['userPrivaryVisibilitiesSetting'], // TODO: Mongoose issue: #12420
					userLinkedAccountsVisibilitiesSetting: updateOrCreateUserSettingsRequest.userLinkedAccountsVisibilitiesSetting as UserSettings['userLinkedAccountsVisibilitiesSetting'], // TODO: Mongoose issue: #12420
					editDateTime: now
				}
				const updateResult = await findOneAndUpdateData4MongoDB(updateOrCreateUserSettingsWhere, updateOrCreateUserSettingsUpdate, schemaInstance, collectionName)
				const userSettings = updateResult?.result?.[0]
				if (updateResult?.success) {
					return { success: true, message: '更新或创建用户设置成功', userSettings: userSettings || updateOrCreateUserSettingsUpdate }
				} else {
					logging('ERROR', '更新或创建用户设置失败，没有返回用户设置数据', undefined, { updateOrCreateUserSettingsRequest, uid })
					return { success: false, message: '更新或创建用户设置失败，没有返回用户设置数据' }
				}
			} else {
				logging('ERROR', '更新或创建用户设置失败，未找到必要的数据，或者关联账户平台类型不合法：', undefined, { updateOrCreateUserSettingsRequest, uid })
				return { success: false, message: '更新或创建用户设置失败，必要的数据为空或关联平台信息出错' }
			}
		} else {
			logging('ERROR', '更新或创建用户设置失败，token 校验失败，非法用户！', undefined, { updateOrCreateUserSettingsRequest, uid })
			return { success: false, message: '更新或创建用户设置失败，非法用户！' }
		}
	} catch (error) {
		logging('ERROR', '更新或创建用户设置时失败，未知异常', error)
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
				logging('ERROR', `用户校验失败！非法用户！用户 UID：${uid}`)
				return { success: false, message: '用户校验失败！非法用户！', userTokenOk: false }
			}
		} else {
			logging('ERROR', `用户校验失败！用户 uid 或 token 不存在，用户 UID：${uid}`)
			return { success: false, message: '用户校验失败！', userTokenOk: false }
		}
	} catch {
		logging('ERROR', `用户校验异常！用户 UID：${uid}`)
		return { success: false, message: '用户校验异常！', userTokenOk: false }
	}
}

/**
 * 通过 UUID 校验用户
 * @param UUID 用户 UUID
 * @param token 用户 ID 对应的 token，为空时会导致校验失败
 * @returns 校验结果
 */
export const checkUserTokenByUuidService = async (UUID: string, token: string): Promise<CheckUserTokenResponseDto> => {
	try {
		if (UUID !== undefined && UUID !== null && token) {
			const checkUserTokenResult = await checkUserTokenByUUID(UUID, token)
			if (checkUserTokenResult) {
				return { success: true, message: '用户校验成功', userTokenOk: true }
			} else {
				logging('ERROR', `用户校验失败！非法用户！用户 UUID：${UUID}`)
				return { success: false, message: '用户校验失败！非法用户！', userTokenOk: false }
			}
		} else {
			logging('ERROR', `用户校验失败！用户 UUID 或 token 不存在，用户 UUID：${UUID}`)
			return { success: false, message: '用户校验失败！', userTokenOk: false }
		}
	} catch {
		logging('ERROR', `用户校验异常！用户 UUID：${UUID}`)
		return { success: false, message: '用户校验异常！', userTokenOk: false }
	}
}

/**
 * 发送通用 2FA 邮箱验证码
 * 有别于函数 sendGeneralEmailVerificationCodeService，本函数专门用于 2FA 邮箱验证码发送
 * @param sendGeneral2FAEmailVerificationCodeRequest 发送通用 2FA 邮箱验证码的请求载荷
 * @param uuid
 * @param token
 * @returns 发送通用 2FA 邮箱验证码的请求响应
 */
export const sendGeneral2FAEmailVerificationCodeService = async (sendGeneral2FAEmailVerificationCodeRequest: SendGeneral2FAEmailVerificationCodeRequestDto = { clientLanguage: 'zh-Hans-CN', mailTemplate: 'SendGeneral2FAEmailVerificationCode', exclusiveBusinessName: 'unknown' }, uuid: string, token: string): Promise<SendGeneral2FAEmailVerificationCodeResponseDto> => {
	try {
		if (!checkSendGeneral2FAEmailVerificationCodeRequest(sendGeneral2FAEmailVerificationCodeRequest)) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，参数不合法'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		if (!await checkUserTokenByUUID(uuid, token)) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，用户校验未通过'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const session = await createAndStartSession()

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		const getUserAuthWhere: QueryType<UserAuth> = {
			UUID: uuid,
		}
		const getUserAuthSelect: SelectType<UserAuth> = {
			email: 1,
			authenticatorType: 1,
		}
		const userAuthResult = await selectDataFromMongoDB<UserAuth>(getUserAuthWhere, getUserAuthSelect, userAuthSchemaInstance, userAuthCollectionName, { session })

		if (!userAuthResult.success || !userAuthResult.result || userAuthResult.result.length !== 1) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，获取用户信息失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const userEmail = userAuthResult.result[0].email
		const userAuthenticatorType = userAuthResult.result[0].authenticatorType

		if (!userEmail || !userAuthenticatorType ) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，用户邮箱或 2FA 类型不存在'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		if (['totp'].includes(userAuthenticatorType)) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，用户使用的非邮箱 2FA'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: true, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const { collectionName: general2FAEmailVerificationCodeCollectionName, schemaInstance: general2FAEmailVerificationCodeSchemaInstance } = General2FAEmailVerificationCodeSchema
		type General2FAEmailVerificationCode = InferSchemaType<typeof general2FAEmailVerificationCodeSchemaInstance>
		const getGeneral2FAEmailVerificationCodeHistoryWhere: QueryType<General2FAEmailVerificationCode> = {
			uuid,
		}
		const getGeneral2FAEmailVerificationCodeHistorySelect: SelectType<General2FAEmailVerificationCode> = {
			verificationCreatedDate: 1,
			totalCreateTimesToday: 1,
			totalVerifierTimesToday: 1,
		}
		const getGeneral2FAEmailVerificationCodeResult = await selectDataFromMongoDB<General2FAEmailVerificationCode>(getGeneral2FAEmailVerificationCodeHistoryWhere, getGeneral2FAEmailVerificationCodeHistorySelect, general2FAEmailVerificationCodeSchemaInstance, general2FAEmailVerificationCodeCollectionName, { session })

		const now = new Date().getTime()
		let isVerificationCodeCreatedDateToday = false
		let totalCreateTimesToday = 0

		if (
			getGeneral2FAEmailVerificationCodeResult.success
			&& getGeneral2FAEmailVerificationCodeResult.result && getGeneral2FAEmailVerificationCodeResult.result.length === 1
			&& getGeneral2FAEmailVerificationCodeResult.result[0].verificationCreatedDate !== undefined && getGeneral2FAEmailVerificationCodeResult.result[0].verificationCreatedDate !== null
			&& getGeneral2FAEmailVerificationCodeResult.result[0].totalCreateTimesToday !== undefined && getGeneral2FAEmailVerificationCodeResult.result[0].totalCreateTimesToday !== null
		) {
			const { verificationCreatedDate, totalVerifierTimesToday } = getGeneral2FAEmailVerificationCodeResult.result[0]
			totalCreateTimesToday = getGeneral2FAEmailVerificationCodeResult.result[0].totalCreateTimesToday
			const GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS = parseInteger(process.env.GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS, 5) || 5 // 默认每天最多允许连续验证验证码直到成功验证的次数，默认 5。请注意：在验证通过后应重置次数。
			const GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_CREATE_ATTEMPTS = parseInteger(process.env.GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_CREATE_ATTEMPTS, 5) || 5 // 默认每天最多允许连续发送验证码直到成功验证的次数，默认 5。请注意：在验证通过后应重置次数。
			const GENERAL_2FA_EMAIL_VERIFICATION_CODE_COOLINGDOWN_SECONDS = parseInteger(process.env.GENERAL_2FA_EMAIL_VERIFICATION_CODE_COOLINGDOWN_SECONDS, 55) || 55 // 默认冷却时间 55 秒，这里没使用 60 秒是为了给前端留出时间差

			isVerificationCodeCreatedDateToday = isToday(verificationCreatedDate)
			if (
				totalVerifierTimesToday === undefined || totalVerifierTimesToday === null
				|| (isVerificationCodeCreatedDateToday && totalVerifierTimesToday >= GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS)
			) {
				const errorMessage = '发送通用 2FA 邮箱验证码失败，已达今日验证上限，请明日再试'
				logging('ERROR', errorMessage, undefined, { uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: true }
			}
			if (
				totalCreateTimesToday === undefined || totalCreateTimesToday === null
				|| (isVerificationCodeCreatedDateToday && totalCreateTimesToday >= GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_CREATE_ATTEMPTS)
			) {
				const errorMessage = '发送通用 2FA 邮箱验证码失败，已达今日创建上限，请明日再试'
				logging('ERROR', errorMessage, undefined, { uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: true, isMaxDailyVerifierAttempts: false }
			}

			const isCoolingDown = (verificationCreatedDate + GENERAL_2FA_EMAIL_VERIFICATION_CODE_COOLINGDOWN_SECONDS * 1000) > now
			if (isCoolingDown) {
				const errorMessage = '发送通用 2FA 邮箱验证码失败，操作过于频繁，请稍后再试'
				logging('ERROR', errorMessage, undefined, { uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: true, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
			}
		}

		const verificationCode = generateSecureVerificationNumberCode(6) // 生成六位随机数验证码
		const { clientLanguage, mailTemplate, exclusiveBusinessName } = sendGeneral2FAEmailVerificationCodeRequest

		const mail = getI18nLanguagePack(clientLanguage, mailTemplate)
		if (!mail || !mail.mailTitle || !mail.mailHtml) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，获取邮件模板失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const { mailTitle, mailHtml } = mail
		const correctMailHTML = mailHtml.replaceAll('{{verificationCode}}', verificationCode)
		const sendMailResult = await sendMail(userEmail, mailTitle, { html: correctMailHTML })
		if (!sendMailResult.success) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，邮件发送失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const general2FAEmailVerificationCodeUpdate: General2FAEmailVerificationCode = {
			uuid,
			exclusive: exclusiveBusinessName,
			verificationCode,
			verificationCreatedDate: now,
			totalCreateTimesToday: isVerificationCodeCreatedDateToday && totalCreateTimesToday !== undefined && totalCreateTimesToday !== null ? totalCreateTimesToday + 1 : 1,
			totalVerifierTimesToday: 0,
			used: false,
			createdDateTime: now,
			createdBy: uuid,
			editedDateTime: now,
			editedBy: uuid,
		}
		const updateResult = await findOneAndUpdateData4MongoDB<General2FAEmailVerificationCode>(getGeneral2FAEmailVerificationCodeHistoryWhere, general2FAEmailVerificationCodeUpdate, general2FAEmailVerificationCodeSchemaInstance, general2FAEmailVerificationCodeCollectionName, { session })

		if (!updateResult.success) {
			const errorMessage = '发送通用 2FA 邮箱验证码失败，存储验证码失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		await commitAndEndSession(session)
		return { success: true, message: '发送通用 2FA 邮箱验证码成功', isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
	} catch (error) {
		const errorMessage = '发送通用 2FA 邮箱验证码失败，未知错误'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage, isUsingOtherVerificationMethodOtherThanEmail: false, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
	}
}

/**
 * 通用 2FA 邮箱验证码验证器的类型
 */
namespace General2FAEmailVerifier {
	/** 验证邮箱验证码的参数 */
	export type VerifyOptions = {
		/** 是否在验证成功后立即重置尝试次数 */
		isResetAttemptsImmediately: boolean,
		/** 业务名称，用于“独占”验证码。区分不同业务场景下的验证码（例如登录、修改邮箱、修改密码等），以防止验证码混用 */
		exclusiveBusinessName?: string,
	}

	/** 验证邮箱验证码的结果 */
	export type VerifyResult = {
		/** 是否验证成功 */
		success: boolean,
		/** 是否因为超时未验证成功 */
		isTimeout: boolean,
		/** 是否已达到今日尝试连续验证次数上限 */
		isMaxVerifierTimesToday: boolean,
		/** 附加的文本消息 */
		message: string,
		/** 如果 isResetAttemptsImmediately 为假，则不会在验证通过后立即重置尝试次数，而是返回一个用于稍后重置尝试次数的回调函数（这样可以在用户验证通过，且后续业务也成功完成的情况下才重置尝试次数） */
		resetAttemptsCallback?: () => Promise<{
			/** 是否重置次数成功 */
			success: boolean,
			/** 附加的文本消息 */
			message: string,
		}>,
	}
}

/**
 * 通用 2FA 邮箱验证码验证器
 */
export class General2FAEmailVerifier {
	/** 用户 UUID */
	#uuid: string
	/** 用户 Token */
	#token?: string
	/** 验证码 */
	#verificationCode: string
	/** Mongoose 事务 session */
	#session: mongoose.ClientSession


	/**
	 * 构造函数，用于初始化通用 2FA 邮箱验证码验证器
	 * @param uuid 用户 UUID
	 * @param verificationCode 验证码
	 * @param token 用户 Token，可选，为空时不会进行用户校验
	 */
	constructor(uuid: string, verificationCode: string, token?: string) {
		this.#uuid = uuid
		this.#verificationCode = verificationCode
		this.#token = token
	}

	/**
	 * 验证用户的邮箱验证码
	 * @param options 验证选项
	 * @returns 验证结果
	 */
	async verify(options: General2FAEmailVerifier.VerifyOptions): Promise<General2FAEmailVerifier.VerifyResult> {
		try {
			const { isResetAttemptsImmediately, exclusiveBusinessName } = options

			if (this.#uuid && this.#token && !await checkUserTokenByUUID(this.#uuid, this.#token)) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，用户校验未通过'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			const { collectionName: general2FAEmailVerificationCodeCollectionName, schemaInstance: general2FAEmailVerificationCodeSchemaInstance } = General2FAEmailVerificationCodeSchema
			type General2FAEmailVerificationCode = InferSchemaType<typeof general2FAEmailVerificationCodeSchemaInstance>
			const verifyWhere: QueryType<General2FAEmailVerificationCode> = {
				uuid: this.#uuid,
				used: false,
				exclusive: exclusiveBusinessName || undefined,
			}
			const verifySelect: SelectType<General2FAEmailVerificationCode> = {
				verificationCode: 1,
				verificationCreatedDate: 1,
				totalVerifierTimesToday: 1,
			}

			const verifyResult = await selectDataFromMongoDB<General2FAEmailVerificationCode>(verifyWhere, verifySelect, general2FAEmailVerificationCodeSchemaInstance, general2FAEmailVerificationCodeCollectionName)
			if (!verifyResult.success || !verifyResult.result || verifyResult.result.length !== 1) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，验证码错误或不存在'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			const { verificationCode, verificationCreatedDate, totalVerifierTimesToday } = verifyResult.result[0]
			const now = new Date().getTime()
			const GENERAL_2FA_EMAIL_VERIFICATION_CODE_TIMEOUT_MILLISECONDS = parseInteger(process.env.GENERAL_2FA_EMAIL_VERIFICATION_CODE_TIMEOUT_MILLISECONDS, 1800000) || 1800000 // 默认验证码超时为 30 分钟
			const GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS = parseInteger(process.env.GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS, 5) || 5 // 默认每天最多允许连续验证验证码直到成功验证的次数，默认 5。请注意：在验证通过后应手动重置次数。

			if (
				verificationCreatedDate === undefined || verificationCreatedDate === null
				|| verificationCreatedDate + GENERAL_2FA_EMAIL_VERIFICATION_CODE_TIMEOUT_MILLISECONDS < now
			) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，验证码已超时'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: true, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			const isVerificationCodeCreatedDateToday = isToday(verificationCreatedDate)
			if (
				totalVerifierTimesToday === undefined || totalVerifierTimesToday === null
				|| (isVerificationCodeCreatedDateToday && totalVerifierTimesToday >= GENERAL_2FA_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS)
			) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，已达今日验证上限，请明日再试'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: true, message: errorMessage }
			}

			// 尝试增加尝试次数，‘惩罚’ 需尽力而为，不需要使用事务
			try {
				const accumulatedVerificationFailuresTimesUpdate: UpdateType<General2FAEmailVerificationCode> = {
					totalVerifierTimesToday: isVerificationCodeCreatedDateToday ? 1 : totalVerifierTimesToday + 1
				}
				const accumulatedVerificationFailuresTimesResult = await findOneAndUpdateData4MongoDB<General2FAEmailVerificationCode>(verifyWhere, accumulatedVerificationFailuresTimesUpdate, general2FAEmailVerificationCodeSchemaInstance, general2FAEmailVerificationCodeCollectionName)
				if (!accumulatedVerificationFailuresTimesResult.success) {
					const errorMessage = '通用 2FA 邮箱验证码验证失败，增加尝试次数失败'
					logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
					return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
				}
			} catch (error) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，增加尝试次数时出错'
				logging('ERROR', errorMessage, error, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			if (!verificationCode || verificationCode !== this.#verificationCode) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，验证码错误'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			this.#session = await createAndStartSession()
			const session = this.#session

			const verifyUpdate: UpdateType<General2FAEmailVerificationCode> = {
				used: true,
			}
			const verifyUpdateResult = await findOneAndUpdateData4MongoDB<General2FAEmailVerificationCode>(verifyWhere, verifyUpdate, general2FAEmailVerificationCodeSchemaInstance, general2FAEmailVerificationCodeCollectionName, { session })
			if (!verifyUpdateResult.success) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，更新验证码使用状态失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			if (!isResetAttemptsImmediately) {
				return { success: true, isTimeout: false, isMaxVerifierTimesToday: false, message: '通用 2FA 邮箱验证码验证成功，请别忘记稍后重置尝试次数。', resetAttemptsCallback: this.#resetAttempts.bind(this) }
			}

			const resetAttemptsResult = await this.#resetAttempts()
			if (!resetAttemptsResult.success) {
				const errorMessage = '通用 2FA 邮箱验证码验证失败，重置尝试次数失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			// 若 resetAttempts 成功，则已经提交事务，所以这里不需要再提交
			return { success: true, isTimeout: false, isMaxVerifierTimesToday: false, message: '通用 2FA 邮箱验证码验证成功，并且尝试次数已重置' }
		} catch (error) {
			const errorMessage = '通用 2FA 邮箱验证码验证失败，未知错误'
			logging('ERROR', errorMessage, error, { uuid: this.#uuid })
			return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
		}
	}

	/**
	 * 重置尝试次数的私有方法
	 * @returns 重置尝试次数的结果
	 */
	async #resetAttempts(): Promise<{ success: boolean, message: string }> {
		const session = this.#session
		if (!session) {
			const errorMessage = '通用 2FA 邮箱验证码尝试次数重置失败，内部 session 不存在'
			logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
			return { success: false, message: errorMessage }
		}

		try {
			const { collectionName: general2FAEmailVerificationCodeCollectionName, schemaInstance: general2FAEmailVerificationCodeSchemaInstance } = General2FAEmailVerificationCodeSchema
			type General2FAEmailVerificationCode = InferSchemaType<typeof general2FAEmailVerificationCodeSchemaInstance>
			const resetAttemptsWhere: QueryType<General2FAEmailVerificationCode> = {
				uuid: this.#uuid,
			}
			const resetAttemptsUpdate: UpdateType<General2FAEmailVerificationCode> = {
				verificationCreatedDate: 0,
				totalVerifierTimesToday: 0,
			}

			const resetAttemptsResult = await findOneAndUpdateData4MongoDB<General2FAEmailVerificationCode>(resetAttemptsWhere, resetAttemptsUpdate, general2FAEmailVerificationCodeSchemaInstance, general2FAEmailVerificationCodeCollectionName, { session })
			if (!resetAttemptsResult.success) {
				const errorMessage = '通用 2FA 邮箱验证码尝试次数重置失败，存储尝试次数失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage }
			}

			await commitAndEndSession(session)
			return { success: true, message: '通用 2FA 邮箱验证码尝试次数重置成功' }
		} catch (error) {
			let errorMessage = '通用 2FA 邮箱验证码尝试次数重置失败，未知错误'
			try {
				await abortAndEndSession(session)
			} catch {
				errorMessage += '，且在中止事务时发生错误'
			}
			logging('ERROR', errorMessage, error, { uuid: this.#uuid })
			return { success: false, message: errorMessage }
		}
	}
}

/**
 * 发送通用邮箱验证码
 * 有别于函数 sendGeneral2FAEmailVerificationCodeService，本函数用于发送非 2FA 场景下的通用邮箱验证码
 * @param sendGeneralEmailVerificationCodeRequest 发送通用邮箱验证码的请求载荷
 * @param uuid
 * @param token
 * @returns 发送通用邮箱验证码的请求响应
 */
export const sendGeneralEmailVerificationCodeService = async (sendGeneralEmailVerificationCodeRequest: SendGeneralEmailVerificationCodeRequestDto = { email: '', clientLanguage: 'zh-Hans-CN', mailTemplate: 'SendGeneralEmailVerificationCode', exclusiveBusinessName: 'unknown' }, uuid?: string, token?: string): Promise<SendGeneralEmailVerificationCodeResponseDto> => {
	try {
		if (!checkSendGeneralEmailVerificationCodeRequest(sendGeneralEmailVerificationCodeRequest)) {
			const errorMessage = '发送通用邮箱验证码失败，参数不合法'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		if (uuid && token && !await checkUserTokenByUUID(uuid, token)) {
			const errorMessage = '发送通用邮箱验证码失败，用户校验未通过'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const session = await createAndStartSession()

		const { email, clientLanguage, mailTemplate, exclusiveBusinessName } = sendGeneralEmailVerificationCodeRequest
		const emailLowerCase = email.toLowerCase()

		const { collectionName: generalEmailVerificationCodeCollectionName, schemaInstance: generalEmailVerificationCodeSchemaInstance } = GeneralEmailVerificationCodeSchema
		type GeneralEmailVerificationCode = InferSchemaType<typeof generalEmailVerificationCodeSchemaInstance>
		const getGeneralEmailVerificationCodeHistoryWhere: QueryType<GeneralEmailVerificationCode> = {
			emailLowerCase,
		}
		const getGeneralEmailVerificationCodeHistorySelect: SelectType<GeneralEmailVerificationCode> = {
			verificationCreatedDate: 1,
			totalCreateTimesToday: 1,
			totalVerifierTimesToday: 1,
		}
		const getGeneralEmailVerificationCodeResult = await selectDataFromMongoDB<GeneralEmailVerificationCode>(getGeneralEmailVerificationCodeHistoryWhere, getGeneralEmailVerificationCodeHistorySelect, generalEmailVerificationCodeSchemaInstance, generalEmailVerificationCodeCollectionName, { session })

		const now = new Date().getTime()
		let isVerificationCodeCreatedDateToday = false
		let totalCreateTimesToday = 0

		if (
			getGeneralEmailVerificationCodeResult.success
			&& getGeneralEmailVerificationCodeResult.result && getGeneralEmailVerificationCodeResult.result.length === 1
			&& getGeneralEmailVerificationCodeResult.result[0].verificationCreatedDate !== undefined && getGeneralEmailVerificationCodeResult.result[0].verificationCreatedDate !== null
			&& getGeneralEmailVerificationCodeResult.result[0].totalCreateTimesToday !== undefined && getGeneralEmailVerificationCodeResult.result[0].totalCreateTimesToday !== null
		) {
			const { verificationCreatedDate, totalVerifierTimesToday } = getGeneralEmailVerificationCodeResult.result[0]
			totalCreateTimesToday = getGeneralEmailVerificationCodeResult.result[0].totalCreateTimesToday
			const GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS = parseInteger(process.env.GENERALEMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS, 5) || 5 // 默认每天最多允许连续验证验证码直到成功验证的次数，默认 5。请注意：在验证通过后应重置次数。
			const GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_CREATE_ATTEMPTS = parseInteger(process.env.GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_CREATE_ATTEMPTS, 3) || 3 // 默认每天最多允许连续发送验证码直到成功验证的次数，默认 3。请注意：在验证通过后应重置次数。
			const GENERAL_EMAIL_VERIFICATION_CODE_COOLINGDOWN_SECONDS = parseInteger(process.env.GENERAL_EMAIL_VERIFICATION_CODE_COOLINGDOWN_SECONDS, 55) || 55 // 默认冷却时间 55 秒，这里没使用 60 秒是为了给前端留出时间差

			isVerificationCodeCreatedDateToday = isToday(verificationCreatedDate)
			if (
				totalVerifierTimesToday === undefined || totalVerifierTimesToday === null
				|| (isVerificationCodeCreatedDateToday && totalVerifierTimesToday >= GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS)
			) {
				const errorMessage = '发送通用邮箱验证码失败，已达今日验证上限，请明日再试'
				logging('ERROR', errorMessage, undefined, { uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: true }
			}
			if (
				totalCreateTimesToday === undefined || totalCreateTimesToday === null
				|| (isVerificationCodeCreatedDateToday && totalCreateTimesToday >= GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_CREATE_ATTEMPTS)
			) {
				const errorMessage = '发送通用邮箱验证码失败，已达今日创建上限，请明日再试'
				logging('ERROR', errorMessage, undefined, { uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: true, isMaxDailyVerifierAttempts: false }
			}

			const isCoolingDown = (verificationCreatedDate + GENERAL_EMAIL_VERIFICATION_CODE_COOLINGDOWN_SECONDS * 1000) > now
			if (isCoolingDown) {
				const errorMessage = '发送通用邮箱验证码失败，操作过于频繁，请稍后再试'
				logging('ERROR', errorMessage, undefined, { uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage, isCoolingDown: true, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
			}
		}

		const verificationCode = generateSecureVerificationNumberCode(6) // 生成六位随机数验证码

		const mail = getI18nLanguagePack(clientLanguage, mailTemplate)
		if (!mail || !mail.mailTitle || !mail.mailHtml) {
			const errorMessage = '发送通用邮箱验证码失败，获取邮件模板失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const { mailTitle, mailHtml } = mail
		const correctMailHTML = mailHtml.replaceAll('{{verificationCode}}', verificationCode)
		const sendMailResult = await sendMail(email, mailTitle, { html: correctMailHTML })
		if (!sendMailResult.success) {
			const errorMessage = '发送通用邮箱验证码失败，邮件发送失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		const generalEmailVerificationCodeUpdate: GeneralEmailVerificationCode = {
			email,
			emailLowerCase,
			exclusive: exclusiveBusinessName,
			verificationCode,
			verificationCreatedDate: now,
			totalCreateTimesToday: isVerificationCodeCreatedDateToday && totalCreateTimesToday !== undefined && totalCreateTimesToday !== null ? totalCreateTimesToday + 1 : 1,
			totalVerifierTimesToday: 0,
			used: false,
			createdDateTime: now,
			createdBy: uuid,
			editedDateTime: now,
			editedBy: uuid,
		}
		const updateResult = await findOneAndUpdateData4MongoDB<GeneralEmailVerificationCode>(getGeneralEmailVerificationCodeHistoryWhere, generalEmailVerificationCodeUpdate, generalEmailVerificationCodeSchemaInstance, generalEmailVerificationCodeCollectionName, { session })

		if (!updateResult.success) {
			const errorMessage = '发送通用邮箱验证码失败，存储验证码失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
		}

		await commitAndEndSession(session)
		return { success: true, message: '发送通用邮箱验证码成功', isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
	} catch (error) {
		const errorMessage = '发送通用邮箱验证码失败，未知错误'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage, isCoolingDown: false, isMaxDailyCreateAttempts: false, isMaxDailyVerifierAttempts: false }
	}
}

/**
 * 通用邮箱验证码验证器的类型
 */
namespace GeneralEmailVerifier {
	/** 验证邮箱验证码的参数 */
	export type VerifyOptions = {
		/** 是否在验证成功后立即重置尝试次数 */
		isResetAttemptsImmediately: boolean,
		/** 业务名称，用于“独占”验证码。区分不同业务场景下的验证码（例如登录、修改邮箱、修改密码等），以防止验证码混用 */
		exclusiveBusinessName?: string,
	}

	/** 验证邮箱验证码的结果 */
	export type VerifyResult = {
		/** 是否验证成功 */
		success: boolean,
		/** 是否因为超时未验证成功 */
		isTimeout: boolean,
		/** 是否已达到今日尝试连续验证次数上限 */
		isMaxVerifierTimesToday: boolean,
		/** 附加的文本消息 */
		message: string,
		/** 如果 isResetAttemptsImmediately 为假，则不会在验证通过后立即重置尝试次数，而是返回一个用于稍后重置尝试次数的回调函数（这样可以在用户验证通过，且后续业务也成功完成的情况下才重置尝试次数） */
		resetAttemptsCallback?: () => Promise<{
			/** 是否重置次数成功 */
			success: boolean,
			/** 附加的文本消息 */
			message: string,
		}>,
	}
}

/**
 * 通用邮箱验证码验证器
 */
export class GeneralEmailVerifier {
	/** 用户 email（全小写）*/
	#emailLowerCase: string
	/** 用户 UUID */
	#uuid: string
	/** 用户 Token */
	#token?: string
	/** 验证码 */
	#verificationCode: string
	/** Mongoose 事务 session */
	#session?: mongoose.ClientSession


	/**
	 * 构造函数，用于初始化通用邮箱验证码验证器
	 * @param email 用户 Email
	 * @param verificationCode 验证码
	 * @param uuid 用户 UUID，可选，为空时不会进行用户校验
	 * @param token 用户 Token，可选，为空时不会进行用户校验
	 */
	constructor(email: string, verificationCode: string, uuid?: string, token?: string) {
		this.#emailLowerCase = email.toLowerCase()
		this.#verificationCode = verificationCode
		this.#uuid = uuid
		this.#token = token
	}

	/**
	 * 验证用户的邮箱验证码
	 * @param options 验证选项
	 * @returns 验证结果
	 */
	async verify(options: GeneralEmailVerifier.VerifyOptions): Promise<GeneralEmailVerifier.VerifyResult> {
		try {
			const { isResetAttemptsImmediately, exclusiveBusinessName } = options

			if (this.#uuid && this.#token && !await checkUserTokenByUUID(this.#uuid, this.#token)) {
				const errorMessage = '通用邮箱验证码验证失败，用户校验未通过'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			const { collectionName: generalEmailVerificationCodeCollectionName, schemaInstance: generalEmailVerificationCodeSchemaInstance } = GeneralEmailVerificationCodeSchema
			type GeneralEmailVerificationCode = InferSchemaType<typeof generalEmailVerificationCodeSchemaInstance>
			const verifyWhere: QueryType<GeneralEmailVerificationCode> = {
				emailLowerCase: this.#emailLowerCase,
				used: false,
				exclusive: exclusiveBusinessName || undefined,
			}
			const verifySelect: SelectType<GeneralEmailVerificationCode> = {
				verificationCode: 1,
				verificationCreatedDate: 1,
				totalVerifierTimesToday: 1,
			}

			const verifyResult = await selectDataFromMongoDB<GeneralEmailVerificationCode>(verifyWhere, verifySelect, generalEmailVerificationCodeSchemaInstance, generalEmailVerificationCodeCollectionName)
			if (!verifyResult.success || !verifyResult.result || verifyResult.result.length !== 1) {
				const errorMessage = '通用邮箱验证码验证失败，验证码错误或不存在'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			const { verificationCode, verificationCreatedDate, totalVerifierTimesToday } = verifyResult.result[0]
			const now = new Date().getTime()
			const GENERAL_EMAIL_VERIFICATION_CODE_TIMEOUT_MILLISECONDS = parseInteger(process.env.GENERAL_EMAIL_VERIFICATION_CODE_TIMEOUT_MILLISECONDS, 1800000) || 1800000 // 默认验证码超时为 30 分钟
			const GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS = parseInteger(process.env.GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS, 5) || 5 // 默认每天最多允许连续验证验证码直到成功验证的次数，默认 5。请注意：在验证通过后应手动重置次数。

			if (
				verificationCreatedDate === undefined || verificationCreatedDate === null
				|| verificationCreatedDate + GENERAL_EMAIL_VERIFICATION_CODE_TIMEOUT_MILLISECONDS < now
			) {
				const errorMessage = '通用邮箱验证码验证失败，验证码已超时'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: true, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			const isVerificationCodeCreatedDateToday = isToday(verificationCreatedDate)
			if (
				totalVerifierTimesToday === undefined || totalVerifierTimesToday === null
				|| (isVerificationCodeCreatedDateToday && totalVerifierTimesToday >= GENERAL_EMAIL_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS)
			) {
				const errorMessage = '通用邮箱验证码验证失败，已达今日验证上限，请明日再试'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: true, message: errorMessage }
			}

			// 尝试增加尝试次数，‘惩罚’ 需尽力而为，不需要使用事务
			try {
				const accumulatedVerificationFailuresTimesUpdate: UpdateType<GeneralEmailVerificationCode> = {
					totalVerifierTimesToday: isVerificationCodeCreatedDateToday ? 1 : totalVerifierTimesToday + 1
				}
				const accumulatedVerificationFailuresTimesResult = await findOneAndUpdateData4MongoDB<GeneralEmailVerificationCode>(verifyWhere, accumulatedVerificationFailuresTimesUpdate, generalEmailVerificationCodeSchemaInstance, generalEmailVerificationCodeCollectionName)
				if (!accumulatedVerificationFailuresTimesResult.success) {
					const errorMessage = '通用邮箱验证码验证失败，增加尝试次数失败'
					logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
					return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
				}
			} catch (error) {
				const errorMessage = '通用邮箱验证码验证失败，增加尝试次数时出错'
				logging('ERROR', errorMessage, error, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			if (!verificationCode || verificationCode !== this.#verificationCode) {
				const errorMessage = '通用邮箱验证码验证失败，验证码错误'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			this.#session = await createAndStartSession()
			const session = this.#session

			const verifyUpdate: UpdateType<GeneralEmailVerificationCode> = {
				used: true,
			}
			const verifyUpdateResult = await findOneAndUpdateData4MongoDB<GeneralEmailVerificationCode>(verifyWhere, verifyUpdate, generalEmailVerificationCodeSchemaInstance, generalEmailVerificationCodeCollectionName, { session })
			if (!verifyUpdateResult.success) {
				const errorMessage = '通用邮箱验证码验证失败，更新验证码使用状态失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			if (!isResetAttemptsImmediately) {
				return { success: true, isTimeout: false, isMaxVerifierTimesToday: false, message: '通用邮箱验证码验证成功，请别忘记稍后重置尝试次数。', resetAttemptsCallback: this.#resetAttempts.bind(this) }
			}

			const resetAttemptsResult = await this.#resetAttempts()
			if (!resetAttemptsResult.success) {
				const errorMessage = '通用邮箱验证码验证失败，重置尝试次数失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
			}

			// 若 resetAttempts 成功，则已经提交事务，所以这里不需要再提交
			return { success: true, isTimeout: false, isMaxVerifierTimesToday: false, message: '通用邮箱验证码验证成功，并且尝试次数已重置' }
		} catch (error) {
			const errorMessage = '通用邮箱验证码验证失败，未知错误'
			logging('ERROR', errorMessage, error, { uuid: this.#uuid })
			return { success: false, isTimeout: false, isMaxVerifierTimesToday: false, message: errorMessage }
		}
	}

	/**
	 * 重置尝试次数的私有方法
	 * @returns 重置尝试次数的结果
	 */
	async #resetAttempts(): Promise<{ success: boolean, message: string }> {
		const session = this.#session
		if (!session) {
			const errorMessage = '通用邮箱验证码尝试次数重置失败，内部 session 不存在'
			logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
			return { success: false, message: errorMessage }
		}

		try {
			const { collectionName: generalEmailVerificationCodeCollectionName, schemaInstance: generalEmailVerificationCodeSchemaInstance } = GeneralEmailVerificationCodeSchema
			type GeneralEmailVerificationCode = InferSchemaType<typeof generalEmailVerificationCodeSchemaInstance>
			const resetAttemptsWhere: QueryType<GeneralEmailVerificationCode> = {
				emailLowerCase: this.#emailLowerCase,
			}
			const resetAttemptsUpdate: UpdateType<GeneralEmailVerificationCode> = {
				verificationCreatedDate: 0,
				totalVerifierTimesToday: 0,
			}

			const resetAttemptsResult = await findOneAndUpdateData4MongoDB<GeneralEmailVerificationCode>(resetAttemptsWhere, resetAttemptsUpdate, generalEmailVerificationCodeSchemaInstance, generalEmailVerificationCodeCollectionName, { session })
			if (!resetAttemptsResult.success) {
				const errorMessage = '通用邮箱验证码尝试次数重置失败，存储尝试次数失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage }
			}

			await commitAndEndSession(session)
			return { success: true, message: '通用邮箱验证码尝试次数重置成功' }
		} catch (error) {
			let errorMessage = '通用邮箱验证码尝试次数重置失败，未知错误'
			try {
				await abortAndEndSession(session)
			} catch {
				errorMessage += '，且在中止事务时发生错误'
			}
			logging('ERROR', errorMessage, error, { uuid: this.#uuid })
			return { success: false, message: errorMessage }
		}
	}
}

/**
 * 通用 TOTP 2FA 验证码验证器的类型
 */
namespace General2FATotpVerifier {
	/** 验证 TOTP 验证码的参数 */
	export type VerifyOptions = {
		/** 是否在验证成功后立即重置尝试次数 */
		isResetAttemptsImmediately: boolean,
		/** 是否允许使用备份码 */
		isAllowBackupCode: boolean,
		/** 是否允许使用恢复码，并且使用后删除 TOTP 验证器 */
		isAllowRecoveryCodeAndDeleteTotp: boolean,
		/**
		 * 要对何种启用状态的 TOTP 验证器进行验证。
		 * 如果为真值或未提供该参数（即使提供的是一个‘假’值），则默认视为对已启用的 TOTP 进行验证，只有显式指定为 false 时才会对 enabled 为 false 的 TOTP 进行验证。其目的是为了用户第一次设置 TOTP 时，允许用户验证未启用的 TOTP 验证器。
		 */
		totpEnableStatus?: boolean,
	}

	/** 验证 TOTP 验证码的结果 */
	export type VerifyResult = {
		/** 是否验证成功 */
		success: boolean,
		/** 是否已达到规定时间内连续验证次数上限 */
		isMaxAttemptsReachedWithinTime: boolean,
		/** 是否不允许使用备份码 */
		isNotAllowBackupCode: boolean,
		/** 是否不允许使用恢复码并删除 TOTP */
		isNotAllowRecoveryCodeAndDeleteTotp: boolean,
		/** 附加的文本消息 */
		message: string,
		/** 如果 isResetAttemptsImmediately 为假，则不会在验证通过后立即重置尝试次数，而是返回一个用于稍后重置尝试次数的回调函数（这样可以在用户验证通过，且后续业务也成功完成的情况下才重置尝试次数） */
		resetAttemptsCallback?: () => Promise<{
			/** 是否重置次数成功 */
			success: boolean,
			/** 附加的文本消息 */
			message: string,
		}>,
	}
}

/**
 * 通用 TOTP 2FA 验证码验证器
 */
export class General2FATotpVerifier {
	/** 用户 UUID */
	#uuid: string
	/** 用户 Token */
	#token?: string
	/** TOTP 验证码 */
	#clientOtp: string
	/** Mongoose 事务 session */
	#session?: mongoose.ClientSession

	/**
	 * 构造函数，用于初始化通用 2FA TOTP 验证码验证器
	 * @param uuid 用户 UUID
	 * @param clientOtp 验证码
	 * @param token 用户 Token，可选，为空时不会进行用户校验
	 */
	constructor(uuid: string, clientOtp: string, token?: string) {
		this.#uuid = uuid
		this.#clientOtp = clientOtp
		this.#token = token
	}

	/**
	 * 验证用户的 TOTP 2FA 验证码
	 * @param options
	 * @returns
	 */
	async verify(options: General2FATotpVerifier.VerifyOptions): Promise<General2FATotpVerifier.VerifyResult> {
		try {
			const maxAttempts	= parseInteger(process.env.GENERAL_2FA_TOTP_VERIFICATION_CODE_DAILY_MAX_VERIFIER_ATTEMPTS, 5) || 5 // 最大尝试次数
			const lockTime = parseInteger(process.env.GENERAL_2FA_TOTP_VERIFICATION_CODE_MAX_VERIFIER_COOLINGDOWN_MILLISECONDS, 1800000) || 1800000 // 连续尝试验证 TOTP 验证码达到上限后，多久之后可以重试（毫秒）
			const { isResetAttemptsImmediately, isAllowBackupCode, isAllowRecoveryCodeAndDeleteTotp, totpEnableStatus } = options
			const now = new Date().getTime()

			if (!this.#clientOtp) {
				const errorMessage = '验证 TOTP 2FA 失败，未提供 TOTP 验证码'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
			}

			if (this.#uuid && this.#token && !await checkUserTokenByUUID(this.#uuid, this.#token)) {
				const errorMessage = '验证 TOTP 2FA 失败，用户校验未通过'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
			}

			const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
			type UserTotpAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>
			const userTotpAuthenticatorWhere: QueryType<UserTotpAuthenticator> = {
				UUID: this.#uuid,
				enabled: totpEnableStatus === false ? false : true,
			}
			const userTotpAuthenticatorSelect: SelectType<UserTotpAuthenticator> = {
				secret: 1,
				backupCodeHash: 1,
				lastAttemptTime: 1,
				attempts: 1,
				recoveryCodeHash: 1,
			}

			const selectResult = await selectDataFromMongoDB<UserTotpAuthenticator>(userTotpAuthenticatorWhere, userTotpAuthenticatorSelect, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName)
			if (!selectResult.success || selectResult.result.length !== 1) {
				const errorMessage = '验证 TOTP 2FA 失败，获取验证数据失败'
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
			}

			const { attempts, secret: totpSecret, backupCodeHash: listOfBackupCodeHash, recoveryCodeHash, lastAttemptTime } = selectResult.result[0]
			const isTimeout = (now - lastAttemptTime) >= lockTime
			const isMaxAttemptsReachedWithinTime = selectResult.result[0].attempts >= maxAttempts && isTimeout // 在限定时间内达到最大尝试次数

			// 限制用户的验证频率
			if (isMaxAttemptsReachedWithinTime) {
				const warningMessage = '验证 TOTP 2FA 失败，已达最大尝试次数，请稍后再试';
				logging('WARN', warningMessage);
				return { success: false, message: warningMessage, isMaxAttemptsReachedWithinTime, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp };
			}

			const updateTotpAttemptsTimesUpdate: UpdateType<UserTotpAuthenticator> = {
				attempts: isTimeout ? 1 : attempts + 1,
				lastAttemptTime: now,
			}

			// 更新尝试次数和最后尝试时间。‘惩罚’ 需尽力而为，不需要使用事务
			const updateTotpAttemptsTimesResult = await findOneAndUpdateData4MongoDB<UserTotpAuthenticator>(userTotpAuthenticatorWhere, updateTotpAttemptsTimesUpdate, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName)
			if (!updateTotpAttemptsTimesResult.success) {
				const errorMessage = '验证 TOTP 2FA 失败，更新尝试次数失败'
				logging('ERROR', errorMessage)
				return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
			}

			this.#session = await createAndStartSession()
			const session = this.#session

			if (this.#clientOtp.length > 6) { // 大于六位时，视为使用 TOTP 恢复码进行验证（成功后会删除 TOTP 2FA）
				if (!isAllowRecoveryCodeAndDeleteTotp) {
					const errorMessage = '验证 TOTP 2FA 失败，使用恢复码验证未被允许'
					logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
					return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
				}

				const isCorrectRecoveryCode = compareStringSync(this.#clientOtp, recoveryCodeHash)
				if (!isCorrectRecoveryCode) {
					const errorMessage = '验证 TOTP 2FA 失败，恢复码错误'
					logging('ERROR', errorMessage)
					return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
				}

				const deleteTotpAuthenticatorByRecoveryCodeData: DeleteTotpAuthenticatorByRecoveryCodeParametersDto = {
					uuid: this.#uuid,
					recoveryCodeHash,
					session
				}
				const deleteResult = await deleteTotpAuthenticatorByRecoveryCode(deleteTotpAuthenticatorByRecoveryCodeData) // 如果使用恢复码验证成功，则删除 TOTP 2FA
				if (!deleteResult.success) {
					const errorMessage = '验证 TOTP 2FA 失败，未能通过恢复码删除 TOTP 2FA'
					logging('ERROR', errorMessage)
					await abortAndEndSession(session)
					return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
				}

				await commitAndEndSession(session)
				if (!isResetAttemptsImmediately) {
					return { success: true, message: '通过恢复码验证 TOTP 2FA 成功，并且你的 TOTP 2FA 已删除，请手动重置尝试次数', isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp, resetAttemptsCallback: this.#resetAttempts.bind(this) }
				}
			} else { // 不大于六位数时，视为使用 TOTP 验证码或 TOTP 备份码进行验证。先视为 TOTP 验证码尝试，如果验证失败，则视为 TOTP 备份码尝试，如果都失败，则返回失败
				if (!authenticator.check(this.#clientOtp, totpSecret)) {
					// attempts += 1
					let useCorrectBackupCode = false // 用户是否使用了一个正确的备用码。
					const newBackupCodeHash = []
					listOfBackupCodeHash.forEach( backupCodeHash => {
						const isCorrectBackupCode = compareStringSync(this.#clientOtp, backupCodeHash)
						if (isCorrectBackupCode) {
							useCorrectBackupCode = true
						} else {
							newBackupCodeHash.push(backupCodeHash)
						}
					})
					if (!useCorrectBackupCode) {
						const errorMessage = '验证 TOTP 2FA 失败，TOTP 验证码或备份码错误'
						logging('ERROR', errorMessage);
						await abortAndEndSession(session)
						return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp };
					}

					const userLoginByBackupCodeUpdate: UpdateType<UserTotpAuthenticator> = {
						backupCodeHash: newBackupCodeHash,
						editDateTime: now,
						attempts: 0,
						lastAttemptTime: now,
					}
					// 使用备份码验证后，将除了已使用的备份码之外的备份码写回数据库（这样一来，备份码就无法被重复使用了）
					const updateAuthenticatorResult = await findOneAndUpdateData4MongoDB<UserTotpAuthenticator>(userTotpAuthenticatorWhere, userLoginByBackupCodeUpdate, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName, { session })
					if (!updateAuthenticatorResult.success) {
						const errorMessage = '验证 TOTP 2FA 失败，更新备份码失败'
						logging('ERROR', errorMessage)
						await abortAndEndSession(session)
						return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
					}

					if (!isResetAttemptsImmediately) {
						return { success: true, message: '用户使用备用码验证 TOTP 2FA 成功，请手动重置尝试次数', isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp, resetAttemptsCallback: this.#resetAttempts.bind(this) }
					}
				}

				if (!isResetAttemptsImmediately) {
					return { success: true, message: '验证 TOTP 2FA 成功，请手动重置尝试次数', isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp, resetAttemptsCallback: this.#resetAttempts.bind(this) }
				}
			}

			const resetAttemptsResult = await this.#resetAttempts()
			if (!resetAttemptsResult.success) {
				const errorMessage = '验证 TOTP 2FA 失败，重置尝试次数失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
			}

			// 若 resetAttempts 成功，则已经提交事务，所以这里不需要再提交
			return { success: true, message: '验证 TOTP 2FA 成功，并且尝试次数已重置', isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: !isAllowBackupCode, isNotAllowRecoveryCodeAndDeleteTotp: !isAllowRecoveryCodeAndDeleteTotp }
		} catch (error) {
			let errorMessage = '通用 2FA TOTP 验证码验证失败，未知错误'
			logging('ERROR', errorMessage, error, { uuid: this.#uuid })
			return { success: false, message: errorMessage, isMaxAttemptsReachedWithinTime: false, isNotAllowBackupCode: false, isNotAllowRecoveryCodeAndDeleteTotp: false }
		}
	}

	/**
	 * 重置尝试次数的私有方法
	 * @returns 重置尝试次数的结果
	 */
	async #resetAttempts(): Promise<{ success: boolean, message: string }> {
		const session = this.#session
		if (!session) {
			const errorMessage = '通用 2FA TOTP 验证码尝试次数重置失败，内部 session 不存在'
			logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
			return { success: false, message: errorMessage }
		}

		try {
			const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
			type UserTotpAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>
			const resetAttemptsWhere: QueryType<UserTotpAuthenticator> = {
				UUID: this.#uuid,
				enabled: true,
			}
			const resetAttemptsUpdate: UpdateType<UserTotpAuthenticator> = {
				attempts: 0,
			}

			const resetAttemptsResult = await findOneAndUpdateData4MongoDB<UserTotpAuthenticator>(resetAttemptsWhere, resetAttemptsUpdate, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName, { session })
			if (!resetAttemptsResult.success) {
				const errorMessage = '通用 2FA TOTP 验证码验证码尝试次数重置失败，存储尝试次数失败'
				logging('ERROR', errorMessage, undefined, { uuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, message: errorMessage }
			}

			await commitAndEndSession(session)
			return { success: true, message: '通用 2FA TOTP 验证码验证码尝试次数重置成功' }
		} catch (error) {
			let errorMessage = '通用 2FA TOTP 验证码验证码尝试次数重置失败，未知错误'
			try {
				await abortAndEndSession(session)
			} catch {
				errorMessage += '，且在中止事务时发生错误'
			}
			logging('ERROR', errorMessage, error, { uuid: this.#uuid })
			return { success: false, message: errorMessage }
		}
	}
}

/**
 * 通用 2FA 验证码验证器的类型
 */
namespace General2FAVerifier {
	/** 验证 2FA 验证码的参数 */
	export type VerifyOptions = {
		/** 是否在验证成功后立即重置尝试次数 */
		isResetAttemptsImmediately: boolean,
		/** 可选的业务名称，用于标识验证码的专用性（仅 Email 验证时生效） */
		exclusiveBusinessName?: string,
		/** 是否启用严格模式，在严格模式下，即使没有开启 2FA 的用户也会验证邮箱，只有显式声明 isStrictMode: false 才会关闭严格模式，否则默认开启 */
		isStrictMode: boolean
	}

	/** 验证 2FA 验证码的结果 */
	export type VerifyResult = {
		/** 是否验证成功 */
		success: boolean,
		/** 验证方式 */
		verificationType: 'unknown' | 'no-2fa' | '2fa-email' | '2fa-totp',
		/** 是否因为超时未验证成功（仅 Email 验证模式） */
		isTimeout?: boolean,
		/** 是否已达到连续验证次数上限 */
		isMaxAttemptsTime: boolean,
		/** 附加的文本消息 */
		message: string,
		/** 如果 isResetAttemptsImmediately 为假，则不会在验证通过后立即重置尝试次数，而是返回一个用于稍后重置尝试次数的回调函数（这样可以在用户验证通过，且后续业务也成功完成的情况下才重置尝试次数） */
		resetAttemptsCallback?: () => Promise<{
			/** 是否重置次数成功 */
			success: boolean,
			/** 附加的文本消息 */
			message: string,
		}>,
	}
}

/**
 * 通用 2FA 验证码验证器
 */
export class General2FAVerifier {
	/** 用户 UUID */
	#uuid: string
	/** 用户 Token */
	#token: string
	/** 验证码 */
	#verificationCode: string
	/** Mongoose 事务 session */
	#session?: mongoose.ClientSession


	/**
	 * 构造函数，用于初始化通用 2FA 验证码验证器
	 * @param uuid 用户 UUID
	 * @param verificationCode 验证码
	 * @param token 用户 Token
	 */
	constructor(uuid: string, verificationCode: string, token: string) {
		this.#uuid = uuid
		this.#verificationCode = verificationCode
		this.#token = token
	}

	/**
	 * 验证用户的 2FA 验证码
	 * @param options
	 * @returns
	 */
	async verify(options: General2FAVerifier.VerifyOptions): Promise<General2FAVerifier.VerifyResult> {
		try {
			const { isResetAttemptsImmediately, exclusiveBusinessName } = options
			let { isStrictMode } = options
			if (isStrictMode !== false) isStrictMode = true // 只要不是显式的 false 都视为 true

			this.#session = await createAndStartSession()
			const session = this.#session

			if (!await checkUserTokenByUUID(this.#uuid, this.#token)) {
				const errorMessage = '通用 2FA 验证码验证失败，用户校验未通过'
				logging('ERROR', errorMessage, undefined, { cookieUuid: this.#uuid })
				return { success: false, verificationType: 'unknown', message: errorMessage, isMaxAttemptsTime: false }
			}

			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const userAuthWhere: QueryType<UserAuth> = { UUID: this.#uuid, token: this.#token }
			const userAuthSelect: SelectType<UserAuth> = { authenticatorType: 1 }
			const userAuthResult = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, schemaInstance, collectionName, { session })
			const userAuthData = userAuthResult.result

			if (!userAuthData || userAuthData.length !== 1) {
				const errorMessage = '通用 2FA 验证码验证失败，未能获取用户信息'
				logging('ERROR', errorMessage, undefined, { cookieUuid: this.#uuid })
				await abortAndEndSession(session)
				return { success: false, verificationType: 'unknown', message: errorMessage, isMaxAttemptsTime: false }
			}

			const { authenticatorType } = userAuthData[0]
			let verificationType = 'no-2fa'
			if (authenticatorType === 'email') verificationType = '2fa-email'
			if (authenticatorType === 'totp') verificationType = '2fa-totp'

			switch (verificationType) {
				case 'no-2fa': {
					if (!isStrictMode) {
						const message = '已跳过通用 2FA 验证码验证，用户未启用 2FA 验证'
						logging('INFO', message, undefined, { cookieUuid: this.#uuid })
						await abortAndEndSession(session)
						return { success: true, verificationType, message, isMaxAttemptsTime: false }
					}
					const EmailVerifier = new General2FAEmailVerifier(this.#uuid, this.#verificationCode, this.#token)
					const emailVerificationResult = await EmailVerifier.verify({ isResetAttemptsImmediately, exclusiveBusinessName: 'update-email' })
					let message = emailVerificationResult.message
					if (!emailVerificationResult.success) {
						message = `通用 2FA 验证码验证失败（严格模式），旧邮箱验证码验证失败：${message}`
						logging('ERROR', message)
						await abortAndEndSession(session)
					}
					return { ...emailVerificationResult, verificationType, message, isMaxAttemptsTime: emailVerificationResult.isMaxVerifierTimesToday }
				}
				case '2fa-email': {
					const EmailVerifier = new General2FAEmailVerifier(this.#uuid, this.#verificationCode, this.#token)
					const emailVerificationResult = await EmailVerifier.verify({ isResetAttemptsImmediately, exclusiveBusinessName })
					let message = emailVerificationResult.message
					if (!emailVerificationResult.success) {
						message = `通用 2FA 验证码验证失败，2FA 邮箱验证码验证失败：${message}`
						logging('ERROR', message)
						await abortAndEndSession(session)
					}
					return { ...emailVerificationResult, verificationType, message, isMaxAttemptsTime: emailVerificationResult.isMaxVerifierTimesToday }
				}
				case '2fa-totp': {
					const TotpVerifier = new General2FATotpVerifier(this.#uuid, this.#verificationCode, this.#token)
					const totpVerificationResult = await TotpVerifier.verify({ isResetAttemptsImmediately, isAllowBackupCode: false, isAllowRecoveryCodeAndDeleteTotp: false })
					let message = totpVerificationResult.message
					if (!totpVerificationResult.success) {
						message = `通用 2FA 验证码验证失败，2TA TOTP 验证失败：${message}`
						logging('ERROR', message)
						await abortAndEndSession(session)
					}
					return { ...totpVerificationResult, verificationType, message, isMaxAttemptsTime: totpVerificationResult.isMaxAttemptsReachedWithinTime }
				}
			}
		} catch (error) {
			let errorMessage = '通用 2FA 验证码验证失败，未知错误'
			logging('ERROR', errorMessage, error, { uuid: this.#uuid })
			return { success: false, verificationType: 'unknown', message: errorMessage, isMaxAttemptsTime: false }
		}
	}
}

/**
 * 生成邀请码
 * // FIXME: 这是一个临时解决方法，应该使用 cookie 中的 uuid
 * @param uid 申请生成邀请码的用户
 * @param token 申请生成邀请码的用户 token
 * @returns 生成的邀请码
 */
export const createInvitationCodeService = async (uid: number, token: string): Promise<CreateInvitationCodeResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) {
			const UUID = await getUserUuid(uid) // FIXME: 这是一个临时解决方法，应该使用 cookie 中的 uuid
			if (!UUID) {
				logging('ERROR', '生成邀请码失败，UUID 不存在', undefined, { uid })
				return { success: false, isCoolingDown: false, message: '生成邀请码失败，UUID 不存在' }
			}

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

				// 检查用户上一次创建时间是否在七天内
				try {
					const getSelfUserInfoByUuidRequest: GetSelfUserInfoByUuidRequestDto = {
						uuid: UUID,
						token,
					}
					const selfUserInfo = await getSelfUserInfoByUuidService(getSelfUserInfoByUuidRequest)
					if (!selfUserInfo.success || selfUserInfo.result.userCreateDateTime > nowTime - sevenDaysInMillis) { // TODO: 临时使用 sevenDaysInMillis，实际上第一次创建冷却应该长于 sevenDaysInMillis
						logging('WARN', '生成邀请码失败，未超出邀请码生成期限，正在冷却中（用户第一次创建邀请码）', undefined, { uid })
						return { success: true, isCoolingDown: true, message: '生成邀请码失败，未超出邀请码生成期限，正在冷却中（用户第一次创建邀请码）' }
					}
				} catch (error) {
					logging('ERROR', '生成邀请码时出错，查询用户信息出错', error, { uid })
					return { success: false, isCoolingDown: false, message: '生成邀请码时出错，查询用户信息出错' }
				}

				if (userInvitationCodeSelectResult.success && userInvitationCodeSelectResult.result?.length === 0) { // 没有找到一天内的邀请码，则可以生成邀请码。
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
								creatorUUID: UUID,
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
									return { success: true, isCoolingDown: false, message: '生成邀请码成功', invitationCodeResult: userInvitationCode }
								} else {
									logging('ERROR', '生成邀请码失败，存储邀请码失败', undefined, { uid })
									return { success: false, isCoolingDown: false, message: '生成邀请码失败，存储邀请码失败' }
								}
							} catch (error) {
								logging('ERROR', '生成邀请码失败，存储邀请码时出错', error, { uid })
								return { success: false, isCoolingDown: false, message: '生成邀请码失败，存储邀请码时出错' }
							}
						} else {
							logging('ERROR', '生成邀请码失败，生成不重复的新邀请码失败', undefined, { uid })
							return { success: false, isCoolingDown: false, message: '生成邀请码失败，生成不重复的新邀请码失败' }
						}
					} catch (error) {
						logging('ERROR', '生成邀请码失败，生成不重复的新邀请码时出错', error, { uid })
						return { success: false, isCoolingDown: false, message: '生成邀请码失败，生成不重复的新邀请码时出错' }
					}
				} else {
					logging('WARN', '生成邀请码失败，未超出邀请码生成期限，正在冷却中', undefined, { uid })
					return { success: true, isCoolingDown: true, message: '生成邀请码失败，未超出邀请码生成期限，正在冷却中' }
				}
			} catch (error) {
				logging('ERROR', '生成邀请码失败，查询是否超出邀请码生成期限时出错', error, { uid })
				return { success: false, isCoolingDown: true, message: '生成邀请码失败，查询是否超出邀请码生成期限出错' }
			}
		} else {
			logging('ERROR', '生成邀请码失败，非法用户！', undefined, { uid })
			return { success: false, isCoolingDown: false, message: '生成邀请码失败，非法用户！' }
		}
	} catch (error) {
		logging('ERROR', '生成邀请码失败，未知错误', error)
		return { success: false, isCoolingDown: false, message: '生成邀请码失败，未知错误' }
	}
}

/**
 * 获取自己的邀请码列表
 * // FIXME: 应该使用 UUID
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 获取自己的邀请码列表的请求结果
 */
export const getMyInvitationCodeService = async (uid: number, token: string): Promise<GetMyInvitationCodeResponseDto> => {
	try {
		if (await checkUserToken(uid, token)) { // FIXME: 应该使用 UUID
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
						return { success: true, message: '已成功获取邀请码列表', invitationCodeResult: myInvitationCodeResult.result }
					} else {
						return { success: true, message: '自己的邀请码列表为空', invitationCodeResult: [] }
					}
				} else {
					logging('ERROR', '获取自己的邀请码失败，请求失败', undefined, { uid })
					return { success: false, message: '获取自己的邀请码失败，请求失败！', invitationCodeResult: [] }
				}
			} catch (error) {
				logging('ERROR', '获取自己的邀请码失败，请求时出错', error, { uid })
				return { success: false, message: '获取自己的邀请码失败，请求时出错！', invitationCodeResult: [] }
			}
		} else {
			logging('ERROR', '获取自己的邀请码失败，非法用户！', undefined, { uid })
			return { success: false, message: '获取自己的邀请码失败，非法用户！', invitationCodeResult: [] }
		}
	} catch (error) {
		logging('ERROR', '获取自己的邀请码失败，未知错误', error)
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
				assigneeUUID: useInvitationCodeDto.registrantUUID,
				usedDateTime: nowTime,
				editDateTime: nowTime,
			}

			try {
				const updateResult = await findOneAndUpdateData4MongoDB(useInvitationCodeWhere, useInvitationCodeUpdate, schemaInstance, collectionName)
				if (updateResult.success) {
					return { success: true, message: '已使用邀请码注册' }
				} else {
					logging('ERROR', '使用邀请码注册，使用邀请码失败')
					return { success: false, message: '使用邀请码注册，使用邀请码失败' }
				}
			} catch (error) {
				logging('ERROR', '使用邀请码注册，使用邀请码时出错', error)
				return { success: false, message: '使用邀请码注册，使用邀请码时出错' }
			}
		} else {
			logging('ERROR', '使用邀请码注册，参数不合法')
			return { success: false, message: '使用邀请码注册，参数不合法' }
		}
	} catch (error) {
		logging('ERROR', '使用邀请码注册，未知错误', error)
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
					logging('ERROR', '检查邀请码可用性失败，请求失败')
					return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，请求失败！' }
				}
			} catch (error) {
				logging('ERROR', '检查邀请码可用性失败，请求时出错')
				return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，请求时出错！' }
			}
		} else {
			logging('ERROR', '检查邀请码可用性失败，参数不合法')
			return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，参数不合法' }
		}
	} catch (error) {
		logging('ERROR', '检查邀请码可用性失败，未知错误', error)
		return { success: false, isAvailableInvitationCode: false, message: '检查邀请码可用性失败，未知错误' }
	}
}

/**
 * 管理员根据邀请码查询用户
 * @param invitationCode 邀请码
 * @param AdminUUID 管理员 UUID
 * @param AdminToken 管理员 token
 */
export const adminGetUserByInvitationCodeService = async (invitationCode: string, AdminUUID: string, AdminToken: string): Promise<AdminGetUserByInvitationCodeResponseDto> => {
	try {
		if (!invitationCode || !AdminUUID || !AdminToken) {
			logging('ERROR', '管理员以邀请码查询用户失败，参数不合法')
			return { success: false, message: '管理员以邀请码查询用户失败，参数不合法', userInfoResult: {} }
		}
		if (!(await checkUserTokenByUuidService(AdminUUID, AdminToken)).success) {
			logging('ERROR', '管理员以邀请码查询用户失败，管理员验证失败')
			return { success: false, message: '管理员以邀请码查询用户失败，管理员验证失败', userInfoResult: {} }
		}

		const checkInvitationCode = await checkInvitationCodeService({ invitationCode })
		if (!checkInvitationCode.success || !!checkInvitationCode.isAvailableInvitationCode) {
			logging('ERROR', '管理员以邀请码查询用户失败，邀请码不可用', undefined, { invitationCode })
			return { success: false, message: '管理员以邀请码查询用户失败，邀请码不可用', userInfoResult: {} }
		}

		const { collectionName, schemaInstance } = UserInvitationCodeSchema
		type UserInvitationCode = InferSchemaType<typeof schemaInstance>
		const userInvitationCodeWhere: QueryType<UserInvitationCode> = {
			invitationCode,
		}
		const userInvitationCodeSelect: SelectType<UserInvitationCode> = {
			assignee: 1,
			assigneeUUID: 1,
		}

		const userInvitationCodeResult = await selectDataFromMongoDB<UserInvitationCode>(userInvitationCodeWhere, userInvitationCodeSelect, schemaInstance, collectionName)
		const userInvitationCodeData = userInvitationCodeResult.result?.[0]
		if (!userInvitationCodeResult.success) {
			logging('ERROR', '管理员以邀请码查询用户失败，查询失败')
			return { success: false, message: '管理员以邀请码查询用户失败，查询失败', userInfoResult: {} }
		}
		if (!userInvitationCodeData || !userInvitationCodeData.assignee || !userInvitationCodeData.assigneeUUID) {
			logging('ERROR', '管理员以邀请码查询用户失败，未找到用户信息', undefined, { invitationCode })
			return { success: false, message: '管理员以邀请码查询用户失败，未找到用户信息', userInfoResult: {} }
		}
		return { success: true, message: '管理员以邀请码查询用户成功', userInfoResult: { uid: userInvitationCodeData?.assignee, uuid: userInvitationCodeData?.assigneeUUID} }

	} catch (error) {
		logging('ERROR', '管理员以邀请码查询用户失败，未知错误', error)
		return { success: false, message: '管理员以邀请码查询用户失败，未知错误', userInfoResult: {} }
	}
}

/**
 * 更新密码
 * @param updateUserPasswordRequest 更新密码的请求载荷
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 更新密码的请求响应
 */
export const changePasswordService = async (updateUserPasswordRequest: UpdateUserPasswordRequestDto, cookieUuid: string, cookieToken: string): Promise<UpdateUserPasswordResponseDto> => {
	try {
		if (!checkUpdateUserPasswordRequest(updateUserPasswordRequest)) {
			const errorMessage = '修改密码失败，参数不合法！'
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			return { success: false, message: errorMessage }
		}

		if (!await checkUserTokenByUUID(cookieUuid, cookieToken)) {
			const errorMessage = '修改密码失败，用户验证未通过！'
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			return { success: false, message: errorMessage }
		}

		const { oldPasswordHash, newPasswordHash, verificationCode } = updateUserPasswordRequest
		const now = new Date().getTime()

		// 启动事务
		const session = await createAndStartSession()

		// 验证 2FA 验证码
		const general2FAVerifier = new General2FAVerifier(cookieUuid, verificationCode, cookieToken)
		const verify2FAResult = await general2FAVerifier.verify({ isResetAttemptsImmediately: true, exclusiveBusinessName: 'update-password', isStrictMode: true })
		if (!verify2FAResult.success) {
			const errorMessage = `修改密码失败，2FA 验证未通过：${verify2FAResult.message}`
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>

		const changePasswordWhere: QueryType<UserAuth> = {
			UUID: cookieUuid
		}
		const changePasswordSelect: SelectType<UserAuth> = {
			passwordHashHash: 1,
		}

		const userAuthResult = await selectDataFromMongoDB<UserAuth>(changePasswordWhere, changePasswordSelect, schemaInstance, collectionName, { session })
		if (!userAuthResult.success || !userAuthResult.result || !userAuthResult.result.length || userAuthResult.result.length !== 1) {
			const errorMessage = '修改密码失败，未能获取用户认证信息'
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const { passwordHashHash } = userAuthResult.result[0]
		const isCorrectPassword = compareStringSync(oldPasswordHash, passwordHashHash)
		if (!isCorrectPassword) {
			const errorMessage = '修改密码失败，旧密码不正确'
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const newPasswordHashHash = hashStringSync(newPasswordHash)
		if (!newPasswordHashHash) {
			const errorMessage = '修改密码失败，未能散列新密码'
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}
		if (newPasswordHashHash === passwordHashHash) {
			const errorMessage = '修改密码失败，新密码不能与旧密码相同'
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const changePasswordUpdate: UpdateType<UserAuth> = {
			passwordHashHash: newPasswordHashHash,
			passwordUpdateDateTime: now,
			editDateTime: now,
		}

		const updateResult = await findOneAndUpdateData4MongoDB(changePasswordWhere, changePasswordUpdate, schemaInstance, collectionName, { session })
		if (!updateResult.success) {
			const errorMessage = '修改密码时出错，更新密码失败'
			logging('ERROR', errorMessage, undefined, { uuid: cookieUuid })
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		await commitAndEndSession(session)
		return { success: true, message: '密码已更新！' }
	} catch (error) {
		logging('ERROR', '修改密码时出错，未知错误', error)
		return { success: false, message: '修改密码时出错，未知错误' }
	}
}

/**
 * 找回密码（更新密码）
 * @param forgotPasswordRequest 忘记密码（更新密码）的请求载荷
 * @returns 忘记密码（更新密码）的请求响应
 */
export const forgotPasswordService = async (forgotPasswordRequest: ForgotPasswordRequestDto): Promise<ForgotPasswordResponseDto> => {
	try {
		if (!checkForgotPasswordRequest(forgotPasswordRequest)) {
			const message = '找回密码失败，参数不合法！'
			logging('ERROR', message)
			return { success: false, message }
		}

		const { email, newPasswordHash, verificationCode } = forgotPasswordRequest
		const emailLowerCase = email.toLowerCase()
		const now = new Date().getTime()

		const EmailVerifier = new GeneralEmailVerifier(emailLowerCase, verificationCode)
		const emailVerificationResult = await EmailVerifier.verify({ isResetAttemptsImmediately: true, exclusiveBusinessName: 'forgot-password' })
		if (!emailVerificationResult.success) {
			const errorMessage = `找回密码时出错，验证失败：${emailVerificationResult.message}`
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		const newPasswordHashHash = hashStringSync(newPasswordHash)
		if (!newPasswordHashHash) {
			await abortAndEndSession(session)
			const message = '找回密码失败，未能散列新密码'
			logging('ERROR', message, undefined, { email })
			return { success: false, message }
		}

		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>

		const changePasswordWhere: QueryType<UserAuth> = {
			emailLowerCase,
		}
		const changePasswordUpdate: UpdateType<UserAuth> = {
			passwordHashHash: newPasswordHashHash,
			editDateTime: now,
		}

		try {
			const updateResult = await findOneAndUpdateData4MongoDB(changePasswordWhere, changePasswordUpdate, schemaInstance, collectionName, { session })

			if (!updateResult.success) {
				await abortAndEndSession(session)
				const message = '找回密码失败，更新密码失败'
				logging('ERROR', message, undefined, { email })
				return { success: false, message }
			}

			await commitAndEndSession(session)
			return { success: true, message: '找回密码成功，密码已更新！' }
		} catch (error) {
			await abortAndEndSession(session)
			const message = '找回密码时出错，更新密码时出错'
			logging('ERROR', message, error, { email })
			return { success: false, message }
		}
	} catch (error) {
		const message = '找回密码时出错，未知错误。'
		logging('ERROR', message, error)
		return { success: false, message }
	}
}

/**
 * 检查用户名是否可用
 * @param checkUsernameRequest 检查用户名是否可用的请求载荷
 * @returns 检查用户名是否可用的请求响应，可用返回 true，否则返回 false
 */
export const checkUsernameService = async (checkUsernameRequest: CheckUsernameRequestDto, excluedUuid: 'none' | string[] = 'none'): Promise<CheckUsernameResponseDto> => {
	try {
		if (checkCheckUsernameRequest(checkUsernameRequest)) {
			const { username } = checkUsernameRequest
			const usernameStandardized = username.trim().normalize()

			if (!validateNameField(usernameStandardized)) {
				logging('ERROR', '用户名不合法')
				return { success: false, message: '用户名不合法', isAvailableUsername: true }
			}

			const { collectionName, schemaInstance } = UserInfoSchema
			type UserInfo = InferSchemaType<typeof schemaInstance>
			const checkUsernameWhere: QueryType<UserInfo> = {
				username: { $regex: new RegExp(`\\b${usernameStandardized}\\b`, 'iu') },
			}
			if (excluedUuid && excluedUuid !== 'none') { // 如果 excluedUuid 存在且不是 'none'，则在检查用户名可用性时增加排除用户（修改自己用户名时排除自己，或者排除一些官方号等...）
				checkUsernameWhere.UUID = { $nin: excluedUuid }
			}
			const checkUsernameSelete: SelectType<UserInfo> = {
				uid: 1,
			}
			try {
				const checkUsername = await selectDataFromMongoDB<UserInfo>(checkUsernameWhere, checkUsernameSelete, schemaInstance, collectionName)
				if (checkUsername.success) {
					if (checkUsername.result?.length === 0) {
						return { success: true, message: '用户名可用', isAvailableUsername: true }
					} else {
						return { success: true, message: '用户名重复', isAvailableUsername: false }
					}
				} else {
					logging('ERROR', '检查用户名失败，请求用户数据失败')
					return { success: false, message: '检查用户名失败，请求用户数据失败', isAvailableUsername: false }
				}
			} catch (error) {
				logging('ERROR', '检查用户名时出错，请求用户数据出错', error)
				return { success: false, message: '检查用户名时出错，请求用户数据出错', isAvailableUsername: false }
			}
		} else {
			logging('ERROR', '检查用户名失败，参数不合法')
			return { success: false, message: '检查用户名失败，参数不合法', isAvailableUsername: false }
		}
	} catch (error) {
		logging('ERROR', '检查用户名时出错，未知错误', error)
		return { success: false, message: '检查用户名时出错，未知错误', isAvailableUsername: false }
	}
}

/**
 * 根据 UUID 校验用户是否已经存在
 * @param checkUserExistsByUuidRequest 根据 UUID 校验用户是否已经存在的请求载荷
 * @returns 根据 UUID 校验用户是否已经存在的请求响应
 */
export const checkUserExistsByUuidService = async (checkUserExistsByUuidRequest: CheckUserExistsByUuidRequestDto): Promise<CheckUserExistsByUuidResponseDto> => {
	try {
		if (!checkCheckUserExistsByUuidRequest(checkUserExistsByUuidRequest)) {
			logging('ERROR', '查询用户是否存在时失败：参数不合法')
			return { success: false, exists: false, message: '查询用户是否存在时失败：参数不合法' }
		}

		const { uuid } = checkUserExistsByUuidRequest
		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>
		const where: QueryType<UserAuth> = {
			uuid,
		}
		const select: SelectType<UserAuth> = {
			UUID: 1,
		}

		let result: DbPoolResultsType<UserAuth>
		try {
			result = await selectDataFromMongoDB<UserAuth>(where, select, schemaInstance, collectionName)
		} catch (error) {
			logging('ERROR', '根据 UUID 校验用户是否已经存在时出错：查询出错', error)
			return { success: false, exists: false, message: '根据 UUID 校验用户是否已经存在时出错：查询出错' }
		}

		if (result && result.success && result.result) {
			if (result.result?.length > 0) {
				return { success: true, exists: true, message: '用户已存在' }
			} else {
				return { success: true, exists: false, message: '用户不存在' }
			}
		} else {
			return { success: false, exists: false, message: '查询失败' }
		}
	} catch (error) {
		logging('ERROR', '查询用户是否存在时出错：未知错误', error)
		return { success: false, exists: false, message: '查询用户是否存在时出错：未知错误' }
	}
}

/**
 * 获取所有被封禁用户的信息
 * @param adminUid 管理员的 UID
 * @param adminToken 管理员的 Token
 * @param GetBlockedUserRequest 获取被封禁用户的请求载荷
 * @returns 获取所有被封禁用户的信息的请求响应
 */
export const getBlockedUserService = async (adminUUID: string, adminToken: string, GetBlockedUserRequest: GetBlockedUserRequestDto): Promise<GetBlockedUserResponseDto> => {
	try {
		if (await checkUserTokenByUUID(adminUUID, adminToken)) {
			const { sortBy, sortOrder } = GetBlockedUserRequest
			if (!checkSortVariablesForGetBlockedUserService(sortBy, sortOrder)) {
				logging('ERROR', '获取所有被封禁用户的信息失败，排序参数不合法')
				return { success: false, message: '获取所有被封禁用户的信息失败，排序参数不合法', totalCount: 0 }
			}

			let pageSize = undefined
			let skip = 0
			if (GetBlockedUserRequest.pagination && GetBlockedUserRequest.pagination.page > 0 && GetBlockedUserRequest.pagination.pageSize > 0) {
				skip = (GetBlockedUserRequest.pagination.page - 1) * GetBlockedUserRequest.pagination.pageSize
				pageSize = GetBlockedUserRequest.pagination.pageSize
			}

			const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema

			const blockedUserCountPipeline: PipelineStage[] = [
				{
					$match: {
						roles: 'blocked',
					},
				},
				{
					$lookup: {
						from: 'user-infos', // WARN: 别忘了加复数
						localField: 'UUID',
						foreignField: 'UUID',
						as: 'user_info_data',
					},
				},
				{
					$unwind: {
						path: '$user_info_data',
						preserveNullAndEmptyArrays: true, // 保留空数组和null值
					},
				},
			]

			const blockedUserPipeline: PipelineStage[] = [
				{
					$match: {
						roles: 'blocked',
					},
				},
				{
					$lookup: {
						from: 'user-infos', // WARN: 别忘了加复数
						localField: 'UUID',
						foreignField: 'UUID',
						as: 'user_info_data',
					},
				},
				{
					$unwind: {
						path: '$user_info_data',
						preserveNullAndEmptyArrays: true, // 保留空数组和null值
					},
				},
				{ $sort: { [`user_info_data.${sortBy}`]: sortOrder === 'descend' ? -1 : 1 } },
				{ $skip: skip }, // 跳过指定数量的文档
				{ $limit: pageSize }, // 限制返回的文档数量
			]

			const projectStep = {
				$project: {
					uid: 1,
					UUID: 1,
					userCreateDateTime: 1, // 用户创建日期
					roles: 1, // 用户的角色
					username: '$user_info_data.username', // 用户名
					userNickname: '$user_info_data.userNickname', // 用户昵称
					email: 1, // 用户邮箱
					totalCount: 1, // 总文档数
				},
			}
			blockedUserPipeline.push(projectStep)

			const countStep = {
				$count: 'totalCount', // 统计总文档数
			}
			blockedUserCountPipeline.push(countStep)

			try {
				const userCountResult = await selectDataByAggregateFromMongoDB(userAuthSchemaInstance, userAuthCollectionName, blockedUserCountPipeline)
				const userResult = await selectDataByAggregateFromMongoDB(userAuthSchemaInstance, userAuthCollectionName, blockedUserPipeline)
				if (!userResult.success) {
					logging('ERROR', '获取所有被封禁用户的信息失败，查询数据失败')
					return { success: false, message: '获取所有被封禁用户的信息失败，查询数据失败', totalCount: 0 }
				}

				return { success: true, message: '获取所有被封禁用户的信息成功', result: userResult.result, totalCount: userCountResult.result?.[0]?.totalCount ?? 0 }
			} catch (error) {
				logging('ERROR', '获取所有被封禁用户的信息失败，查询数据时出错：', error)
				return { success: false, message: '获取所有被封禁用户的信息失败，查询数据时出错', totalCount: 0 }
			}
		} else {
			logging('ERROR', '获取所有被封禁用户的信息失败，用户校验失败')
			return { success: false, message: '获取所有被封禁用户的信息失败，用户校验失败', totalCount: 0 }
		}
	} catch (error) {
		logging('ERROR', '获取所有被封禁用户的信息时出错，未知错误：', error)
		return { success: false, message: '获取所有被封禁用户的信息时出错，未知错误', totalCount: 0 }
	}
}

/**
 * 管理员获取用户信息
 * @param adminGetUserInfoServiceRequest 管理员获取用户信息的请求载荷
 * @param adminUUID 管理员的 UUID
 * @param adminToken 管理员的 Token
 * @returns 管理员获取用户信息的请求响应
 */
export const adminGetUserInfoService = async (adminGetUserInfoRequest: AdminGetUserInfoRequestDto, adminUUID: string, adminToken: string): Promise<AdminGetUserInfoResponseDto> => {
	try {
		if (!checkAdminGetUserInfoRequest(adminGetUserInfoRequest)) {
			logging('ERROR', '管理员获取用户信息失败，请求参数不合法')
			return { success: false, message: '管理员获取用户信息失败，请求参数不合法', totalCount: 0 }
		}

		if (!await checkUserTokenByUUID(adminUUID, adminToken)) {
			logging('ERROR', '管理员获取用户信息失败，用户校验未通过')
			return { success: false, message: '管理员获取用户信息失败，用户校验未通过', totalCount: 0 }
		}
		const { sortBy, sortOrder } = adminGetUserInfoRequest
		if (!checkSortVariablesForAdminGetUserInfoService(sortBy, sortOrder)) {
			logging('ERROR', '管理员获取用户信息失败，排序参数不合法')
			return { success: false, message: '管理员获取用户信息失败，排序参数不合法', totalCount: 0 }
		}

		let pageSize = undefined
		let skip = 0
		if (adminGetUserInfoRequest.pagination && adminGetUserInfoRequest.pagination.page > 0 && adminGetUserInfoRequest.pagination.pageSize > 0) {
			skip = (adminGetUserInfoRequest.pagination.page - 1) * adminGetUserInfoRequest.pagination.pageSize
			pageSize = adminGetUserInfoRequest.pagination.pageSize
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		const adminGetUserInfoCountPipeline: PipelineStage[] = [
			{
				$lookup: {
					from: 'user-infos', // WARN: 别忘了加复数
					localField: 'UUID',
					foreignField: 'UUID',
					as: 'user_info_data',
				},
			},
			{
				$unwind: {
					path: '$user_info_data',
					preserveNullAndEmptyArrays: true, // 保留空数组和null值
				},
			},
		]

		const adminGetUserInfoPipeline: PipelineStage[] = [
			{
				$lookup: {
					from: 'user-infos', // WARN: 别忘了加复数
					localField: 'UUID',
					foreignField: 'UUID',
					as: 'user_info_data',
				},
			},
			{
				$unwind: {
					path: '$user_info_data',
					preserveNullAndEmptyArrays: true, // 保留空数组和null值
				},
			},
			{
				$lookup: {
					from: 'user-invitation-codes',
					localField: 'UUID',
					foreignField: 'assigneeUUID',
					as: 'invitation_codes_data'
				},
			},
			{
				$unwind: {
					path: '$invitation_codes_data',
					preserveNullAndEmptyArrays: true
				},
			},
			{ $sort: { [`user_info_data.${sortBy}`]: sortOrder === 'descend' ? -1 : 1}},
			{ $skip: skip }, // 跳过指定数量的文档
			{ $limit: pageSize }, // 限制返回的文档数量
		]

		if (adminGetUserInfoRequest.isOnlyShowUserInfoUpdatedAfterReview) {
			const userInfoFilter = {
				$match: {
					'user_info_data.isUpdatedAfterReview': true,
				},
			}
			adminGetUserInfoCountPipeline.push(userInfoFilter)
			adminGetUserInfoPipeline.push(userInfoFilter)
		}

		if (adminGetUserInfoRequest.uid !== undefined && adminGetUserInfoRequest.uid !== null && adminGetUserInfoRequest.uid !== -1) {
			const userInfoFilter = {
				$match: {
					uid: adminGetUserInfoRequest.uid,
				},
			}
			adminGetUserInfoCountPipeline.push(userInfoFilter)
			adminGetUserInfoPipeline.push(userInfoFilter)
		}

		const projectStep = {
			$project: {
				uid: 1,
				UUID: 1,
				userCreateDateTime: 1, // 用户创建日期
				roles: 1, // 用户的角色
				email: 1, // 用户的邮箱
				username: '$user_info_data.username', // 用户名
				userNickname: '$user_info_data.userNickname', // 用户昵称
				avatar: '$user_info_data.avatar', // 用户头像
				userBannerImage: '$user_info_data.userBannerImage', // 用户的背景图
				signature: '$user_info_data.signature', // 用户的个性签名
				gender: '$user_info_data.gender', // 用户的性别
				userBirthday: '$user_info_data.userBirthday', // 用户出生日期
				invitationCode: '$invitation_codes_data.invitationCode', // 用户的邀请码
				isUpdatedAfterReview: '$user_info_data.isUpdatedAfterReview', // 是否经过审核
				editOperatorUUID: '$user_info_data.editOperatorUUID', // 编辑操作员的 UUID
				editDateTime: '$user_info_data.editDateTime', // 编辑时间
				totalCount: 1, // 总文档数
			},
		}
		adminGetUserInfoPipeline.push(projectStep)

		const countStep = {
			$count: 'totalCount', // 统计总文档数
		}
		adminGetUserInfoCountPipeline.push(countStep)

		try {
			const userCountResult = await selectDataByAggregateFromMongoDB(userAuthSchemaInstance, userAuthCollectionName, adminGetUserInfoCountPipeline)
			const userResult = await selectDataByAggregateFromMongoDB(userAuthSchemaInstance, userAuthCollectionName, adminGetUserInfoPipeline)
			if (!userResult.success) {
				logging('ERROR', '管理员获取用户信息失败，查询数据失败')
				return { success: false, message: '管理员获取用户信息失败，查询数据失败', totalCount: 0 }
			}

			return { success: true, message: '管理员获取用户信息成功', result: userResult.result, totalCount: userCountResult.result?.[0]?.totalCount ?? 0 }
		} catch (error) {
			logging('ERROR', '管理员获取用户信息时出错，查询数据时出错：', error)
			return { success: false, message: '管理员获取用户信息时出错，查询数据时出错', totalCount: 0 }
		}
	} catch (error) {
		logging('ERROR', '管理员获取用户信息时出错，未知错误：', error)
		return { success: false, message: '管理员获取用户信息时出错，未知错误', totalCount: 0 }
	}
}

/**
 * 管理员通过用户信息审核
 * @param approveUserInfoRequest 管理员通过用户信息审核的请求载荷
 * @param adminUUID 管理员的 UUID
 * @param adminToken 管理员的 Token
 * @returns 管理员通过用户信息审核的请求响应
 */
export const approveUserInfoService = async (approveUserInfoRequest: ApproveUserInfoRequestDto, adminUUID: string, adminToken: string): Promise<ApproveUserInfoResponseDto> => {
	try {
		if (!checkApproveUserInfoRequest(approveUserInfoRequest)) {
			logging('ERROR', '管理员通过用户信息审核失败，参数不合法')
			return { success: false, message: '管理员通过用户信息审核失败，参数不合法' }
		}

		if (!await checkUserTokenByUUID(adminUUID, adminToken)) {
			logging('ERROR', '管理员通过用户信息审核失败，用户校验未通过')
			return { success: false, message: '管理员通过用户信息审核失败，用户校验未通过' }
		}

		const UUID = approveUserInfoRequest.UUID
		const { collectionName, schemaInstance } = UserInfoSchema
		type UserInfo = InferSchemaType<typeof schemaInstance>

		const approveUserInfoWhere: QueryType<UserInfo> = {
			UUID,
		}
		const approveUserInfoUpdate: UpdateType<UserInfo> = {
			isUpdatedAfterReview: false,
			editDateTime: new Date().getTime(),
		}
		try {
			const updateResult = await findOneAndUpdateData4MongoDB(approveUserInfoWhere, approveUserInfoUpdate, schemaInstance, collectionName)
			if (!updateResult.success) {
				logging('ERROR', '管理员通过用户信息审核失败，向数据库更新数据失败')
				return { success: false, message: '管理员通过用户信息审核失败，向数据库更新数据失败' }
			}

			return { success: true, message: '管理员通过用户信息审核成功' }
		} catch (error) {
			logging('ERROR', '管理员通过用户信息审核时出错，向数据库更新数据时出错：', error)
			return { success: false, message: '管理员通过用户信息审核时出错，向数据库更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '管理员通过用户信息审核时出错，未知错误：', error)
		return { success: false, message: '管理员通过用户信息审核时出错，未知错误' }
	}
}

/**
 * 管理员清空某个用户的信息
 * @param approveUserInfoRequest 管理员清空某个用户的信息的请求载荷
 * @param adminUUID 管理员的 UUID
 * @param adminToken 管理员的 Token
 * @returns 管理员清空某个用户的信息请求响应
 */
export const adminClearUserInfoService = async (adminClearUserInfoRequest: AdminClearUserInfoRequestDto, adminUUID: string, adminToken: string): Promise<AdminClearUserInfoResponseDto> => {
	try {
		if (!checkAdminClearUserInfoRequest(adminClearUserInfoRequest)) {
			logging('ERROR', '管理员清空某个用户的信息失败，参数不合法')
			return { success: false, message: '管理员清空某个用户的信息失败，参数不合法' }
		}

		if (!await checkUserTokenByUUID(adminUUID, adminToken)) {
			logging('ERROR', '管理员清空某个用户的信息失败，用户校验未通过')
			return { success: false, message: '管理员清空某个用户的信息失败，用户校验未通过' }
		}

		const uid = adminClearUserInfoRequest.uid
		const UUID = await getUserUuid(uid)
		if (!UUID) {
			logging('ERROR', '管理员清空某个用户的信息失败，UUID 不存在', undefined, { uid })
			return { success: false, message: '管理员清空某个用户的信息失败，UUID 不存在' }
		}
		let username: string
		while (true) {
			username = `${UUID}_${generateSecureRandomString(6)}`
			const checkResult = await checkUsernameService({ username })
			if (checkResult.success && checkResult.isAvailableUsername) {
				break
			}
		}

		const { collectionName, schemaInstance } = UserInfoSchema
		type UserInfo = InferSchemaType<typeof schemaInstance>

		const adminClearUserInfoWhere: QueryType<UserInfo> = {
			uid, // TODO: 也许可以删掉
			UUID,
		}
		const adminClearUserInfoUpdate: UpdateType<UserInfo> = {
			username,
			userNickname: '[cleaned]',
			avatar: '',
			userBannerImage: '',
			signature: '',
			gender: '',
			label: [] as UserInfo['label'], // TODO: Mongoose issue: #12420
			userBirthday: '',
			userProfileMarkdown: '',
			userLinkedAccounts: [] as UserInfo['userLinkedAccounts'], // TODO: Mongoose issue: #12420
			userWebsite: { websiteName: '', websiteUrl: '' },
			isUpdatedAfterReview: false, // 清除信息的直接设为 false
			editOperatorUUID: adminUUID,
			editDateTime: new Date().getTime(),
		}
		try {
			const updateResult = await findOneAndUpdateData4MongoDB(adminClearUserInfoWhere, adminClearUserInfoUpdate, schemaInstance, collectionName)
			if (!updateResult.success) {
				logging('ERROR', '管理员清空某个用户的信息失败，向数据库更新数据失败')
				return { success: false, message: '管理员清空某个用户的信息失败，向数据库更新数据失败' }
			}

			return { success: true, message: '管理员清空某个用户的信息成功' }
		} catch (error) {
			logging('ERROR', '管理员清空某个用户的信息时出错，向数据库更新数据时出错：', error)
			return { success: false, message: '管理员清空某个用户的信息时出错，向数据库更新数据时出错' }
		}
	} catch (error) {
		logging('ERROR', '管理员清空某个用户的信息时出错，未知错误：', error)
		return { success: false, message: '管理员清空某个用户的信息时出错，未知错误' }
	}
}

/**  TODO:1231
 * 管理员编辑用户信息
 * @param AdminEditUserInfoRequestDto 管理员编辑用户信息的请求载荷
 * @param adminUUID 管理员的 UUID
 * @param adminToken 管理员的 Token
 * @return 管理员编辑用户信息的请求响应
 */
export const adminEditUserInfoService = async (adminEditUserInfoRequest: AdminEditUserInfoRequestDto, adminUUID: string, adminToken: string): Promise<AdminEditUserInfoResponseDto> => {
	try {
		if (!checkAdminEditUserInfoRequest(adminEditUserInfoRequest)) {
			logging('ERROR', '管理员编辑用户信息失败，参数不合法')
			return { success: false, message: '管理员编辑用户信息失败，参数不合法' }
		}

		const { uid } = adminEditUserInfoRequest
		const { username } = adminEditUserInfoRequest.userInfo
		const usernameStandardized = username.trim().normalize()
		const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaInstance } = UserInfoSchema

		if (username) {
			const checkResult = await checkUsernameService({ username: usernameStandardized })

			if (!checkResult.success || !checkResult.isAvailableUsername) {
				logging('ERROR', '管理员编辑用户信息失败，用户名不可用', undefined, { adminEditUserInfoRequest, uid })
				return { success: false, message: '管理员编辑用户信息失败，用户名不可用' }
			}
		}

		const UUID = await getUserUuid(uid)
		if (!UUID) {
			logging('ERROR', '管理员编辑用户信息失败，UUID 不存在', undefined, { uid })
			return { success: false, message: '管理员编辑用户信息失败，UUID 不存在' }
		}

		if (!await checkUserTokenByUUID(adminUUID, adminToken)) {
			logging('ERROR', '管理员编辑用户信息失败，用户校验未通过')
			return { success: false, message: '管理员编辑用户信息失败，用户校验未通过' }
		}

		type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>
		const adminEditUserInfoWhere: QueryType<UserInfo> = {
			UUID,
		}
		const adminEditUserInfoUpdate: UpdateType<UserInfo> = {
			...adminEditUserInfoRequest.userInfo,
			editOperatorUUID: adminUUID,
			editDateTime: new Date().getTime(),
		}

		const updateUserInfoResult = await findOneAndUpdateData4MongoDB(adminEditUserInfoWhere, adminEditUserInfoUpdate, userInfoSchemaInstance, userInfoCollectionName)
		if (!updateUserInfoResult.success) {
			logging('ERROR', '管理员编辑用户信息失败，向数据库更新数据失败')
			return { success: false, message: '管理员编辑用户信息失败，向数据库更新数据失败' }
		}
		return { success: true, message: '管理员编辑用户信息成功' }

	} catch (error) {
		logging('ERROR', '管理员编辑用户信息时出错，未知错误：', error)
		return { success: false, message: '管理员编辑用户信息时出错，未知错误' }
	}
}

/**
 * 根据 UID 获取 UUID
 * @param uid 用户 UID
 * @returns UUID
 */
export const getUserUuid = async (uid: number): Promise<string | void> => {
	try {
		if (uid === undefined || uid === null || uid <= 0) {
			logging('ERROR', '通过 UID 获取 UUID 失败，UID 不合法')
			return
		}
		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaSchemaInstance>

		const getUuidWhere: QueryType<UserAuth> = {
			uid,
		}

		const getUuidSelect: SelectType<UserAuth> = {
			UUID: 1,
		}

		const getUuidResult = await selectDataFromMongoDB<UserAuth>(getUuidWhere, getUuidSelect, userAuthSchemaSchemaInstance, userAuthCollectionName)
		if (getUuidResult.success && getUuidResult.result?.length === 1) {
			return getUuidResult.result[0].UUID
		} else {
			logging('ERROR', '通过 UID 获取 UUID 失败，UUID 不存在或结果长度不为 1')
		}
	} catch (error) {
		logging('ERROR', '通过 UID 获取 UUID 时出错：', error)
		return
	}
}

/**
 * 根据 UUID 获取 UID
 * @param uuid 用户 UUID
 * @returns UID
 */
export const getUserUid = async (uuid: string): Promise<number | undefined> => {
	try {
		if (!uuid) {
			logging('ERROR', '通过 UUID 获取 UID 失败，UUID 不合法')
			return
		}
		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaSchemaInstance>

		const getUidWhere: QueryType<UserAuth> = {
			UUID: uuid,
		}

		const getUidSelect: SelectType<UserAuth> = {
			uid: 1,
		}

		const getUidResult = await selectDataFromMongoDB<UserAuth>(getUidWhere, getUidSelect, userAuthSchemaSchemaInstance, userAuthCollectionName)
		if (getUidResult.success && getUidResult.result?.length === 1) {
			return getUidResult.result[0].uid
		} else {
			logging('ERROR', '通过 UUID 获取 UID 失败，UID 不存在或结果长度不为 1')
		}
	} catch (error) {
		logging('ERROR', '通过 UUID 获取 UID 时出错：', error)
		return undefined
	}
}

/**
 * 检查用户 Token，检查 Token 和用户 uid 是否吻合，判断用户是否已注册
 * // DELETE ME 这是一个临时的解决方案，以后 Cookie 中直接存储 UUID
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
				const userInfo = await selectDataFromMongoDB<UserAuth>(userTokenWhere, userTokenSelect, schemaInstance, collectionName)
				if (userInfo && userInfo.success) {
					if (userInfo.result?.length === 1) {
						return true
					} else {
						logging('ERROR', `查询用户 Token 时，用户信息长度不为 1，用户uid：【${uid}】`)
						return false
					}
				} else {
					logging('ERROR', `查询用户 Token 时未查询到用户信息，用户uid：【${uid}】，错误描述：${userInfo.message}，错误信息：${userInfo.error}`)
					return false
				}
			} catch (error) {
				logging('ERROR', `查询用户 Token 时出错，用户uid：【${uid}】，错误信息：`, error)
				return false
			}
		} else {
			logging('ERROR', `查询用户 Token 时出错，必要的参数 uid 或 token为空：【${uid}】`)
			return false
		}
	} catch (error) {
		logging('ERROR', '查询用户 Token 时出错，未知错误：', error)
		return false
	}
}

/**
 * 检查用户 Token，检查 Token 和用户 uuid 是否吻合，判断用户是否已注册
 * @param UUID 用户 UUID
 * @param token 用户 Token
 * @returns boolean 如果验证通过则为 true，不通过为 false
 */
const checkUserTokenByUUID = async (UUID: string, token: string): Promise<boolean> => {
	try {
		if (UUID !== null && !Number.isNaN(UUID) && UUID !== undefined && token) {
			const { collectionName, schemaInstance } = UserAuthSchema
			type UserAuth = InferSchemaType<typeof schemaInstance>
			const userTokenWhere: QueryType<UserAuth> = {
				UUID,
				token,
			}
			const userTokenSelect: SelectType<UserAuth> = {
				uid: 1,
			}
			try {
				const userInfo = await selectDataFromMongoDB<UserAuth>(userTokenWhere, userTokenSelect, schemaInstance, collectionName)
				if (userInfo && userInfo.success) {
					if (userInfo.result?.length === 1) {
						return true
					} else {
						logging('ERROR', `查询用户 Token 时，用户信息长度不为 1，用户 UUID: ${UUID}`)
						return false
					}
				} else {
					logging('ERROR', `查询用户 Token 时未查询到用户信息，用户 UUID: ${UUID}，错误描述：${userInfo.message}，错误信息：${userInfo.error}`)
					return false
				}
			} catch (error) {
				logging('ERROR', `查询用户 Token 时出错，用户 UUID: ${UUID}，错误信息：`, error)
				return false
			}
		} else {
			logging('ERROR', `查询用户 Token 时出错，必要的参数 uid 或 token为空 UUID: ${UUID}`)
			return false
		}
	} catch (error) {
		logging('ERROR', '查询用户 Token 时出错，未知错误：', error)
		return false
	}
}

/**
 * 检查用户数据初始化提示标识和用户 uid 是否吻合。
 * @param uid 用户 UID
 * @param userDataBootstrapHint 用户数据初始化提示标识
 * @returns boolean 如果验证通过则为 true，不通过为 false
 */
export const checkUserBootstrapHintByUid = async (uid: number, userDataBootstrapHint: string): Promise<boolean> => {
	try {
		if (uid === null || Number.isNaN(uid) || uid === undefined || !userDataBootstrapHint) {
			logging('ERROR', `用户数据初始化提示标识时出错，必要的参数 uid 或 userDataBootstrapHint 为空: uid: ${uid}`, undefined, { uid })
			return false
		}

		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>
		const userAuthWhere: QueryType<UserAuth> = {
			uid,
			userDataBootstrapHint,
		}
		const userAuthSelect: SelectType<UserAuth> = {
			uid: 1,
		}
		try {
			const userAuthInfo = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, schemaInstance, collectionName)
			if (!userAuthInfo || !userAuthInfo.success) {
				logging('ERROR', `用户数据初始化提示标识时未查询到用户信息，用户 uid: ${uid}，错误描述：${userAuthInfo?.message}，错误信息：${userAuthInfo?.error}`, undefined, { uid })
				return false
			}

			if (userAuthInfo.result?.length !== 1) {
				logging('ERROR', `用户数据初始化提示标识时，用户信息长度不为 1，用户 uid: ${uid}`, undefined, { uid })
				return false
			}

			return true
		} catch (error) {
			logging('ERROR', `用户数据初始化提示标识时出错，用户 uid: ${uid}，错误信息：`, error, { uid })
			return false
		}
	} catch (error) {
		logging('ERROR', '用户数据初始化提示标识时出错，未知错误：', error, { uid })
		return false
	}
}

/** 通过恢复码删除用户 TOTP 2FA 的参数 */
type DeleteTotpAuthenticatorByRecoveryCodeParametersDto = {
	/** 用户 UUID */
	uuid: string,
	/** 恢复码 */
	recoveryCodeHash: string,
	/** 事务 */
	session?: mongoose.ClientSession,
}

/** 通过恢复码删除用户 TOTP 2FA 的结果 */
type DeleteTotpAuthenticatorByRecoveryCodeResultDto = {} & DeleteTotpAuthenticatorByTotpVerificationCodeResponseDto

/**
 * 通过恢复码删除用户 TOTP 2FA
 * @param deleteTotpAuthenticatorByRecoveryCodeData 通过恢复码删除用户 TOTP 2FA 的参数
 * @returns 通过恢复码删除用户 TOTP 2FA 的结果
 */
const deleteTotpAuthenticatorByRecoveryCode = async (deleteTotpAuthenticatorByRecoveryCodeData: DeleteTotpAuthenticatorByRecoveryCodeParametersDto): Promise<DeleteTotpAuthenticatorByRecoveryCodeResultDto> => {
	try {
		if (!checkDeleteTotpAuthenticatorByRecoveryCodeData(deleteTotpAuthenticatorByRecoveryCodeData)) {
			logging('ERROR', '通过恢复码删除用户 2FA 失败，参数不合法')
			return { success: false, message: '通过恢复码删除用户 2FA 失败，参数不合法' }
		}

		const { uuid, recoveryCodeHash, session } = deleteTotpAuthenticatorByRecoveryCodeData

		const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
		type UserTotpAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>
		const userTotpAuthenticatorWhere: QueryType<UserTotpAuthenticator> = { UUID: uuid, recoveryCodeHash }
		const deleteResult = await deleteOneDataFromMongoDB<UserTotpAuthenticator>(userTotpAuthenticatorWhere, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName, { session })

		if (!deleteResult.success) {
			const errorMessage = '通过恢复码删除用户 TOTP 2FA 失败，删除失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage }
		}

		const resetResult = await resetUser2FATypeByUUID(uuid, session)

		if (!resetResult) {
			const errorMessage = '通过恢复码删除用户 TOTP 2FA 失败，重置用户 TOTP 2FA 数据失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			return { success: false, message: errorMessage }
		}

		return { success: true, message: '用户的 TOTP 身份验证器已删除' }
	} catch (error) {
		const errorMessage = '通过恢复码删除用户 TOTP 2FA 失败，发生未知错误'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage }
	}
}

/**
 * 已登录用户通过密码和 TOTP 验证码删除身份验证器
 * @param deleteTotpAuthenticatorByTotpVerificationCodeRequest 登录用户通过密码和 TOTP 验证码删除身份验证器的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 删除操作的结果
 */
export const deleteTotpAuthenticatorByTotpVerificationCodeService = async (deleteTotpAuthenticatorByTotpVerificationCodeRequest: DeleteTotpAuthenticatorByTotpVerificationCodeRequestDto, uuid: string, token: string): Promise<DeleteTotpAuthenticatorByTotpVerificationCodeResponseDto> => {
	try {
		if (!checkDeleteTotpAuthenticatorByTotpVerificationCodeRequest(deleteTotpAuthenticatorByTotpVerificationCodeRequest)) {
			const errorMessage = '已登录用户通过密码和 TOTP 验证码删除身份验证器失败，参数不合法'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		if (!await checkUserTokenByUUID(uuid, token)) {
			const errorMessage = '已登录用户通过密码和 TOTP 验证码删除身份验证器失败，用户校验未通过'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const { clientOtp, passwordHash } = deleteTotpAuthenticatorByTotpVerificationCodeRequest

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		const userLoginWhere: QueryType<UserAuth> = {
			UUID: uuid
		}
		const userLoginSelect: SelectType<UserAuth> = {
			passwordHashHash: 1,
		}

		const userAuthResult = await selectDataFromMongoDB<UserAuth>(userLoginWhere, userLoginSelect, userAuthSchemaInstance, userAuthCollectionName)
		const passwordHashHash = userAuthResult.result?.[0]?.passwordHashHash
		if (!userAuthResult?.result || userAuthResult.result?.length !== 1) {
			const errorMessage = '已登录用户通过密码和 TOTP 验证码删除身份验证器失败，无法查询到用户安全信息'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const isCorrectPassword = compareStringSync(passwordHash, passwordHashHash)
		if (!isCorrectPassword) {
			const errorMessage = '已登录用户通过密码和 TOTP 验证码删除身份验证器失败，用户密码不正确'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const TotpVerifier = new General2FATotpVerifier(uuid, clientOtp, token)
		// ↓ isResetAttemptsImmediately 不能设置为 false，因为重置尝试次数和删除 TOTP 身份验证器操作的同一个集合的同一条记录，但未在同一个事务，会报错。
		const totpVerificationResult = await TotpVerifier.verify({ isResetAttemptsImmediately: true, isAllowBackupCode: true, isAllowRecoveryCodeAndDeleteTotp: false })
		if (!totpVerificationResult.success && totpVerificationResult.resetAttemptsCallback) {
			const errorMessage = `已登录用户通过密码和 TOTP 验证码删除身份验证器失败：${totpVerificationResult.message}`
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
		type UserTotpAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>
		const deleteTotpAuthenticatorByTotpVerificationCodeWhere: QueryType<UserTotpAuthenticator> = {
			UUID: uuid,
			enabled: true,
		}

		const session = await createAndStartSession()

		// 调用删除函数
		const deleteResult = await deleteOneDataFromMongoDB(deleteTotpAuthenticatorByTotpVerificationCodeWhere, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName, { session })
		const resetResult = await resetUser2FATypeByUUID(uuid, session)

		if (!deleteResult.success || deleteResult.result.deletedCount !== 1 || !resetResult) {
			const errorMessage = '已登录用户通过密码和 TOTP 验证码删除身份验证器失败：删除失败，未找到匹配的数据或重置用户 2FA 数据失败'
			logging('ERROR', errorMessage)
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		await commitAndEndSession(session)
		return { success: true, message: '删除 TOTP 身份验证器成功' }
	} catch (error) {
		const errorMessage = '已登录用户通过密码和 TOTP 验证码删除身份验证器时出错，未知错误'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage }
	}
}

/**
 * 根据 UUID 重置 user-auth 表中用户的 authenticatorType 字段为 none，在 deleteTotpAuthenticatorByRecoveryCode, deleteTotpAuthenticatorByTotpVerificationCodeService 和 deleteUserEmailAuthenticatorService 中用到
 * @param uuid 用户的 UUID
 * @param session Mongoose Session
 * @returns boolean 执行是否成功
 */
const resetUser2FATypeByUUID = async (uuid: string, session: ClientSession): Promise<boolean> => {
	try {
		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		const userAuthWhere: QueryType<UserAuth> = { UUID: uuid }
		const userAuthUpdate: UpdateType<UserAuth> = { authenticatorType: 'none' }

		const updateResult = await updateData4MongoDB<UserAuth>(userAuthWhere, userAuthUpdate, userAuthSchemaInstance, userAuthCollectionName, { session })

		return !!updateResult.success
	} catch (error) {
		logging('ERROR', '根据 UUID 重置 user-auth 表中用户的 authenticatorType 字段时出错，未知错误：', error)
		return false
	}
}

/**
 * 用户创建 TOTP 身份验证器服务
 * 开启邮箱验证的是另一个函数，这个只是开启 totp
 * 这里只是创建，然后还有一个确认创建的步骤。
 *
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户创建 TOTP 身份验证器的请求响应
 */
export const createUserTotpAuthenticatorService = async (uuid: string, token: string): Promise<CreateUserTotpAuthenticatorResponseDto> => {
	try {
		if (!await checkUserTokenByUUID(uuid, token)) {
			logging('ERROR', '创建 TOTP 身份验证器失败，非法用户', undefined, { uuid })
			return { success: false, isExists: false, message: '创建 TOTP 身份验证器失败，非法用户' }
		}

		const session = await mongoose.startSession()
		session.startTransaction()

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const createUserTotpAuthenticatorUserAuthWhere: QueryType<UserAuth> = { UUID: uuid }
		const createUserTotpAuthenticatorUserAuthSelect: SelectType<UserAuth> = {
			authenticatorType: 1,
			email: 1,
		}

		const userAuthResult = await selectDataFromMongoDB<UserAuth>(createUserTotpAuthenticatorUserAuthWhere, createUserTotpAuthenticatorUserAuthSelect, userAuthSchemaInstance, userAuthCollectionName, { session })

		if (!userAuthResult.success || !userAuthResult?.result || userAuthResult.result?.length !== 1) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '创建 TOTP 身份验证器失败，用户不存在', undefined, { uuid })
			return { success: false, isExists: false, message: '创建 TOTP 身份验证器失败，用户不存在' }
		}

		if (userAuthResult.result[0].authenticatorType === 'email') {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '创建 TOTP 身份验证器失败，已经开启 Email 2FA', undefined, { uuid })
			return { success: false, isExists: true, existsAuthenticatorType: 'email', message: '创建 TOTP 身份验证器失败，已经开启 Email 2FA' }
		}

		if (userAuthResult.result[0].authenticatorType === 'email') {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '创建 TOTP 身份验证器失败，已经开启 TOTP 2FA', undefined, { uuid })
			return { success: false, isExists: true, existsAuthenticatorType: 'totp', message: '创建 TOTP 身份验证器失败，已经开启 TOTP 2FA' }
		}

		const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
		type UserAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>
		const checkUserAuthenticatorWhere: QueryType<UserAuthenticator> = { UUID: uuid, enabled: true }
		const checkUserAuthenticatorSelect: SelectType<UserAuthenticator> = { enabled: 1, createDateTime: 1 } satisfies SelectType<UserAuthenticator>
		const checkUserAuthenticatorResult = await selectDataFromMongoDB<UserAuthenticator>(checkUserAuthenticatorWhere, checkUserAuthenticatorSelect, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName, { session })

		if (!checkUserAuthenticatorResult.success || !checkUserAuthenticatorResult.result) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '创建 TOTP 身份验证器失败，验证器唯一检查失败', undefined, { uuid })
			return { success: false, isExists: false, message: '创建身份验证器失败，验证器唯一检查失败' }
		}

		if (checkUserAuthenticatorResult.result.length >= 1) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '创建 TOTP 身份验证器失败，数据库中已经存储了一个启用的 TOTP 2FA', undefined, { uuid })
			return { success: false, isExists: true, existsAuthenticatorType: 'totp', message: '创建 TOTP 身份验证器失败，数据库中已经存储了一个启用的身份验证器' }
		}

		const now = new Date().getTime()
		const secret = authenticator.generateSecret()
		const email = userAuthResult.result[0].email
		const otpAuth = authenticator.keyuri(email, 'KIRAKIRA☆DOUGA', secret)
		const attempts = 0

		// 准备要插入的身份验证器数据
		const userAuthenticatorData: UserAuthenticator = {
			UUID: uuid,
			enabled: false,
			secret,
			otpAuth,
			backupCodeHash: [],
			attempts,
			lastAttemptTime: now,
			createDateTime: now,
			editDateTime: now,
		}

		// 插入数据到数据库
		const saveTotpAuthenticatorResult = await insertData2MongoDB<UserAuthenticator>(userAuthenticatorData, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName, { session })

		if (!saveTotpAuthenticatorResult.success) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			logging('ERROR', '创建 TOTP 身份验证器失败，保存数据失败', undefined, { uuid })
			return { success: false, isExists: false, message: '创建 TOTP 身份验证器失败，保存数据失败' }
		}

		await session.commitTransaction()
		session.endSession()
		return { success: true, isExists: false, message: '创建 TOTP 身份验证器成功', result: { otpAuth } }
	} catch (error) {
		logging('ERROR', '创建 TOTP 身份验证器失败时出错，未知错误', error)
		return { success: false, isExists: false, message: '创建 TOTP 身份验证器时出错，未知错误' }
	}
}

/**
 * 用户确认绑定 TOTP 设备
 * @param confirmUserTotpAuthenticatorRequest 用户确认绑定 TOTP 设备的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户确认绑定 TOTP 设备的请求响应
 */
export const confirmUserTotpAuthenticatorService = async (confirmUserTotpAuthenticatorRequest: ConfirmUserTotpAuthenticatorRequestDto, uuid: string, token: string): Promise<ConfirmUserTotpAuthenticatorResponseDto> => {
	try {
		if (!await checkUserTokenByUUID(uuid, token)) {
			const errorMessage = '确认绑定 TOTP 设备失败，非法用户'
			logging('ERROR', errorMessage)
			return { success: false, message: errorMessage }
		}

		const { clientOtp, otpAuth } = confirmUserTotpAuthenticatorRequest

		const session = await createAndStartSession()

		const TotpVerifier = new General2FATotpVerifier(uuid, clientOtp, token)
		const totpVerificationResult = await TotpVerifier.verify({ isResetAttemptsImmediately: true, isAllowBackupCode: false, isAllowRecoveryCodeAndDeleteTotp: false, totpEnableStatus: false })
		if (!totpVerificationResult.success && totpVerificationResult.resetAttemptsCallback) {
			const errorMessage = `确认绑定 TOTP 设备失败，验证失败：${totpVerificationResult.message}`
			logging('ERROR', errorMessage)
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		const now = new Date().getTime()
		const charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ'
		const recoveryCode = generateSecureVerificationStringCode(24, charset)
		const recoveryCodeHash = hashStringSync(recoveryCode)
		const backupCode = Array.from({ length: 5 }, () => generateSecureVerificationStringCode(6, charset))
		const backupCodeHash = backupCode.map(hashStringSync)

		const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
		type UserAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>
		const confirmUserTotpAuthenticatorWhere: QueryType<UserAuthenticator> = {
			UUID: uuid,
			enabled: false,
			otpAuth,
		}
		const confirmUserTotpAuthenticatorUpdate: UpdateType<UserAuthenticator> = {
			enabled: true,
			recoveryCodeHash,
			backupCodeHash,
			editDateTime: now,
		}
		const updateAuthenticatorResult = await findOneAndUpdateData4MongoDB<UserAuthenticator>(confirmUserTotpAuthenticatorWhere, confirmUserTotpAuthenticatorUpdate, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName, { session })

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const userAuthWhere: QueryType<UserAuth> = {
			UUID: uuid,
		}
		const userAuthUpdate: UpdateType<UserAuth> = {
			authenticatorType: 'totp',
			editDateTime: now,
		}
		const updateUserAuthResult = await findOneAndUpdateData4MongoDB<UserAuthenticator>(userAuthWhere, userAuthUpdate, userAuthSchemaInstance, userAuthCollectionName, { session })

		if (!updateAuthenticatorResult.success || !updateAuthenticatorResult.result || !updateUserAuthResult.success || !updateUserAuthResult.result) {
			const errorMessage = '确认绑定 TOTP 设备失败，更新失败'
			logging('ERROR', errorMessage)
			await abortAndEndSession(session)
			return { success: false, message: errorMessage }
		}

		await commitAndEndSession(session)
		return { success: true, result: { backupCode, recoveryCode }, message: '已绑定 TOTP 设备' }
	} catch (error) {
		const errorMessage = '确认绑定 TOTP 设备时出错，未知错误'
		logging('ERROR', errorMessage, error)
		return { success: false, message: errorMessage }
	}
}

/**
 * 用户创建 Email 身份验证器服务
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户创建 Email 身份验证器的请求响应
 */
export const createUserEmailAuthenticatorService = async (uuid: string, token: string): Promise<CreateUserEmailAuthenticatorResponseDto> => {
	try {
		if (!await checkUserTokenByUUID(uuid, token)) {
			logging('ERROR', '创建 Email 身份验证器失败，非法用户', undefined, { uuid })
			return { success: false, isExists: false, message: '创建 Email 身份验证器失败，非法用户' }
		}

		const session = await createAndStartSession()

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const createUserEmailAuthenticatorUserAuthWhere: QueryType<UserAuth> = { UUID: uuid }
		const createUserEmailAuthenticatorUserAuthSelect: SelectType<UserAuth> = {
			authenticatorType: 1,
			emailLowerCase: 1,
			email: 1,
		}
		const userAuthResult = await selectDataFromMongoDB<UserAuth>(createUserEmailAuthenticatorUserAuthWhere, createUserEmailAuthenticatorUserAuthSelect, userAuthSchemaInstance, userAuthCollectionName, { session })
		if (!userAuthResult.success || !userAuthResult?.result || userAuthResult.result?.length !== 1) {
			const errorMessage = '创建 Email 2FA 身份验证器失败，用户不存在'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, isExists: false, message: errorMessage }
		}

		const email = userAuthResult.result[0].email
		const emailLowerCase = userAuthResult.result[0].emailLowerCase
		if (!emailLowerCase) {
			const errorMessage = '创建 Email 2FA 身份验证器失败，未找到邮箱'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, isExists: false, message: errorMessage }
		}

		if (userAuthResult.result[0].authenticatorType === 'email') {
			const errorMessage = '创建 Email 2FA 身份验证器失败，已经开启 Email 2FA'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, isExists: true, existsAuthenticatorType: 'email', message: errorMessage }
		}

		if (userAuthResult.result[0].authenticatorType === 'totp') {
			const errorMessage = '创建 Email 2FA 身份验证器失败，已经开启 TOTP 2FA'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, isExists: true, existsAuthenticatorType: 'totp', message: errorMessage }
		}

		const now = new Date().getTime()

		const userAuthWhere: QueryType<UserAuth> = {
			UUID: uuid,
		}
		const userAuthUpdate: UpdateType<UserAuth> = {
			authenticatorType: 'email',
			editDateTime: now,
		}
		const updateUserAuthResult = await findOneAndUpdateData4MongoDB<UserAuth>(userAuthWhere, userAuthUpdate, userAuthSchemaInstance, userAuthCollectionName, { session })

		if (!updateUserAuthResult.success || !updateUserAuthResult.result) {
			const errorMessage = '创建 Email 2FA 身份验证器失败，保存数据失败'
			logging('ERROR', errorMessage, undefined, { uuid })
			await abortAndEndSession(session)
			return { success: false, isExists: false, message: errorMessage }
		}

		await commitAndEndSession(session)
		return { success: true, isExists: false, message: '创建 Email 2FA 身份验证器成功', result: { email, emailLowerCase } }
	} catch (error) {
		const errorMessage = '创建 Email 2FA 身份验证器时出错，未知错误'
		logging('ERROR', errorMessage, error)
		return { success: false, isExists: false, message: errorMessage }
	}
}

/**
 * 用户删除 Email 2FA
 * @param deleteUserEmailAuthenticatorRequest
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 */
export const deleteUserEmailAuthenticatorService = async (deleteUserEmailAuthenticatorRequest: DeleteUserEmailAuthenticatorRequestDto, uuid: string, token: string): Promise<DeleteUserEmailAuthenticatorResponseDto> => {
	try {
		if (!checkDeleteUserEmailAuthenticatorRequest(deleteUserEmailAuthenticatorRequest)) {
			logging('ERROR', '用户删除 Email 2FA 时失败，参数非法')
			return { success: false, message: '用户删除 Email 2FA 时失败，参数非法' }
		}

		if (!await checkUserTokenByUUID(uuid, token)) {
			logging('ERROR', '用户删除 Email 2FA 时失败，用户校验未通过')
			return { success: false, message: '用户删除 Email 2FA 时失败，用户校验未通过' }
		}

		const { passwordHash, verificationCode } = deleteUserEmailAuthenticatorRequest

		const session = await mongoose.startSession()
		session.startTransaction()

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const deleteUserEmailAuthenticatorUserAuthWhere: QueryType<UserAuth> = { UUID: uuid }
		const deleteUserEmailAuthenticatorUserAuthSelect: SelectType<UserAuth> = {
			authenticatorType: 1,
			emailLowerCase: 1,
			email: 1,
			passwordHashHash: 1,
		}
		const userAuthResult = await selectDataFromMongoDB<UserAuth>(deleteUserEmailAuthenticatorUserAuthWhere, deleteUserEmailAuthenticatorUserAuthSelect, userAuthSchemaInstance, userAuthCollectionName, { session })
		const userAuthData = userAuthResult.result?.[0]

		if (!userAuthResult.success || userAuthResult.result?.length !== 1) {
			await abortAndEndSession(session)
			logging('ERROR', '用户删除 Email 2FA 时失败，用户不存在')
			return { success: false, message: '用户删除 Email 2FA 时失败，用户不存在' }
		}

		if (userAuthData.authenticatorType !== 'email') {
			await abortAndEndSession(session)
			logging('ERROR', '用户删除 Email 2FA 时失败，用户未开启 2FA 或者 2FA 方式不是 Email。')
			return { success: false, message: '用户删除 Email 2FA 时失败，用户未开启 2FA 或者 2FA 方式不是 Email。' }
		}

		const isCorrectPassword = compareStringSync(passwordHash, userAuthData.passwordHashHash)
		if (!isCorrectPassword) {
			await abortAndEndSession(session)
			logging('ERROR', '用户删除 Email 2FA 时失败，密码错误')
			return { success: false, message: '用户删除 Email 2FA 时失败，密码错误' }
		}

		const EmailVerifier = new General2FAEmailVerifier(uuid, verificationCode, token)
		const verificationCodeCheckResult = await EmailVerifier.verify({ isResetAttemptsImmediately: true, exclusiveBusinessName: 'delete-email-2fa' })

		if (!verificationCodeCheckResult || !verificationCodeCheckResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '用户删除 Email 2FA 时失败，验证失败或验证码错误')
			return { success: false, message: '用户删除 Email 2FA 时失败，验证失败或验证码错误' }
		}

		// 重置用户的 2FA 类型
		const resetUser2FATypeByUUIDResult = await resetUser2FATypeByUUID(uuid, session)

		if (!resetUser2FATypeByUUIDResult) {
			await abortAndEndSession(session)
			logging('ERROR', '用户删除 Email 2FA 时失败，用户关闭 2FA 失败', undefined, { UUID: uuid })
			return { success: false, message: '用户删除 Email 2FA 时失败，用户关闭 2FA 失败' }
		}

		await commitAndEndSession(session)
		return { success: true, message: '用户删除 Email 2FA 成功' }
	} catch (error) {
		logging('ERROR', '用户删除 Email 2FA 时出错，未知错误', error)
		return { success: false, message: '用户删除 Email 2FA 时出错，未知错误' }
	}
}

/**
 * 通过 Email 检查用户是否已开启 2FA 身份验证器
 * @param checkUserHave2FARequestDto 通过 Email 检查用户是否已开启 2FA 身份验证器的请求载荷
 * @returns 通过 Email 检查用户是否已开启 2FA 身份验证器的请求响应
 */
export const checkUserHave2FAByEmailService = async (checkUserHave2FARequestDto: CheckUserHave2FARequestDto): Promise<CheckUserHave2FAResponseDto> => {
	try {
		const { email } = checkUserHave2FARequestDto
		if (!email) {
			logging('ERROR', `通过 Email 检查用户是否已开启 2FA 身份验证器失败，邮箱为空`)
			return { success: false, have2FA: false, message: '通过 Email 检查用户是否已开启 2FA 身份验证器失败，邮箱为空' }
		}

		const emailLowerCase = email.toLowerCase()

		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>

		const userAuthWhere: QueryType<UserAuth> = { emailLowerCase }
		const userAuthSelect: SelectType<UserAuth> = { authenticatorType: 1, UUID: 1 }

		const userAuthResult = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, schemaInstance, collectionName)
		if (!userAuthResult?.result || userAuthResult.result?.length !== 1) {
			logging('ERROR', `通过 Email 检查用户是否已开启 2FA 身份验证器失败，未找到用户数据`)
			return { success: false, have2FA: false, message: '通过 Email 检查用户是否已开启 2FA 身份验证器失败，未找到用户数据' }
		}

		const UUID = userAuthResult.result[0].UUID
		if (!UUID) {
			logging('ERROR', `通过 Email 检查用户是否已开启 2FA 身份验证器失败，未找到 UUID`)
			return { success: false, have2FA: false, message: '通过 Email 检查用户是否已开启 2FA 身份验证器失败，未找到 UUID' }
		}

		const authenticatorType = userAuthResult.result[0].authenticatorType
		if (authenticatorType === 'totp') {
			const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
			type UserTotpAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>

			const userTotpAuthenticatorWhere: QueryType<UserTotpAuthenticator> = { UUID, enabled: true }
			const userTotpAuthenticatorSelect: SelectType<UserTotpAuthenticator> = { createDateTime: 1 }

			const userTotpAuthenticatorResult = await selectDataFromMongoDB<UserTotpAuthenticator>(userTotpAuthenticatorWhere, userTotpAuthenticatorSelect, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName)
			const totpCreationDateTime = userTotpAuthenticatorResult?.result?.[0].createDateTime

			return { success: true, have2FA: true, type: authenticatorType, totpCreationDateTime, message: '用户已开启 TOTP 2FA' }
		} else if (authenticatorType === 'email') {
			return { success: true, have2FA: true, type: authenticatorType, message: '用户已开启 Email 2FA' }
		} else {
			return { success: true, have2FA: false, message: '用户未开启 2FA' }
		}
	} catch (error) {
		logging('ERROR', '通过 Email 检查用户是否已开启 2FA 身份验证器时出错，未知错误', error)
		return { success: false, have2FA: false, message: '通过 Email 检查用户是否已开启 2FA 身份验证器时出错，未知错误' }
	}
}

/**
 * 通过 UUID 检查用户是否已开启 2FA 身份验证器
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 通过 UUID 检查用户是否已开启 2FA 身份验证器的请求响应
 */
export const checkUserHave2FAByUUIDService = async (uuid: string, token: string): Promise<CheckUserHave2FAResponseDto> => {
	try {
		if (!await checkUserTokenByUUID(uuid, token)) {
			logging('ERROR', `通过 UUID 检查用户是否已开启 2FA 身份验证器失败，非法用户`)
			return { success: false, have2FA: false, message: '通过 UUID 检查用户是否已开启 2FA 身份验证器失败，非法用户' }
		}

		const { collectionName, schemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof schemaInstance>

		const userAuthWhere: QueryType<UserAuth> = { UUID: uuid }
		const userAuthSelect: SelectType<UserAuth> = { authenticatorType: 1 }

		const userAuthResult = await selectDataFromMongoDB<UserAuth>(userAuthWhere, userAuthSelect, schemaInstance, collectionName)
		if (!userAuthResult?.result || userAuthResult.result?.length !== 1) {
			logging('ERROR', `通过 UUID 检查用户是否已开启 2FA 身份验证器失败，未找到用户数据`)
			return { success: false, have2FA: false, message: '通过 UUID 检查用户是否已开启 2FA 身份验证器失败，未找到用户数据' }
		}

		const authenticatorType = userAuthResult.result[0].authenticatorType
		if (authenticatorType === 'totp') {
			const { collectionName: userTotpAuthenticatorCollectionName, schemaInstance: userTotpAuthenticatorSchemaInstance } = UserTotpAuthenticatorSchema
			type UserTotpAuthenticator = InferSchemaType<typeof userTotpAuthenticatorSchemaInstance>

			const userTotpAuthenticatorWhere: QueryType<UserTotpAuthenticator> = { UUID: uuid, enabled: true }
			const userTotpAuthenticatorSelect: SelectType<UserTotpAuthenticator> = { createDateTime: 1 }

			const userTotpAuthenticatorResult = await selectDataFromMongoDB<UserTotpAuthenticator>(userTotpAuthenticatorWhere, userTotpAuthenticatorSelect, userTotpAuthenticatorSchemaInstance, userTotpAuthenticatorCollectionName)
			const totpCreationDateTime = userTotpAuthenticatorResult?.result?.[0].createDateTime

			return { success: true, have2FA: true, type: authenticatorType, totpCreationDateTime, message: '用户已开启 TOTP 2FA' }
		} else if (authenticatorType === 'email') {
			return { success: true, have2FA: true, type: authenticatorType, message: '用户已开启 Email 2FA' }
		} else {
			return { success: true, have2FA: false, message: '用户未开启 2FA' }
		}
	} catch (error) {
		logging('ERROR', '通过 UUID 检查用户是否已开启 2FA 身份验证器时出错，未知错误', error)
		return { success: false, have2FA: false, message: '通过 UUID 检查用户是否已开启 2FA 身份验证器时出错，未知错误' }
	}
}

/**
 * 管理员重置所有用户的 token // DANGER: 请勿调用，除非你知道你自己在做什么！所有用户将会被强制登出！
 * @param adminUUID
 * @param adminToken
 * @returns 管理员重置所有用户的 token 的请求响应
 */
export const adminRotationAllUserTokenService = async (adminUUID: string, adminToken: string): Promise<AdminRotationAllUserTokenResponseDto> => {
	try {
		if (!await checkUserTokenByUUID(adminUUID, adminToken)) {
			logging('ERROR', '管理员重置所有用户的 token 时失败，非法用户', undefined, { adminUUID })
			return { success: false, message: '管理员重置所有用户的 token 时失败，非法用户' }
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		let UserAuthModel: Model<UserAuth>
		if (mongoose.models[userAuthCollectionName]) {
			UserAuthModel = mongoose.models[userAuthCollectionName]
		} else {
			UserAuthModel = mongoose.model<UserAuth>(userAuthCollectionName, userAuthSchemaInstance)
		}

		const cursor = UserAuthModel.find().cursor();

		let count = 0;

		for await (const doc of cursor) {
			doc.token = generateSecureRandomString(64);
			doc.editDateTime = Date.now();
			await doc.save();
			count++;
		}

		return { success: true, message: `token 轮换完成，一共轮换了 ${count} 条用户数据` }
	} catch (error) {
		logging('ERROR', '管理员重置所有用户的 token 时出错，未知错误', error, { adminUUID })
		return { success: false, message: '管理员重置所有用户的 token 时出错，未知错误' }
	}
}

/**
 * 管理员重置所有用户的 userDataBootstrapHint // DANGER: 请勿调用，除非你知道你自己在做什么！
 * @param adminUUID
 * @param adminToken
 * @returns 管理员重置所有用户的 token 的请求响应
 */
export const adminRotationAllUserDataBootstrapHintService = async (adminUUID: string, adminToken: string): Promise<AdminRotationAllUserDataBootstrapHintResponseDto> => {
	try {
		if (!await checkUserTokenByUUID(adminUUID, adminToken)) {
			logging('ERROR', '管理员重置所有用户的 userDataBootstrapHint 时失败，非法用户', undefined, { adminUUID })
			return { success: false, message: '管理员重置所有用户的 userDataBootstrapHint 时失败，非法用户' }
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		let UserAuthModel: Model<UserAuth>
		if (mongoose.models[userAuthCollectionName]) {
			UserAuthModel = mongoose.models[userAuthCollectionName]
		} else {
			UserAuthModel = mongoose.model<UserAuth>(userAuthCollectionName, userAuthSchemaInstance)
		}

		const cursor = UserAuthModel.find().cursor();

		let count = 0;

		for await (const doc of cursor) {
			doc.userDataBootstrapHint = generateSecureRandomString(64);
			doc.editDateTime = Date.now();
			await doc.save();
			count++;
		}

		return { success: true, message: `userDataBootstrapHint 轮换完成，一共轮换了 ${count} 条用户数据` }
	} catch (error) {
		logging('ERROR', '管理员重置所有用户的 userDataBootstrapHint 时出错，未知错误', error, { adminUUID })
		return { success: false, message: '管理员重置所有用户的 userDataBootstrapHint 时出错，未知错误' }
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
		&& !!userRegistrationRequest.passwordHash
		&& !!userRegistrationRequest.email && !isInvalidEmail(userRegistrationRequest.email)
		&& !!userRegistrationRequest.verificationCode
		&& !!userRegistrationRequest.username
	)
}

/**
 * 用户邮箱是否存在验证的请求参数的非空验证
 * @param userEmailExistsCheckRequest
 * @returns boolean 合法则返回 true
 */
const checkUserEmailExistsCheckRequest = (userEmailExistsCheckRequest: UserEmailExistsCheckRequestDto): boolean => {
	// TODO // WARN 这里可能需要更安全的校验机制
	return (!!userEmailExistsCheckRequest.email && !isInvalidEmail(userEmailExistsCheckRequest.email))
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
		true
		&& !!updateUserEmailRequest.oldEmail && !isInvalidEmail(updateUserEmailRequest.oldEmail)
		&& !!updateUserEmailRequest.newEmail && !isInvalidEmail(updateUserEmailRequest.newEmail)
		&& !!updateUserEmailRequest.passwordHash
		&& !!updateUserEmailRequest.changeEmailVerificationCode
		&& !!updateUserEmailRequest.changeEmailNewEmailVerificationCode
	)
}

/**
 * 允许关联的平台列表
 * // TODO 或许这些数据放到环境变量里更好？
 */
const ALLOWED_PLATFORM_ID = [
	'platform.twitter', // Twitter → X
	'platform.qq',
	'platform.wechat', // 微信
	'platform.bilibili',
	'platform.niconico',
	'platform.youtube',
	'platform.otomad_wiki', // 音 MAD 维基
	'platform.weibo', // 新浪微博
	'platform.tieba', // 百度贴吧
	'platform.cloudmusic', // 网易云音乐
	'platform.discord',
	'platform.telegram',
	'platform.midishow',
	'platform.linkedin', // 领英（海外版）
	'platform.facebook',
	'platform.instagram',
	'platform.douyin', // 抖音
	'platform.tiktok', // TikTok（抖音海外版）
	'platform.pixiv',
	'platform.github',
]

/**
 * 允许设置的隐私设置项
 * // TODO 或许这些数据放到环境变量里更好？
 */
const ALLOWED_PRIVARY_ID = [
	'privary.birthday', // 生日
	'privary.age', // 年龄
	'privary.follow', // 关注
	'privary.fans', // 粉丝
	'privary.favorites', // 收藏
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

	if (updateOrCreateUserInfoRequest?.userLinkedAccounts?.some(account => !ALLOWED_PLATFORM_ID.includes(account.platformId))) {
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

	if (updateOrCreateUserSettingsRequest?.userLinkedAccountsVisibilitiesSetting?.some(account => !ALLOWED_PLATFORM_ID.includes(account.platformId))) {
		return false
	}

	if (updateOrCreateUserSettingsRequest?.userPrivaryVisibilitiesSetting?.some(account => !ALLOWED_PRIVARY_ID.includes(account.privaryId))) {
		return false
	}

	return true
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
 * 验证忘记密码（更新密码）的请求载荷
 * @param forgotPasswordRequest 忘记密码（更新密码）的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkForgotPasswordRequest = (forgotPasswordRequest: ForgotPasswordRequestDto): boolean => {
	return (
		true
		&& !!forgotPasswordRequest.email
		&& !!forgotPasswordRequest.newPasswordHash
		&& !!forgotPasswordRequest.verificationCode && forgotPasswordRequest.verificationCode.length === 6
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

/**
 * 检查管理员获取用户信息的请求载荷
 * @param adminGetUserInfoRequest 管理员获取用户信息的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkAdminGetUserInfoRequest = (adminGetUserInfoRequest: AdminGetUserInfoRequestDto): boolean => {
	return (
		adminGetUserInfoRequest.isOnlyShowUserInfoUpdatedAfterReview !== undefined && adminGetUserInfoRequest.isOnlyShowUserInfoUpdatedAfterReview !== null
		&& !!adminGetUserInfoRequest.pagination && adminGetUserInfoRequest.pagination.page > 0 && adminGetUserInfoRequest.pagination.pageSize > 0
	)
}

/**
 * 检查管理员通过用户信息审核的请求载荷
 * @param approveUserInfoRequest 管理员通过用户信息审核的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkApproveUserInfoRequest = (approveUserInfoRequest: ApproveUserInfoRequestDto): boolean => {
	return (!!approveUserInfoRequest.UUID)
}

/**
 * 检查管理员清空某个用户的信息的请求载荷
 * @param adminClearUserInfoRequest 管理员清空某个用户的信息的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkAdminClearUserInfoRequest = (adminClearUserInfoRequest: AdminClearUserInfoRequestDto): boolean => {
	return (
		adminClearUserInfoRequest.uid !== undefined && adminClearUserInfoRequest.uid !== null && typeof adminClearUserInfoRequest.uid === 'number' && adminClearUserInfoRequest.uid > 0
	)
}

/**
 * 检查通过恢复码删除用户 2FA 的参数
 * @param deleteAuthenticatorByRecoveryCodeData 通过恢复码删除用户 2FA 的参数
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkDeleteTotpAuthenticatorByRecoveryCodeData = (deleteTotpAuthenticatorByRecoveryCodeData: DeleteTotpAuthenticatorByRecoveryCodeParametersDto): boolean => {
	return (!!deleteTotpAuthenticatorByRecoveryCodeData.uuid && !!deleteTotpAuthenticatorByRecoveryCodeData.recoveryCodeHash)
}

/**
 * 检查已登录用户通过密码和 TOTP 验证码删除身份验证器的请求载荷
 * @param deleteAuthenticatorByTotpVerificationCodeRequest 已登录用户通过密码和 TOTP 验证码删除身份验证器的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkDeleteTotpAuthenticatorByTotpVerificationCodeRequest = (deleteTotpAuthenticatorByTotpVerificationCodeRequest: DeleteTotpAuthenticatorByTotpVerificationCodeRequestDto): boolean => {
	return (!!deleteTotpAuthenticatorByTotpVerificationCodeRequest.clientOtp && !!deleteTotpAuthenticatorByTotpVerificationCodeRequest.passwordHash)
}

/**
 * 检查用户删除 Email 2FA 的请求载荷
 * @param deleteUserEmailAuthenticatorRequest 用户删除 Email 2FA 的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkDeleteUserEmailAuthenticatorRequest = (deleteUserEmailAuthenticatorRequest: DeleteUserEmailAuthenticatorRequestDto): boolean => {
	return (
		true
		&& !!deleteUserEmailAuthenticatorRequest.passwordHash
		&& !!deleteUserEmailAuthenticatorRequest.verificationCode
	)
}

/**
 * 检查管理员编辑用户信息的请求载荷
 * @param adminEditUserInfoRequest 管理员编辑用户信息的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkAdminEditUserInfoRequest = (adminEditUserInfoRequest: AdminEditUserInfoRequestDto): boolean => {
	return (
		adminEditUserInfoRequest.uid !== null && adminEditUserInfoRequest.uid !== undefined
		&& !!adminEditUserInfoRequest.userInfo
	)
}

/**
 * 检查根据 UUID 校验用户是否已经存在的请求载荷
 * @param checkUserExistsByUuidRequest 根据 UUID 校验用户是否已经存在的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkCheckUserExistsByUuidRequest = (checkUserExistsByUuidRequest: CheckUserExistsByUuidRequestDto): boolean => {
	return ( !!checkUserExistsByUuidRequest.uuid )
}

/**
 * 检查获取封禁用户排序相关的变量
 * @param sortBy 排序字段
 * @param sortOrder 排序顺序
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkSortVariablesForGetBlockedUserService = (sortBy: string, sortOrder: string): boolean => {
	const allowedSortFields = ['createDateTime', 'editDateTime', 'username', 'userNickname', 'uid'] // 允许的排序方式
	if (!allowedSortFields.includes(sortBy)) {
		return false
	}
	if (sortOrder !== 'ascend' && sortOrder !== 'descend') {
		return false
	}
	return true
}

/**
 * 检查管理员获取用户信息排序相关的变量
 * @param sortBy 排序字段
 * @param sortOrder 排序顺序
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkSortVariablesForAdminGetUserInfoService = (sortBy: string, sortOrder: string): boolean => {
	const allowedSortFields = ['createDateTime', 'editDateTime', 'username', 'userNickname', 'uid'] // 允许的排序方式
	if (!allowedSortFields.includes(sortBy)) {
		return false
	}
	if (sortOrder !== 'ascend' && sortOrder !== 'descend') {
		return false
	}
	return true
}

/**
 * 检查发送通用 2FA 邮箱验证码的请求载荷
 * @param sendGeneral2FAEmailVerificationCodeRequest 发送通用 2FA 邮箱验证码的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkSendGeneral2FAEmailVerificationCodeRequest = (sendGeneral2FAEmailVerificationCodeRequest: SendGeneral2FAEmailVerificationCodeRequestDto): boolean => {
	return (
		true
		&& !!sendGeneral2FAEmailVerificationCodeRequest.clientLanguage && supportedLanguageList.includes(sendGeneral2FAEmailVerificationCodeRequest.clientLanguage)
		&& !!sendGeneral2FAEmailVerificationCodeRequest.exclusiveBusinessName && sendGeneral2FAEmailVerificationCodeRequest.exclusiveBusinessName !== 'unknown'
	)
}

/**
 * 检查发送通用邮箱验证码的请求载荷
 * @param sendGeneralEmailVerificationCodeRequest 发送通用邮箱验证码的请求载荷
 * @returns 检查结果，合法返回 true，不合法返回 false
 */
const checkSendGeneralEmailVerificationCodeRequest = (sendGeneralEmailVerificationCodeRequest: SendGeneralEmailVerificationCodeRequestDto): boolean => {
	return (
		true
		&& !!sendGeneralEmailVerificationCodeRequest.clientLanguage && supportedLanguageList.includes(sendGeneralEmailVerificationCodeRequest.clientLanguage)
		&& !!sendGeneralEmailVerificationCodeRequest.email && !isInvalidEmail(sendGeneralEmailVerificationCodeRequest.email)
		&& !!sendGeneralEmailVerificationCodeRequest.exclusiveBusinessName && sendGeneralEmailVerificationCodeRequest.exclusiveBusinessName !== 'unknown'
	)
}
