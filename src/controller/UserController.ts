import { userRegistrationService } from '../service/UserService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { userRegistrationDataDto } from './UserControllerDto.js'

export const userRegistrationController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<userRegistrationDataDto>
	const userRegistrationData: userRegistrationDataDto = {
		userName: data?.userName,
		passwordHash: data?.passwordHash,
	}
	ctx.body = await userRegistrationService(userRegistrationData)
	await next()
}


