import type { CheckUserRbacParams } from '../controller/RbacControllerDto.js'
import { checkUserByRbac } from '../service/RbacService.js'
import { logging } from '../service/loggingService.js'
import type { koaCtx } from '../type/koaTypes.js'

/**
 * 检查当前请求的访问权限。拒绝请求时写入 HTTP 状态码和响应消息。
 * @param params 要检查的用户和请求路径
 * @param ctx 当前请求的 Koa 上下文
 * @returns 当前请求能否继续执行业务
 */
export const isPassRbacCheck = async (params: CheckUserRbacParams, ctx: koaCtx): Promise<boolean> => {
	try {
		const rbacCheckResult = await checkUserByRbac(params)
		const { status: rbacStatus, message: rbacMessage } = rbacCheckResult
		if (rbacStatus !== 200) {
			ctx.status = rbacStatus
			ctx.body = rbacMessage
			logging('WARN', `RBAC - ${rbacStatus} - ${rbacMessage}`)
			return false
		}

		return true
	} catch (error) {
		logging('ERROR', '在 Controller 层执行 RBAC 鉴权时出现错误，未知错误：', error)
		ctx.status = 500
		ctx.body = '在 Controller 层执行 RBAC 鉴权时出现错误，未知错误'
		return false
	}
}
