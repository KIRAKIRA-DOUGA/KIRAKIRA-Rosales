import { userSettingsType } from '../type/UserTypes.js'
import { saveData2CorrectMongoDBShardByUnionPrimaryKeyRoute, getData2CorrectMongoDBShardByUnionPrimaryKeyRoute, updateData2CorrectMongoDBShardByUnionPrimaryKeyRoute } from '../common/DbPool.js'
import { mongoDbUpdateResultType } from '../type/AdminTypes.js'

/**
 * 存储用户设置
 *
 * @param userSettings 用户设置
 * @returns boolean 成功返回 true, 失败返回 false
 */
export const saveUserSettingsService = async (userSettings: userSettingsType): Promise<boolean> => {
	try {
		const serviceCollectionName: string = 'user-settings'
		const userSettingsSchema = {
			uuid: String,
			systemStyle: String,
			systemColor: String,
			backgroundAnimation: Boolean,
			settingPageLastEnter: String,
		}
		const primaryKey = 'uuid'
		return await saveData2CorrectMongoDBShardByUnionPrimaryKeyRoute<typeof userSettingsSchema>(serviceCollectionName, userSettingsSchema, userSettings, primaryKey)
	} catch (e) {
		console.error('something error in function saveUserSettingsByUUIDService', e)
	}
}

/**
 * 获取用户设置
 *
 * @param uuid 用户 id
 * @returns unknown 用户设置
 */
export const getUserSettingsByUUIDService = async (uuid: string): Promise<unknown> => {
	try {
		const serviceCollectionName: string = 'user-settings'
		const userSettingsSchema = {
			uuid: String,
			systemStyle: String,
			systemColor: String,
			backgroundAnimation: Boolean,
			settingPageLastEnter: String,
		}
		const userSettingsConditions = {
			uuid,
		}
		const primaryKey = 'uuid'

		return await getData2CorrectMongoDBShardByUnionPrimaryKeyRoute<typeof userSettingsSchema>(serviceCollectionName, userSettingsSchema, userSettingsConditions, primaryKey)
	} catch {
		return {}
	}
}

/**
 * 检查用户设置字段和 uuid 是否正确
 *
 * @param userSettingsWithUuid 用户设置字段和 uuid
 * @returns boolean 正确 true, 错误 false
 */
export const checkUserSettingsWithUuid = (userSettingsWithUuid: userSettingsType): boolean => {
	if (userSettingsWithUuid && userSettingsWithUuid.uuid) {
		return true
	} else {
		return false
	}
}

/**
 * 更新用户设置
 *
 * @param userSettings 用户设置
 * @returns
 */
export const updateUserSettingsByUUIDService = async (userSettings: userSettingsType): Promise<mongoDbUpdateResultType> => {
	try {
		const serviceCollectionName: string = 'user-settings'
		const userSettingsSchema = {
			uuid: String,
			systemStyle: String,
			systemColor: String,
			backgroundAnimation: Boolean,
			settingPageLastEnter: String,
		}
		const conditions = { uuid: userSettings.uuid }
		const primaryKey = 'uuid'
		return await updateData2CorrectMongoDBShardByUnionPrimaryKeyRoute<typeof userSettingsSchema>(serviceCollectionName, userSettingsSchema, conditions, primaryKey, userSettings)
	} catch (e) {
		console.error('something error in function saveUserSettingsByUUIDService', e)
	}
}
