import { InferSchemaType, PipelineStage } from 'mongoose'
import { EmitDanmakuRequestDto, EmitDanmakuResponseDto, GetDanmakuByKvidDto, GetDanmakuByKvidRequestDto, GetDanmakuByKvidResponseDto, GetSelfDanmakuRequestDto, GetSelfDanmakuResponseDto } from '../controller/DanmakuControllerDto.js'
import { insertData2MongoDB, selectDataByAggregateFromMongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { DanmakuSchema } from '../dbPool/schema/DanmakuSchema.js'
import { checkUserTokenByUuidService, checkUserTokenService, getUserUid, getUserUuid } from './UserService.js'
import { buildBlockListMongooseFilter, checkIsBlockedByOtherUserService } from './BlockService.js'
import { checkVideoBlockedByKvidService, getVideoByKvidService } from './VideoService.js'

/**
 * 用户发送弹幕
 * @param emitDanmakuRequest 用户发送的弹幕数据
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户发送弹幕的结果
 */
export const emitDanmakuService = async (emitDanmakuRequest: EmitDanmakuRequestDto, uuid: string, token: string): Promise<EmitDanmakuResponseDto> => {
	try {
		if (!checkEmitDanmakuRequest(emitDanmakuRequest)) {
			console.error('ERROR', '弹幕发送失败，弹幕数据校验未通过：', { emitDanmakuRequest, uuid, token })
			return { success: false, message: '弹幕发送失败，弹幕数据错误' }
		}

		const { videoId } = emitDanmakuRequest
		const uid = await getUserUid(uuid)
		if (!uid) {
			console.error('ERROR', '弹幕发送失败，用户ID不存在', { emitDanmakuRequest, uuid, token })
			return { success: false, message: '弹幕发送失败，用户ID不存在' }
		}
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '弹幕发送失败，用户校验未通过', { emitDanmakuRequest, uuid, token })
			return { success: false, message: '弹幕发送失败，用户校验未通过' }
		}

		// 检查视频是否被屏蔽
		const selectorUuid = uuid
		const selectorToken = token
		const checkVideoBlockedResult = await checkVideoBlockedByKvidService(videoId, selectorUuid, selectorToken)
		if (!checkVideoBlockedResult.success) {
			console.error('ERROR', '弹幕发送失败，检查视频是否被屏蔽失败', { uid, token })
			return { success: false, message: '弹幕发送失败，检查视频是否被屏蔽失败' }
		}

		if (checkVideoBlockedResult.isBlockedByOther) {
			console.error('ERROR', '弹幕发送失败，用户被其他用户屏蔽', { uid, token })
			return { success: false, message: '弹幕发送失败，用户被其他用户屏蔽' }
		}
		if (checkVideoBlockedResult.isBlocked) {
			console.error('ERROR', '弹幕发送失败，用户已屏蔽上传者', { uid, token })
			return { success: false, message: '弹幕发送失败，用户已屏蔽上传者' }
		}

		const { collectionName, schemaInstance } = DanmakuSchema
		type Danmaku = InferSchemaType<typeof schemaInstance>
		const nowDate = new Date().getTime()
		const danmaku: Danmaku = {
			UUID: uuid,
			uid,
			...emitDanmakuRequest,
			userDeletedFlag: false,
			adminDeletedFlag: false,
			pendingReview: false,
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

	} catch (error) {
		console.error('ERROR', '弹幕发送失败，错误信息：', error, { emitDanmakuRequest, uuid, token })
		return { success: false, message: '弹幕发送失败，未知原因' }
	}
}

/**
 * 根据 kvid 获取视频弹幕列表
 * @param getDanmakuByKvidRequest 请求弹幕列表的查询参数
 * @returns 视频的弹幕列表
 */
