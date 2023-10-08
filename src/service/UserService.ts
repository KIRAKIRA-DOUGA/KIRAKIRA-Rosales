import { InferSchemaType, Schema } from 'mongoose'
import { generateSaltedHash } from '../common/HashTool.js'
import { generateSecureRandomString } from '../common/RandomTool.js'
import { userRegistrationDataDto, userRegistrationResultDto } from '../controller/UserControllerDto.js'
import { insertData2MongoDB } from '../dbPool/DbClusterPool.js'
import UserSchema from '../dbPool/schema/UserSchema.js'

export const userRegistrationService = async (userRegistrationData: userRegistrationDataDto): Promise<userRegistrationResultDto> => {
	try {
		if (checkUserLoginData(userRegistrationData)) {
			const passwordHashHash = await hashPassword(userRegistrationData)
			const token = generateSecureRandomString(64)
			if (passwordHashHash && token) {
				const { collectionName, schema: userSchema } = UserSchema
				const schema = new Schema(userSchema)
				type User = InferSchemaType<typeof schema>
				const user: User = {
					userName: userRegistrationData.userName,
					passwordHashHash,
					token,
					editDateTime: new Date().getTime(),
				}

				try {
					await insertData2MongoDB(user, schema, collectionName)
				} catch (error) {
					console.error('ERROR', '用户注册失败：向 MongoDB 插入数据时出现异常：', error)
					return { success: false, message: '用户注册失败：无法保存用户资料' }
				}

				return { success: true, token, message: '用户注册成功' }
			} else {
				console.error('ERROR', '用户注册失败：passwordHashHash 或 token 可能为空')
				return { success: false, message: '用户注册失败：生成账户资料时失败' }
			}
		} else {
			console.error('ERROR', '用户注册失败：userRegistrationData 的非空验证没有通过')
			return { success: false, message: '用户注册失败：非空验证没有通过' }
		}
	} catch (error) {
		console.error('userRegistrationService 函数中出现异常', error)
		return { success: false, message: '用户注册失败：程序异常终止' }
	}
}


/**
 * 非空验证
 *
 * @param userRegistrationData
 * @returns
 */
const checkUserLoginData = (userRegistrationData: userRegistrationDataDto): boolean => {
	return (!!userRegistrationData.passwordHash && !!userRegistrationData.userName)
}

/**
 * 二次 Hash 密码，让用户密码可以安全存储在 DB 中
 *
 * @param userRegistrationData
 * @returns
 */
const hashPassword = async (userRegistrationData: userRegistrationDataDto): Promise<string> => {
	try {
		if (checkUserLoginData(userRegistrationData)) {
			const salt = generateSecureRandomString(32)
			const userName = userRegistrationData.userName
			const passwordHash = userRegistrationData.passwordHash
			if (salt) {
				const saltHash = await generateSaltedHash(salt, passwordHash)
					.catch(e => {
						console.error('something error in function hashPassword -> generateSaltedHash-1', e)
					})
				if (saltHash) {
					const finalSalt = `${userName}-${passwordHash}-${saltHash}`
					if (finalSalt) {
						const passwordHashHash = await generateSaltedHash(passwordHash, finalSalt)
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
