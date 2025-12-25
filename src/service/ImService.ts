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
	GetUnreadMessageCountRequestDto,
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
import { BlockListSchema } from '../dbPool/schema/BlockSchema.js'
import { FollowingSchema } from '../dbPool/schema/FeedSchema.js'
import { UserInfoSchema } from '../dbPool/schema/UserSchema.js'
import { v4 as uuidV4 } from 'uuid'

/**
 * 生成会话ID（确保两个用户之间的会话ID唯一且一致）
 */
const generateConversationId = (user1Uuid: string, user2Uuid: string): string => {
	// 按字典序排序，确保两个用户之间的会话ID唯一
	const [uuid1, uuid2] = [user1Uuid, user2Uuid].sort()
	return `conv_${uuid1}_${uuid2}`
}

/**
 * 检查用户是否被拉黑
 */
const checkUserIsBlocked = async (blockerUuid: string, blockedUuid: string): Promise<boolean> => {
	try {
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockList = InferSchemaType<typeof blockListSchemaInstance>
		const where: QueryType<BlockList> = {
			type: 'block',
			operatorUUID: blockerUuid,
			value: blockedUuid,
		}
		const select: SelectType<BlockList> = {}
		const result = await selectDataFromMongoDB<BlockList>(where, select, blockListSchemaInstance, blockListCollectionName)
		return result.success && result.result && result.result.length > 0
	} catch (error) {
		console.error('ERROR', '检查用户是否被拉黑失败：', error)
		return false
	}
}

/**
 * 检查用户是否关注了对方
 */
const checkUserIsFollowing = async (followerUuid: string, followingUuid: string): Promise<boolean> => {
	try {
		const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
		type Following = InferSchemaType<typeof followingSchemaInstance>
		const where: QueryType<Following> = {
			followerUuid,
			followingUuid,
		}
		const select: SelectType<Following> = {}
		const result = await selectDataFromMongoDB<Following>(where, select, followingSchemaInstance, followingCollectionName)
		return result.success && result.result && result.result.length > 0
	} catch (error) {
		console.error('ERROR', '检查用户是否关注失败：', error)
		return false
	}
}

/**
 * 检查是否已经发送过消息但对方未回复
 */
const checkHasUnrepliedMessage = async (senderUuid: string, receiverUuid: string): Promise<boolean> => {
	try {
		const conversationId = generateConversationId(senderUuid, receiverUuid)
		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>
		
		// 查找会话中是否有发送者发送的消息
		const senderMessageWhere: QueryType<Message> = {
			conversationId,
			senderUuid,
			receiverUuid,
			senderDeleted: { $ne: true } as any,
		}
		const senderMessageSelect: SelectType<Message> = {
			messageId: 1,
			createDateTime: 1,
		}
		const senderMessages = await selectDataFromMongoDB<Message>(senderMessageWhere, senderMessageSelect, messageSchemaInstance, messageCollectionName)
		
		if (!senderMessages.success || !senderMessages.result || senderMessages.result.length === 0) {
			return false
		}
		
		// 查找是否有接收者回复的消息
		const receiverMessageWhere: QueryType<Message> = {
			conversationId,
			senderUuid: receiverUuid,
			receiverUuid: senderUuid,
			senderDeleted: { $ne: true } as any,
		}
		const receiverMessageSelect: SelectType<Message> = {
			messageId: 1,
		}
		const receiverMessages = await selectDataFromMongoDB<Message>(receiverMessageWhere, receiverMessageSelect, messageSchemaInstance, messageCollectionName)
		
		// 如果发送者有消息，但接收者没有回复，则返回true
		if (receiverMessages.success && receiverMessages.result && receiverMessages.result.length > 0) {
			// 检查接收者的最后一条消息是否在发送者的最后一条消息之后
			const lastSenderMessage = senderMessages.result.sort((a, b) => b.createDateTime - a.createDateTime)[0]
			const lastReceiverMessage = receiverMessages.result.sort((a, b) => b.createDateTime - a.createDateTime)[0]
			return lastReceiverMessage.createDateTime < lastSenderMessage.createDateTime
		}
		
		return receiverMessages.success && (!receiverMessages.result || receiverMessages.result.length === 0)
	} catch (error) {
		console.error('ERROR', '检查是否有未回复消息失败：', error)
		return false
	}
}

