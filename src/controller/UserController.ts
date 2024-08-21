import { getCorrectCookieDomain } from '../common/UrlTool.js'
import { adminClearUserInfoService, adminGetUserInfoService, approveUserInfoService, blockUserByUIDService, changePasswordService, checkInvitationCodeService, checkUsernameService, checkUserTokenService, createInvitationCodeService, getBlockedUserService, getMyInvitationCodeService, getSelfUserInfoService, getUserAvatarUploadSignedUrlService, getUserInfoByUidService, getUserSettingsService, reactivateUserByUIDService, requestSendChangeEmailVerificationCodeService, requestSendChangePasswordVerificationCodeService, RequestSendVerificationCodeService, updateOrCreateUserInfoService, updateOrCreateUserSettingsService, updateUserEmailService, userExistsCheckService, userLoginService, userRegistrationService, getUserInvitationCodeService, getUserUuid, createUserAuthenticatorService, deleteUserAuthenticatorService, checkUserAuthenticatorService } from '../service/UserService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { AdminClearUserInfoRequestDto, AdminGetUserInfoRequestDto, ApproveUserInfoRequestDto, BlockUserByUIDRequestDto, CheckInvitationCodeRequestDto, CheckUsernameRequestDto, GetSelfUserInfoRequestDto, GetUserInfoByUidRequestDto, GetUserSettingsRequestDto, ReactivateUserByUIDRequestDto, RequestSendChangeEmailVerificationCodeRequestDto, RequestSendChangePasswordVerificationCodeRequestDto, RequestSendVerificationCodeRequestDto, UpdateOrCreateUserInfoRequestDto, UpdateOrCreateUserSettingsRequestDto, UpdateUserEmailRequestDto, UpdateUserPasswordRequestDto, UserExistsCheckRequestDto, UserLoginRequestDto, UserLogoutResponseDto, UserRegistrationRequestDto } from './UserControllerDto.js'

/**
 * 用户注册
 * @param ctx context
 * @param next context
 * @returns 用户注册的结果，如果注册成功会包含 token
 */
export const userRegistrationController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UserRegistrationRequestDto>
	const userRegistrationData: UserRegistrationRequestDto = {
		email: data?.email,
		verificationCode: data?.verificationCode,
		passwordHash: data?.passwordHash,
		passwordHint: data?.passwordHint,
		invitationCode: data?.invitationCode,
		username: data?.username,
		userNickname: data?.userNickname,
	}
	const userRegistrationResult = await userRegistrationService(userRegistrationData)

	const cookieOption = {
		httpOnly: true, // 仅 HTTP 访问，浏览器中的 js 无法访问。
		secure: true,
		sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
		maxAge: 1000 * 60 * 60 * 24 * 365, // 设置有效期为 1 年
		domain: getCorrectCookieDomain(),
	}
	ctx.cookies.set('token', userRegistrationResult.token, cookieOption)
	ctx.cookies.set('email', data?.email, cookieOption)
	ctx.cookies.set('uid', `${userRegistrationResult.uid}`, cookieOption)
	ctx.cookies.set('uuid', `${userRegistrationResult.UUID}`, cookieOption)
	ctx.body = userRegistrationResult
	await next()
}

/**
 * 用户登录
 * @param ctx context
 * @param next context
 * @returns 用户登录的结果，如果登录成功会包含 token
 */
export const userLoginController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UserLoginRequestDto>
	const userLoginRequest: UserLoginRequestDto = {
		email: data?.email,
		passwordHash: data?.passwordHash,
		otp: data?.otp
	}
	const userLoginResult = await userLoginService(userLoginRequest)

	const cookieOption = {
		httpOnly: true, // 仅 HTTP 访问，浏览器中的 js 无法访问。
		secure: true,
		sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
		maxAge: 1000 * 60 * 60 * 24 * 365, // 设置有效期为 1 年
		domain: getCorrectCookieDomain(),
	}
	ctx.cookies.set('token', userLoginResult.token, cookieOption)
	ctx.cookies.set('email', userLoginResult.email, cookieOption)
	ctx.cookies.set('uid', `${userLoginResult.uid}`, cookieOption)
	ctx.cookies.set('uuid', `${userLoginResult.UUID}`, cookieOption)
	ctx.body = userLoginResult
	await next()
}