export const getDanmakuListByKvidService = async (getDanmakuByKvidRequest: GetDanmakuByKvidRequestDto, uuid?: string, token?: string): Promise<GetDanmakuByKvidResponseDto> => {
	try {
		if (!checkGetDanmakuByKvidRequest(getDanmakuByKvidRequest)) {
			console.error('ERROR', '获取弹幕列表失败，数据校验失败', getDanmakuByKvidRequest)
			return { success: false, message: '获取弹幕列表失败，数据校验失败' }
		}

		const { videoId } = getDanmakuByKvidRequest
		const { collectionName, schemaInstance } = DanmakuSchema
		type Danmaku = InferSchemaType<typeof schemaInstance>

		try {
			const blockListFilter = await buildBlockListMongooseFilter(
				[
					{
						attr: 'UUID',
						category: 'block-uuid',
					},
					{
						attr: 'UUID',
						category: 'hide-uuid',
					},
					{
						attr: 'text',
						category: 'keyword',
					},
					{
						attr: 'text',
						category: 'regex',
					},
				],
				uuid,
				token
			)

			const getDanmakuPipeline: PipelineStage[] = [
				{
					$match: {
						videoId,
						userDeletedFlag: { $ne: true },
						adminDeletedFlag: { $ne: true },
						pendingReview: { $ne: true },
					}
				},
				...blockListFilter.filter,
				{
					$sort: {
						editDateTime: 1, // 按 editDateTime 升序排序
					},
				},
				{
					$project: {
						videoId: 1,
						UUID: 1,
						uid: 1,
						time: 1,
						text: 1,
						color: 1,
						fontSize: 1,
						mode: 1,
						enableRainbow: 1,
						editDateTime: 1,
						...blockListFilter.additionalFields, // 黑名单过滤器的额外字段
					}
				}
			]

			const danmakuResult = await selectDataByAggregateFromMongoDB<Danmaku>(schemaInstance, collectionName, getDanmakuPipeline)

			if (!danmakuResult.success) {
				console.error('ERROR', '获取弹幕列表失败，查询失败或结果为空：', getDanmakuByKvidRequest)
				return { success: false, message: '获取弹幕列表失败，查询失败' }
			}

			const danmakuList = danmakuResult.result?.map(danmaku => {
				const fontSize = ['small', 'medium', 'large'].includes(danmaku.fontSize) ? danmaku.fontSize : 'medium'
				return { ...danmaku, uuid: danmaku.UUID, fontSize } as GetDanmakuByKvidDto
			})

			if (danmakuList && danmakuList.length > 0) {
				return { success: true, message: '获取弹幕列表成功', danmaku: danmakuList }
			} else {
				return { success: true, message: '弹幕列表为空', danmaku: [] }
			}
		} catch (error) {
			console.error('ERROR', '获取弹幕列表失败，查询失败：', error, getDanmakuByKvidRequest)
			return { success: false, message: '获取弹幕列表失败，查询失败' }
		}
	} catch (error) {
		console.error('ERROR', '获取弹幕列表失败，错误信息：', error, getDanmakuByKvidRequest)
		return { success: false, message: '获取弹幕列表失败，未知原因' }
	}
}

/**
 * 获取本人已发布的弹幕（包含管理员删除或待审核，排除用户自行删除）
 */
export const getSelfDanmakuListService = async (getSelfDanmakuRequest: GetSelfDanmakuRequestDto, uuid: string, token: string): Promise<GetSelfDanmakuResponseDto> => {
	try {
		if (!uuid || !token) {
			return { success: false, message: '获取弹幕失败，缺少鉴权信息', danmakuCount: 0, danmaku: [] }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			return { success: false, message: '获取弹幕失败，用户校验未通过', danmakuCount: 0, danmaku: [] }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			return { success: false, message: '获取弹幕失败，用户 UID 不存在', danmakuCount: 0, danmaku: [] }
		}

		const page = getSelfDanmakuRequest.page ?? 1
		const pageSize = getSelfDanmakuRequest.pageSize ?? 50
		const skip = page > 0 && pageSize > 0 ? (page - 1) * pageSize : 0
		const limitStage = page > 0 && pageSize > 0 ? [{ $limit: pageSize }] : []

		const { collectionName, schemaInstance } = DanmakuSchema
		type Danmaku = InferSchemaType<typeof schemaInstance>

		const matchStage: PipelineStage = {
			$match: {
				uid,
				userDeletedFlag: { $ne: true }, // 用户自行删除的不返回
			},
		}

		const projectStage: PipelineStage = {
			$project: {
				videoId: 1,
				UUID: 1,
				uid: 1,
				time: 1,
				text: 1,
				color: 1,
				fontSize: 1,
				mode: 1,
				enableRainbow: 1,
				editDateTime: 1,
				userDeletedFlag: 1,
				adminDeletedFlag: 1,
				pendingReview: 1,
			},
		}

		const sortStage: PipelineStage = { $sort: { editDateTime: -1 } }
		const skipStage: PipelineStage = { $skip: skip }

		const listPipeline: PipelineStage[] = [
			matchStage,
			sortStage,
			skipStage,
			...limitStage,
			projectStage,
		]

		const countPipeline: PipelineStage[] = [
			matchStage,
			{ $count: 'totalCount' },
		]

		const countResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, countPipeline)
		const listResult = await selectDataByAggregateFromMongoDB(schemaInstance, collectionName, listPipeline)

		if (!countResult.success || !listResult.success) {
			return { success: false, message: '获取弹幕失败，查询失败', danmakuCount: 0, danmaku: [] }
		}

		const total = countResult.result?.[0]?.totalCount ?? 0
		const list = (listResult.result as unknown as GetDanmakuByKvidDto[]) ?? []

		return { success: true, message: '获取本人弹幕成功', danmakuCount: total, danmaku: list }
	} catch (error) {
		console.error('ERROR', '获取本人弹幕失败：', error, { getSelfDanmakuRequest, uuid })
		return { success: false, message: '获取本人弹幕失败，未知错误', danmakuCount: 0, danmaku: [] }
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
	if (!emitDanmakuRequest.fontSize || !(['small', 'medium', 'large'].includes(emitDanmakuRequest.fontSize))) {
		console.error('ERROR', '发送弹幕出错，弹幕数据非法：字体大小为空或格式错误', emitDanmakuRequest)
		return false
	}
	if (!emitDanmakuRequest.mode || !(['ltr', 'rtl', 'top', 'bottom'].includes(emitDanmakuRequest.mode))) {
		console.error('ERROR', '发送弹幕出错，弹幕数据非法：弹幕模式为空或格式错误', emitDanmakuRequest)
		return false
	}
	if (!emitDanmakuRequest.text || emitDanmakuRequest.time === undefined || emitDanmakuRequest.time === null || !emitDanmakuRequest.videoId) {
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