/**
 * 获取或创建会话
 */
const getOrCreateConversation = async (user1Uuid: string, user2Uuid: string): Promise<{ success: boolean; conversation?: InferSchemaType<typeof ImConversationSchema.schemaInstance> }> => {
	try {
		const conversationId = generateConversationId(user1Uuid, user2Uuid)
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		
		// 尝试查找现有会话（即使被删除也可以恢复）
		const where: QueryType<Conversation> = {
			conversationId,
		}
		const select: SelectType<Conversation> = {}
		const existing = await selectDataFromMongoDB<Conversation>(where, select, conversationSchemaInstance, conversationCollectionName)
		
		if (existing.success && existing.result && existing.result.length > 0) {
			const conversation = existing.result[0]
			const now = new Date().getTime()
			const [uuid1, uuid2] = [user1Uuid, user2Uuid].sort()
			const isUser1 = user1Uuid === uuid1
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
					editDateTime: now,
				}
				
				// 如果对方也删除了，同时恢复对方
				if (conversation[otherDeletedField]) {
					updateData[otherDeletedField] = false
				}
				
				const updateResult = await findOneAndUpdateData4MongoDB<Conversation>(
					updateWhere,
					updateData,
					conversationSchemaInstance,
					conversationCollectionName
				)
				if (updateResult.success && updateResult.result) {
					return { success: true, conversation: updateResult.result }
				}
			}
			return { success: true, conversation }
		}
		
		// 创建新会话
		const now = new Date().getTime()
		const [uuid1, uuid2] = [user1Uuid, user2Uuid].sort()
		const conversationData: Conversation = {
			conversationId,
			user1Uuid: uuid1,
			user2Uuid: uuid2,
			user1UnreadCount: 0,
			user2UnreadCount: 0,
			user1Deleted: false,
			user2Deleted: false,
			createDateTime: now,
			editDateTime: now,
		}
		
		const insertResult = await insertData2MongoDB<Conversation>(conversationData, conversationSchemaInstance, conversationCollectionName)
		
		if (!insertResult.success) {
			return { success: false }
		}
		
		return { success: true, conversation: conversationData }
	} catch (error) {
		console.error('ERROR', '获取或创建会话失败：', error)
		return { success: false }
	}
}

/**
 * 发送消息
 */
