import { InferSchemaType } from 'mongoose'
import { EmitDanmakuRequestDto, EmitDanmakuResponseDto, GetDanmakuByKvidRequestDto, GetDanmakuByKvidResponseDto } from '../controller/DanmakuControllerDto.js'
import { insertData2MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { DanmakuSchema } from '../dbPool/schema/DanmakuSchema.js'
import { checkUserRoleService, checkUserTokenService, getUserUuid } from './UserService.js'

/**
 * 用户发送弹幕
 * @param emitDanmakuRequest 用户发送的弹幕数据
 * @param uid cookie 中的用户 ID
 * @param token cookie 中的用户 token
 * @returns 用户发送弹幕的结果
 */
export const emitDanmakuService = async (emitDanmakuRequest: EmitDanmakuRequestDto, uid: number, token: string): Promise<EmitDanmakuResponseDto> => {
	try {
		if (checkEmitDanmakuRequest(emitDanmakuRequest)) {
			if ((await checkUserTokenService(uid, token)).success) {
				const UUID = await getUserUuid(uid) // DELETE ME 这是一个临时解决方法，Cookie 中应当存储 UUID
				if (!UUID) {
					console.error('ERROR', '发送弹幕失败，UUID 不存在', { uid })
					return { success: false, message: '发送弹幕失败，UUID 不存在' }
				}

				if (await checkUserRoleService(uid, 'blocked')) {
					console.error('ERROR', '弹幕发送失败，用户已封禁')
					return { success: false, message: '弹幕发送失败，用户已封禁' }
				}

				const { collectionName, schemaInstance } = DanmakuSchema
				type Danmaku = InferSchemaType<typeof schemaInstance>
				const nowDate = new Date().getTime()
				const danmaku: Danmaku = {
					UUID,
					uid,
					...emitDanmakuRequest,
					editDateTime: nowDate,
				}
				try {
					const insertData2MongoDBResult = await insertData2MongoDB(danmaku, schemaInstance, collectionName)
					if (insertData2MongoDBResult && insertData2MongoDBResult.success) {
						return { success: true, message: '弹幕发送成功！', danmaku: emitDanmakuRequest }
					}
				} catch (error) {
					console.error('ERROR', '弹幕发送失败，无法存储到 MongoDB', error)
					return { success: false, message: '弹幕发送失败，存储弹幕数据失败' }
				}
			} else {
				console.error('ERROR', '弹幕发送失败，用户校验未通过', { emitDanmakuRequest, uid, token })
				return { success: false, message: '弹幕发送失败，用户校验未通过' }
			}
		} else {
			console.error('ERROR', '弹幕发送失败，弹幕数据校验未通过：', { emitDanmakuRequest, uid, token })
			return { success: false, message: '弹幕发送失败，弹幕数据错误' }
		}
	} catch (error) {
		console.error('ERROR', '弹幕发送失败，错误信息：', error, { emitDanmakuRequest, uid, token })
		return { success: false, message: '弹幕发送失败，未知原因' }
	}
}

/**
 * 根据 kvid 获取视频弹幕列表
 * @param getDanmakuByKvidRequest 请求弹幕列表的查询参数
 * @returns 视频的弹幕列表
 */
export const getDanmakuListByKvidService = async (getDanmakuByKvidRequest: GetDanmakuByKvidRequestDto): Promise<GetDanmakuByKvidResponseDto> => {
	try {
		if (checkGetDanmakuByKvidRequest(getDanmakuByKvidRequest)) {
			const { collectionName, schemaInstance } = DanmakuSchema
			type Danmaku = InferSchemaType<typeof schemaInstance>
			const where: QueryType<Danmaku> = {
				videoId: getDanmakuByKvidRequest.videoId,
			}

			const select: SelectType<Danmaku> = {
				videoId: 1,
				uuid: 1,
				time: 1,
				text: 1,
				color: 1,
				fontSIze: 1,
				mode: 1,
				enableRainbow: 1,
				editDateTime: 1,
			}

			try {
				const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
				const danmakuList = result.result
				if (result.success) {
					if (danmakuList && danmakuList.length > 0) {
						return { success: true, message: '获取弹幕列表成功', danmaku: danmakuList }
					} else {
						return { success: true, message: '弹幕列表为空', danmaku: [] }
					}
				} else {
					console.error('ERROR', '获取弹幕列表失败，查询失败或结果为空：', getDanmakuByKvidRequest)
					return { success: false, message: '获取弹幕列表失败，查询失败' }
				}
			} catch (error) {
				console.error('ERROR', '获取弹幕列表失败，查询失败：', error, getDanmakuByKvidRequest)
				return { success: false, message: '获取弹幕列表失败，查询失败' }
			}
		} else {
			console.error('ERROR', '获取弹幕列表失败，数据校验失败', getDanmakuByKvidRequest)
			return { success: false, message: '获取弹幕列表失败，数据校验失败' }
		}
	} catch (error) {
		console.error('ERROR', '获取弹幕列表失败，错误信息：', error, getDanmakuByKvidRequest)
		return { success: false, message: '获取弹幕列表失败，未知原因' }
	}
}

/**
 * 校验用户发送的弹幕的请求载荷
 * @param emitDanmakuRequest 用户发送的弹幕数据
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkEmitDanmakuRequest = (emitDanmakuRequest: EmitDanmakuRequestDto): boolean => {
	const hexColorRegex = /^([0-9A-F]{3}([0-9A-F]{1})?|[0-9A-F]{6}([0-9A-F]{2})?)$/i
	if (!emitDanmakuRequest.color || !(hexColorRegex.test(emitDanmakuRequest.color))) {
		console.error('ERROR', '发送弹幕出错，弹幕数据非法：颜色为空或格式错误', emitDanmakuRequest)
		return false
	}
	if (emitDanmakuRequest.enableRainbow === undefined || emitDanmakuRequest.enableRainbow === null) {
		console.error('ERROR', '发送弹幕出错，弹幕数据非法：是否启用彩虹弹幕为空或格式错误', emitDanmakuRequest)
		return false
	}
	if (!emitDanmakuRequest.fontSIze || !(['small', 'medium', 'large'].includes(emitDanmakuRequest.fontSIze))) {
		console.error('ERROR', '发送弹幕出错，弹幕数据非法：字体大小为空或格式错误', emitDanmakuRequest)
		return false
	}
	if (!emitDanmakuRequest.mode || !(['ltr', 'rtl', 'top', 'bottom'].includes(emitDanmakuRequest.mode))) {
		console.error('ERROR', '发送弹幕出错，弹幕数据非法：弹幕模式为空或格式错误', emitDanmakuRequest)
		return false
	}
	if (!emitDanmakuRequest.text || !emitDanmakuRequest.time || !emitDanmakuRequest.videoId) {
		console.error('ERROR', '发送弹幕出错，弹幕数据非法：必要的请求参数为空或格式错误', emitDanmakuRequest)
		return false
	}

	return true
}

/**
 * 校验获取弹幕列表的请求载荷
 * @param getDanmakuByKvidRequest 用户请求弹幕列表的请求载荷
 * @returns 校验结果，合法返回 true，不合法返回 false
 */
const checkGetDanmakuByKvidRequest = (getDanmakuByKvidRequest: GetDanmakuByKvidRequestDto): boolean => {
	// TODO 可能需要增加增加更多验证用来判断当前视频是否是一个已经存在的视频
	return (getDanmakuByKvidRequest.videoId !== undefined && getDanmakuByKvidRequest.videoId !== null)
}
