import { checkUserSettingsWithUuid, getUserSettingsByUUIDService, saveUserSettingsByUUIDService } from '../service/UserService'
import { koaCtx, koaNext } from '../type'
import { userSettingsType } from '../type/UserType'


/**
 * 存储用户设置
 * @param ctx koa ctx
 * @param next koa next
 */
export const saveUserSettingsByUUID = async (ctx: koaCtx, next: koaNext) => {
	const userSettingsWithUuid = ctx.request.body as userSettingsType
	if (checkUserSettingsWithUuid(userSettingsWithUuid)) {
		const uuid = userSettingsWithUuid.uuid as string
		
		const userSettings = userSettingsWithUuid as userSettingsType
		if (uuid && userSettings && typeof uuid === 'string') {
			saveUserSettingsByUUIDService(uuid, userSettings)
		} else {
			console.error('something error in function saveUserSettingsByUUID, required data uuid or userSettings is empty, or uuid not is string')
		}
	} else {
		console.error('something error in function saveUserSettingsByUUID, checkUserSettingsWithUuid(userSettingsWithUuid) return a false')
	}
	await next()
}

/**
 * 获取用户设置
 * @param ctx koa ctx
 * @param next koa next
 */
export const getUserSettingsByUUID = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.query.uuid as string
	if (uuid && typeof uuid === 'string') {
		ctx.body = getUserSettingsByUUIDService(uuid)
	} else {
		console.error('something error in function getUserSettingsByUUID, required data uuid is empty, or uuid not is string')
	}
	await next()
}


