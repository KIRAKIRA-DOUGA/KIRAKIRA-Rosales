import { InferSchemaType, PipelineStage } from 'mongoose'
import { SendMessageRequestDto, SendMessageResponseDto, GetConversationListRequestDto, GetConversationListResponseDto, GetMessageListRequestDto, GetMessageListResponseDto, MarkMessageReadRequestDto, MarkMessageReadResponseDto, DeleteConversationRequestDto, DeleteConversationResponseDto, DeleteMessageRequestDto, DeleteMessageResponseDto, GetUnreadMessageCountResponseDto, GetImImageUploadSignedUrlResponseDto, RecallMessageRequestDto, RecallMessageResponseDto, ConversationInfo, MessageInfo } from '../controller/ImControllerDto.js'
import { ImConversationSchema, ImMessageSchema, IM_MESSAGE_TYPE } from '../dbPool/schema/ImSchema.js'
import { UserSettingsSchema, UserInfoSchema } from '../dbPool/schema/UserSchema.js'
import { checkUserTokenByUuidService, getUserUuid, getUserUid } from './UserService.js'
import { QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { selectDataFromMongoDB, insertData2MongoDB, selectDataByAggregateFromMongoDB, findOneAndUpdateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { createAndStartSession, commitAndEndSession, abortAndEndSession } from '../common/MongoDBSessionTool.js'
import { ClientSession } from 'mongoose'
import { checkIsBlockedByOtherUserService } from './BlockService.js'
import { checkUserIsFollowing } from './FeedService.js'
import { FollowingSchema } from '../dbPool/schema/FeedSchema.js'
import { v4 as uuidV4 } from 'uuid'
import { logging } from './loggingService.js'
import { createCloudflareImageUploadSignedUrl } from '../cloudflare/index.js'
import { generateSecureRandomString } from '../common/RandomTool.js'

/**
 * 发送消息
 * @param sendMessageRequest 发送消息的请求载荷
 * @param senderUuid 发送者的 UUID
 * @param token 发送者的 token
 * @returns 发送消息的结果
 */
export const sendMessageService = async (sendMessageRequest: SendMessageRequestDto, senderUuid: string, token: string): Promise<SendMessageResponseDto> => {
	try {
		// 验证请求参数
		if (!checkSendMessageRequest(sendMessageRequest)) {
			logging('ERROR', '发送消息失败，参数校验失败')
			return { success: false, message: '发送消息失败，参数校验失败' }
		}

		// 验证用户token
		if (!(await checkUserTokenByUuidService(senderUuid, token)).success) {
			logging('ERROR', '发送消息失败，用户校验失败')
			return { success: false, message: '发送消息失败，用户校验失败' }
		}

		const { receiverUid, messageType, content } = sendMessageRequest

		// 获取接收者UUID（仅用于内部验证，不暴露）
		const receiverUuid = await getUserUuid(receiverUid)
		if (!receiverUuid) {
			logging('ERROR', '发送消息失败，接收者不存在')
			return { success: false, message: '发送消息失败，接收者不存在' }
		}

		// 不能给自己发消息
		const senderUid = await getUserUid(senderUuid)
		if (!senderUid) {
			logging('ERROR', '发送消息失败，发送者不存在')
			return { success: false, message: '发送消息失败，发送者不存在' }
		}
		if (senderUid === receiverUid) {
			logging('ERROR', '发送消息失败，不能给自己发消息')
			return { success: false, message: '发送消息失败，不能给自己发消息' }
		}

		// 检查接收者是否拉黑了发送者
		const checkBlockResult = await checkIsBlockedByOtherUserService({ targetUid: receiverUid }, senderUuid, token)
		if (!checkBlockResult.success) {
			logging('ERROR', '发送消息失败，检查拉黑状态失败')
			return { success: false, message: '发送消息失败，检查拉黑状态失败' }
		}
		if (checkBlockResult.isBlocked) {
			logging('ERROR', '发送消息失败，对方已拉黑你')
			return { success: false, message: '发送消息失败，对方已拉黑你' }
		}

		// 检查接收者是否关注了发送者（如果B关注了A，那么A可以无限发消息给B）
		const isFollowing = await checkUserIsFollowing(receiverUuid, senderUuid)

		// 如果接收者没有关注发送者，检查是否已经发送过3条或更多消息但对方未回复
		if (!isFollowing) {
			const hasUnreplied = await checkHasUnrepliedMessage(senderUuid, receiverUuid)
			if (hasUnreplied) {
				logging('ERROR', '发送消息失败，对方未回复你的消息，且对方未关注你（最多可发送3条消息）')
				return { success: false, message: '发送消息失败，对方未回复你的消息，且对方未关注你（最多可发送3条消息）' }
			}
		}

		// 检查接收者的私信隐私设置
		const imPrivacyCheck = await checkReceiverImPrivacy(receiverUuid, senderUuid, isFollowing)
		if (!imPrivacyCheck.allow) {
			logging('ERROR', imPrivacyCheck.message || '发送消息失败，对方隐私设置不允许私信')
			return { success: false, message: imPrivacyCheck.message || '发送消息失败，对方隐私设置不允许私信' }
		}

		// 验证消息内容
		if (messageType === IM_MESSAGE_TYPE.text) {
			if (!content || content.trim().length === 0) {
				logging('ERROR', '发送消息失败，消息内容不能为空')
				return { success: false, message: '发送消息失败，消息内容不能为空' }
			}
			if (content.length > 10000) {
				logging('ERROR', '发送消息失败，消息内容过长')
				return { success: false, message: '发送消息失败，消息内容过长' }
			}
		}
		if (messageType === IM_MESSAGE_TYPE.image) {
			if (!content || content.trim().length === 0) {
				logging('ERROR', '发送消息失败，图片内容不能为空')
				return { success: false, message: '发送消息失败，图片内容不能为空' }
			}
		}

		// TODO: 增加消息审核 / 关键词过滤

		const session = await createAndStartSession()

		try {
			// 获取或创建会话（传入当前用户的UUID和对方的UID）
			const conversationResult = await getOrCreateConversation(senderUuid, receiverUid, session)
			if (!conversationResult.success || !conversationResult.conversation) {
				await abortAndEndSession(session)
				logging('ERROR', '发送消息失败，创建会话失败')
				return { success: false, message: '发送消息失败，创建会话失败' }
			}

			const conversation = conversationResult.conversation
			const conversationId = conversation.conversationId

			// 创建消息
			const now = new Date().getTime()
			const messageId = `msg_${uuidV4()}`
			const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
			type Message = InferSchemaType<typeof messageSchemaInstance>

			const messageData: Message = {
				messageId,
				conversationId,
				senderUuid,
				receiverUuid,
				messageType,
				content: content.trim(),
				isRead: false,
				senderDeleted: false,
				receiverDeleted: false,
				isRecalled: false,
				createdDateTime: now,
				createdBy: senderUuid,
				editedDateTime: now,
				editedBy: senderUuid,
			}

			const insertMessageResult = await insertData2MongoDB<Message>(messageData, messageSchemaInstance, messageCollectionName, { session })
			if (!insertMessageResult.success) {
				await abortAndEndSession(session)
				logging('ERROR', '发送消息失败，插入消息失败')
				return { success: false, message: '发送消息失败，插入消息失败' }
			}

			// 更新会话信息，并按消息表真实未读数同步接收方未读计数
			const isUser1 = senderUuid === conversation.user1Uuid
			const receiverUnreadCountField = isUser1 ? 'user2UnreadCount' : 'user1UnreadCount'
			const receiverUnreadCount = await countUnreadMessagesForReceiver(
				conversationId,
				receiverUuid,
				messageSchemaInstance,
				messageCollectionName,
				session,
			)

			const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
			type Conversation = InferSchemaType<typeof conversationSchemaInstance>
			const updateWhere: QueryType<Conversation> = {
				conversationId,
			}
			const updateData: UpdateType<Conversation> = {
				lastMessageId: messageId,
				lastMessageTime: now,
				[receiverUnreadCountField]: receiverUnreadCount,
				editedDateTime: now,
				editedBy: senderUuid,
			}

			const updateConversationResult = await findOneAndUpdateData4MongoDB<Conversation>(
				updateWhere,
				updateData,
				conversationSchemaInstance,
				conversationCollectionName,
				{ session },
				false,
			)

			if (!updateConversationResult.success) {
				await abortAndEndSession(session)
				logging('ERROR', '发送消息失败，更新会话失败')
				return { success: false, message: '发送消息失败，更新会话失败' }
			}

			await commitAndEndSession(session)
			return { success: true, message: '发送消息成功', result: { messageId, conversationId } }
		} catch (error) {
			await abortAndEndSession(session)
			throw error
		}
	} catch (error) {
		logging('ERROR', '发送消息失败，未知错误', error)
		return { success: false, message: '发送消息失败，未知错误' }
	}
}

/**
 * 获取会话列表
 * @param getConversationListRequest 获取会话列表的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 会话列表的结果
 */
export const getConversationListService = async (getConversationListRequest: GetConversationListRequestDto, uuid: string, token: string): Promise<GetConversationListResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取会话列表失败，用户校验失败')
			return { success: false, message: '获取会话列表失败，用户校验失败' }
		}

		const { pagination, isFollowing, isFollower } = getConversationListRequest
		const { page, pageSize } = pagination
		const skip = (page - 1) * pageSize

		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		const { collectionName: followingCollectionName } = FollowingSchema

		// 根据 query 生成关注筛选条件（未传则不过滤）
		const followFilterConditions: Record<string, unknown>[] = []
		if (isFollowing !== undefined) {
			followFilterConditions.push({ iFollowOther: isFollowing })
		}
		if (isFollower !== undefined) {
			followFilterConditions.push({ otherFollowsMe: isFollower })
		}

		// 构建查询管道
		const pipeline: PipelineStage[] = [
			{
				$match: {
					$or: [
						{ user1Uuid: uuid, user1Deleted: false },
						{ user2Uuid: uuid, user2Deleted: false },
					],
				},
			},
			{
				$addFields: {
					otherUserUuid: {
						$cond: {
							if: { $eq: ['$user1Uuid', uuid] },
							then: '$user2Uuid',
							else: '$user1Uuid',
						},
					},
					unreadCount: {
						$cond: {
							if: { $eq: ['$user1Uuid', uuid] },
							then: '$user1UnreadCount',
							else: '$user2UnreadCount',
						},
					},
				},
			},
			// 关注关系：我是否关注对方（uuid -> otherUserUuid）
			{
				$lookup: {
					from: followingCollectionName,
					let: { otherUserUuid: '$otherUserUuid' },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ['$followerUuid', uuid] },
										{ $eq: ['$followingUuid', '$$otherUserUuid'] },
									],
								},
							},
						},
						{ $limit: 1 },
					],
					as: 'iFollowOtherData',
				},
			},
			// 关注关系：对方是否关注我（otherUserUuid -> uuid）
			{
				$lookup: {
					from: followingCollectionName,
					let: { otherUserUuid: '$otherUserUuid' },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ['$followerUuid', '$$otherUserUuid'] },
										{ $eq: ['$followingUuid', uuid] },
									],
								},
							},
						},
						{ $limit: 1 },
					],
					as: 'otherFollowsMeData',
				},
			},
			{
				$addFields: {
					iFollowOther: { $gt: [{ $size: '$iFollowOtherData' }, 0] },
					otherFollowsMe: { $gt: [{ $size: '$otherFollowsMeData' }, 0] },
				},
			},
			// 根据 isFollowing/isFollower 做筛选（发生在分页之前，保证 pageSize 尽量填满）
			...(followFilterConditions.length > 0 ? [{
				$match: {
					$and: followFilterConditions,
				},
			} as PipelineStage.Match] : []),
			{
				$sort: { lastMessageTime: -1, editedDateTime: -1 },
			},
			{
				$skip: skip,
			},
			{
				$limit: pageSize,
			},
			{
				$lookup: {
					from: 'user-infos',
					localField: 'otherUserUuid',
					foreignField: 'UUID',
					as: 'otherUserInfo',
				},
			},
			{
				$unwind: {
					path: '$otherUserInfo',
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$lookup: {
					from: 'im-message',
					localField: 'lastMessageId',
					foreignField: 'messageId',
					as: 'lastMessageData',
				},
			},
			{
				$unwind: {
					path: '$lastMessageData',
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$project: {
					conversationId: 1,
					iFollowOther: 1,
					otherFollowsMe: 1,
					otherUser: {
						uid: '$otherUserInfo.uid',
						username: '$otherUserInfo.username',
						userNickname: '$otherUserInfo.userNickname',
						avatar: '$otherUserInfo.avatar',
					},
					lastMessage: {
						$cond: {
							if: { $ne: ['$lastMessageData', null] },
							then: {
								messageId: '$lastMessageData.messageId',
								messageType: '$lastMessageData.messageType',
								content: '$lastMessageData.content',
								senderUuid: '$lastMessageData.senderUuid',
								isRecalled: '$lastMessageData.isRecalled',
								senderDeleted: '$lastMessageData.senderDeleted',
								receiverDeleted: '$lastMessageData.receiverDeleted',
								createdDateTime: '$lastMessageData.createdDateTime',
							},
							else: null,
						},
					},
					unreadCount: 1,
					lastMessageTime: 1,
				},
			},
		]

		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					$or: [
						{ user1Uuid: uuid, user1Deleted: false },
						{ user2Uuid: uuid, user2Deleted: false },
					],
				},
			},
			{
				$addFields: {
					otherUserUuid: {
						$cond: {
							if: { $eq: ['$user1Uuid', uuid] },
							then: '$user2Uuid',
							else: '$user1Uuid',
						},
					},
				},
			},
			{
				$lookup: {
					from: followingCollectionName,
					let: { otherUserUuid: '$otherUserUuid' },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ['$followerUuid', uuid] },
										{ $eq: ['$followingUuid', '$$otherUserUuid'] },
									],
								},
							},
						},
						{ $limit: 1 },
					],
					as: 'iFollowOtherData',
				},
			},
			{
				$lookup: {
					from: followingCollectionName,
					let: { otherUserUuid: '$otherUserUuid' },
					pipeline: [
						{
							$match: {
								$expr: {
									$and: [
										{ $eq: ['$followerUuid', '$$otherUserUuid'] },
										{ $eq: ['$followingUuid', uuid] },
									],
								},
							},
						},
						{ $limit: 1 },
					],
					as: 'otherFollowsMeData',
				},
			},
			{
				$addFields: {
					iFollowOther: { $gt: [{ $size: '$iFollowOtherData' }, 0] },
					otherFollowsMe: { $gt: [{ $size: '$otherFollowsMeData' }, 0] },
				},
			},
			...(followFilterConditions.length > 0 ? [{
				$match: {
					$and: followFilterConditions,
				},
			} as PipelineStage.Match] : []),
			{
				$count: 'totalCount',
			},
		]

		const [conversationsResult, countResult] = await Promise.all([
			selectDataByAggregateFromMongoDB(conversationSchemaInstance, conversationCollectionName, pipeline),
			selectDataByAggregateFromMongoDB(conversationSchemaInstance, conversationCollectionName, countPipeline),
		])

		if (!conversationsResult.success) {
			logging('ERROR', '获取会话列表失败，查询失败')
			return { success: false, message: '获取会话列表失败，查询失败' }
		}

		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].totalCount : 0
		const rawConversations = conversationsResult.result || []
		const lastMessageSenderUidMap = await resolveUuidsToUidMap(
			rawConversations.flatMap((item: unknown) => {
				const lastMessageData = (item as Record<string, unknown>).lastMessage as Record<string, unknown> | undefined
				const senderUuid = lastMessageData?.senderUuid as string | undefined
				return senderUuid ? [senderUuid] : []
			}),
		)
		const conversations = rawConversations.map((item: unknown): ConversationInfo => {
			const itemData = item as Record<string, unknown>
			const lastMessageData = itemData.lastMessage as Record<string, unknown> | undefined
			let lastMessage = undefined
			if (lastMessageData) {
				// 判断当前用户是否删除了这条消息
				const senderUuid = (lastMessageData.senderUuid as string) || ''
				const isSender = senderUuid === uuid
				const isDeleted = isSender ? lastMessageData.senderDeleted : lastMessageData.receiverDeleted

				const isRecalled = (lastMessageData.isRecalled as boolean) || false
				lastMessage = {
					messageId: (lastMessageData.messageId as string) || '',
					messageType: lastMessageData.messageType as IM_MESSAGE_TYPE,
					content: isRecalled ? '' : ((lastMessageData.content as string) || ''),
					senderUid: lastMessageSenderUidMap.get(senderUuid) || 0,
					isRecalled,
					isDeleted: (isDeleted as boolean) || false,
					createdDateTime: (lastMessageData.createdDateTime as number) || 0,
				}
			}

			const otherUserData = itemData.otherUser as Record<string, unknown> | undefined
			return {
				conversationId: (itemData.conversationId as string) || '',
				otherUser: {
					uid: (otherUserData?.uid as number) || 0,
					username: otherUserData?.username as string | undefined,
					userNickname: otherUserData?.userNickname as string | undefined,
					avatar: otherUserData?.avatar as string | undefined,
				},
				lastMessage,
				unreadCount: (itemData.unreadCount as number) || 0,
				lastMessageTime: itemData.lastMessageTime as number | undefined,
			}
		})

		return { success: true, message: '获取会话列表成功', result: conversations, totalCount }
	} catch (error) {
		logging('ERROR', '获取会话列表失败，未知错误', error)
		return { success: false, message: '获取会话列表失败，未知错误' }
	}
}

