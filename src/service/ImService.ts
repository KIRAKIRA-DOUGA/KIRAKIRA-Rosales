import { InferSchemaType, PipelineStage } from 'mongoose'
import {
	SendMessageRequestDto,
	SendMessageResponseDto,
	GetConversationListRequestDto,
	GetConversationListResponseDto,
	GetMessageListRequestDto,
	GetMessageListResponseDto,
	MarkMessageReadRequestDto,
	MarkMessageReadResponseDto,
	DeleteConversationRequestDto,
	DeleteConversationResponseDto,
	DeleteMessageRequestDto,
	DeleteMessageResponseDto,
	GetUnreadMessageCountResponseDto,
	RecallMessageRequestDto,
	RecallMessageResponseDto,
	ConversationInfo,
	MessageInfo,
} from '../controller/ImControllerDto.js'
import { ImConversationSchema, ImMessageSchema, IM_MESSAGE_TYPE } from '../dbPool/schema/ImSchema.js'
import { checkUserTokenByUuidService, getUserUuid, getUserUid } from './UserService.js'
import { QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { selectDataFromMongoDB, insertData2MongoDB, selectDataByAggregateFromMongoDB, findOneAndUpdateData4MongoDB, deleteDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { createAndStartSession, commitAndEndSession, abortAndEndSession } from '../common/MongoDBSessionTool.js'
import { ClientSession } from 'mongoose'
import { checkIsBlockedByOtherUserService } from './BlockService.js'
import { checkUserIsFollowing } from './FeedService.js'
import { v4 as uuidV4 } from 'uuid'
import { logging } from './loggingService.js'

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
			logging('ERROR', '发送消息失败：参数不合法')
			return { success: false, message: '发送消息失败：参数不合法' }
		}

		// 验证用户token
		if (!(await checkUserTokenByUuidService(senderUuid, token)).success) {
			logging('ERROR', '发送消息失败：用户验证失败')
			return { success: false, message: '发送消息失败：用户验证失败' }
		}

		const { receiverUid, messageType, content } = sendMessageRequest

		// 获取接收者UUID（仅用于内部验证，不暴露）
		const receiverUuid = await getUserUuid(receiverUid)
		if (!receiverUuid) {
			logging('ERROR', '发送消息失败：接收者不存在')
			return { success: false, message: '发送消息失败：接收者不存在' }
		}

		// 不能给自己发消息
		const senderUid = await getUserUid(senderUuid)
		if (!senderUid) {
			logging('ERROR', '发送消息失败：发送者不存在')
			return { success: false, message: '发送消息失败：发送者不存在' }
		}
		if (senderUid === receiverUid) {
			logging('ERROR', '发送消息失败：不能给自己发消息')
			return { success: false, message: '发送消息失败：不能给自己发消息' }
		}

		// 检查接收者是否拉黑了发送者
		const checkBlockResult = await checkIsBlockedByOtherUserService({ targetUid: receiverUid }, senderUuid, token)
		if (checkBlockResult.success && checkBlockResult.isBlocked) {
			logging('ERROR', '发送消息失败：对方已拉黑你')
			return { success: false, message: '发送消息失败：对方已拉黑你' }
		}

		// 检查接收者是否关注了发送者（如果B关注了A，那么A可以无限发消息给B）
		const isFollowing = await checkUserIsFollowing(receiverUuid, senderUuid)

		// 如果接收者没有关注发送者，检查是否已经发送过3条或更多消息但对方未回复
		if (!isFollowing) {
			const hasUnreplied = await checkHasUnrepliedMessage(senderUuid, receiverUuid)
			if (hasUnreplied) {
				logging('ERROR', '发送消息失败：对方未回复你的消息，且对方未关注你（最多可发送3条消息）')
				return { success: false, message: '发送消息失败：对方未回复你的消息，且对方未关注你（最多可发送3条消息）' }
			}
		}

		// 验证消息内容
		if (messageType === IM_MESSAGE_TYPE.text) {
			if (!content || content.trim().length === 0) {
				logging('ERROR', '发送消息失败：消息内容不能为空')
				return { success: false, message: '发送消息失败：消息内容不能为空' }
			}
			if (content.length > 10000) {
				logging('ERROR', '发送消息失败：消息内容过长')
				return { success: false, message: '发送消息失败：消息内容过长' }
			}
		}

		// TODO: 增加消息审核 / 关键词过滤

		const session = await createAndStartSession()

		try {
			// 获取或创建会话（传入当前用户的UUID和对方的UID）
			const conversationResult = await getOrCreateConversation(senderUuid, receiverUid, session)
			if (!conversationResult.success || !conversationResult.conversation) {
				await abortAndEndSession(session)
				logging('ERROR', '发送消息失败：创建会话失败')
				return { success: false, message: '发送消息失败：创建会话失败' }
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
				logging('ERROR', '发送消息失败：插入消息失败')
				return { success: false, message: '发送消息失败：插入消息失败' }
			}

			// 更新会话信息
			// 确定发送者在会话中是 user1 还是 user2（通过比较 UUID）
			const isUser1 = senderUuid === conversation.user1Uuid
			const updateField = isUser1 ? 'user2UnreadCount' : 'user1UnreadCount'

			const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
			type Conversation = InferSchemaType<typeof conversationSchemaInstance>
			const updateWhere: QueryType<Conversation> = {
				conversationId,
			}
			const updateData: UpdateType<Conversation> = {
				lastMessageId: messageId,
				lastMessageTime: now,
				[updateField]: (conversation[updateField] || 0) + 1,
				editedDateTime: now,
				editedBy: senderUuid,
			}

			const updateConversationResult = await findOneAndUpdateData4MongoDB<Conversation>(
				updateWhere,
				updateData,
				conversationSchemaInstance,
				conversationCollectionName,
				{ session }
			)

			if (!updateConversationResult.success) {
				await abortAndEndSession(session)
				logging('ERROR', '发送消息失败：更新会话失败')
				return { success: false, message: '发送消息失败：更新会话失败' }
			}

			await commitAndEndSession(session)
			return { success: true, message: '发送消息成功', messageId, conversationId }
		} catch (error) {
			await abortAndEndSession(session)
			throw error
		}
	} catch (error) {
		logging('ERROR', '发送消息失败：未知错误', error)
		return { success: false, message: '发送消息失败：未知错误' }
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
			logging('ERROR', '获取会话列表失败：用户验证失败')
			return { success: false, message: '获取会话列表失败：用户验证失败' }
		}

		const { pagination } = getConversationListRequest
		const { page, pageSize } = pagination
		const skip = (page - 1) * pageSize

		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema

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
				$sort: { lastMessageTime: -1, editedDateTime: -1 },
			},
			{
				$skip: skip,
			},
			{
				$limit: pageSize,
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
				$count: 'totalCount',
			},
		]

		const conversationsResult = await selectDataByAggregateFromMongoDB(conversationSchemaInstance, conversationCollectionName, pipeline)
		const countResult = await selectDataByAggregateFromMongoDB(conversationSchemaInstance, conversationCollectionName, countPipeline)

		if (!conversationsResult.success) {
			logging('ERROR', '获取会话列表失败：查询失败')
			return { success: false, message: '获取会话列表失败：查询失败' }
		}

		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].totalCount : 0
		const conversations = (conversationsResult.result || []).map((item: unknown): ConversationInfo => {
			const itemData = item as Record<string, unknown>
			const lastMessageData = itemData.lastMessage as Record<string, unknown> | undefined
			let lastMessage = undefined
			if (lastMessageData) {
				// 判断当前用户是否删除了这条消息
				const isSender = lastMessageData.senderUuid === uuid
				const isDeleted = isSender ? lastMessageData.senderDeleted : lastMessageData.receiverDeleted

				lastMessage = {
					messageId: (lastMessageData.messageId as string) || '',
					messageType: lastMessageData.messageType as IM_MESSAGE_TYPE,
					content: (lastMessageData.content as string) || '',
					senderUuid: (lastMessageData.senderUuid as string) || '',
					isRecalled: (lastMessageData.isRecalled as boolean) || false,
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

		return { success: true, message: '获取会话列表成功', conversations, totalCount }
	} catch (error) {
		logging('ERROR', '获取会话列表失败：未知错误', error)
		return { success: false, message: '获取会话列表失败：未知错误' }
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
			logging('ERROR', '获取消息列表失败：用户验证失败')
			return { success: false, message: '获取消息列表失败：用户验证失败' }
		}

		if (!checkGetMessageListRequest(getMessageListRequest)) {
			logging('ERROR', '获取消息列表失败：参数不合法')
			return { success: false, message: '获取消息列表失败：参数不合法' }
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
			logging('ERROR', '获取消息列表失败：会话不存在或无权限')
			return { success: false, message: '获取消息列表失败：会话不存在或无权限' }
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
			}
			const cursorSelect: SelectType<Message> = {
				createdDateTime: 1,
			}
			const cursorResult = await selectDataFromMongoDB<Message>(cursorWhere, cursorSelect, messageSchemaInstance, messageCollectionName)
			if (cursorResult.success && cursorResult.result && cursorResult.result.length === 1) {
				cursorCreatedDateTime = cursorResult.result[0].createdDateTime
			}
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
			logging('ERROR', '获取消息列表失败：查询失败')
			return { success: false, message: '获取消息列表失败：查询失败' }
		}

		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].totalCount : 0
		const unreadMessageIds: string[] = []
		const messages: MessageInfo[] = await Promise.all(
			(messagesResult.result || []).map(async (item: unknown): Promise<MessageInfo> => {
			const itemData = item as Record<string, unknown>
				const senderUuid = (itemData.senderUuid as string) || ''
				const receiverUuid = (itemData.receiverUuid as string) || ''
				const messageId = (itemData.messageId as string) || ''
				const isRead = (itemData.isRead as boolean) || false

				const senderUid = senderUuid ? await getUserUid(senderUuid) : undefined
				const receiverUid = receiverUuid ? await getUserUid(receiverUuid) : undefined

				// 收集需要标记已读的消息（基于原始聚合结果里的 receiverUuid/isRead）
				if (markAsRead && !isRead && receiverUuid === uuid && messageId) {
					unreadMessageIds.push(messageId)
				}

			return {
				messageId,
				senderUid: senderUid || 0,
				receiverUid: receiverUid || 0,
				messageType: (itemData.messageType as IM_MESSAGE_TYPE) || IM_MESSAGE_TYPE.text,
				content: ((itemData.isRecalled as boolean) ? '' : (itemData.content as string)) || '',
				isRead,
				readTime: itemData.readTime as number | undefined,
				isRecalled: (itemData.isRecalled as boolean) || false,
				recalledTime: itemData.recalledTime as number | undefined,
				createdDateTime: (itemData.createdDateTime as number) || 0,
				createdBy: (itemData.createdBy as string) || '',
				editedDateTime: (itemData.editedDateTime as number) || 0,
				editedBy: (itemData.editedBy as string) || '',
			}
		})
		)

		// 如果需要标记为已读（使用上面收集的未读 messageId 列表）
		if (markAsRead && unreadMessageIds.length > 0) {
				await markMessageReadService({ conversationId, messageIds: unreadMessageIds }, uuid, token)
		}

		return { success: true, message: '获取消息列表成功', messages, totalCount }
	} catch (error) {
		logging('ERROR', '获取消息列表失败：未知错误', error)
		return { success: false, message: '获取消息列表失败：未知错误' }
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
			logging('ERROR', '标记消息已读失败：用户验证失败')
			return { success: false, message: '标记消息已读失败：用户验证失败' }
		}

		if (!checkMarkMessageReadRequest(markMessageReadRequest)) {
			logging('ERROR', '标记消息已读失败：参数不合法')
			return { success: false, message: '标记消息已读失败：参数不合法' }
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
			logging('ERROR', '标记消息已读失败：会话不存在或无权限')
			return { success: false, message: '标记消息已读失败：会话不存在或无权限' }
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
						{ session }
					)
					if (updateResult.success) {
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
							{ messageId: msg.messageId },
							messageUpdate,
							messageSchemaInstance,
							messageCollectionName,
							{ session }
						)
						if (updateResult.success) {
							markedCount++
						}
					}
				}
			}

			// 更新会话的未读消息数
			if (markedCount > 0) {
				const conversationUpdateWhere: QueryType<Conversation> = {
					conversationId,
				}
				const conversationUpdate: UpdateType<Conversation> = {
					[unreadCountField]: Math.max(0, (conversation[unreadCountField] || 0) - markedCount),
					editedDateTime: now,
					editedBy: uuid,
				}
				await findOneAndUpdateData4MongoDB<Conversation>(
					conversationUpdateWhere,
					conversationUpdate,
					conversationSchemaInstance,
					conversationCollectionName,
					{ session }
				)
			}

			await commitAndEndSession(session)
			return { success: true, message: '标记消息已读成功', markedCount }
		} catch (error) {
			await abortAndEndSession(session)
			throw error
		}
	} catch (error) {
		logging('ERROR', '标记消息已读失败：未知错误', error)
		return { success: false, message: '标记消息已读失败：未知错误' }
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
			logging('ERROR', '删除会话失败：用户验证失败')
			return { success: false, message: '删除会话失败：用户验证失败' }
		}

		if (!checkDeleteConversationRequest(deleteConversationRequest)) {
			logging('ERROR', '删除会话失败：参数不合法')
			return { success: false, message: '删除会话失败：参数不合法' }
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
			logging('ERROR', '删除会话失败：会话不存在或无权限')
			return { success: false, message: '删除会话失败：会话不存在或无权限' }
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
			conversationCollectionName
		)

		if (!updateResult.success) {
			logging('ERROR', '删除会话失败：更新失败')
			return { success: false, message: '删除会话失败：更新失败' }
		}

		return { success: true, message: '删除会话成功' }
	} catch (error) {
		logging('ERROR', '删除会话失败：未知错误', error)
		return { success: false, message: '删除会话失败：未知错误' }
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
			logging('ERROR', '删除消息失败：用户验证失败')
			return { success: false, message: '删除消息失败：用户验证失败' }
		}

		if (!checkDeleteMessageRequest(deleteMessageRequest)) {
			logging('ERROR', '删除消息失败：参数不合法')
			return { success: false, message: '删除消息失败：参数不合法' }
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
		}
		const messageResult = await selectDataFromMongoDB<Message>(messageWhere, messageSelect, messageSchemaInstance, messageCollectionName)

		if (!messageResult.success || !messageResult.result || messageResult.result.length === 0) {
			logging('ERROR', '删除消息失败：消息不存在或无权限')
			return { success: false, message: '删除消息失败：消息不存在或无权限' }
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
			messageCollectionName
		)

		if (!updateResult.success) {
			logging('ERROR', '删除消息失败：更新失败')
			return { success: false, message: '删除消息失败：更新失败' }
		}
		return { success: true, message: '删除消息成功' }
	} catch (error) {
		logging('ERROR', '删除消息失败：未知错误', error)
		return { success: false, message: '删除消息失败：未知错误' }
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
			logging('ERROR', '获取未读消息总数失败：用户验证失败')
			return { success: false, message: '获取未读消息总数失败：用户验证失败' }
		}

		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema

		// 构建聚合管道
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
					unreadCount: {
						$cond: {
							if: { $eq: ['$user1Uuid', uuid] },
							then: '$user1UnreadCount',
							else: '$user2UnreadCount',
						},
					},
				},
			},
			{
				$group: {
					_id: null,
					totalUnreadCount: { $sum: '$unreadCount' },
				},
			},
		]

		const result = await selectDataByAggregateFromMongoDB(conversationSchemaInstance, conversationCollectionName, pipeline)

		if (!result.success) {
			logging('ERROR', '获取未读消息总数失败：查询失败')
			return { success: false, message: '获取未读消息总数失败：查询失败' }
		}

		const totalUnreadCount = result.result && result.result.length > 0 ? result.result[0].totalUnreadCount : 0

		return { success: true, message: '获取未读消息总数成功', totalUnreadCount }
	} catch (error) {
		logging('ERROR', '获取未读消息总数失败：未知错误', error)
		return { success: false, message: '获取未读消息总数失败：未知错误' }
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
			logging('ERROR', '撤回消息失败：用户验证失败')
			return { success: false, message: '撤回消息失败：用户验证失败' }
		}

		if (!checkRecallMessageRequest(recallMessageRequest)) {
			logging('ERROR', '撤回消息失败：参数不合法')
			return { success: false, message: '撤回消息失败：参数不合法' }
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
			logging('ERROR', '撤回消息失败：消息不存在或无权限')
			return { success: false, message: '撤回消息失败：消息不存在或无权限' }
		}

		const message = messageResult.result[0]

		// 检查是否已经撤回
		if (message.isRecalled) {
			logging('ERROR', '撤回消息失败：消息已被撤回')
			return { success: false, message: '撤回消息失败：消息已被撤回' }
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
			messageCollectionName
		)

		if (!updateResult.success) {
			logging('ERROR', '撤回消息失败：更新失败')
			return { success: false, message: '撤回消息失败：更新失败' }
		}

		return { success: true, message: '撤回消息成功' }
	} catch (error) {
		logging('ERROR', '撤回消息失败：未知错误', error)
		return { success: false, message: '撤回消息失败：未知错误' }
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
			return false
		}
		const conversationId = generateConversationId(senderUid, receiverUid)
		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>

		// 查找会话中是否有发送者发送的消息
		const senderMessageWhere: QueryType<Message> = {
			conversationId,
			senderUuid,
			receiverUuid,
			senderDeleted: false,
		}
		const senderMessageSelect: SelectType<Message> = {
			messageId: 1,
			createdDateTime: 1,
		}
		const senderMessages = await selectDataFromMongoDB<Message>(senderMessageWhere, senderMessageSelect, messageSchemaInstance, messageCollectionName)

		if (!senderMessages.success || !senderMessages.result || senderMessages.result.length === 0) {
			return false
		}

		// 如果发送的消息少于3条，允许继续发送
		if (senderMessages.result.length < 3) {
			return false
		}

		// 查找是否有接收者回复的消息
		const receiverMessageWhere: QueryType<Message> = {
			conversationId,
			senderUuid: receiverUuid,
			receiverUuid: senderUuid,
			senderDeleted: false,
		}
		const receiverMessageSelect: SelectType<Message> = {
			messageId: 1,
			createdDateTime: 1,
		}
		const receiverMessages = await selectDataFromMongoDB<Message>(receiverMessageWhere, receiverMessageSelect, messageSchemaInstance, messageCollectionName)

		// 如果发送者有3条或更多消息，但接收者没有回复，则返回true
		if (receiverMessages.success && receiverMessages.result && receiverMessages.result.length > 0) {
			// 如果接收者曾经回复过（有任何回复消息），就允许发送者继续无限发送（返回false）
			// 不需要检查最后一条消息的时间，只要曾经回复过即可
			return false
		}

		// 如果接收者完全没有回复，且发送者已发送3条或更多消息，则返回true
		return receiverMessages.success && (!receiverMessages.result || receiverMessages.result.length === 0)
	} catch (error) {
		logging('ERROR', '检查是否有未回复消息失败：', error)
		return false
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
					session ? { session } : undefined
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

		const insertResult = await insertData2MongoDB<Conversation>(conversationData, conversationSchemaInstance, conversationCollectionName, session ? { session } : undefined)

		if (!insertResult.success) {
			return { success: false }
		}

		return { success: true, conversation: conversationData }
	} catch (error) {
		logging('ERROR', '获取或创建会话失败：', error)
		return { success: false }
	}
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

