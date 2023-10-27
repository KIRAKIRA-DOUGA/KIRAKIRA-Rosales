import { checkUserExistsCheckService, userLoginService, userRegistrationService } from '../service/UserService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { UserExistsCheckDataDto, UserLoginDataDto, UserRegistrationDataDto } from './UserControllerDto.js'

/**
 * 用户注册
 * @param ctx context
 * @param next context
 * @returns 用户注册的结果，如果注册成功会包含 token
 */
export const userRegistrationController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UserRegistrationDataDto>
	const userRegistrationData: UserRegistrationDataDto = {
		username: data?.username,
		passwordHash: data?.passwordHash,
		passwordHint: data?.passwordHint,
	}
	const userRegistrationResult = await userRegistrationService(userRegistrationData)
	
	const cookieOption = {
		httpOnly: true, // 仅 HTTP 访问，浏览器中的 Js 无法访问。
		secure: true,
		sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
		maxAge: 1000 * 60 * 60 * 24 * 365, // 设置有效期为 1 年
		// domain: 'yourdomain.com'   // TODO 如果你在生产环境，可以设置 domain
	}
	ctx.cookies.set('token', userRegistrationResult.token, cookieOption)
	ctx.cookies.set('username', data?.username, cookieOption)
	ctx.cookies.set('uid', `${userRegistrationResult.uid}`, cookieOption)
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
	const data = ctx.request.body as Partial<UserLoginDataDto>
	const userRegistrationData: UserLoginDataDto = {
		username: data?.username,
		passwordHash: data?.passwordHash,
	}
	const userLoginResult = await userLoginService(userRegistrationData)

	const cookieOption = {
		httpOnly: true, // 仅 HTTP 访问，浏览器中的 Js 无法访问。
		secure: true,
		sameSite: 'strict' as boolean | 'none' | 'strict' | 'lax',
		maxAge: 1000 * 60 * 60 * 24 * 365, // 设置有效期为 1 年
		// domain: 'yourdomain.com'   // TODO 如果你在生产环境，可以设置 domain
	}
	ctx.cookies.set('token', userLoginResult.token, cookieOption)
	ctx.cookies.set('username', userLoginResult.username, cookieOption)
	ctx.cookies.set('uid', `${userLoginResult.uid}`, cookieOption)
	ctx.body = userLoginResult
	await next()
}

/**
 * 检查一个用户是否存在
 * @param ctx context
 * @param next context
 * @return checkUserExistsCheckResultDto 检查结果，如果存在或查询失败则 exists: true
 */
export const checkUserExistsCheckController = async (ctx: koaCtx, next: koaNext) => {
	const username = ctx.query.username as string
	const userExistsCheckData: UserExistsCheckDataDto = {
		username: username ? username : '',
	}
	ctx.body = await checkUserExistsCheckService(userExistsCheckData)
	await next()
}