/**
 * 获取消息列表
 * @param getMessageListRequest 获取消息列表的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 消息列表的结果
 */
export const getMessageListService = async (getMessageListRequest: GetMessageListRequestDto, uuid: string, token: string): Promise<GetMessageListResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取消息列表失败，用户校验失败')
			return { success: false, message: '获取消息列表失败，用户校验失败' }
		}

		if (!checkGetMessageListRequest(getMessageListRequest)) {
			logging('ERROR', '获取消息列表失败，参数校验失败')
			return { success: false, message: '获取消息列表失败，参数校验失败' }
		}

		const { conversationId, cursorMessageId, pagination, markAsRead = false } = getMessageListRequest
		const { page, pageSize } = pagination
		// IM 场景：如果存在 cursorMessageId，则仅从该游标往前取 pageSize 条，不再使用 page 做偏移（建议前端固定传 page=1）
		const skip = cursorMessageId ? 0 : (page - 1) * pageSize

		// 验证会话是否存在且用户有权限访问
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		const conversationOrConditions: QueryType<Conversation>[] = [
			{ user1Uuid: uuid },
			{ user2Uuid: uuid },
		]
		const conversationWhere: QueryType<Conversation> = {
			conversationId,
			$or: conversationOrConditions,
		}
		const conversationSelect: SelectType<Conversation> = {
			conversationId: 1,
		}
		const conversationResult = await selectDataFromMongoDB<Conversation>(conversationWhere, conversationSelect, conversationSchemaInstance, conversationCollectionName)

		if (!conversationResult.success || !conversationResult.result || conversationResult.result.length === 0) {
			logging('ERROR', '获取消息列表失败，会话不存在或无权限')
			return { success: false, message: '获取消息列表失败，会话不存在或无权限' }
		}

		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>

		// 构建查询管道（基于游标的“向上翻页”）
		const matchBase: PipelineStage.Match['$match'] = {
			conversationId,
			$or: [
				{ senderUuid: uuid, senderDeleted: false },
				{ receiverUuid: uuid, receiverDeleted: false },
			],
		}

		let cursorCreatedDateTime: number | undefined = undefined

		// 如果传入了游标 messageId，则以该消息的 createdDateTime 为“锚点”，只查更早的消息
		if (cursorMessageId) {
			const cursorWhere: QueryType<Message> = {
				conversationId,
				messageId: cursorMessageId,
				$or: [
					{ senderUuid: uuid, senderDeleted: false },
					{ receiverUuid: uuid, receiverDeleted: false },
				],
			}
			const cursorSelect: SelectType<Message> = {
				createdDateTime: 1,
			}
			const cursorResult = await selectDataFromMongoDB<Message>(cursorWhere, cursorSelect, messageSchemaInstance, messageCollectionName)
			if (!cursorResult.success || !cursorResult.result || cursorResult.result.length !== 1) {
				logging('ERROR', '获取消息列表失败，游标消息不存在或无权访问')
				return { success: false, message: '获取消息列表失败，游标消息不存在或无权访问' }
			}
			cursorCreatedDateTime = cursorResult.result[0].createdDateTime
		}

		const matchStage: PipelineStage.Match = {
			$match: cursorCreatedDateTime
				? {
						...matchBase,
						createdDateTime: { $lt: cursorCreatedDateTime },
				  }
				: matchBase,
		}

		const pipeline: PipelineStage[] = [
			matchStage,
			{
				$sort: { createdDateTime: -1 },
			},
			{
				$skip: skip,
			},
			{
				$limit: pageSize,
			},
			{
				$project: {
					messageId: 1,
					senderUuid: 1,
					receiverUuid: 1,
					messageType: 1,
					content: 1, // 保留原始内容，在返回时根据 isRecalled 判断
					isRead: 1,
					readTime: 1,
					isRecalled: 1,
					recalledTime: 1,
					createdDateTime: 1,
					createdBy: 1,
					editedDateTime: 1,
					editedBy: 1,
				},
			},
		]

		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					conversationId,
					$or: [
						{ senderUuid: uuid, senderDeleted: false },
						{ receiverUuid: uuid, receiverDeleted: false },
					],
				},
			},
			{
				$count: 'totalCount',
			},
		]

		const messagesResult = await selectDataByAggregateFromMongoDB(messageSchemaInstance, messageCollectionName, pipeline)
		const countResult = await selectDataByAggregateFromMongoDB(messageSchemaInstance, messageCollectionName, countPipeline)

		if (!messagesResult.success) {
			logging('ERROR', '获取消息列表失败，查询失败')
			return { success: false, message: '获取消息列表失败，查询失败' }
		}

		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].totalCount : 0
		const unreadMessageIds: string[] = []
		const rawMessages = messagesResult.result || []
		const uidMap = await resolveUuidsToUidMap(
			rawMessages.flatMap((item: unknown) => {
				const itemData = item as Record<string, unknown>
				return [
					(itemData.senderUuid as string) || '',
					(itemData.receiverUuid as string) || '',
					(itemData.createdBy as string) || '',
					(itemData.editedBy as string) || '',
				]
			}),
		)
		const messages: MessageInfo[] = rawMessages.map((item: unknown): MessageInfo => {
				const itemData = item as Record<string, unknown>
				const senderUuid = (itemData.senderUuid as string) || ''
				const receiverUuid = (itemData.receiverUuid as string) || ''
				const createdByUuid = (itemData.createdBy as string) || ''
				const editedByUuid = (itemData.editedBy as string) || ''
				const messageId = (itemData.messageId as string) || ''
				const isRead = (itemData.isRead as boolean) || false

				if (markAsRead && !isRead && receiverUuid === uuid && messageId) {
					unreadMessageIds.push(messageId)
				}

				return {
					messageId,
					senderUid: uidMap.get(senderUuid) || 0,
					receiverUid: uidMap.get(receiverUuid) || 0,
					messageType: (itemData.messageType as IM_MESSAGE_TYPE) || IM_MESSAGE_TYPE.text,
					content: ((itemData.isRecalled as boolean) ? '' : (itemData.content as string)) || '',
					isRead,
					readTime: itemData.readTime as number | undefined,
					isRecalled: (itemData.isRecalled as boolean) || false,
					recalledTime: itemData.recalledTime as number | undefined,
					createdDateTime: (itemData.createdDateTime as number) || 0,
					createdByUid: uidMap.get(createdByUuid) || 0,
					editedDateTime: (itemData.editedDateTime as number) || 0,
					editedByUid: uidMap.get(editedByUuid) || 0,
				}
			})

		// 如果需要标记为已读（使用上面收集的未读 messageId 列表）
		if (markAsRead && unreadMessageIds.length > 0) {
			const markReadResult = await markMessageReadService({ conversationId, messageIds: unreadMessageIds }, uuid, token)
			if (!markReadResult.success) {
				logging('ERROR', '获取消息列表失败，标记已读失败')
				return { success: false, message: markReadResult.message || '获取消息列表失败，标记已读失败' }
			}
		}

		return { success: true, message: '获取消息列表成功', result: messages, totalCount }
	} catch (error) {
		logging('ERROR', '获取消息列表失败，未知错误', error)
		return { success: false, message: '获取消息列表失败，未知错误' }
	}
}