export const sendMessageService = async (
	sendMessageRequest: SendMessageRequestDto,
	senderUuid: string,
	token: string
): Promise<SendMessageResponseDto> => {
	try {
		// 验证请求参数
		if (!checkSendMessageRequest(sendMessageRequest)) {
			console.error('ERROR', '发送消息失败：参数不合法')
			return { success: false, message: '发送消息失败：参数不合法' }
		}
		
		// 验证用户token
		if (!(await checkUserTokenByUuidService(senderUuid, token)).success) {
			console.error('ERROR', '发送消息失败：用户验证失败')
			return { success: false, message: '发送消息失败：用户验证失败' }
		}
		
		const { receiverUid, messageType, content } = sendMessageRequest
		
		// 获取接收者UUID
		const receiverUuid = await getUserUuid(receiverUid)
		if (!receiverUuid) {
			console.error('ERROR', '发送消息失败：接收者不存在')
			return { success: false, message: '发送消息失败：接收者不存在' }
		}
		
		// 不能给自己发消息
		if (senderUuid === receiverUuid) {
			console.error('ERROR', '发送消息失败：不能给自己发消息')
			return { success: false, message: '发送消息失败：不能给自己发消息' }
		}
		
		// 检查接收者是否拉黑了发送者
		const isBlocked = await checkUserIsBlocked(receiverUuid, senderUuid)
		if (isBlocked) {
			console.error('ERROR', '发送消息失败：对方已拉黑你')
			return { success: false, message: '发送消息失败：对方已拉黑你' }
		}
		
		// 检查发送者是否关注了接收者
		const isFollowing = await checkUserIsFollowing(senderUuid, receiverUuid)
		
		// 如果发送者没有关注接收者，检查是否已经发送过消息但对方未回复
		if (!isFollowing) {
			const hasUnreplied = await checkHasUnrepliedMessage(senderUuid, receiverUuid)
			if (hasUnreplied) {
				console.error('ERROR', '发送消息失败：对方未回复你的上一条消息，且你未关注对方')
				return { success: false, message: '发送消息失败：对方未回复你的上一条消息，且你未关注对方' }
			}
		}
		
		// 验证消息内容
		if (messageType === IM_MESSAGE_TYPE.text) {
			if (!content || content.trim().length === 0) {
				console.error('ERROR', '发送消息失败：消息内容不能为空')
				return { success: false, message: '发送消息失败：消息内容不能为空' }
			}
			if (content.length > 10000) {
				console.error('ERROR', '发送消息失败：消息内容过长')
				return { success: false, message: '发送消息失败：消息内容过长' }
			}
		}
		
		const session = await createAndStartSession()
		
		try {
			// 获取或创建会话
			const conversationResult = await getOrCreateConversation(senderUuid, receiverUuid)
			if (!conversationResult.success || !conversationResult.conversation) {
				await abortAndEndSession(session)
				console.error('ERROR', '发送消息失败：创建会话失败')
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
				createDateTime: now,
				editDateTime: now,
			}
			
			const insertMessageResult = await insertData2MongoDB<Message>(messageData, messageSchemaInstance, messageCollectionName, { session })
			if (!insertMessageResult.success) {
				await abortAndEndSession(session)
				console.error('ERROR', '发送消息失败：插入消息失败')
				return { success: false, message: '发送消息失败：插入消息失败' }
			}
			
			// 更新会话信息
			const [uuid1, uuid2] = [senderUuid, receiverUuid].sort()
			const isUser1 = senderUuid === uuid1
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
				editDateTime: now,
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
				console.error('ERROR', '发送消息失败：更新会话失败')
				return { success: false, message: '发送消息失败：更新会话失败' }
			}
			
			await commitAndEndSession(session)
			return {
				success: true,
				message: '发送消息成功',
				messageId,
				conversationId,
			}
		} catch (error) {
			await abortAndEndSession(session)
			throw error
		}
	} catch (error) {
		console.error('ERROR', '发送消息失败：未知错误', error)
		return { success: false, message: '发送消息失败：未知错误' }
	}
}

/**
 * 获取会话列表
 */
