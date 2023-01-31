import { checkOneTimeSecretKey } from '../service/AdminService'
import { koaCtx, koaNext } from '../type/index'
import { adminCheckStates } from '../type/AdminType'

let ONE_TIME_SECRET_KEY: string = process.env.ONE_TIME_SECRET_KEY

export const initKirakiraCluster = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	await next()

	const userSendSecretKey: string = ctx.query.oneTimeSecretKey as string
	const { state: state, callbackMessage: responseBody }: adminCheckStates = checkOneTimeSecretKey(ONE_TIME_SECRET_KEY, userSendSecretKey)
	if (state) {
		ONE_TIME_SECRET_KEY = undefined
	}
	ctx.body = responseBody
}