/**
 * 创建身份验证器
 * @param ctx context
 * @param next context
 * @return UserCreateAuthenticatorResponseDto 创建结果
 */
export const userCreateAuthenticatorController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const result = await createUserAuthenticatorService(uuid, token)
	ctx.body = result
	await next()
}

/**
 * 删除身份验证器
 * @param ctx context
 * @param next next
 * @returns UserDeleteAuthenticatorResponseDto 删除结果
 */
export const deleteUserAuthenticatorController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const result = await deleteUserAuthenticatorService(uuid, token);
	ctx.body = result;
	await next()
}

/**
 * 检查身份验证器功能是否开启，若开启则返回创建时间
 * @param ctx context
 * @param next next
 * @returns GetUserAuthenticatorResponseDto 检查结果
 */
export const checkUserAuthenticatorController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const result = await checkUserAuthenticatorService(uuid);
	ctx.body = result;
	await next()
}

/**
 * 检查一个用户是否存在
 * @param ctx context
 * @param next context
 * @return UserExistsCheckResultDto 检查结果，如果用户邮箱已存在或查询失败则 exists: true
 */
export const userExistsCheckController = async (ctx: koaCtx, next: koaNext) => {
	const email = ctx.query.email as string
	const userExistsCheckData: UserExistsCheckRequestDto = {
		email: email || '',
	}
	ctx.body = await userExistsCheckService(userExistsCheckData)
	await next()
}

/**
 * 更新用户邮箱
 * @param ctx context
 * @param next context
 * @return UpdateUserEmailResponseDto 更新结果，如果更新成功则 success: true，不成功则 success: false
 */
export const updateUserEmailController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UpdateUserEmailRequestDto>
	const updateUserEmailRequest: UpdateUserEmailRequestDto = {
		uid: data?.uid,
		oldEmail: data?.oldEmail,
		newEmail: data?.newEmail,
		passwordHash: data?.passwordHash,
		verificationCode: data?.verificationCode,
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	const updateUserEmailResponse = await updateUserEmailService(updateUserEmailRequest, uid, token)

	const cookieOption = {
		httpOnly: true, // 仅 HTTP 访问，浏览器中的 js 无法访问。
		secure: true,
		sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
		maxAge: 1000 * 60 * 60 * 24 * 365, // 设置有效期为 1 年
		domain: getCorrectCookieDomain(),
	}
	if (updateUserEmailResponse.success) {
		ctx.cookies.set('email', data?.newEmail ?? '', cookieOption)
	}
	ctx.body = updateUserEmailResponse
	await next()
}

/**
 * 更新或创建用户信息
 * @param ctx context
 * @param next context
 * @return UpdateOrCreateUserInfoResponseDto 更新或创建后的结果和新的用户信息，如果更新成功则 success: true，不成功则 success: false
 */
export const updateOrCreateUserInfoController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UpdateOrCreateUserInfoRequestDto>
	const updateOrCreateUserInfoRequest: UpdateOrCreateUserInfoRequestDto = {
		username: data?.username,
		userNickname: data?.userNickname,
		avatar: data?.avatar,
		userBannerImage: data?.userBannerImage,
		signature: data?.signature,
		gender: data?.gender,
		label: data?.label,
		userBirthday: data?.userBirthday,
		userProfileMarkdown: data?.userProfileMarkdown,
		userLinkAccounts: data?.userLinkAccounts,
		userWebsite: data?.userWebsite,
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	ctx.body = await updateOrCreateUserInfoService(updateOrCreateUserInfoRequest, uid, token)
	await next()
}

/**
 * 获取当前登录的用户信息
 * @param ctx context
 * @param next context
 * @return GetSelfUserInfoResponseDto 当前登录的用户信息，如果获取成功则 success: true，不成功则 success: false
 */