export const getConversationListService = async (
	getConversationListRequest: GetConversationListRequestDto,
	uuid: string,
	token: string
): Promise<GetConversationListResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '获取会话列表失败：用户验证失败')
			return { success: false, message: '获取会话列表失败：用户验证失败' }
		}
		
		const { page = 1, pageSize = 20 } = getConversationListRequest
		const skip = (page - 1) * pageSize
		
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		
		// 构建查询管道
		const pipeline: PipelineStage[] = [
			{
				$match: {
					$or: [
						{ user1Uuid: uuid, user1Deleted: { $ne: true } },
						{ user2Uuid: uuid, user2Deleted: { $ne: true } },
					],
				},
			},
			{
				$sort: { lastMessageTime: -1, editDateTime: -1 },
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
						uuid: '$otherUserUuid',
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
								content: {
									$cond: {
										if: '$lastMessageData.isRecalled',
										then: '[消息已撤回]',
										else: '$lastMessageData.content',
									},
								},
								senderUuid: '$lastMessageData.senderUuid',
								createDateTime: '$lastMessageData.createDateTime',
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
						{ user1Uuid: uuid, user1Deleted: { $ne: true } },
						{ user2Uuid: uuid, user2Deleted: { $ne: true } },
					],
				},
			},
			{
				$count: 'total',
			},
		]
		
		const conversationsResult = await selectDataByAggregateFromMongoDB(conversationSchemaInstance, conversationCollectionName, pipeline)
		const countResult = await selectDataByAggregateFromMongoDB(conversationSchemaInstance, conversationCollectionName, countPipeline)
		
		if (!conversationsResult.success) {
			console.error('ERROR', '获取会话列表失败：查询失败')
			return { success: false, message: '获取会话列表失败：查询失败' }
		}
		
		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].total : 0
		const conversations = (conversationsResult.result || []).map((item: any): ConversationInfo => ({
			conversationId: item.conversationId || '',
			otherUser: {
				uid: item.otherUser?.uid || 0,
				uuid: item.otherUser?.uuid || '',
				username: item.otherUser?.username,
				userNickname: item.otherUser?.userNickname,
				avatar: item.otherUser?.avatar,
			},
			lastMessage: item.lastMessage || undefined,
			unreadCount: item.unreadCount || 0,
			lastMessageTime: item.lastMessageTime,
		}))
		
		return {
			success: true,
			message: '获取会话列表成功',
			conversations,
			totalCount,
		}
	} catch (error) {
		console.error('ERROR', '获取会话列表失败：未知错误', error)
		return { success: false, message: '获取会话列表失败：未知错误' }
	}
}

/**
 * 获取消息列表
 */
export const getMessageListService = async (
	getMessageListRequest: GetMessageListRequestDto,
	uuid: string,
	token: string
): Promise<GetMessageListResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '获取消息列表失败：用户验证失败')
			return { success: false, message: '获取消息列表失败：用户验证失败' }
		}
		
		if (!checkGetMessageListRequest(getMessageListRequest)) {
			console.error('ERROR', '获取消息列表失败：参数不合法')
			return { success: false, message: '获取消息列表失败：参数不合法' }
		}
		
		const { conversationId, page = 1, pageSize = 50, markAsRead = false } = getMessageListRequest
		const skip = (page - 1) * pageSize
		
		// 验证会话是否存在且用户有权限访问
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		const conversationWhere: QueryType<Conversation> = {
			conversationId,
			$or: [
				{ user1Uuid: uuid },
				{ user2Uuid: uuid },
			],
		} as any
		const conversationSelect: SelectType<Conversation> = {
			conversationId: 1,
		}
		const conversationResult = await selectDataFromMongoDB<Conversation>(conversationWhere, conversationSelect, conversationSchemaInstance, conversationCollectionName)
		
		if (!conversationResult.success || !conversationResult.result || conversationResult.result.length === 0) {
			console.error('ERROR', '获取消息列表失败：会话不存在或无权限')
			return { success: false, message: '获取消息列表失败：会话不存在或无权限' }
		}
		
		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>
		
		// 构建查询管道
		const pipeline: PipelineStage[] = [
			{
				$match: {
					conversationId,
					$or: [
						{ senderUuid: uuid, senderDeleted: { $ne: true } },
						{ receiverUuid: uuid, receiverDeleted: { $ne: true } },
					],
				},
			},
			{
				$sort: { createDateTime: -1 },
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
					createDateTime: 1,
				},
			},
		]
		
		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					conversationId,
					$or: [
						{ senderUuid: uuid, senderDeleted: { $ne: true } },
						{ receiverUuid: uuid, receiverDeleted: { $ne: true } },
					],
				},
			},
			{
				$count: 'total',
			},
		]
		
		const messagesResult = await selectDataByAggregateFromMongoDB(messageSchemaInstance, messageCollectionName, pipeline)
		const countResult = await selectDataByAggregateFromMongoDB(messageSchemaInstance, messageCollectionName, countPipeline)
		
		if (!messagesResult.success) {
			console.error('ERROR', '获取消息列表失败：查询失败')
			return { success: false, message: '获取消息列表失败：查询失败' }
		}
		
		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].total : 0
		const messages = (messagesResult.result || []).map((item: any): MessageInfo => ({
			messageId: item.messageId || '',
			senderUuid: item.senderUuid || '',
			receiverUuid: item.receiverUuid || '',
			messageType: item.messageType || IM_MESSAGE_TYPE.text,
			content: (item.isRecalled ? '[消息已撤回]' : item.content) || '', // 如果已撤回，显示"[消息已撤回]"
			isRead: item.isRead || false,
			readTime: item.readTime,
			isRecalled: item.isRecalled || false,
			recalledTime: item.recalledTime,
			createDateTime: item.createDateTime || 0,
		}))
		
		// 如果需要标记为已读
		if (markAsRead && messages.length > 0) {
			const unreadMessageIds = messages.filter(m => !m.isRead && m.receiverUuid === uuid).map(m => m.messageId)
			if (unreadMessageIds.length > 0) {
				await markMessageReadService({ conversationId, messageIds: unreadMessageIds }, uuid, token)
			}
		}
		
		return {
			success: true,
			message: '获取消息列表成功',
			messages,
			totalCount,
		}
	} catch (error) {
		console.error('ERROR', '获取消息列表失败：未知错误', error)
		return { success: false, message: '获取消息列表失败：未知错误' }
	}
}