/**
 * 标记消息已读
 * @param markMessageReadRequest 标记消息已读的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 标记消息已读的结果
 */
export const markMessageReadService = async (markMessageReadRequest: MarkMessageReadRequestDto, uuid: string, token: string): Promise<MarkMessageReadResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '标记消息已读失败，用户校验失败')
			return { success: false, message: '标记消息已读失败，用户校验失败' }
		}

		if (!checkMarkMessageReadRequest(markMessageReadRequest)) {
			logging('ERROR', '标记消息已读失败，参数校验失败')
			return { success: false, message: '标记消息已读失败，参数校验失败' }
		}

		const { conversationId, messageIds } = markMessageReadRequest

		// 验证会话是否存在且用户有权限访问
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		const conversationWhere = {
			conversationId,
			$or: [
				{ user1Uuid: uuid },
				{ user2Uuid: uuid },
			],
		} as QueryType<Conversation>
		const conversationSelect: SelectType<Conversation> = {
			conversationId: 1,
			user1Uuid: 1,
			user2Uuid: 1,
		}
		const conversationResult = await selectDataFromMongoDB<Conversation>(conversationWhere, conversationSelect, conversationSchemaInstance, conversationCollectionName)

		if (!conversationResult.success || !conversationResult.result || conversationResult.result.length === 0) {
			logging('ERROR', '标记消息已读失败，会话不存在或无权限')
			return { success: false, message: '标记消息已读失败，会话不存在或无权限' }
		}

		const conversation = conversationResult.result[0]
		const isUser1 = uuid === conversation.user1Uuid
		const unreadCountField = isUser1 ? 'user1UnreadCount' : 'user2UnreadCount'

		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>

		const session = await createAndStartSession()

		try {
			const now = new Date().getTime()
			let markedCount = 0

			if (messageIds && messageIds.length > 0) {
				// 标记指定消息为已读
				for (const messageId of messageIds) {
					const messageWhere: QueryType<Message> = {
						messageId,
						conversationId,
						receiverUuid: uuid,
						isRead: false,
					}
					const messageUpdate: UpdateType<Message> = {
						isRead: true,
						readTime: now,
						editedDateTime: now,
						editedBy: uuid,
					}
					const updateResult = await findOneAndUpdateData4MongoDB<Message>(
						messageWhere,
						messageUpdate,
						messageSchemaInstance,
						messageCollectionName,
						{ session },
						false,
					)
					if (updateResult.success && updateResult.result?.isRead) {
						markedCount++
					}
				}
			} else {
				// 标记该会话所有未读消息为已读
				const messageWhere: QueryType<Message> = {
					conversationId,
					receiverUuid: uuid,
					isRead: false,
				}
				const messageSelect: SelectType<Message> = {
					messageId: 1,
				}
				const unreadMessages = await selectDataFromMongoDB<Message>(messageWhere, messageSelect, messageSchemaInstance, messageCollectionName, { session })

				if (unreadMessages.success && unreadMessages.result) {
					for (const msg of unreadMessages.result) {
						const messageUpdate: UpdateType<Message> = {
							isRead: true,
							readTime: now,
							editedDateTime: now,
							editedBy: uuid,
						}
						const updateResult = await findOneAndUpdateData4MongoDB<Message>(
							{
								messageId: msg.messageId,
								conversationId,
								receiverUuid: uuid,
								isRead: false,
							},
							messageUpdate,
							messageSchemaInstance,
							messageCollectionName,
							{ session },
							false,
						)
						if (updateResult.success && updateResult.result?.isRead) {
							markedCount++
						}
					}
				}
			}

			// 根据消息表实际未读数同步会话未读计数，避免扣减累计误差
			if (markedCount > 0) {
				const actualUnreadCount = await countUnreadMessagesForReceiver(
					conversationId,
					uuid,
					messageSchemaInstance,
					messageCollectionName,
					session,
				)
				const conversationUpdateWhere: QueryType<Conversation> = {
					conversationId,
				}
				const conversationUpdate: UpdateType<Conversation> = {
					[unreadCountField]: actualUnreadCount,
					editedDateTime: now,
					editedBy: uuid,
				}
				await findOneAndUpdateData4MongoDB<Conversation>(
					conversationUpdateWhere,
					conversationUpdate,
					conversationSchemaInstance,
					conversationCollectionName,
					{ session },
					false,
				)
			}

			await commitAndEndSession(session)
			return { success: true, message: '标记消息已读成功', result: { markedCount } }
		} catch (error) {
			await abortAndEndSession(session)
			throw error
		}
	} catch (error) {
		logging('ERROR', '标记消息已读失败，未知错误', error)
		return { success: false, message: '标记消息已读失败，未知错误' }
	}
}

