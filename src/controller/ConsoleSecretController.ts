import { getStgEnvBackEndSecretService } from '../service/ConsoleSecretService.js'
import { isPassRbacCheck } from '../service/RbacService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'

/**
 * 获取预生产环境后端环境变量机密
 * @param ctx context
 * @param next context
 */
export const getStgEnvBackEndSecretController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const getStgEnvBackEndSecretResponse = await getStgEnvBackEndSecretService(uuid, token)
	ctx.body = getStgEnvBackEndSecretResponse
	await next()
}