/**
 * 标记消息已读
 */
export const markMessageReadService = async (
	markMessageReadRequest: MarkMessageReadRequestDto,
	uuid: string,
	token: string
): Promise<MarkMessageReadResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '标记消息已读失败：用户验证失败')
			return { success: false, message: '标记消息已读失败：用户验证失败' }
		}
		
		if (!checkMarkMessageReadRequest(markMessageReadRequest)) {
			console.error('ERROR', '标记消息已读失败：参数不合法')
			return { success: false, message: '标记消息已读失败：参数不合法' }
		}
		
		const { conversationId, messageIds } = markMessageReadRequest
		
		// 验证会话是否存在且用户有权限访问
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		const conversationWhere: QueryType<Conversation> = {
			conversationId,
			$or: [
				{ user1Uuid: uuid },
				{ user2Uuid: uuid },
			],
		} as any
		const conversationSelect: SelectType<Conversation> = {
			conversationId: 1,
			user1Uuid: 1,
			user2Uuid: 1,
		}
		const conversationResult = await selectDataFromMongoDB<Conversation>(conversationWhere, conversationSelect, conversationSchemaInstance, conversationCollectionName)
		
		if (!conversationResult.success || !conversationResult.result || conversationResult.result.length === 0) {
			console.error('ERROR', '标记消息已读失败：会话不存在或无权限')
			return { success: false, message: '标记消息已读失败：会话不存在或无权限' }
		}
		
		const conversation = conversationResult.result[0]
		const [uuid1, uuid2] = [conversation.user1Uuid, conversation.user2Uuid].sort()
		const isUser1 = uuid === uuid1
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
						editDateTime: now,
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
							editDateTime: now,
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
					editDateTime: now,
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
			return {
				success: true,
				message: '标记消息已读成功',
				markedCount,
			}
		} catch (error) {
			await abortAndEndSession(session)
			throw error
		}
	} catch (error) {
		console.error('ERROR', '标记消息已读失败：未知错误', error)
		return { success: false, message: '标记消息已读失败：未知错误' }
	}
}

/**
 * 删除会话
 */