/**
 * 删除会话
 * @param deleteConversationRequest 删除会话的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 删除会话的结果
 */
export const deleteConversationService = async (deleteConversationRequest: DeleteConversationRequestDto, uuid: string, token: string): Promise<DeleteConversationResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除会话失败，用户校验失败')
			return { success: false, message: '删除会话失败，用户校验失败' }
		}

		if (!checkDeleteConversationRequest(deleteConversationRequest)) {
			logging('ERROR', '删除会话失败，参数校验失败')
			return { success: false, message: '删除会话失败，参数校验失败' }
		}

		const { conversationId } = deleteConversationRequest

		// 验证会话是否存在且用户有权限访问
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		const conversationWhere = {
			conversationId,
			$or: [
				{ user1Uuid: uuid },
				{ user2Uuid: uuid },
			],
		} as QueryType<Conversation>
		const conversationSelect: SelectType<Conversation> = {
			conversationId: 1,
			user1Uuid: 1,
			user2Uuid: 1,
		}
		const conversationResult = await selectDataFromMongoDB<Conversation>(conversationWhere, conversationSelect, conversationSchemaInstance, conversationCollectionName)

		if (!conversationResult.success || !conversationResult.result || conversationResult.result.length === 0) {
			logging('ERROR', '删除会话失败，会话不存在或无权限')
			return { success: false, message: '删除会话失败，会话不存在或无权限' }
		}

		const conversation = conversationResult.result[0]
		const isUser1 = conversation.user1Uuid === uuid
		const updateField = isUser1 ? 'user1Deleted' : 'user2Deleted'
		const updateTimeField = isUser1 ? 'user1DeletedTime' : 'user2DeletedTime'

		const now = new Date().getTime()
		const updateWhere: QueryType<Conversation> = {
			conversationId,
		}
		const updateData: UpdateType<Conversation> = {
			[updateField]: true,
			[updateTimeField]: now,
			editedDateTime: now,
			editedBy: uuid,
		}

		const updateResult = await findOneAndUpdateData4MongoDB<Conversation>(
			updateWhere,
			updateData,
			conversationSchemaInstance,
			conversationCollectionName,
			undefined,
			false,
		)

		if (!updateResult.success) {
			logging('ERROR', '删除会话失败，更新失败')
			return { success: false, message: '删除会话失败，更新失败' }
		}

		return { success: true, message: '删除会话成功' }
	} catch (error) {
		logging('ERROR', '删除会话失败，未知错误', error)
		return { success: false, message: '删除会话失败，未知错误' }
	}
}