export const getSelfUserInfoController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<GetSelfUserInfoRequestDto>

	const uid = parseInt(ctx.cookies.get('uid'), 10) || data?.uid
	const token = ctx.cookies.get('token') || data?.token

	const getSelfUserInfoRequest: GetSelfUserInfoRequestDto = {
		uid,
		token,
	}
	const selfUserInfo = await getSelfUserInfoService(getSelfUserInfoRequest)
	if (!selfUserInfo.success) {
		const cookieOption = {
			httpOnly: true, // 仅 HTTP 访问，浏览器中的 js 无法访问。
			secure: true,
			sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
			maxAge: 0, // 立即过期
			expires: new Date(0), // 设置一个以前的日期让浏览器删除 cookie
			domain: getCorrectCookieDomain(),
		}

		ctx.cookies.set('token', '', cookieOption)
		ctx.cookies.set('email', '', cookieOption)
		ctx.cookies.set('uid', '', cookieOption)
		ctx.cookies.set('uuid', '', cookieOption)
	}
	ctx.body = selfUserInfo
	await next()
}

/**
 * 获取用户信息
 * @param ctx context
 * @param next context
 * @return GetUserInfoByUidResponseDto 通过 uid 获取到的用户信息，如果获取成功则 success: true，不成功则 success: false
 */
export const getUserInfoByUidController = async (ctx: koaCtx, next: koaNext) => {
	const uid = ctx.query.uid as string
	const getUserInfoByUidRequest: GetUserInfoByUidRequestDto = {
		uid: uid ? parseInt(uid, 10) : -1, // WARN -1 代表这个 UID 是永远无法查找到结果
	}
	ctx.body = await getUserInfoByUidService(getUserInfoByUidRequest)
	await next()
}

/**
 * 校验用户 token
 * // DELETE: 顺便给用户加上UUID
 * @param ctx context
 * @param next context
 * @return CheckUserTokenResponseDto 通过 token 中的 uid 和 token 校验用户，如果校验成功则 success 和 userTokenOk 的值都为 true，不成功则 success 或 userTokenOk 的值为 false
 */
export const checkUserTokenController = async (ctx: koaCtx, next: koaNext) => {
	const uidString = ctx.cookies.get('uid')
	const uid = parseInt(uidString, 10)
	const token = ctx.cookies.get('token')

	const checkUserTokenResponse = await checkUserTokenService(uid, token)

	// DELETE ME: 对于 Cookie 中没有 UUID 的早期注册用户，强制向 Cookie 中推送 UUID。该逻辑不应当一直存在，一段时间之后差不多都推送完了，就应该删掉了。
	if (checkUserTokenResponse.success && checkUserTokenResponse.userTokenOk) {
		const uuid = await getUserUuid(uid)
		if (uuid) {
			const cookieOption = {
				httpOnly: true, // 仅 HTTP 访问，浏览器中的 js 无法访问。
				secure: true,
				sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
				maxAge: 1000 * 60 * 60 * 24 * 365, // 设置有效期为 1 年
				domain: getCorrectCookieDomain(),
			}
			ctx.cookies.set('uuid', uuid, cookieOption)
			ctx.cookies.set('uid', uidString, cookieOption)
			ctx.cookies.set('token', token, cookieOption)
		}
	}

	ctx.body = checkUserTokenResponse
	await next()
}

/**
 * 用户登出，清除和用户身份相关 Token
 * @param ctx context
 * @param next context
 */
export const userLogoutController = async (ctx: koaCtx, next: koaNext) => {
	// TODO 理论上这里还可以做一些操作，比如说记录用户登出事件...

	const cookieOption = {
		httpOnly: true, // 仅 HTTP 访问，浏览器中的 js 无法访问。
		secure: true,
		sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
		maxAge: 0, // 立即过期
		expires: new Date(0), // 设置一个以前的日期让浏览器删除 cookie
		domain: getCorrectCookieDomain(),
	}

	ctx.cookies.set('token', '', cookieOption)
	ctx.cookies.set('email', '', cookieOption)
	ctx.cookies.set('uid', '', cookieOption)
	ctx.cookies.set('uuid', '', cookieOption)

	ctx.body = { success: true, message: '登出成功' } as UserLogoutResponseDto

	await next()
}

/**
 * 获取用于用户上传头像的预签名 URL, 上传限时 60 秒
 * @param ctx context
 * @param next context
 */
export const getUserAvatarUploadSignedUrlController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	ctx.body = await getUserAvatarUploadSignedUrlService(uid, token)
	await next()
}

/**
 * 在服务端或客户端获取用户个性设置数据用以正确渲染页面
 * @param ctx context
 * @param next context
 */
export const getUserSettingsController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<GetUserSettingsRequestDto>

	const uid = parseInt(ctx.cookies.get('uid'), 10) || data?.uid
	const token = ctx.cookies.get('token') || data?.token

	ctx.body = await getUserSettingsService(uid, token)
	await next()
}