export const deleteConversationService = async (
	deleteConversationRequest: DeleteConversationRequestDto,
	uuid: string,
	token: string
): Promise<DeleteConversationResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '删除会话失败：用户验证失败')
			return { success: false, message: '删除会话失败：用户验证失败' }
		}
		
		if (!checkDeleteConversationRequest(deleteConversationRequest)) {
			console.error('ERROR', '删除会话失败：参数不合法')
			return { success: false, message: '删除会话失败：参数不合法' }
		}
		
		const { conversationId } = deleteConversationRequest
		
		// 验证会话是否存在且用户有权限访问
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		const conversationWhere: QueryType<Conversation> = {
			conversationId,
			$or: [
				{ user1Uuid: uuid },
				{ user2Uuid: uuid },
			],
		} as any
		const conversationSelect: SelectType<Conversation> = {
			conversationId: 1,
			user1Uuid: 1,
			user2Uuid: 1,
		}
		const conversationResult = await selectDataFromMongoDB<Conversation>(conversationWhere, conversationSelect, conversationSchemaInstance, conversationCollectionName)
		
		if (!conversationResult.success || !conversationResult.result || conversationResult.result.length === 0) {
			console.error('ERROR', '删除会话失败：会话不存在或无权限')
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
			editDateTime: now,
		}
		
		const updateResult = await findOneAndUpdateData4MongoDB<Conversation>(
			updateWhere,
			updateData,
			conversationSchemaInstance,
			conversationCollectionName
		)
		
		if (!updateResult.success) {
			console.error('ERROR', '删除会话失败：更新失败')
			return { success: false, message: '删除会话失败：更新失败' }
		}
		
		return { success: true, message: '删除会话成功' }
	} catch (error) {
		console.error('ERROR', '删除会话失败：未知错误', error)
		return { success: false, message: '删除会话失败：未知错误' }
	}
}

/**
 * 删除消息
 */
export const deleteMessageService = async (
	deleteMessageRequest: DeleteMessageRequestDto,
	uuid: string,
	token: string
): Promise<DeleteMessageResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '删除消息失败：用户验证失败')
			return { success: false, message: '删除消息失败：用户验证失败' }
		}
		
		if (!checkDeleteMessageRequest(deleteMessageRequest)) {
			console.error('ERROR', '删除消息失败：参数不合法')
			return { success: false, message: '删除消息失败：参数不合法' }
		}
		
		const { messageId } = deleteMessageRequest
		
		// 验证消息是否存在且用户有权限删除
		const { collectionName: messageCollectionName, schemaInstance: messageSchemaInstance } = ImMessageSchema
		type Message = InferSchemaType<typeof messageSchemaInstance>
		const messageWhere: QueryType<Message> = {
			messageId,
			$or: [
				{ senderUuid: uuid },
				{ receiverUuid: uuid },
			],
		} as any
		const messageSelect: SelectType<Message> = {
			messageId: 1,
			senderUuid: 1,
			receiverUuid: 1,
		}
		const messageResult = await selectDataFromMongoDB<Message>(messageWhere, messageSelect, messageSchemaInstance, messageCollectionName)
		
		if (!messageResult.success || !messageResult.result || messageResult.result.length === 0) {
			console.error('ERROR', '删除消息失败：消息不存在或无权限')
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
			editDateTime: now,
		}
		
		const updateResult = await findOneAndUpdateData4MongoDB<Message>(
			updateWhere,
			updateData,
			messageSchemaInstance,
			messageCollectionName
		)
		
		if (!updateResult.success) {
			console.error('ERROR', '删除消息失败：更新失败')
			return { success: false, message: '删除消息失败：更新失败' }
		}
		
		return { success: true, message: '删除消息成功' }
	} catch (error) {
		console.error('ERROR', '删除消息失败：未知错误', error)
		return { success: false, message: '删除消息失败：未知错误' }
	}
}

/**
 * 获取未读消息总数
 */