/**
 * 删除消息
 * @param deleteMessageRequest 删除消息的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 删除消息的结果
 */
export const deleteMessageService = async (deleteMessageRequest: DeleteMessageRequestDto, uuid: string, token: string): Promise<DeleteMessageResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除消息失败，用户校验失败')
			return { success: false, message: '删除消息失败，用户校验失败' }
		}

		if (!checkDeleteMessageRequest(deleteMessageRequest)) {
			logging('ERROR', '删除消息失败，参数校验失败')
			return { success: false, message: '删除消息失败，参数校验失败' }
		}

		const { messageId } = deleteMessageRequest

		// 验证消息是否存在且用户有权限删除
		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>
		const messageWhere = {
			messageId,
			$or: [
				{ senderUuid: uuid },
				{ receiverUuid: uuid },
			],
		} as QueryType<Message>
		const messageSelect: SelectType<Message> = {
			messageId: 1,
			senderUuid: 1,
			receiverUuid: 1,
			conversationId: 1,
			isRead: 1,
		}
		const messageResult = await selectDataFromMongoDB<Message>(messageWhere, messageSelect, messageSchemaInstance, messageCollectionName)

		if (!messageResult.success || !messageResult.result || messageResult.result.length === 0) {
			logging('ERROR', '删除消息失败，消息不存在或无权限')
			return { success: false, message: '删除消息失败，消息不存在或无权限' }
		}

		const message = messageResult.result[0]
		const isSender = message.senderUuid === uuid
		const updateField = isSender ? 'senderDeleted' : 'receiverDeleted'

		const now = new Date().getTime()
		const updateWhere: QueryType<Message> = {
			messageId,
		}
		const updateData: UpdateType<Message> = {
			[updateField]: true,
			editedDateTime: now,
			editedBy: uuid,
		}

		const updateResult = await findOneAndUpdateData4MongoDB<Message>(
			updateWhere,
			updateData,
			messageSchemaInstance,
			messageCollectionName,
			undefined,
			false,
		)

		if (!updateResult.success) {
			logging('ERROR', '删除消息失败，更新失败', undefined, { messageId, uuid })
			return { success: false, message: '删除消息失败，更新失败' }
		}

		// 接收者删除未读消息时，同步会话表中的未读计数
		if (message.receiverUuid === uuid && !message.isRead) {
			const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
			type Conversation = InferSchemaType<typeof conversationSchemaInstance>
			const conversationWhere: QueryType<Conversation> = {
				conversationId: message.conversationId,
			}
			const conversationSelect: SelectType<Conversation> = {
				user1Uuid: 1,
				user2Uuid: 1,
			}
			const conversationResult = await selectDataFromMongoDB<Conversation>(
				conversationWhere,
				conversationSelect,
				conversationSchemaInstance,
				conversationCollectionName,
			)
			if (conversationResult.success && conversationResult.result && conversationResult.result.length > 0) {
				const conversation = conversationResult.result[0]
				const isUser1 = uuid === conversation.user1Uuid
				const unreadCountField = isUser1 ? 'user1UnreadCount' : 'user2UnreadCount'
				const actualUnreadCount = await countUnreadMessagesForReceiver(
					message.conversationId,
					uuid,
					messageSchemaInstance,
					messageCollectionName,
				)
				const syncNow = new Date().getTime()
				await findOneAndUpdateData4MongoDB<Conversation>(
					conversationWhere,
					{
						[unreadCountField]: actualUnreadCount,
						editedDateTime: syncNow,
						editedBy: uuid,
					},
					conversationSchemaInstance,
					conversationCollectionName,
					undefined,
					false,
				)
			}
		}

		return { success: true, message: '删除消息成功' }
	} catch (error) {
		logging('ERROR', '删除消息失败，未知错误', error)
		return { success: false, message: '删除消息失败，未知错误' }
	}
}

