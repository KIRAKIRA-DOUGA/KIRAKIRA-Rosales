import { userAuthDataType, userLoginDataType, userSettingsType } from '../type/UserTypes.js'
import { saveData2CorrectMongoDBShardByUnionPrimaryKeyRoute, getDataFromCorrectMongoDBShardByUnionPrimaryKeyRoute, updateData2CorrectMongoDBShardByUnionPrimaryKeyRoute, saveData2MongoDBShard } from '../common/DbPool.js'
import { mongoDBConnectType, mongoDbUpdateResultType } from '../type/AdminTypes.js'
import { generateSaltedHash, hashData } from '../common/HashTool.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { GlobalSingleton } from '../store/index.js'

const globalSingleton = GlobalSingleton.getInstance()

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

		return await getDataFromCorrectMongoDBShardByUnionPrimaryKeyRoute<typeof userSettingsSchema>(serviceCollectionName, userSettingsSchema, userSettingsConditions, primaryKey)
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


export const userRegistrationService = async (userLoginData: userLoginDataType): Promise<string> => {
	try {
		if (checkUserLoginData(userLoginData)) {
			const passwordHashHash = await hashPassword(userLoginData)
				.catch(e => {
					console.error('something error in function userRegistrationService -> hashPassword', e)
				})
			const token = generateSecureRandomString(64)
			const mongoDBShardConnectList = globalSingleton.getVariable<mongoDBConnectType[]>('__MONGO_DB_SHARD_CONNECT_LIST__') // 拿到全部 MongoDB 数据持久化数据库分片的库连接
	
			if (passwordHashHash && token && mongoDBShardConnectList) {
				const serviceCollectionName: string = 'user-auth'
				const userAuthDataSchema = {
					userName: String,
					passwordHashHash: String,
					token: String,
					editDateTime: Number,
				}
				const userAuthData: userAuthDataType = {
					userName: userLoginData.userName,
					passwordHashHash,
					token,
					editDateTime: new Date().getTime(),
				}
				const saveUserAuthDataStatus = await saveData2MongoDBShard<typeof userAuthDataSchema>(mongoDBShardConnectList, serviceCollectionName, userAuthDataSchema, userAuthData) // 向 所有心跳数据库的 service 集合广播 本机 API server 信息
					.catch(e => {
						console.error('something error in function userRegistrationService -> saveData2MongoDBShard', e)
					})
				if (saveUserAuthDataStatus)
					return token
				else {
					console.error('something error in function userRegistrationService, Registration failed')
					return ''
				}
			} else {
				console.error('something error in function userRegistrationService, required data passwordHashHash && token && mongoDBShardConnectList is empty')
				return ''
			}
		} else {
			console.error('something error in function userRegistrationService, checkUserLoginData result is false')
			return ''
		}
	} catch (e) {
		console.error('something error in function userRegistrationService', e)
		return ''
	}
}

const hashPassword = async (userLoginData: userLoginDataType): Promise<string> => {
	try {
		if (checkUserLoginData(userLoginData)) {
			const salt = generateSecureRandomString(32)
			if (salt) {
				const saltHash = await generateSaltedHash(salt, userLoginData.passwordHash)
					.catch(e => {
						console.error('something error in function hashPassword -> generateSaltedHash-1', e)
					})
				if (saltHash) {
					const finalSalt = `${userLoginData.userName}-${userLoginData.passwordHash}-${saltHash}`
					if (finalSalt) {
						const passwordHashHash = await generateSaltedHash(userLoginData.passwordHash, finalSalt)
							.catch(e => {
								console.error('something error in function hashPassword -> generateSaltedHash-2', e)
							})
						if (passwordHashHash) {
							return passwordHashHash
						} else {
							console.error('something error in function hashPassword, required data passwordHashHash is empty')
							return ''
						}
					} else {
						console.error('something error in function hashPassword, required data finalSalt is empty')
						return ''
					}
				} else {
					console.error('something error in function hashPassword, required data saltHash is empty')
					return ''
				}
			} else {
				console.error('something error in function hashPassword, required data salt is empty')
				return ''
			}
		} else {
			console.error('something error in function hashPassword, checkUserLoginData result is false')
			return ''
		}
	} catch (e) {
		console.error('something error in function hashPassword', e)
		return ''
	}
}


/**
 * 非空验证
 * 
 * @param userLoginData 
 * @returns 
 */
export const checkUserLoginData = (userLoginData: userLoginDataType): boolean => {
	return (!!userLoginData.passwordHash && !!userLoginData.userName)
}