export const getUnreadMessageCountService = async (
	getUnreadMessageCountRequest: GetUnreadMessageCountRequestDto,
	uuid: string,
	token: string
): Promise<GetUnreadMessageCountResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '获取未读消息总数失败：用户验证失败')
			return { success: false, message: '获取未读消息总数失败：用户验证失败' }
		}
		
		const { collectionName: conversationCollectionName, schemaInstance: conversationSchemaInstance } = ImConversationSchema
		type Conversation = InferSchemaType<typeof conversationSchemaInstance>
		
		// 构建聚合管道
		const pipeline: PipelineStage[] = [
			{
				$match: {
					$or: [
						{ user1Uuid: uuid, user1Deleted: { $ne: true } },
						{ user2Uuid: uuid, user2Deleted: { $ne: true } },
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
			console.error('ERROR', '获取未读消息总数失败：查询失败')
			return { success: false, message: '获取未读消息总数失败：查询失败' }
		}
		
		const totalUnreadCount = result.result && result.result.length > 0 ? result.result[0].totalUnreadCount : 0
		
		return {
			success: true,
			message: '获取未读消息总数成功',
			totalUnreadCount,
		}
	} catch (error) {
		console.error('ERROR', '获取未读消息总数失败：未知错误', error)
		return { success: false, message: '获取未读消息总数失败：未知错误' }
	}
}

/**
 * 验证发送消息请求
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
 * 撤回消息
 */
export const recallMessageService = async (
	recallMessageRequest: RecallMessageRequestDto,
	uuid: string,
	token: string
): Promise<RecallMessageResponseDto> => {
	try {
		// 验证用户token
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			console.error('ERROR', '撤回消息失败：用户验证失败')
			return { success: false, message: '撤回消息失败：用户验证失败' }
		}
		
		if (!checkRecallMessageRequest(recallMessageRequest)) {
			console.error('ERROR', '撤回消息失败：参数不合法')
			return { success: false, message: '撤回消息失败：参数不合法' }
		}
		
		const { messageId } = recallMessageRequest
		const RECALL_TIME_LIMIT = 2 * 60 * 1000 // 2分钟内可以撤回
		
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
			createDateTime: 1,
			isRecalled: 1,
		}
		const messageResult = await selectDataFromMongoDB<Message>(messageWhere, messageSelect, messageSchemaInstance, messageCollectionName)
		
		if (!messageResult.success || !messageResult.result || messageResult.result.length === 0) {
			console.error('ERROR', '撤回消息失败：消息不存在或无权限')
			return { success: false, message: '撤回消息失败：消息不存在或无权限' }
		}
		
		const message = messageResult.result[0]
		
		// 检查是否已经撤回
		if (message.isRecalled) {
			console.error('ERROR', '撤回消息失败：消息已被撤回')
			return { success: false, message: '撤回消息失败：消息已被撤回' }
		}
		
		// 检查是否超过撤回时间限制
		const now = new Date().getTime()
		const timeSinceCreation = now - message.createDateTime
		if (timeSinceCreation > RECALL_TIME_LIMIT) {
			console.error('ERROR', '撤回消息失败：超过撤回时间限制（2分钟）')
			return { success: false, message: '撤回消息失败：超过撤回时间限制（2分钟）' }
		}
		
		// 更新消息为已撤回（不修改content，保留原始内容）
		const updateWhere: QueryType<Message> = {
			messageId,
		}
		const updateData: UpdateType<Message> = {
			isRecalled: true,
			recalledTime: now,
			editDateTime: now,
		}
		
		const updateResult = await findOneAndUpdateData4MongoDB<Message>(
			updateWhere,
			updateData,
			messageSchemaInstance,
			messageCollectionName
		)
		
		if (!updateResult.success) {
			console.error('ERROR', '撤回消息失败：更新失败')
			return { success: false, message: '撤回消息失败：更新失败' }
		}
		
		return { success: true, message: '撤回消息成功' }
	} catch (error) {
		console.error('ERROR', '撤回消息失败：未知错误', error)
		return { success: false, message: '撤回消息失败：未知错误' }
	}
}

/**
 * 验证撤回消息请求
 */
const checkRecallMessageRequest = (request: RecallMessageRequestDto): boolean => {
	return (
		request.messageId !== undefined &&
		request.messageId !== null &&
		typeof request.messageId === 'string' &&
		request.messageId.length > 0
	)
}