/**
 * 获取未读消息总数
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 未读消息总数的结果
 */
export const getUnreadMessageCountService = async (uuid: string, token: string): Promise<GetUnreadMessageCountResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取未读消息总数失败，用户校验失败')
			return { success: false, message: '获取未读消息总数失败，用户校验失败' }
		}

		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema

		const activeConversationPipeline: PipelineStage[] = [
			{
				$match: {
					$or: [
						{ user1Uuid: uuid, user1Deleted: false },
						{ user2Uuid: uuid, user2Deleted: false },
					],
				},
			},
			{
				$project: {
					conversationId: 1,
				},
			},
		]
		const activeConversationResult = await selectDataByAggregateFromMongoDB<{ conversationId: string }>(
			conversationSchemaInstance,
			conversationCollectionName,
			activeConversationPipeline,
		)
		if (!activeConversationResult.success) {
			logging('ERROR', '获取未读消息总数失败，查询失败', undefined, { uuid })
			return { success: false, message: '获取未读消息总数失败，查询失败' }
		}

		const conversationIds = (activeConversationResult.result || []).map(item => item.conversationId).filter(Boolean)
		if (conversationIds.length === 0) {
			return { success: true, message: '获取未读消息总数成功', result: { totalUnreadCount: 0 } }
		}

		const unreadCountPipeline: PipelineStage[] = [
			{
				$match: {
					conversationId: { $in: conversationIds },
					receiverUuid: uuid,
					isRead: false,
					receiverDeleted: false,
				} as PipelineStage.Match['$match'],
			},
			{
				$count: 'totalCount',
			},
		]

		const result = await selectDataByAggregateFromMongoDB<{ totalCount: number }>(messageSchemaInstance, messageCollectionName, unreadCountPipeline)

		if (!result.success) {
			logging('ERROR', '获取未读消息总数失败，查询失败', undefined, { uuid })
			return { success: false, message: '获取未读消息总数失败，查询失败' }
		}

		const totalUnreadCount = result.result && result.result.length > 0 ? result.result[0].totalCount : 0

		return { success: true, message: '获取未读消息总数成功', result: { totalUnreadCount } }
	} catch (error) {
		logging('ERROR', '获取未读消息总数失败，未知错误', error)
		return { success: false, message: '获取未读消息总数失败，未知错误' }
	}
}

/**
 * 撤回消息
 * @param recallMessageRequest 撤回消息的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 撤回消息的结果
 */
export const recallMessageService = async (recallMessageRequest: RecallMessageRequestDto, uuid: string, token: string): Promise<RecallMessageResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '撤回消息失败，用户校验失败')
			return { success: false, message: '撤回消息失败，用户校验失败' }
		}

		if (!checkRecallMessageRequest(recallMessageRequest)) {
			logging('ERROR', '撤回消息失败，参数校验失败')
			return { success: false, message: '撤回消息失败，参数校验失败' }
		}

		const { messageId } = recallMessageRequest

		// 验证消息是否存在且用户是发送者
		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>
		const messageWhere: QueryType<Message> = {
			messageId,
			senderUuid: uuid,
			isRecalled: false,
		}
		const messageSelect: SelectType<Message> = {
			messageId: 1,
			senderUuid: 1,
			isRecalled: 1,
		}
		const messageResult = await selectDataFromMongoDB<Message>(messageWhere, messageSelect, messageSchemaInstance, messageCollectionName)

		if (!messageResult.success || !messageResult.result || messageResult.result.length === 0) {
			logging('ERROR', '撤回消息失败，消息不存在或无权限')
			return { success: false, message: '撤回消息失败，消息不存在或无权限' }
		}

		const message = messageResult.result[0]

		// 检查是否已经撤回
		if (message.isRecalled) {
			logging('ERROR', '撤回消息失败，消息已被撤回')
			return { success: false, message: '撤回消息失败，消息已被撤回' }
		}

		// 更新消息为已撤回（不修改content，保留原始内容）
		const now = new Date().getTime()
		const updateWhere: QueryType<Message> = {
			messageId,
		}
		const updateData: UpdateType<Message> = {
			isRecalled: true,
			recalledTime: now,
			editedDateTime: now,
			editedBy: uuid,
		}

		const updateResult = await findOneAndUpdateData4MongoDB<Message>(
			updateWhere,
			updateData,
			messageSchemaInstance,
			messageCollectionName,
			undefined,
			false,
		)

		if (!updateResult.success) {
			logging('ERROR', '撤回消息失败，更新失败')
			return { success: false, message: '撤回消息失败，更新失败' }
		}

		return { success: true, message: '撤回消息成功' }
	} catch (error) {
		logging('ERROR', '撤回消息失败，未知错误', error)
		return { success: false, message: '撤回消息失败，未知错误' }
	}
}

/**
 * 获取 IM 图片上传预签名 URL
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 预签名 URL 与文件名
 */
export const getImImageUploadSignedUrlService = async (uuid: string, token: string): Promise<GetImImageUploadSignedUrlResponseDto> => {
	try {
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取 IM 图片上传预签名 URL 失败，用户校验失败')
			return { success: false, message: '获取 IM 图片上传预签名 URL 失败，用户校验失败' }
		}

		const uid = await getUserUid(uuid)
		if (!uid) {
			logging('ERROR', '获取 IM 图片上传预签名 URL 失败，用户不存在')
			return { success: false, message: '获取 IM 图片上传预签名 URL 失败，用户不存在' }
		}

		const now = new Date().getTime()
		const fileName = `im-image-${uid}-${generateSecureRandomString(32)}-${now}`
		const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 660)
		if (!signedUrl) {
			logging('ERROR', '获取 IM 图片上传预签名 URL 失败，无法生成上传 URL')
			return { success: false, message: '获取 IM 图片上传预签名 URL 失败，无法生成上传 URL' }
		}

		return { success: true, message: '获取 IM 图片上传预签名 URL 成功', result: { fileName, signedUrl } }
	} catch (error) {
		logging('ERROR', '获取 IM 图片上传预签名 URL 失败，未知错误', error)
		return { success: false, message: '获取 IM 图片上传预签名 URL 失败，未知错误' }
	}
}

/**
 * 生成会话ID（确保两个用户之间的会话ID唯一且一致）
 * @param user1Uid 用户1的UID
 * @param user2Uid 用户2的UID
 * @returns 格式化的会话ID字符串，格式为 conv_{uid1}_{uid2}，其中uid按数字大小排序
 */
