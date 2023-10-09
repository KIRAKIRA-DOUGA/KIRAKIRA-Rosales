import { checkUserExistsCheckService, userLoginService, userRegistrationService } from '../service/UserService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { UserExistsCheckDataDto, UserLoginDataDto, UserRegistrationDataDto } from './UserControllerDto.js'

/**
 * 用户注册
 * @param koa context
 * @returns 用户注册的结果，如果注册成功会包含 token
 */
export const userRegistrationController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UserRegistrationDataDto>
	const userRegistrationData: UserRegistrationDataDto = {
		username: data?.username,
		passwordHash: data?.passwordHash,
		passwordHint: data?.passwordHint,
	}
	ctx.body = await userRegistrationService(userRegistrationData)
	await next()
}

/**
 * 用户登录
 * @param koa context
 * @returns 用户登录的结果，如果登录成功会包含 token
 */
export const userLoginController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UserLoginDataDto>
	const userRegistrationData: UserLoginDataDto = {
		username: data?.username,
		passwordHash: data?.passwordHash,
	}
	ctx.body = await userLoginService(userRegistrationData)
	await next()
}

/**
 * 检查一个用户是否存在
 * @param koa context
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