/**
 * 更新或创建用户设置
 * @param ctx context
 * @param next context
 */
export const updateOrCreateUserSettingsController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UpdateOrCreateUserSettingsRequestDto>

	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	const updateOrCreateUserSettingsRequest: UpdateOrCreateUserSettingsRequestDto = {
		...data,
	}

	ctx.body = await updateOrCreateUserSettingsService(updateOrCreateUserSettingsRequest, uid, token)
	await next()
}

/**
 * 请求发送验证码，用于注册时验证用户邮箱
 * @param ctx context
 * @param next context
 */
export const requestSendVerificationCodeController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<RequestSendVerificationCodeRequestDto>

	const requestSendVerificationCodeRequest: RequestSendVerificationCodeRequestDto = {
		email: data.email || '',
		clientLanguage: data.clientLanguage,
	}

	ctx.body = await RequestSendVerificationCodeService(requestSendVerificationCodeRequest)
	await next()
}

/**
 * 生成邀请码
 * @param ctx context
 * @param next context
 */
export const createInvitationCodeController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	ctx.body = await createInvitationCodeService(uid, token)
	await next()
}

/**
 * 获取某位用户的所有的邀请码
 * @param ctx context
 * @param next context
 */
export const getMyInvitationCodeController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	ctx.body = await getMyInvitationCodeService(uid, token)
	await next()
}

/**
 * 获取用户注册时使用的邀请码
 * @param ctx context
 * @param next context
 */
export const getUserInvitationCodeController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	ctx.body = await getUserInvitationCodeService(uuid, token)
	await next()
}

/**
 * 检查一个邀请码是否可用
 * @param ctx context
 * @param next context
 */
export const checkInvitationCodeController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CheckInvitationCodeRequestDto>

	const checkInvitationCodeRequestDto: CheckInvitationCodeRequestDto = {
		invitationCode: data.invitationCode || '',
	}
	ctx.body = await checkInvitationCodeService(checkInvitationCodeRequestDto)
	await next()
}


/**
 * 请求发送验证码，用于修改邮箱
 * @param ctx context
 * @param next context
 */
export const requestSendChangeEmailVerificationCodeController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<RequestSendChangeEmailVerificationCodeRequestDto>

	const requestSendChangeEmailVerificationCodeRequest: RequestSendChangeEmailVerificationCodeRequestDto = {
		newEmail: data.newEmail,
		clientLanguage: data.clientLanguage,
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	ctx.body = await requestSendChangeEmailVerificationCodeService(requestSendChangeEmailVerificationCodeRequest, uid, token)
	await next()
}

/**
 * 请求发送验证码，用于修改密码
 * @param ctx context
 * @param next context
 */
export const requestSendChangePasswordVerificationCodeController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<RequestSendChangePasswordVerificationCodeRequestDto>

	const requestSendChangePasswordVerificationCodeRequest: RequestSendChangePasswordVerificationCodeRequestDto = {
		clientLanguage: data.clientLanguage,
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	ctx.body = await requestSendChangePasswordVerificationCodeService(requestSendChangePasswordVerificationCodeRequest, uid, token)
	await next()
}

/**
 * 更新用户密码
 * @param ctx context
 * @param next context
 * @return UpdateUserPasswordResponseDto 更新结果，如果更新成功则 success: true，不成功则 success: false
 */
export const updateUserPasswordController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UpdateUserPasswordRequestDto>
	const updateUserPasswordRequest: UpdateUserPasswordRequestDto = {
		oldPasswordHash: data?.oldPasswordHash ?? '',
		newPasswordHash: data?.newPasswordHash ?? '',
		verificationCode: data?.verificationCode ?? '',
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	const updateUserEmailResponse = await changePasswordService(updateUserPasswordRequest, uid, token)
	ctx.body = updateUserEmailResponse
	await next()
}

/**
 * 检查用户名是否可用
 * @param ctx context
 * @param next context
 * @return checkUsernameResponse 检查用户名是否可用的请求响应
 */
export const checkUsernameController = async (ctx: koaCtx, next: koaNext) => {
	const username = ctx.query.username as string
	const checkUsernameRequest: CheckUsernameRequestDto = {
		username,
	}

	const checkUsernameResponse = await checkUsernameService(checkUsernameRequest)
	ctx.body = checkUsernameResponse
	await next()
}