const generateConversationId = (user1Uid: number, user2Uid: number): string => {
	// 按数字大小排序，确保两个用户之间的会话ID唯一
	const [uid1, uid2] = [user1Uid, user2Uid].sort((a, b) => a - b)
	return `conv_${uid1}_${uid2}`
}

/**
 * 检查是否已经发送过3条或更多消息但对方未回复
 * @param senderUuid 发送者的UUID
 * @param receiverUuid 接收者的UUID
 * @returns 如果发送者已发送3条或更多消息但接收者从未回复过，返回true（不允许继续发送）；如果接收者曾经回复过，返回false（允许继续无限发送）
 */
const checkHasUnrepliedMessage = async (senderUuid: string, receiverUuid: string): Promise<boolean> => {
	try {
		const senderUid = await getUserUid(senderUuid)
		const receiverUid = await getUserUid(receiverUuid)
		if (!senderUid || !receiverUid) {
			return true
		}
		const conversationId = generateConversationId(senderUid, receiverUid)
		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema

		const senderCountPipeline: PipelineStage[] = [
			{
				$match: {
					conversationId,
					senderUuid,
					receiverUuid,
					senderDeleted: false,
				},
			},
			{
				$count: 'totalCount',
			},
		]
		const senderCountResult = await selectDataByAggregateFromMongoDB<{ totalCount: number }>(
			messageSchemaInstance,
			messageCollectionName,
			senderCountPipeline,
		)
		if (!senderCountResult.success) {
			return true
		}
		const senderMessageCount = senderCountResult.result?.[0]?.totalCount ?? 0
		if (senderMessageCount < 3) {
			return false
		}

		const receiverReplyPipeline: PipelineStage[] = [
			{
				$match: {
					conversationId,
					senderUuid: receiverUuid,
					receiverUuid: senderUuid,
					senderDeleted: false,
				},
			},
			{
				$limit: 1,
			},
			{
				$count: 'totalCount',
			},
		]
		const receiverReplyResult = await selectDataByAggregateFromMongoDB<{ totalCount: number }>(
			messageSchemaInstance,
			messageCollectionName,
			receiverReplyPipeline,
		)
		if (!receiverReplyResult.success) {
			return true
		}
		const receiverReplyCount = receiverReplyResult.result?.[0]?.totalCount ? receiverReplyResult.result[0].totalCount : 0
		return receiverReplyCount === 0
	} catch (error) {
		logging('ERROR', '检查是否有未回复消息失败，', error, { senderUuid, receiverUuid })
		return true
	}
}

/**
 * 获取或创建会话
 * @param currentUserUuid 当前用户的UUID（发送者）
 * @param otherUserUid 对方的UID（接收者）
 * @param session 可选的 MongoDB 会话（用于事务）
 * @returns 包含成功状态和会话信息的对象。如果成功，返回 { success: true, conversation: ... }；如果失败，返回 { success: false }
 */
const getOrCreateConversation = async (currentUserUuid: string, otherUserUid: number, session?: ClientSession): Promise<{ success: boolean; conversation?: InferSchemaType<typeof ImConversationSchema.schemaInstance> }> => {
	try {
		// 获取当前用户的UID
		const currentUserUid = await getUserUid(currentUserUuid)
		if (!currentUserUid) {
			return { success: false }
		}

		// 获取对方的UUID（仅用于数据库存储，不暴露给用户）
		const otherUserUuid = await getUserUuid(otherUserUid)
		if (!otherUserUuid) {
			return { success: false }
		}

		// 生成会话ID（使用UID）
		const conversationId = generateConversationId(currentUserUid, otherUserUid)
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>

		// 尝试查找现有会话（即使被删除也可以恢复）
		const where: QueryType<Conversation> = {
			conversationId,
		}
		const select: SelectType<Conversation> = {}
		const existing = await selectDataFromMongoDB<Conversation>(where, select, conversationSchemaInstance, conversationCollectionName, session ? { session } : undefined)

		if (existing.success && existing.result && existing.result.length > 0) {
			const conversation = existing.result[0]
			const now = new Date().getTime()

			// 确定当前用户在会话中是 user1 还是 user2（通过比较 UUID）
			const isUser1 = currentUserUuid === conversation.user1Uuid
			const deletedField = isUser1 ? 'user1Deleted' : 'user2Deleted'
			const otherDeletedField = isUser1 ? 'user2Deleted' : 'user1Deleted'

			// 如果会话被当前用户删除，恢复它（保留删除时间戳）
			// 如果双方都删除了，同时恢复双方（这样对方也能看到新消息）
			if (conversation[deletedField]) {
				const updateWhere: QueryType<Conversation> = {
					conversationId,
				}
				const updateData: UpdateType<Conversation> = {
					[deletedField]: false,
					editedDateTime: now,
					editedBy: currentUserUuid, // 使用发起恢复的用户
				}

				// 如果对方也删除了，同时恢复对方
				if (conversation[otherDeletedField]) {
					updateData[otherDeletedField] = false
				}

				const updateResult = await findOneAndUpdateData4MongoDB<Conversation>(
					updateWhere,
					updateData,
					conversationSchemaInstance,
					conversationCollectionName,
					session ? { session } : undefined,
					false,
				)
				if (updateResult.success && updateResult.result) {
					return { success: true, conversation: updateResult.result }
				}
			}
			return { success: true, conversation }
		}

		// 创建新会话
		const now = new Date().getTime()
		// 按 UUID 字典序排序，确保存储一致性
		const [uuid1, uuid2] = [currentUserUuid, otherUserUuid].sort()
		const conversationData: Conversation = {
			conversationId,
			user1Uuid: uuid1,
			user2Uuid: uuid2,
			user1UnreadCount: 0,
			user2UnreadCount: 0,
			user1Deleted: false,
			user2Deleted: false,
			createdDateTime: now,
			createdBy: currentUserUuid, // 使用发起创建的用户（发送者）
			editedDateTime: now,
			editedBy: currentUserUuid, // 使用发起创建的用户（发送者）
		}

		try {
			const insertResult = await insertData2MongoDB<Conversation>(conversationData, conversationSchemaInstance, conversationCollectionName, session ? { session } : undefined)
			if (!insertResult.success) {
				return { success: false }
			}
			return { success: true, conversation: conversationData }
		} catch (error) {
			if (isMongoDuplicateKeyError(error)) {
				const retryExisting = await selectDataFromMongoDB<Conversation>(where, select, conversationSchemaInstance, conversationCollectionName, session ? { session } : undefined)
				if (retryExisting.success && retryExisting.result && retryExisting.result.length > 0) {
					return { success: true, conversation: retryExisting.result[0] }
				}
			}
			throw error
		}
	} catch (error) {
		logging('ERROR', '获取或创建会话失败，', error, { currentUserUuid, otherUserUid })
		return { success: false }
	}
}

/**
 * 判断 MongoDB 错误是否为唯一索引冲突
 * @param error 捕获到的错误
 * @returns 是唯一索引冲突返回 true，否则 false
 */
