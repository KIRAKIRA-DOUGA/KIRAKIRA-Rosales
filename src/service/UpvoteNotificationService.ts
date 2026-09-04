import { InferSchemaType, PipelineStage, Types } from 'mongoose'
import { QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { insertData2MongoDB, selectDataByAggregateFromMongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { BlockListSchema } from '../dbPool/schema/BlockSchema.js'
import { UpvoteNotificationSchema } from '../dbPool/schema/UpvoteNotificationSchema.js'
import {
	GetUnreadUpvoteNotificationCountRequestDto,
	GetUnreadUpvoteNotificationCountResponseDto,
	GetUpvoteNotificationListRequestDto,
	GetUpvoteNotificationListResponseDto,
	MarkAllUpvoteNotificationReadRequestDto,
	MarkAllUpvoteNotificationReadResponseDto,
	MarkUpvoteNotificationReadByIdsRequestDto,
	MarkUpvoteNotificationReadByIdsResponseDto,
	UpvoteNotificationCategory,
	UpvoteNotificationItemDto,
} from '../controller/UpvoteNotificationControllerDto.js'
import { logging } from './loggingService.js'
import { checkUserTokenByUuidService } from './UserService.js'

type UpvoteNotification = InferSchemaType<typeof UpvoteNotificationSchema.schemaInstance> & { _id?: string }

/**
 * 创建或恢复一条点赞通知（自赞不建；恢复时不改 isRead）
 */
export const createOrRestoreUpvoteNotificationService = async (params: {
	receiverUuid: string;
	receiverUid: number;
	likerUuid: string;
	likerUid: number;
	category: UpvoteNotificationCategory;
	videoId: number;
	commentId?: string;
}): Promise<{ success: boolean; message: string }> => {
	try {
		const { receiverUuid, receiverUid, likerUuid, likerUid, category, videoId, commentId } = params

		if (!receiverUuid || !likerUuid || !category || !(videoId >= 0) || !(receiverUid >= 0) || !(likerUid >= 0)) {
			return { success: false, message: '创建点赞通知失败，参数异常' }
		}

		// 自赞不建（按接收者比）
		if (receiverUuid === likerUuid) {
			return { success: true, message: '自赞不创建点赞通知' }
		}

		if (category === 'video_comment' && !commentId) {
			return { success: false, message: '创建点赞通知失败，评论赞缺少 commentId' }
		}

		const targetId = category === 'video' ? String(videoId) : String(commentId)
		const now = Date.now()
		const { collectionName, schemaInstance } = UpvoteNotificationSchema

		const existingWhere: QueryType<UpvoteNotification> = {
			receiverUuid,
			likerUuid,
			category,
			targetId,
		}
		const existingSelect: SelectType<UpvoteNotification> = {
			receiverUuid: 1,
			deletedFlag: 1,
			isRead: 1,
		}
		const existingResult = await selectDataFromMongoDB<UpvoteNotification>(existingWhere, existingSelect, schemaInstance, collectionName)

		if (existingResult.success && existingResult.result && existingResult.result.length > 0) {
			const existing = existingResult.result[0]
			const updateWhere: QueryType<UpvoteNotification> = { _id: existing._id }
			// 恢复时不改 isRead
			const updateData: UpdateType<UpvoteNotification> = {
				deletedFlag: false,
				upvoteTime: now,
				editDateTime: now,
				receiverUid,
				likerUid,
				videoId,
				...(category === 'video_comment' ? { commentId } : {}),
			}
			const updateResult = await updateData4MongoDB(updateWhere, updateData, schemaInstance, collectionName)
			if (!updateResult.success) {
				logging('ERROR', '恢复点赞通知失败', undefined, { params })
				return { success: false, message: '恢复点赞通知失败' }
			}
			return { success: true, message: '恢复点赞通知成功' }
		}

		const doc: UpvoteNotification = {
			receiverUuid,
			receiverUid,
			likerUuid,
			likerUid,
			category,
			targetId,
			videoId,
			...(category === 'video_comment' ? { commentId } : {}),
			isRead: false,
			deletedFlag: false,
			upvoteTime: now,
			createDateTime: now,
			editDateTime: now,
		}

		try {
			const insertResult = await insertData2MongoDB(doc, schemaInstance, collectionName)
			if (!insertResult.success) {
				logging('ERROR', '创建点赞通知失败，插入失败', undefined, { params })
				return { success: false, message: '创建点赞通知失败' }
			}
			return { success: true, message: '创建点赞通知成功' }
		} catch (error) {
			// 并发下唯一索引冲突：再查一次并恢复
			const retryResult = await selectDataFromMongoDB<UpvoteNotification>(existingWhere, existingSelect, schemaInstance, collectionName)
			if (retryResult.success && retryResult.result && retryResult.result.length > 0) {
				const existing = retryResult.result[0]
				const updateWhere: QueryType<UpvoteNotification> = { _id: existing._id }
				const updateData: UpdateType<UpvoteNotification> = {
					deletedFlag: false,
					upvoteTime: now,
					editDateTime: now,
				}
				await updateData4MongoDB(updateWhere, updateData, schemaInstance, collectionName)
				return { success: true, message: '恢复点赞通知成功（并发）' }
			}
			logging('ERROR', '创建点赞通知失败，未知错误', error, { params })
			return { success: false, message: '创建点赞通知失败，未知错误' }
		}
	} catch (error) {
		logging('ERROR', '创建或恢复点赞通知失败，未知错误', error, { params })
		return { success: false, message: '创建或恢复点赞通知失败，未知错误' }
	}
}

/**
 * 软删一条点赞通知（取消赞）；不改 isRead
 */
export const softDeleteUpvoteNotificationService = async (params: {
	receiverUuid: string;
	likerUuid: string;
	category: UpvoteNotificationCategory;
	videoId: number;
	commentId?: string;
}): Promise<{ success: boolean; message: string }> => {
	try {
		const { receiverUuid, likerUuid, category, videoId, commentId } = params
		if (!receiverUuid || !likerUuid || !category) {
			return { success: false, message: '软删点赞通知失败，参数异常' }
		}
		if (category === 'video_comment' && !commentId) {
			return { success: false, message: '软删点赞通知失败，评论赞缺少 commentId' }
		}

		const targetId = category === 'video' ? String(videoId) : String(commentId)
		const now = Date.now()
		const { collectionName, schemaInstance } = UpvoteNotificationSchema

		const where: QueryType<UpvoteNotification> = {
			receiverUuid,
			likerUuid,
			category,
			targetId,
			deletedFlag: false,
		}
		const update: UpdateType<UpvoteNotification> = {
			deletedFlag: true,
			editDateTime: now,
		}
		const updateResult = await updateData4MongoDB(where, update, schemaInstance, collectionName)
		// 没有匹配到也视为成功（幂等）
		if (!updateResult.success && updateResult.result?.matchedCount === 0) {
			return { success: true, message: '软删点赞通知成功（无记录）' }
		}
		if (!updateResult.success) {
			logging('WARN', '软删点赞通知未更新或失败', undefined, { params, updateResult })
		}
		return { success: true, message: '软删点赞通知成功' }
	} catch (error) {
		logging('ERROR', '软删点赞通知失败，未知错误', error, { params })
		return { success: false, message: '软删点赞通知失败，未知错误' }
	}
}

/**
 * 删除视频时级联软删：该 videoId 的 video 通知 + 同 videoId 的 video_comment 通知
 */
export const cascadeSoftDeleteUpvoteNotificationsByVideoIdService = async (videoId: number): Promise<{ success: boolean; message: string }> => {
	try {
		if (!(videoId >= 0)) {
			return { success: false, message: '级联软删点赞通知失败，videoId 异常' }
		}
		const now = Date.now()
		const { collectionName, schemaInstance } = UpvoteNotificationSchema
		const where: QueryType<UpvoteNotification> = {
			videoId,
			deletedFlag: false,
		}
		const update: UpdateType<UpvoteNotification> = {
			deletedFlag: true,
			editDateTime: now,
		}
		await updateData4MongoDB(where, update, schemaInstance, collectionName)
		return { success: true, message: '按视频级联软删点赞通知成功' }
	} catch (error) {
		logging('ERROR', '按视频级联软删点赞通知失败', error, { videoId })
		return { success: false, message: '按视频级联软删点赞通知失败' }
	}
}

/**
 * 删除评论时级联软删：仅该 commentId
 */
export const cascadeSoftDeleteUpvoteNotificationsByCommentIdService = async (commentId: string): Promise<{ success: boolean; message: string }> => {
	try {
		if (!commentId) {
			return { success: false, message: '级联软删点赞通知失败，commentId 异常' }
		}
		const now = Date.now()
		const { collectionName, schemaInstance } = UpvoteNotificationSchema
		const where: QueryType<UpvoteNotification> = {
			category: 'video_comment',
			commentId,
			deletedFlag: false,
		}
		const update: UpdateType<UpvoteNotification> = {
			deletedFlag: true,
			editDateTime: now,
		}
		await updateData4MongoDB(where, update, schemaInstance, collectionName)
		return { success: true, message: '按评论级联软删点赞通知成功' }
	} catch (error) {
		logging('ERROR', '按评论级联软删点赞通知失败', error, { commentId })
		return { success: false, message: '按评论级联软删点赞通知失败' }
	}
}

/**
 * 获取应对当前接收者过滤掉的点赞者 UUID：
 * - 我 block 的人
 * - 我 hide 的人
 * - block 了我的人
 * 查询失败时返回 success: false（调用方应报错，不得当作空列表放行）
 */
export const getFilteredLikerUuidsForReceiver = async (receiverUuid: string): Promise<{
	success: boolean;
	message?: string;
	uuids?: string[];
}> => {
	try {
		const { collectionName, schemaInstance } = BlockListSchema
		type BlockList = InferSchemaType<typeof schemaInstance>

		const iBlockOrHideWhere: QueryType<BlockList> = {
			operatorUUID: receiverUuid,
			type: { $in: ['block', 'hide'] },
		}
		const iBlockOrHideSelect: SelectType<BlockList> = { value: 1 }
		const iBlockOrHideResult = await selectDataFromMongoDB<BlockList>(iBlockOrHideWhere, iBlockOrHideSelect, schemaInstance, collectionName)
		if (!iBlockOrHideResult.success) {
			logging('ERROR', '获取点赞通知过滤 UUID 列表失败，查询我屏蔽/隐藏的用户失败', undefined, { receiverUuid })
			return { success: false, message: '获取屏蔽列表失败' }
		}

		const blockedMeWhere: QueryType<BlockList> = {
			type: 'block',
			value: receiverUuid,
		}
		const blockedMeSelect: SelectType<BlockList> = { operatorUUID: 1 }
		const blockedMeResult = await selectDataFromMongoDB<BlockList>(blockedMeWhere, blockedMeSelect, schemaInstance, collectionName)
		if (!blockedMeResult.success) {
			logging('ERROR', '获取点赞通知过滤 UUID 列表失败，查询屏蔽我的用户失败', undefined, { receiverUuid })
			return { success: false, message: '获取屏蔽列表失败' }
		}

		const set = new Set<string>()
		if (iBlockOrHideResult.result) {
			for (const row of iBlockOrHideResult.result) {
				if (row.value) {
					set.add(row.value)
				}
			}
		}
		if (blockedMeResult.result) {
			for (const row of blockedMeResult.result) {
				if (row.operatorUUID) {
					set.add(row.operatorUUID)
				}
			}
		}
		return { success: true, uuids: [...set] }
	} catch (error) {
		logging('ERROR', '获取点赞通知过滤 UUID 列表失败', error, { receiverUuid })
		return { success: false, message: '获取屏蔽列表失败，未知错误' }
	}
}

const mapNotificationItem = (doc: UpvoteNotification & { _id?: string | Types.ObjectId }): UpvoteNotificationItemDto => ({
	notificationId: String(doc._id),
	receiverUuid: doc.receiverUuid,
	receiverUid: doc.receiverUid,
	likerUuid: doc.likerUuid,
	likerUid: doc.likerUid,
	category: doc.category as UpvoteNotificationCategory,
	targetId: doc.targetId,
	videoId: doc.videoId,
	commentId: doc.commentId ?? undefined,
	isRead: doc.isRead,
	upvoteTime: doc.upvoteTime,
	createDateTime: doc.createDateTime,
})

/**
 * 获取点赞通知列表（读时过滤 block/hide；isRead 可选，不传则返回全部未软删）
 */
export const getUpvoteNotificationListService = async (
	request: GetUpvoteNotificationListRequestDto,
	uuid: string | undefined,
	token: string | undefined,
): Promise<GetUpvoteNotificationListResponseDto> => {
	try {
		if (!uuid || !(await checkUserTokenByUuidService(uuid, token)).success) {
			return { success: false, message: '获取点赞通知列表失败，用户校验未通过' }
		}
		if (request.isRead !== undefined && typeof request.isRead !== 'boolean') {
			return { success: false, message: '获取点赞通知列表失败，参数异常' }
		}
		const page = Math.max(1, request.pagination?.page ?? 1)
		const pageSize = Math.min(Math.max(1, request.pagination?.pageSize ?? 20), 100)
		const filterResult = await getFilteredLikerUuidsForReceiver(uuid)
		if (!filterResult.success) {
			return { success: false, message: filterResult.message ?? '获取点赞通知列表失败，屏蔽列表查询失败' }
		}
		const filteredLikers = filterResult.uuids ?? []

		const match: Record<string, unknown> = {
			receiverUuid: uuid,
			deletedFlag: false,
		}
		if (typeof request.isRead === 'boolean') {
			match.isRead = request.isRead
		}
		if (request.category) {
			match.category = request.category
		}
		if (filteredLikers.length > 0) {
			match.likerUuid = { $nin: filteredLikers }
		}

		const { collectionName, schemaInstance } = UpvoteNotificationSchema
		const pipeline: PipelineStage[] = [
			{ $match: match },
			{
				$facet: {
					count: [{ $count: 'total' }],
					list: [
						{ $sort: { upvoteTime: -1 } },
						{ $skip: (page - 1) * pageSize },
						{ $limit: pageSize },
					],
				},
			},
		]

		const aggResult = await selectDataByAggregateFromMongoDB< {
			count: { total: number }[];
			list: UpvoteNotification[];
		} >(schemaInstance, collectionName, pipeline)

		if (!aggResult.success || !aggResult.result || aggResult.result.length === 0) {
			return { success: false, message: '获取点赞通知列表失败' }
		}

		const facet = aggResult.result[0]
		const count = facet.count?.[0]?.total ?? 0
		const list = (facet.list ?? []).map(mapNotificationItem)
		return { success: true, message: '获取点赞通知列表成功', count, result: list }
	} catch (error) {
		logging('ERROR', '获取点赞通知列表失败，未知错误', error, { request, uuid })
		return { success: false, message: '获取点赞通知列表失败，未知错误' }
	}
}

/**
 * 获取未读点赞通知总数（读时过滤；可按 category）
 */
export const getUnreadUpvoteNotificationCountService = async (
	request: GetUnreadUpvoteNotificationCountRequestDto,
	uuid: string | undefined,
	token: string | undefined,
): Promise<GetUnreadUpvoteNotificationCountResponseDto> => {
	try {
		if (!uuid || !(await checkUserTokenByUuidService(uuid, token)).success) {
			return { success: false, message: '获取未读点赞通知数失败，用户校验未通过' }
		}

		const filterResult = await getFilteredLikerUuidsForReceiver(uuid)
		if (!filterResult.success) {
			return { success: false, message: filterResult.message ?? '获取未读点赞通知数失败，屏蔽列表查询失败' }
		}
		const filteredLikers = filterResult.uuids ?? []
		const match: Record<string, unknown> = {
			receiverUuid: uuid,
			deletedFlag: false,
			isRead: false,
		}
		if (request.category) {
			match.category = request.category
		}
		if (filteredLikers.length > 0) {
			match.likerUuid = { $nin: filteredLikers }
		}

		const { collectionName, schemaInstance } = UpvoteNotificationSchema
		const pipeline: PipelineStage[] = [
			{ $match: match },
			{ $count: 'total' },
		]
		const aggResult = await selectDataByAggregateFromMongoDB<{ total: number }>(schemaInstance, collectionName, pipeline)
		if (!aggResult.success) {
			return { success: false, message: '获取未读点赞通知数失败' }
		}
		const count = aggResult.result?.[0]?.total ?? 0
		return { success: true, message: '获取未读点赞通知数成功', count }
	} catch (error) {
		logging('ERROR', '获取未读点赞通知数失败，未知错误', error, { request, uuid })
		return { success: false, message: '获取未读点赞通知数失败，未知错误' }
	}
}

/**
 * 按通知编号标记已读（不含 block/hide 过滤掉的；校验 receiver）
 */
export const markUpvoteNotificationReadByIdsService = async (
	request: MarkUpvoteNotificationReadByIdsRequestDto,
	uuid: string | undefined,
	token: string | undefined,
): Promise<MarkUpvoteNotificationReadByIdsResponseDto> => {
	try {
		if (!uuid || !(await checkUserTokenByUuidService(uuid, token)).success) {
			return { success: false, message: '标记点赞通知已读失败，用户校验未通过' }
		}
		const notificationIds = (request.notificationIds ?? []).filter(Boolean)
		if (notificationIds.length === 0) {
			return { success: false, message: '标记点赞通知已读失败，通知编号为空' }
		}

		const filterResult = await getFilteredLikerUuidsForReceiver(uuid)
		if (!filterResult.success) {
			return { success: false, message: filterResult.message ?? '标记点赞通知已读失败，屏蔽列表查询失败' }
		}
		const filteredLikers = new Set(filterResult.uuids ?? [])
		const objectIds = notificationIds
			.filter(id => Types.ObjectId.isValid(id))
			.map(id => new Types.ObjectId(id))

		const markedIds: string[] = []
		const skippedFilteredIds: string[] = []
		const skippedDeletedIds: string[] = []
		const skippedForbiddenOrMissingIds: string[] = []

		const invalidFormatIds = notificationIds.filter(id => !Types.ObjectId.isValid(id))
		skippedForbiddenOrMissingIds.push(...invalidFormatIds)

		if (objectIds.length === 0) {
			return {
				success: true,
				message: '标记点赞通知已读完成',
				markedIds,
				skippedFilteredIds,
				skippedDeletedIds,
				skippedForbiddenOrMissingIds,
			}
		}

		const { collectionName, schemaInstance } = UpvoteNotificationSchema
		const where: QueryType<UpvoteNotification> = {
			_id: { $in: objectIds } as unknown as string,
			receiverUuid: uuid,
		}
		const select: SelectType<UpvoteNotification> = {
			likerUuid: 1,
			deletedFlag: 1,
			isRead: 1,
		}
		const foundResult = await selectDataFromMongoDB<UpvoteNotification>(where, select, schemaInstance, collectionName)
		const foundMap = new Map<string, UpvoteNotification>()
		if (foundResult.success && foundResult.result) {
			for (const row of foundResult.result) {
				foundMap.set(String(row._id), row)
			}
		}

		const toMarkIds: Types.ObjectId[] = []
		for (const id of notificationIds) {
			if (!Types.ObjectId.isValid(id)) {
				continue
			}
			const doc = foundMap.get(id)
			if (!doc) {
				skippedForbiddenOrMissingIds.push(id)
				continue
			}
			if (doc.deletedFlag) {
				skippedDeletedIds.push(id)
				continue
			}
			if (filteredLikers.has(doc.likerUuid)) {
				skippedFilteredIds.push(id)
				continue
			}
			if (doc.isRead) {
				markedIds.push(id) // 已是已读，视为成功
				continue
			}
			toMarkIds.push(new Types.ObjectId(id))
			markedIds.push(id)
		}

		if (toMarkIds.length > 0) {
			const now = Date.now()
			const updateWhere: QueryType<UpvoteNotification> = {
				_id: { $in: toMarkIds } as unknown as string,
				receiverUuid: uuid,
				deletedFlag: false,
			}
			const updateData: UpdateType<UpvoteNotification> = {
				isRead: true,
				editDateTime: now,
			}
			await updateData4MongoDB(updateWhere, updateData, schemaInstance, collectionName)
		}

		return {
			success: true,
			message: '标记点赞通知已读完成',
			markedIds,
			skippedFilteredIds,
			skippedDeletedIds,
			skippedForbiddenOrMissingIds,
		}
	} catch (error) {
		logging('ERROR', '按 ID 标记点赞通知已读失败', error, { request, uuid })
		return { success: false, message: '按 ID 标记点赞通知已读失败，未知错误' }
	}
}

/**
 * 全部已读：仅 deletedFlag=false 且当前可见（不含 block/hide 过滤）
 */
export const markAllUpvoteNotificationReadService = async (
	request: MarkAllUpvoteNotificationReadRequestDto,
	uuid: string | undefined,
	token: string | undefined,
): Promise<MarkAllUpvoteNotificationReadResponseDto> => {
	try {
		if (!uuid || !(await checkUserTokenByUuidService(uuid, token)).success) {
			return { success: false, message: '全部已读失败，用户校验未通过' }
		}

		const filterResult = await getFilteredLikerUuidsForReceiver(uuid)
		if (!filterResult.success) {
			return { success: false, message: filterResult.message ?? '全部已读失败，屏蔽列表查询失败' }
		}
		const filteredLikers = filterResult.uuids ?? []
		const now = Date.now()
		const { collectionName, schemaInstance } = UpvoteNotificationSchema

		const where: Record<string, unknown> = {
			receiverUuid: uuid,
			deletedFlag: false,
			isRead: false,
		}
		if (request.category) {
			where.category = request.category
		}
		if (filteredLikers.length > 0) {
			where.likerUuid = { $nin: filteredLikers }
		}

		const updateData: UpdateType<UpvoteNotification> = {
			isRead: true,
			editDateTime: now,
		}
		const updateResult = await updateData4MongoDB(
			where as QueryType<UpvoteNotification>,
			updateData,
			schemaInstance,
			collectionName,
		)

		// 无匹配时 updateData4MongoDB 可能 success=false，对「全部已读」仍算成功
		const markedCount = updateResult.result?.modifiedCount
			?? (updateResult.success ? updateResult.result?.matchedCount : 0)
			?? 0

		return {
			success: true,
			message: '全部已读成功',
			markedCount,
		}
	} catch (error) {
		logging('ERROR', '全部已读失败，未知错误', error, { request, uuid })
		return { success: false, message: '全部已读失败，未知错误' }
	}
}