/**
 * 根据 UID 封禁一个用户
 * @param ctx context
 * @param next context
 * @return 封禁用户的请求响应
 */
export const blockUserByUIDController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<BlockUserByUIDRequestDto>
	const blockUserByUIDRequest: BlockUserByUIDRequestDto = {
		criminalUid: data.criminalUid ?? -1,
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	const blockUserByUIDResponse = await blockUserByUIDService(blockUserByUIDRequest, uid, token)
	ctx.body = blockUserByUIDResponse
	await next()
}

/**
 * 根据 UID 重新激活一个用户
 * @param ctx context
 * @param next context
 * @return 重新激活用户的请求响应
 */
export const reactivateUserByUIDController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<ReactivateUserByUIDRequestDto>
	const reactivateUserByUIDRequest: ReactivateUserByUIDRequestDto = {
		uid: data.uid ?? -1,
	}
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	const reactivateUserByUIDResponse = await reactivateUserByUIDService(reactivateUserByUIDRequest, uid, token)
	ctx.body = reactivateUserByUIDResponse
	await next()
}

/**
 * 获取所有被封禁用户的信息
 * @param ctx context
 * @param next context
 * @return 获取所有被封禁用户的信息的请求响应
 */
export const getBlockedUserController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')

	const reactivateUserByUIDResponse = await getBlockedUserService(uid, token)
	ctx.body = reactivateUserByUIDResponse
	await next()
}

/**
 * 管理员获取用户信息
 * @param ctx context
 * @param next context
 * @return 管理员获取用户信息的请求响应
 */
export const adminGetUserInfoController = async (ctx: koaCtx, next: koaNext) => {
	const adminUUID = ctx.cookies.get('uuid')
	const adminToken = ctx.cookies.get('token')

	const isOnlyShowUserInfoUpdatedAfterReviewString = ctx.query.isOnlyShowUserInfoUpdatedAfterReview as string
	const page = ctx.query.page as string
	const pageSize = ctx.query.pageSize as string

	const adminGetUserInfoRequest: AdminGetUserInfoRequestDto = {
		isOnlyShowUserInfoUpdatedAfterReview: typeof isOnlyShowUserInfoUpdatedAfterReviewString === 'string' && isOnlyShowUserInfoUpdatedAfterReviewString === 'true',
		pagination: {
			page: parseInt(page, 10) ?? 0,
			pageSize: parseInt(pageSize, 10) ?? Infinity,
		},
	}

	const adminGetUserInfoResponse = await adminGetUserInfoService(adminGetUserInfoRequest, adminUUID, adminToken)
	ctx.body = adminGetUserInfoResponse
	await next()
}

/**
 * 管理员通过用户信息审核
 * @param ctx context
 * @param next context
 * @return 管理员通过用户信息审核的请求响应
 */
export const approveUserInfoController = async (ctx: koaCtx, next: koaNext) => {
	const adminUUID = ctx.cookies.get('uuid')
	const adminToken = ctx.cookies.get('token')

	const data = ctx.request.body as Partial<ApproveUserInfoRequestDto>

	const approveUserInfoRequest: ApproveUserInfoRequestDto = {
		UUID: data.UUID ?? '',
	}

	const approveUserInfoResponse = await approveUserInfoService(approveUserInfoRequest, adminUUID, adminToken)
	ctx.body = approveUserInfoResponse
	await next()
}

/**
 * 管理员清空某个用户的信息
 * @param ctx context
 * @param next context
 * @return 管理员清空某个用户的信息的请求响应
 */
export const adminClearUserInfoController = async (ctx: koaCtx, next: koaNext) => {
	const adminUUID = ctx.cookies.get('uuid')
	const adminToken = ctx.cookies.get('token')

	const data = ctx.request.body as Partial<AdminClearUserInfoRequestDto>

	const adminClearUserInfoRequest: AdminClearUserInfoRequestDto = {
		uid: data.uid ?? -1,
	}

	const adminClearUserInfoResponse = await adminClearUserInfoService(adminClearUserInfoRequest, adminUUID, adminToken)
	ctx.body = adminClearUserInfoResponse
	await next()
}