const isMongoDuplicateKeyError = (error: unknown): boolean => {
	const hasDuplicateKeyCode = (value: unknown): boolean => {
		if (!value || typeof value !== 'object') {
			return false
		}
		const candidate = value as { code?: number; error?: { code?: number } }
		return candidate.code === 11000 || candidate.error?.code === 11000
	}
	return hasDuplicateKeyCode(error) || (typeof error === 'object' && error !== null && hasDuplicateKeyCode((error as { error?: unknown }).error))
}

/**
 * 批量将 UUID 解析为 UID
 * @param uuids UUID 列表
 * @returns UUID 到 UID 的映射
 */
const resolveUuidsToUidMap = async (uuids: string[]): Promise<Map<string, number>> => {
	const uniqueUuids = [...new Set(uuids.filter(uuidValue => !!uuidValue))]
	const uidMap = new Map<string, number>()
	if (uniqueUuids.length === 0) {
		return uidMap
	}

	const { collectionName, schemaInstance } = UserInfoSchema
	type UserInfo = InferSchemaType<typeof schemaInstance>
	const where = {
		UUID: { $in: uniqueUuids },
	} as QueryType<UserInfo>
	const select: SelectType<UserInfo> = {
		UUID: 1,
		uid: 1,
	}
	const result = await selectDataFromMongoDB<UserInfo>(where, select, schemaInstance, collectionName)
	if (result.success && result.result) {
		for (const user of result.result) {
			if (user.UUID && user.uid) {
				uidMap.set(user.UUID, user.uid)
			}
		}
	}
	return uidMap
}

/**
 * 统计会话内接收者仍未读且未删除的消息数量
 * @param conversationId 会话 ID
 * @param receiverUuid 接收者 UUID
 * @param messageSchemaInstance 消息 Schema 实例
 * @param messageCollectionName 消息集合名
 * @param session 可选事务 session
 * @returns 未读消息数量
 */
const countUnreadMessagesForReceiver = async (
	conversationId: string,
	receiverUuid: string,
	messageSchemaInstance: typeof ImMessageSchema.schemaInstance,
	messageCollectionName: string,
	session?: ClientSession,
): Promise<number> => {
	type Message = InferSchemaType<typeof messageSchemaInstance>
	const unreadWhere: QueryType<Message> = {
		conversationId,
		receiverUuid,
		isRead: false,
		receiverDeleted: false,
	}
	const unreadSelect: SelectType<Message> = {
		messageId: 1,
	}
	const unreadResult = await selectDataFromMongoDB<Message>(
		unreadWhere,
		unreadSelect,
		messageSchemaInstance,
		messageCollectionName,
		session ? { session } : undefined,
	)
	return unreadResult.success && unreadResult.result ? unreadResult.result.length : 0
}

/**
 * 验证发送消息请求
 * @param request 发送消息的请求载荷
 * @returns 如果请求合法返回true，否则返回false
 */
const checkSendMessageRequest = (request: SendMessageRequestDto): boolean => {
	return (
		request.receiverUid !== undefined &&
		request.receiverUid !== null &&
		request.receiverUid > 0 &&
		request.messageType !== undefined &&
		Object.values(IM_MESSAGE_TYPE).includes(request.messageType) &&
		request.content !== undefined &&
		typeof request.content === 'string'
	)
}

/**
 * 验证获取消息列表请求
 * @param request 获取消息列表的请求载荷
 * @returns 如果请求合法返回true，否则返回false
 */
const checkGetMessageListRequest = (request: GetMessageListRequestDto): boolean => {
	return (
		request.conversationId !== undefined &&
		request.conversationId !== null &&
		typeof request.conversationId === 'string' &&
		request.conversationId.length > 0
	)
}

/**
 * 验证标记消息已读请求
 * @param request 标记消息已读的请求载荷
 * @returns 如果请求合法返回true，否则返回false
 */
const checkMarkMessageReadRequest = (request: MarkMessageReadRequestDto): boolean => {
	return (
		request.conversationId !== undefined &&
		request.conversationId !== null &&
		typeof request.conversationId === 'string' &&
		request.conversationId.length > 0
	)
}

/**
 * 验证删除会话请求
 * @param request 删除会话的请求载荷
 * @returns 如果请求合法返回true，否则返回false
 */
const checkDeleteConversationRequest = (request: DeleteConversationRequestDto): boolean => {
	return (
		request.conversationId !== undefined &&
		request.conversationId !== null &&
		typeof request.conversationId === 'string' &&
		request.conversationId.length > 0
	)
}

/**
 * 验证删除消息请求
 * @param request 删除消息的请求载荷
 * @returns 如果请求合法返回true，否则返回false
 */
const checkDeleteMessageRequest = (request: DeleteMessageRequestDto): boolean => {
	return (
		request.messageId !== undefined &&
		request.messageId !== null &&
		typeof request.messageId === 'string' &&
		request.messageId.length > 0
	)
}

/**
 * 验证撤回消息请求
 * @param request 撤回消息的请求载荷
 * @returns 如果请求合法返回true，否则返回false
 */
const checkRecallMessageRequest = (request: RecallMessageRequestDto): boolean => {
	return (
		request.messageId !== undefined &&
		request.messageId !== null &&
		typeof request.messageId === 'string' &&
		request.messageId.length > 0
	)
}

/**
 * 检查接收者的私信隐私设置
 * @param receiverUuid 接收者 UUID
 * @param senderUuid 发送者 UUID
 * @param isSenderFollowed 接收者是否关注了发送者（如果已知，可避免重复查询）
 * @returns 允许发送则 allow=true，否则返回错误消息
 */
const checkReceiverImPrivacy = async (receiverUuid: string, senderUuid: string, isSenderFollowed: boolean): Promise<{ allow: boolean; message?: string }> => {
	try {
		// 读取接收者的隐私设置
		const { collectionName, schemaInstance } = UserSettingsSchema
		type UserSettings = InferSchemaType<typeof schemaInstance>
		const where: QueryType<UserSettings> = { UUID: receiverUuid }
		const select: SelectType<UserSettings> = { userPrivaryVisibilitiesSetting: 1 }
		const settingsResult = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)

		if (!settingsResult.success || !settingsResult.result || settingsResult.result.length === 0) {
			// 未找到设置，视为无特殊限制
			return { allow: true }
		}

		const settings = settingsResult.result[0]
		const imSetting = settings.userPrivaryVisibilitiesSetting?.find((item: { privaryId?: string }) => item?.privaryId === 'privary.im')
		if (!imSetting || !imSetting.visibilitiesType) {
			// 未配置 privary.im 时默认放行
			return { allow: true }
		}

		const visType = imSetting.visibilitiesType as string
		if (visType === 'public') {
			return { allow: true }
		}
		if (visType === 'following') {
			if (isSenderFollowed) {
				return { allow: true }
			}
			return { allow: false, message: '发送消息失败，仅允许关注的人发送私信' }
		}
		// 私密
		return { allow: false, message: '发送消息失败，对方已关闭私信' }
	} catch (error) {
		logging('ERROR', '检查接收者私信隐私设置失败', error, { receiverUuid, senderUuid })
		return { allow: false, message: '发送消息失败，检查对方隐私设置时出错' }
	}
}

