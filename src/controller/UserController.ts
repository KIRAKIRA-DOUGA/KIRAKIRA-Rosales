import { checkUserSettingsWithUuid, getUserSettingsByUUIDService, saveUserSettingsService, updateUserSettingsByUUIDService } from '../service/UserService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { userSettingsType } from '../type/UserTypes.js'


/**
 * 存储用户设置
 *
 * @param ctx koa ctx
 * @param next koa next
 */
export const saveUserSettingsByUUID = async (ctx: koaCtx, next: koaNext) => {
	const userSettingsWithUuid = ctx.request.body as userSettingsType
	if (checkUserSettingsWithUuid(userSettingsWithUuid)) {
		const userSettings = userSettingsWithUuid as userSettingsType
		if (userSettings) {
			const saveUserSettingsResult = await saveUserSettingsService(userSettings)
			if (saveUserSettingsResult) {
				ctx.body = saveUserSettingsResult
			}
		} else {
			console.error('something error in function saveUserSettingsByUUID, required data userSettings is empty, or uuid not is string')
			ctx.body = '<p>something error in function saveUserSettingsByUUID, required data userSettings is empty, or uuid not is string</p>'
		}
	} else {
		console.error('something error in function saveUserSettingsByUUID, checkUserSettingsWithUuid(userSettingsWithUuid) return a false')
		ctx.body = '<p>something error in function saveUserSettingsByUUID, checkUserSettingsWithUuid(userSettingsWithUuid) return a false'
	}
	await next()
}

/**
 * 获取用户设置
 *
 * @param ctx koa ctx
 * @param next koa next
 */
export const getUserSettingsByUUID = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.query.uuid as string
	if (uuid && typeof uuid === 'string') {
		ctx.body = await getUserSettingsByUUIDService(uuid)
	} else {
		console.error('something error in function getUserSettingsByUUID, required data uuid is empty, or uuid not is string')
	}
	await next()
}

/**
 * 存储用户设置
 *
 * @param ctx koa ctx
 * @param next koa next
 */
export const updateUserSettingsByUUID = async (ctx: koaCtx, next: koaNext) => {
	const userSettingsWithUuid = ctx.request.body as userSettingsType
	if (checkUserSettingsWithUuid(userSettingsWithUuid)) {
		const userSettings = userSettingsWithUuid as userSettingsType
		if (userSettings) {
			const updateResult = updateUserSettingsByUUIDService(userSettings)
			ctx.body = updateResult
		} else {
			console.error('something error in function updateUserSettingsByUUID, required data userSettings is empty, or uuid not is string')
			ctx.body = '<p>something error in function updateUserSettingsByUUID, required data userSettings is empty, or uuid not is string</p>'
		}
	} else {
		console.error('something error in function updateUserSettingsByUUID, checkUserSettingsWithUuid(userSettingsWithUuid) return a false')
		ctx.body = '<p>something error in function updateUserSettingsByUUID, checkUserSettingsWithUuid(userSettingsWithUuid) return a false</p>'
	}
	await next()
}


// /02/koa/user/settings/userSettings/update


