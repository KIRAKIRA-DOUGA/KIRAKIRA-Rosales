import { InferSchemaType, PipelineStage } from "mongoose";
import safeRegex from 'safe-regex';
import { AddRegexRequestDto, AddRegexResponseDto, BlockKeywordRequestDto, BlockKeywordResponseDto, BlockTagRequestDto, BlockTagResponseDto, BlockUserByUidRequestDto, BlockUserByUidResponseDto, CheckContentIsBlockedRequestDto, CheckIsBlockedByOtherUserRequestDto, CheckIsBlockedByOtherUserResponseDto, CheckIsBlockedResponseDto, CheckTagIsBlockedRequestDto, CheckUserIsBlockedRequestDto, CheckUserIsBlockedResponseDto, GetBlockListRequestDto, GetBlockListResponseDto, HideUserByUidRequestDto, HideUserByUidResponseDto, RemoveRegexRequestDto, RemoveRegexResponseDto, ShowUserByUidRequestDto, ShowUserByUidResponseDto, UnblockKeywordRequestDto, UnblockKeywordResponseDto, UnblockTagRequestDto, UnblockTagResponseDto, UnblockUserByUidRequestDto, UnblockUserByUidResponseDto } from "../controller/BlockControllerDto.js";
import { checkUserBootstrapHintByUid, checkUserExistsByUIDService, checkUserTokenByUuidService, getUserUid, getUserUuid } from "./UserService.js";
import { QueryType, SelectType } from "../dbPool/DbClusterPoolTypes.js";
import { abortAndEndSession, commitAndEndSession, createAndStartSession } from "../common/MongoDBSessionTool.js";
import { selectDataFromMongoDB, insertData2MongoDB, deleteOneDataFromMongoDB, selectDataByAggregateFromMongoDB } from "../dbPool/DbClusterPool.js";
import { BlockListSchema, UnblockListSchema } from "../dbPool/schema/BlockSchema.js";
import { parseInteger } from '../common/ValidTool.js'
import { logging } from "./loggingService.js";

const MAX_KEYWORD_LENGTH = 30; // 关键词长度限制
const MAX_REGEX_LENGTH = 30; // 正则表达式长度限制

/**
 * 屏蔽用户
 * @param blockUserByUidRequest 屏蔽用户的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 */
export const blockUserByUidService = async (blockUserByUidRequest: BlockUserByUidRequestDto, uuid: string, token: string): Promise<BlockUserByUidResponseDto> => {
	try {
		if (!checkBlockUserByUidRequest(blockUserByUidRequest)) {
			return { success: false, message: '屏蔽用户请求载荷不合法' }
		}

		const { blockUid } = blockUserByUidRequest
		if (!checkUserExistsByUIDService({ uid: blockUid })) {
			logging('ERROR', '屏蔽用户失败，用户不存在')
			return { success: false, message: '屏蔽用户失败，用户不存在' }
		}

		const userUuid = await getUserUuid(blockUid)
		const operatorUid = await getUserUid(uuid)

		if (!userUuid || !operatorUid) {
			logging('ERROR', '屏蔽用户失败，用户不存在')
			return { success: false, message: '屏蔽用户失败，用户不存在' }
		}

		if (userUuid === uuid) {
			logging('ERROR', '屏蔽用户失败，不能屏蔽自己')
			return { success: false, message: '屏蔽用户失败，不能屏蔽自己' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '屏蔽用户失败，用户 Token 不合法')
			return { success: false, message: '屏蔽用户失败，用户 Token 不合法' }
		}

		if (await getBlocklistCount('block', uuid) > 500) {
			return { success: false, message: '屏蔽用户失败，屏蔽列表已达上限' } // TODO: 增加粉丝数判断
		}

		const now = new Date().getTime()
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'block',
			value: userUuid,
			operatorUUID: uuid,
		}
		const blockListSelect: SelectType<BlockListSchemaType> = {
			operatorUid: 1,
		}
		const blockListResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName)
		if (blockListResult.success && blockListResult.result && blockListResult.result.length > 0) {
			return { success: false, message: '屏蔽用户失败，该用户已经被你屏蔽' }
		}

		const blockListData: BlockListSchemaType = {
			type: 'block',
			value: userUuid,
			operatorUid,
			operatorUUID: uuid,
			createDateTime: now,
		}

		const insertResult = await insertData2MongoDB<BlockListSchemaType>(blockListData, blockListSchemaInstance, blockListCollectionName)
		if (!insertResult.success) {
			logging('ERROR', '屏蔽用户失败，查询数据失败')
			return { success: false, message: '屏蔽用户失败，查询数据失败' }
		}
		return { success: true, message: '屏蔽用户成功' }
	}
	catch (error) {
		logging('ERROR', '屏蔽用户失败，未知错误', error)
		return { success: false, message: '屏蔽用户失败' }
	}
}

/**
 * 隐藏用户
 * @param blockTagRequest 屏蔽关键词的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 屏蔽关键词的请求响应
 */
export const hideUserByUidService = async (hideUserByUidRequest: HideUserByUidRequestDto, uuid: string, token: string): Promise<HideUserByUidResponseDto> => {
	try {
		if (!checkHideUserByUidRequest(hideUserByUidRequest)) {
			return { success: false, message: '隐藏用户失败，隐藏用户请求载荷不合法' }
		}

		const { hideUid } = hideUserByUidRequest
		if (!checkUserExistsByUIDService({ uid: hideUid })) {
			logging('ERROR', '隐藏用户失败，用户不存在')
			return { success: false, message: '隐藏用户失败，用户不存在' }
		}

		const userUuid = await getUserUuid(hideUid)
		const operatorUid = await getUserUid(uuid)

		if (!userUuid || !operatorUid) {
			logging('ERROR', '隐藏用户失败，用户不存在')
			return { success: false, message: '隐藏用户失败，用户不存在' }
		}
		if (userUuid === uuid) {
			logging('ERROR', '隐藏用户失败，不能隐藏自己')
			return { success: false, message: '隐藏用户失败，不能隐藏自己' }
		}
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '隐藏用户失败，用户 Token 不合法')
			return { success: false, message: '隐藏用户失败，用户 Token 不合法' }
		}

		if (await getBlocklistCount('hide', uuid) > 500) {
			return { success: false, message: '隐藏用户失败，隐藏列表已达上限' } // TODO: 增加粉丝数判断
		}

		const now = new Date().getTime()
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'hide',
			value: userUuid,
			operatorUUID: uuid,
		}
		const blockListSelect: SelectType<BlockListSchemaType> = {
			operatorUid: 1,
		}
		const blockListResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName)
		if (blockListResult.success && blockListResult.result && blockListResult.result.length > 0) {
			return { success: false, message: '隐藏用户失败，用户已被隐藏' }
		}

		const blockListData: BlockListSchemaType = {
			type: 'hide',
			value: userUuid,
			operatorUid,
			operatorUUID: uuid,
			createDateTime: now,
		}

		const insertResult = await insertData2MongoDB<BlockListSchemaType>(blockListData, blockListSchemaInstance, blockListCollectionName)
		if (!insertResult.success) {
			logging('ERROR', '隐藏用户失败，查询数据失败')
			return { success: false, message: '隐藏用户失败，查询数据失败' }
		}
		return { success: true, message: '隐藏用户成功' }
	}
	catch (error) {
		logging('ERROR', '隐藏用户失败，未知错误', error)
		return { success: false, message: '隐藏用户失败，未知错误' }
	}
}

/**
 * 屏蔽关键词
 * @param blockTagRequest 屏蔽关键词的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 屏蔽关键词的请求响应
 */
export const blockKeywordService = async (blockKeywordRequest: BlockKeywordRequestDto, uuid: string, token: string): Promise<BlockKeywordResponseDto> => {
	try {
		if (!checkBlockKeywordRequest(blockKeywordRequest)) {
			return { success: false, message: '屏蔽关键词失败，屏蔽关键词请求载荷不合法' }
		}

		const { blockKeyword } = blockKeywordRequest

		if (!safeRegex(blockKeyword)) {
			logging('ERROR', '屏蔽关键词失败，用户输入了一个不安全的关键词，该关键词是一个不安全的正则表达式')
			return { success: false, message: '屏蔽关键词失败，用户输入了一个不安全的关键词' }
		}

		const operatorUid = await getUserUid(uuid)

		if (!operatorUid) {
			logging('ERROR', '屏蔽关键词失败，用户不存在')
			return { success: false, message: '屏蔽关键词失败，用户不存在' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '屏蔽关键词失败，用户 Token 不合法')
			return { success: false, message: '屏蔽关键词失败，用户 Token 不合法' }
		}

		if (await getBlocklistCount('keyword', uuid) > 200) {
			return { success: false, message: '屏蔽关键词失败，屏蔽列表已达上限' }
		}

		const now = new Date().getTime()
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'keyword',
			value: blockKeyword,
			operatorUUID: uuid,
		}
		const blockListSelect: SelectType<BlockListSchemaType> = {
			operatorUid: 1,
		}

		const blockListResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName)
		if (blockListResult.success && blockListResult.result && blockListResult.result.length > 0) {
			logging('ERROR', '屏蔽关键词失败，该关键词已经被你屏蔽')
			return { success: false, message: '屏蔽关键词失败，该关键词已经被你屏蔽' }
		}

		const blockListData: BlockListSchemaType = {
			type: 'keyword',
			value: blockKeyword,
			operatorUid,
			operatorUUID: uuid,
			createDateTime: now,
		}

		const insertResult = await insertData2MongoDB<BlockListSchemaType>(blockListData, blockListSchemaInstance, blockListCollectionName)
		if (!insertResult.success) {
			return { success: false, message: '屏蔽关键词失败' }
		}
		return { success: true, message: '屏蔽关键词成功' }
	}
	catch (error) {
		logging('ERROR', '屏蔽关键词失败', error)
		return { success: false, message: '屏蔽关键词失败' }
	}
}

/**
 * 屏蔽标签
 * @param blockTagRequest 屏蔽标签的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 屏蔽标签的请求响应
 */
export const blockTagService = async (blockTagRequest: BlockTagRequestDto, uuid: string, token: string): Promise<BlockTagResponseDto> => {
	try {
		if (!checkBlockTagRequest(blockTagRequest)) {
			return { success: false, message: '屏蔽标签请求载荷不合法' }
		}

		const tagId = blockTagRequest.tagId.toString()
		const operatorUid = await getUserUid(uuid)

		if (!operatorUid) {
			logging('ERROR', '屏蔽标签失败，用户不存在')
			return { success: false, message: '屏蔽标签失败，用户不存在' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '屏蔽标签失败，用户 Token 不合法')
			return { success: false, message: '屏蔽标签失败，用户 Token 不合法' }
		}

		if (await getBlocklistCount('tag', uuid) > 100) {
			return { success: false, message: '屏蔽标签失败，屏蔽列表已达上限' }
		}

		// TODO: 检查 TAG 是否存在

		const now = new Date().getTime()
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'tag',
			value: tagId,
			operatorUUID: uuid,
		}
		const blockListSelect: SelectType<BlockListSchemaType> = {
			operatorUid: 1,
		}

		const blockListResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName)
		if (blockListResult.success && blockListResult.result && blockListResult.result.length > 0) {
			logging('ERROR', '屏蔽标签失败，该标签已经被你屏蔽')
			return { success: false, message: '屏蔽标签失败，该标签已经被你屏蔽' }
		}

		const blockListData: BlockListSchemaType = {
			type: 'tag',
			value: tagId,
			operatorUid,
			operatorUUID: uuid,
			createDateTime: now,
		}

		const insertResult = await insertData2MongoDB<BlockListSchemaType>(blockListData, blockListSchemaInstance, blockListCollectionName)
		if (!insertResult.success) {
			logging('ERROR', '屏蔽标签失败，查询数据失败')
			return { success: false, message: '屏蔽标签失败，查询数据失败' }
		}
		return { success: true, message: '屏蔽标签成功' }
	}
	catch (error) {
		logging('ERROR', '屏蔽标签失败，未知错误', error)
		return { success: false, message: '屏蔽标签失败，未知错误' }
	}
}

/**
 * 添加正则表达式
 * @param addRegexRequest 添加正则表达式的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 添加正则表达式的请求响应
 */
export const addRegexService = async (addRegexRequest: AddRegexRequestDto, uuid: string, token: string): Promise<AddRegexResponseDto> => {
	try {
		if (!checkAddRegexRequest(addRegexRequest)) {
			return { success: false, message: '添加正则表达式请求载荷不合法', unsafeRegex: false }
		}

		const { blockRegex } = addRegexRequest

		if (!safeRegex(blockRegex)) {
			logging('ERROR', '添加正则表达式失败，用户输入了一个不安全的正则表达式')
			return { success: false, message: '添加正则表达式失败，用户输入了一个不安全的正则表达式', unsafeRegex: true }
		}

		const operatorUid = await getUserUid(uuid)

		if (!operatorUid) {
			logging('ERROR', '添加正则表达式失败，用户不存在')
			return { success: false, message: '添加正则表达式失败，用户不存在', unsafeRegex: false }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '添加正则表达式失败，用户 Token 不合法')
			return { success: false, message: '添加正则表达式失败，用户 Token 不合法', unsafeRegex: false }
		}

		if (await getBlocklistCount('regex', uuid) > 3) {
			return { success: false, message: '添加正则表达式失败，屏蔽列表已达上限', unsafeRegex: false }
		}

		const now = new Date().getTime()
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'regex',
			value: blockRegex,
			operatorUUID: uuid,
		}
		const blockListSelect: SelectType<BlockListSchemaType> = {
			operatorUid: 1,
		}

		const blockListResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName)
		if (blockListResult.success && blockListResult.result && blockListResult.result.length > 0) {
			return { success: false, message: '添加正则表达式失败，正则表达式已存在', unsafeRegex: false }
		}

		const blockListData: BlockListSchemaType = {
			type: 'regex',
			value: blockRegex,
			operatorUid,
			operatorUUID: uuid,
			createDateTime: now,
		}

		const insertResult = await insertData2MongoDB<BlockListSchemaType>(blockListData, blockListSchemaInstance, blockListCollectionName)
		if (!insertResult.success) {
			return { success: false, message: '添加正则表达式失败', unsafeRegex: false }
		}

		return { success: true, message: '添加正则表达式成功', unsafeRegex: false }
	}
	catch (error) {
		logging('ERROR', '添加正则表达式失败', error)
		return { success: false, message: '添加正则表达式失败', unsafeRegex: false }
	}
}

/**
 * 取消屏蔽用户
 * @param unblockUserByUidRequest 取消屏蔽用户的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 取消屏蔽用户的请求响应
 */
export const unBlockUserService = async (unblockUserByUidRequest: UnblockUserByUidRequestDto, uuid: string, token: string): Promise<UnblockUserByUidResponseDto> => {
	try {
		if (!checkBlockUserByUidRequest(unblockUserByUidRequest)) {
			return { success: false, message: '取消屏蔽用户失败，取消屏蔽用户请求载荷不合法' }
		}

		const { blockUid } = unblockUserByUidRequest
		if (!checkUserExistsByUIDService({ uid: blockUid })) {
			logging('ERROR', '取消屏蔽用户失败，用户不存在')
			return { success: false, message: '取消屏蔽用户失败，用户不存在' }
		}
		const userUuid = await getUserUuid(blockUid)
		const operatorUid = await getUserUid(uuid)

		if (!userUuid || !operatorUid) {
			logging('ERROR', '取消屏蔽用户失败，用户不存在')
			return { success: false, message: '取消屏蔽用户失败，用户不存在' }
		}
		if (userUuid === uuid) {
			logging('ERROR', '取消屏蔽用户失败，不能取消自己的屏蔽')
			return { success: false, message: '取消屏蔽用户失败，不能取消自己的屏蔽' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '取消屏蔽用户失败，用户 Token 不合法')
			return { success: false, message: '取消屏蔽用户失败，用户 Token 不合法' }
		}

		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'block',
			value: userUuid,
			operatorUUID: uuid,
		}

		const blockListSelect: SelectType<BlockListSchemaType> = {
			type: 1,
			value: 1,
			operatorUid: 1,
			operatorUUID: 1,
		}

		// 启动事务
		const session = await createAndStartSession()

		const selectResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName, {session})
		if (!selectResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽用户失败，查询数据失败')
			return { success: false, message: '取消屏蔽用户失败，查询数据失败' }
		}
		if (selectResult.result.length === 0) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽用户失败，用户未被屏蔽')
			return { success: false, message: '取消屏蔽用户失败，用户未被屏蔽' }
		}

		const { collectionName: unblockUserCollectionName, schemaInstance: unblockUserSchemaInstance } = UnblockListSchema
		type UnblockListSchemaType = InferSchemaType<typeof unblockUserSchemaInstance>
		const unblockListData: UnblockListSchemaType = {
			...selectResult.result[0],
			_operatorUid_: operatorUid,
			_operatorUUID_: uuid,
			createDateTime: new Date().getTime(),
		}
		const insertResult = await insertData2MongoDB<UnblockListSchemaType>(unblockListData, unblockUserSchemaInstance, unblockUserCollectionName, {session})
		if (!insertResult) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽用户失败，查询数据失败')
			return { success: false, message: '取消屏蔽用户失败，查询数据失败' }
		}

		const deleteResult = await deleteOneDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSchemaInstance, blockListCollectionName, {session})
		if (!deleteResult) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽用户失败，查询数据失败')
			return { success: false, message: '取消屏蔽用户失败，查询数据失败' }
		}
		await commitAndEndSession(session)
		return { success: true, message: '取消屏蔽用户成功' }
	}
	catch (error) {
		logging('ERROR', '取消屏蔽用户失败，未知错误', error)
		return { success: false, message: '取消屏蔽用户失败，未知错误' }
	}
}

/**
 * 显示用户
 * @param ShowUserByUidRequestDto 显示用户的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 显示用户的请求响应
 */
export const showUserService = async (showUserByUidRequest: ShowUserByUidRequestDto, uuid: string, token: string): Promise<ShowUserByUidResponseDto> => {
	try {
		if (!checkHideUserByUidRequest(showUserByUidRequest)) {
			return { success: false, message: '显示用户失败，显示用户请求载荷不合法' }
		}

		const { hideUid } = showUserByUidRequest
		if (!checkUserExistsByUIDService({ uid: hideUid })) {
			logging('ERROR', '显示用户失败，用户不存在')
			return { success: false, message: '显示用户失败，用户不存在' }
		}
		const userUuid = await getUserUuid(hideUid)
		const operatorUid = await getUserUid(uuid)

		if (!userUuid || !operatorUid) {
			logging('ERROR', '显示用户失败，用户不存在')
			return { success: false, message: '显示用户失败，用户不存在' }
		}
		if (userUuid === uuid) {
			logging('ERROR', '显示用户失败，不能显示自己')
			return { success: false, message: '显示用户失败，不能显示自己' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '显示用户失败，用户 Token 不合法')
			return { success: false, message: '显示用户失败，用户 Token 不合法' }
		}

		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'hide',
			value: userUuid,
			operatorUUID: uuid,
		}

		const blockListSelect: SelectType<BlockListSchemaType> = {
			type: 1,
			value: 1,
			operatorUid: 1,
			operatorUUID: 1,
		}

		// 启动事务
		const session = await createAndStartSession()

		const selectResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName, {session})
		if (!selectResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '显示用户失败，查询数据失败')
			return { success: false, message: '显示用户失败，查询数据失败' }
		}
		if (selectResult.result.length === 0) {
			await abortAndEndSession(session)
			logging('ERROR', '显示用户失败，用户未被隐藏')
			return { success: false, message: '显示用户失败，用户未被隐藏' }
		}

		const { collectionName: unblockUserCollectionName, schemaInstance: unblockUserSchemaInstance } = UnblockListSchema
		type UnblockListSchemaType = InferSchemaType<typeof unblockUserSchemaInstance>
		const unblockListData: UnblockListSchemaType = {
			...selectResult.result[0],
			_operatorUid_: operatorUid,
			_operatorUUID_: uuid,
			createDateTime: new Date().getTime(),
		}
		const insertResult = await insertData2MongoDB<UnblockListSchemaType>(unblockListData, unblockUserSchemaInstance, unblockUserCollectionName, {session})
		if (!insertResult) {
			await abortAndEndSession(session)
			logging('ERROR', '显示用户失败，查询数据失败')
			return { success: false, message: '显示用户失败，查询数据失败' }
		}

		const deleteResult = await deleteOneDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSchemaInstance, blockListCollectionName, {session})
		if (!deleteResult) {
			await abortAndEndSession(session)
			logging('ERROR', '显示用户失败，查询数据失败')
			return { success: false, message: '显示用户失败，查询数据失败' }
		}
		await commitAndEndSession(session)
		return { success: true, message: '显示用户成功' }
	}
	catch (error) {
		logging('ERROR', '显示用户失败，未知错误', error)
		return { success: false, message: '显示用户失败，未知错误' }
	}
}

/**
 * 取消屏蔽标签
 * @param unblockTagRequest 取消屏蔽标签的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 取消屏蔽标签的请求响应
 */
export const unBlockTagService = async (unblockTagRequest: UnblockTagRequestDto, uuid: string, token: string): Promise<UnblockTagResponseDto> => {
	try {
		if (!checkBlockTagRequest(unblockTagRequest)) {
			return { success: false, message: '取消屏蔽标签失败，取消屏蔽标签请求载荷不合法' }
		}

		const tagId = unblockTagRequest.tagId.toString()
		const operatorUid = await getUserUid(uuid)

		if (!operatorUid) {
			logging('ERROR', '取消屏蔽标签失败，用户不存在')
			return { success: false, message: '取消屏蔽标签失败，用户不存在' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '取消屏蔽标签失败，用户 Token 不合法')
			return { success: false, message: '取消屏蔽标签失败，用户 Token 不合法' }
		}

		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'tag',
			value: tagId,
			operatorUUID: uuid,
		}

		const blockListSelect: SelectType<BlockListSchemaType> = {
			type: 1,
			value: 1,
			operatorUid: 1,
			operatorUUID: 1,
		}

		// 启动事务
		const session = await createAndStartSession()

		const selectResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName, {session})
		if (!selectResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽标签失败，查询数据失败')
			return { success: false, message: '取消屏蔽标签失败，查询数据失败' }
		}
		if (selectResult.result.length === 0) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽标签失败，标签未被屏蔽')
			return { success: false, message: '取消屏蔽标签失败，标签未被屏蔽' }
		}

		const { collectionName: unblockUserCollectionName, schemaInstance: unblockUserSchemaInstance } = UnblockListSchema
		type UnblockListSchemaType = InferSchemaType<typeof unblockUserSchemaInstance>
		const unblockListData: UnblockListSchemaType = {
			...selectResult.result[0],
			_operatorUid_: operatorUid,
			_operatorUUID_: uuid,
			createDateTime: new Date().getTime(),
		}
		const insertResult = await insertData2MongoDB<UnblockListSchemaType>(unblockListData, unblockUserSchemaInstance, unblockUserCollectionName, {session})
		if (!insertResult) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽标签失败，查询数据失败')
			return { success: false, message: '取消屏蔽标签失败，查询数据失败' }
		}

		const deleteResult = await deleteOneDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSchemaInstance, blockListCollectionName, {session})
		if (!deleteResult) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽标签失败，查询数据失败')
			return { success: false, message: '取消屏蔽标签失败，查询数据失败' }
		}
		await commitAndEndSession(session)
		return { success: true, message: '取消屏蔽标签成功' }
	}
	catch (error) {
		logging('ERROR', '取消屏蔽标签失败，未知错误', error)
		return { success: false, message: '取消屏蔽标签失败，未知错误' }
	}
}

/**
 * 取消屏蔽关键词
 * @param unblockKeywordRequest 取消屏蔽关键词的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 取消屏蔽关键词的请求响应
 */
export const unBlockKeywordService = async (unblockKeywordRequest: UnblockKeywordRequestDto, uuid: string, token: string): Promise<UnblockKeywordResponseDto> => {
	try {
		if (!checkBlockKeywordRequest(unblockKeywordRequest)) {
			return { success: false, message: '取消屏蔽关键词失败，取消屏蔽关键词请求载荷不合法' }
		}

		const { blockKeyword: keyword } = unblockKeywordRequest
		const operatorUid = await getUserUid(uuid)

		if (!operatorUid) {
			logging('ERROR', '取消屏蔽关键词失败，用户不存在')
			return { success: false, message: '取消屏蔽关键词失败，用户不存在' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '取消屏蔽关键词失败，用户 Token 不合法')
			return { success: false, message: '取消屏蔽关键词失败，用户 Token 不合法' }
		}

		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'keyword',
			value: keyword,
			operatorUUID: uuid,
		}

		const blockListSelect: SelectType<BlockListSchemaType> = {
			type: 1,
			value: 1,
			operatorUid: 1,
			operatorUUID: 1,
		}

		// 启动事务
		const session = await createAndStartSession()

		const selectResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName, {session})
		if (!selectResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽关键词失败，查询数据失败')
			return { success: false, message: '取消屏蔽关键词失败，查询数据失败' }
		}
		if (selectResult.result.length === 0) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽关键词失败，关键词未被屏蔽')
			return { success: false, message: '取消屏蔽关键词失败，关键词未被屏蔽' }
		}

		const { collectionName: unblockUserCollectionName, schemaInstance: unblockUserSchemaInstance } = UnblockListSchema
		type UnblockListSchemaType = InferSchemaType<typeof unblockUserSchemaInstance>
		const unblockListData: UnblockListSchemaType = {
			...selectResult.result[0],
			_operatorUid_: operatorUid,
			_operatorUUID_: uuid,
			createDateTime: new Date().getTime(),
		}
		const insertResult = await insertData2MongoDB<UnblockListSchemaType>(unblockListData, unblockUserSchemaInstance, unblockUserCollectionName, {session})
		if (!insertResult) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽关键词失败，查询数据失败')
			return { success: false, message: '取消屏蔽关键词失败，查询数据失败' }
		}

		const deleteResult = await deleteOneDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSchemaInstance, blockListCollectionName, {session})
		if (!deleteResult) {
			await abortAndEndSession(session)
			logging('ERROR', '取消屏蔽关键词失败，查询数据失败')
			return { success: false, message: '取消屏蔽关键词失败，查询数据失败' }
		}
		await commitAndEndSession(session)
		return { success: true, message: '取消屏蔽关键词成功' }
	}
	catch (error) {
		logging('ERROR', '取消屏蔽关键词失败，未知错误', error)
		return { success: false, message: '取消屏蔽关键词失败，未知错误' }
	}
}

/**
 * 删除正则表达式
 * @param removeRegexRequest 删除正则表达式的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 删除正则表达式的请求响应
 */
export const removeRegexService = async (removeRegexRequest: RemoveRegexRequestDto, uuid: string, token: string): Promise<RemoveRegexResponseDto> => {
	try {
		if (!checkAddRegexRequest(removeRegexRequest)) {
			return { success: false, message: '删除正则表达式失败，删除正则表达式请求载荷不合法' }
		}

		const { blockRegex: regex } = removeRegexRequest
		const operatorUid = await getUserUid(uuid)

		if (!operatorUid) {
			logging('ERROR', '删除正则表达式失败，用户不存在')
			return { success: false, message: '删除正则表达式失败，用户不存在' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除正则表达式失败，用户 Token 不合法')
			return { success: false, message: '删除正则表达式失败，用户 Token 不合法' }
		}

		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockListWhere: QueryType<BlockListSchemaType> = {
			type: 'regex',
			value: regex,
			operatorUUID: uuid,
		}

		const blockListSelect: SelectType<BlockListSchemaType> = {
			type: 1,
			value: 1,
			operatorUid: 1,
			operatorUUID: 1,
		}

		// 启动事务
		const session = await createAndStartSession()

		const selectResult = await selectDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSelect, blockListSchemaInstance, blockListCollectionName, {session})
		if (!selectResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '删除正则表达式失败，查询数据失败')
			return { success: false, message: '删除正则表达式失败，查询数据失败' }
		}
		if (selectResult.result.length === 0) {
			await abortAndEndSession(session)
			logging('ERROR', '删除正则表达式失败，正则表达式未被屏蔽')
			return { success: false, message: '删除正则表达式失败，正则表达式未被屏蔽' }
		}

		const { collectionName: unblockUserCollectionName, schemaInstance: unblockUserSchemaInstance } = UnblockListSchema
		type UnblockListSchemaType = InferSchemaType<typeof unblockUserSchemaInstance>
		const unblockListData: UnblockListSchemaType = {
			...selectResult.result[0],
			_operatorUid_: operatorUid,
			_operatorUUID_: uuid,
			createDateTime: new Date().getTime(),
		}
		const insertResult = await insertData2MongoDB<UnblockListSchemaType>(unblockListData, unblockUserSchemaInstance, unblockUserCollectionName, {session})
		if (!insertResult) {
			await abortAndEndSession(session)
			logging('ERROR', '删除正则表达式失败，查询数据失败')
			return { success: false, message: '删除正则表达式失败，查询数据失败' }
		}

		const deleteResult = await deleteOneDataFromMongoDB<BlockListSchemaType>(blockListWhere, blockListSchemaInstance, blockListCollectionName, {session})
		if (!deleteResult) {
			await abortAndEndSession(session)
			logging('ERROR', '删除正则表达式失败，查询数据失败')
			return { success: false, message: '删除正则表达式失败，查询数据失败' }
		}
		await commitAndEndSession(session)
		return { success: true, message: '删除正则表达式成功' }
	}
	catch (error) {
		logging('ERROR', '删除正则表达式失败，未知错误', error)
		return { success: false, message: '删除正则表达式失败，未知错误' }
	}
}

/**
 * 获取用户的黑名单
 * @param getBlockListRequest 获取用户的黑名单的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 用户的黑名单
 */
export const getBlockListService = async (getBlockListRequest: GetBlockListRequestDto, uuid?: string, token?: string): Promise<GetBlockListResponseDto> => {
	try {
		if (!checkGetBlockListRequest(getBlockListRequest)) {
			return { success: false, message: '获取黑名单失败，获取黑名单请求载荷不合法', blocklistCount: -1 }
		}

		if (!uuid || !token) {
			logging('WARN', '获取黑名单失败，用户未登录')
			return { success: false, message: '获取黑名单失败，用户未登录', blocklistCount: -1 }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取黑名单失败，用户 Token 不合法')
			return { success: false, message: '获取黑名单失败，用户 Token 不合法', blocklistCount: -1 }
		}

		const { type } = getBlockListRequest
		if (!['hide', 'block', 'keyword', 'tag', 'regex'].includes(type)) {
			logging('ERROR', '获取黑名单失败，黑名单类型不合法')
			return { success: false, message: '获取黑名单失败，黑名单类型不合法' }
		}

		let pageSize = undefined
		let skip = 0
		if (getBlockListRequest.pagination && getBlockListRequest.pagination.page > 0 && getBlockListRequest.pagination.pageSize > 0) {
			skip = (getBlockListRequest.pagination.page - 1) * getBlockListRequest.pagination.pageSize
			pageSize = getBlockListRequest.pagination.pageSize
		}

		let getBlocklistPipelineProject: PipelineStage[] = [
			{
				$project: {
					type: 1,
					value: 1,
					createDateTime: 1,
				}
			}
		]

		const shouldJoinUserInfo = ['hide', 'block'].includes(type) // 判断是否需要关联用户信息
		const shouldJoinTagInfo = type === 'tag' // 判断是否需要关联 TAG 信息

		if (shouldJoinUserInfo) {
			getBlocklistPipelineProject = [
				{
					$lookup: {
						from: 'user-infos',
						localField: 'value',
						foreignField: 'UUID',
						as: 'user_info_data',
					}
				},
				{
					$unwind: {
						path: '$user_info_data',
						preserveNullAndEmptyArrays: true,
					}
				},
				{
					$project: {
						type: 1,
						value: 1,
						createDateTime: 1,
						uid: '$user_info_data.uid',
						username: '$user_info_data.username',
						userNickname: '$user_info_data.userNickname',
						avatar: '$user_info_data.avatar',
					}
				}
			]
		}

		if (shouldJoinTagInfo) {
			getBlocklistPipelineProject = [
				{
					$addFields: {
						tagIdInt: { $toInt: "$value" } // 将字符串字段转换为整数
					}
				},
				{
					$lookup: {
						from: 'video-tags',
						localField: 'tagIdInt',
						foreignField: 'tagId',
						as: 'tag_data',
					}
				},
				{
					$unwind: {
						path: '$tag_data',
						preserveNullAndEmptyArrays: true,
					}
				},
				{
					$project: {
						type: 1,
						value: 1,
						createDateTime: 1,
						tag: '$tag_data',
					}
				}
			]
		}

		const countBlocklistPipeline: PipelineStage[] = [
			{
				$match: {
					operatorUUID: uuid,
					type,
				},
			},
			{
				$count: 'totalCount',
			},
		]

		const getBlocklistPipelineMix: PipelineStage[] = [
			{
				$match: {
					operatorUUID: uuid,
					type,
				},
			},
			{ $sort: { 'createDateTime': -1 } },
			{ $skip: skip },
			...(pageSize ? [{ $limit: pageSize }] : []),
			...getBlocklistPipelineProject
		]
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		const blocklistCountResult = await selectDataByAggregateFromMongoDB(blockListSchemaInstance, blockListCollectionName, countBlocklistPipeline)
		const blocklistResult = await selectDataByAggregateFromMongoDB(blockListSchemaInstance, blockListCollectionName, getBlocklistPipelineMix)

		if (!blocklistResult.success || !blocklistCountResult.success) {
			logging('ERROR', '获取黑名单失败，查询数据失败')
			return { success: false, message: '获取黑名单失败，查询数据失败' }
		}

		return {
			success: true,
			message: blocklistCountResult.result?.[0]?.totalCount > 0 ? '获取黑名单成功' : '获取黑名单成功，长度为零',
			blocklistCount: blocklistCountResult.result?.[0]?.totalCount,
			result: blocklistResult.result,
		}

	} catch (error) {
		logging('ERROR', '获取黑名单失败，未知错误', error)
		return { success: false, message: '获取黑名单失败，未知错误' }
	}
}

// /** 黑名单的类型 */
// type BlockListFilterCategory = 'block-uuid' | 'block-uid' | 'hide-uuid' | 'hide-uid' | 'keyword' | 'tag-id' | 'regex'
/** 黑名单的类型 */
type BlockListFilterCategory = 'block-uuid' | 'hide-uuid' | 'keyword' | 'tag-id' | 'regex'
/** 设置哪些属性需要使用哪种类型的黑名单过滤，其中 attr 参数**必须**为开发者硬编码的安全字段，**禁止**由用户传入 */
type BlockListAttrs = { attr: string, category: BlockListFilterCategory }[]
type BlockListFilterBuilderAuthenticator = { uuid?: string, token?: string } | { uid?: number, userDataBootstrapHint?: string }
/** 黑名单功能的附加字段 Project */
type AdditionalFieldsProject = {
	/** 是否被其他用户屏蔽 */
	isBlockedByOther?: 1;
}
/** 返回值，一个构建好的 Monogoose Pipeline 查询 */
type BlockListFilterResult = { success: boolean, filter: PipelineStage.Match[], additionalFields: AdditionalFieldsProject }

/**
 * 构建 Mongoose Pipeline 黑名单过滤器
 * @param attrs 哪些属性需要过滤，以及使用的过滤方式
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns Mongoose Pipeline 黑名单过滤器
 */
export const buildBlockListMongooseFilter = async (attrs: BlockListAttrs, authenticator: BlockListFilterBuilderAuthenticator): Promise<BlockListFilterResult> => {
	// MEME: Is that a dog...?
	try {
		let uuid: string | undefined = undefined

		if ('uuid' in authenticator && 'token' in authenticator) {
			if (!(await checkUserTokenByUuidService(authenticator.uuid, authenticator.token)).success) {
				logging('ERROR', '构建黑名单过滤器失败，用户 Token 不合法')
				return { success: false, filter: [], additionalFields: { } }
			}
			uuid = authenticator.uuid
		}

		if ('uid' in authenticator && 'userDataBootstrapHint' in authenticator) {
			if (!await checkUserBootstrapHintByUid(authenticator.uid, authenticator.userDataBootstrapHint)) {
				logging('ERROR', '构建黑名单过滤器失败，用户 userDataBootstrapHint 不合法')
				return { success: false, filter: [], additionalFields: { } }
			}
			const uuidResult = await getUserUuid(authenticator.uid)
			if (!uuidResult) {
				logging('ERROR', '构建黑名单过滤器失败，使用 uid 获取 uuid 失败')
				return { success: false, filter: [], additionalFields: { } }
			}
			uuid = uuidResult
		}

		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>

		const getBlockListWhere: QueryType<BlockListSchemaType> = {
			operatorUUID: uuid,
		}

		const getBlockListSelect: SelectType<BlockListSchemaType> = {
			type: 1,
			value: 1,
			operatorUUID: 1,
		}

		const { result: blockListResult, success: blockListSuccess } = await selectDataFromMongoDB<BlockListSchemaType>(getBlockListWhere, getBlockListSelect, blockListSchemaInstance, blockListCollectionName)

		const isBlockListOk = blockListSuccess && blockListResult.length > 0

		const blockUuidList = []
		const hideUuidList = []
		const keywordList = []
		const tagIdList = []
		const regexList = []
		for (const block of blockListResult) {
			switch (block.type) {
				case 'block':
					blockUuidList.push(block.value)
					break
				case 'hide':
					hideUuidList.push(block.value)
					break
				case 'keyword':
					keywordList.push(block.value)
					break
				case 'tag':
					tagIdList.push(parseInteger(block.value ?? '-1'))
					break
				case 'regex':
					regexList.push(block.value)
					break
			}
		}

		// 如果 keyword 存在，拼一个大正则
		let keywordReg: RegExp | null = null
		if (keywordList.length > 0) {
			keywordReg = new RegExp(keywordList.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'))
		}

		const additionalFields = { }
		const blockListMongooseFilter = []
		for (const { attr, category } of attrs) {
			if (!isBlockListOk) {
				switch (category) {
					case 'block-uuid': {
						blockListMongooseFilter.push(
							// 1. 关联 BlockList 集合，获取上传者屏蔽的用户列表（仅 type = 'user'）
							{
								$lookup: {
									from: 'blocklists',
									let: { uuid: `$${attr}` },
									pipeline: [
										{
											$match: {
												$expr: {
													$and: [
														{ $eq: ['$operatorUUID', '$$uuid'] },
														{ $eq: ['$type', 'block'] },
													],
												},
											},
										},
										{
											$project: {
												_id: 0,
												blockedUserUUID: '$value', // value 字段存储被屏蔽的用户 UUID
											},
										},
									],
									as: 'block_by_others_data',
								},
							},
							// 2. 过滤：排除上传者屏蔽了当前用户的视频
							{
								$addFields: {
									isBlockedByOther: {
										$in: [ uuid, '$block_by_others_data.blockedUserUUID' ]
									},
								},
							},
						)
						additionalFields['isBlockedByOther'] = 1
						break;
					}
				}
				continue
			} else {
				switch (category) {
					case 'block-uuid': {
						if (blockUuidList.length > 0) {
							blockListMongooseFilter.push({ $match: { [attr]: { $nin: blockUuidList } } })
						}
						blockListMongooseFilter.push(
							// 1. 关联 BlockList 集合，获取上传者屏蔽的用户列表（仅 type = 'user'）
							{
								$lookup: {
									from: 'blocklists',
									let: { uuid: `$${attr}` },
									pipeline: [
										{
											$match: {
												$expr: {
													$and: [
														{ $eq: ['$operatorUUID', '$$uuid'] },
														{ $eq: ['$type', 'block'] },
													],
												},
											},
										},
										{
											$project: {
												_id: 0,
												blockedUserUUID: '$value', // value 字段存储被屏蔽的用户 UUID
											},
										},
									],
									as: 'block_by_others_data',
								},
							},
							// 2. 过滤：排除上传者屏蔽了当前用户的视频
							{
								$addFields: {
									isBlockedByOther: {
										$in: [ uuid, '$block_by_others_data.blockedUserUUID' ]
									},
								},
							},
						)
						additionalFields['isBlockedByOther'] = 1
						break;
					}
					case 'hide-uuid': {
						if (hideUuidList.length > 0)
							blockListMongooseFilter.push({ $match: { [attr]: { $nin: hideUuidList } } })
						break;
					}
					case 'keyword': {
						if (keywordReg)
							blockListMongooseFilter.push({ $match: { [attr]: { $not: { $regex: keywordReg, $options: 'i' } } } })
						break;
					}
					case 'tag-id': {
						if (tagIdList.length > 0)
							blockListMongooseFilter.push({ $match: { [attr]: { $nin: tagIdList } } })
						break;
					}
					case 'regex': {
						if (regexList.length > 0)
							blockListMongooseFilter.push({ $match: { $nor: regexList.map(rx => ({ [attr]: { $regex: rx, $options: 'i' } })) } })
						break;
					}
				}
			}
		}

		return { success: true, filter: blockListMongooseFilter, additionalFields }
	} catch (error) {
		logging('ERROR', '构建黑名单过滤器时出错，未知错误', error)
		return { success: false, filter: [], additionalFields: { } }
	}
}

/**
 * 检查用户是否被屏蔽或隐藏
 * @param UUID 用户 uuid
 * @param token 用户 Token
 * @param targetUid 目标用户 UID
 * @returns 用户是否被屏蔽或隐藏的请求响应
 */
export const checkBlockUserService = async (checkIsBlockedRequest: CheckUserIsBlockedRequestDto, uuid: string, token: string): Promise<CheckUserIsBlockedResponseDto> => {
	try {
		let isBlocked = false
		let isHidden = false

		if (!checkCheckUserIsBlockedRequest(checkIsBlockedRequest)) {
			logging('ERROR', '检查用户是否被屏蔽或隐藏失败，请求载荷不合法')
			return { success: false, message: '检查用户是否被屏蔽或隐藏失败，请求载荷不合法', isBlocked, isHidden }
		}

		const { uid } = checkIsBlockedRequest

		if (!checkUserExistsByUIDService({ uid })) {
			logging('ERROR', '检查用户是否被屏蔽或隐藏失败，用户不存在')
			return { success: false, message: '检查用户是否被屏蔽或隐藏失败，用户不存在', isBlocked, isHidden }
		}

		const targetUuid = await getUserUuid(uid)
		if (!targetUuid) {
			logging('ERROR', '检查用户是否被屏蔽或隐藏失败，用户 UUID 不存在')
			return { success: false, message: '检查用户是否被屏蔽或隐藏失败，用户 UUID 不存在', isBlocked, isHidden }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '检查用户是否被屏蔽或隐藏失败，用户 Token 不合法')
			return { success: false, message: '检查用户是否被屏蔽或隐藏失败，用户 Token 不合法', isBlocked, isHidden }
		}

		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockWhere: QueryType<BlockListSchemaType> = {
			type: 'block',
			value: targetUuid,
			operatorUUID: uuid,
		}
		const hideWhere: QueryType<BlockListSchemaType> = {
			type: 'hide',
			value: targetUuid,
			operatorUUID: uuid,
		}
		const userSelect: SelectType<BlockListSchemaType> = {
			value: 1,
		}

		const blockResult = await selectDataFromMongoDB<BlockListSchemaType>(blockWhere, userSelect, blockListSchemaInstance, blockListCollectionName)
		if (!blockResult.success) {
			logging('ERROR', '检查用户是否被屏蔽或隐藏失败，查询屏蔽数据失败')
			return { success: false, message: '检查用户是否被屏蔽或隐藏失败，查询屏蔽数据失败', isBlocked, isHidden }
		}

		const hideResult = await selectDataFromMongoDB<BlockListSchemaType>(hideWhere, userSelect, blockListSchemaInstance, blockListCollectionName)
		if (!hideResult.success) {
			logging('ERROR', '检查用户是否被屏蔽或隐藏失败，查询隐藏数据失败')
			return { success: false, message: '检查用户是否被屏蔽或隐藏失败，查询隐藏数据失败', isBlocked, isHidden }
		}

		if (blockResult.result && Array.isArray(blockResult.result) && blockResult.result?.length > 0) {
			isBlocked = true
		}

		if (hideResult.result && Array.isArray(hideResult.result) && hideResult.result?.length > 0) {
			isHidden = true
		}

		return { success: true, message: '检查用户是否被屏蔽或隐藏完成', isBlocked, isHidden }

	} catch (error) {
		logging('ERROR', '检查用户是否被屏蔽或隐藏失败，未知错误', error)
		return { success: false, message: '检查用户是否被屏蔽或隐藏失败，未知错误', isBlocked: false, isHidden: false }
	}
}

/**
 * 检测是否被其他用户屏蔽
 * @param UUID 用户 uuid
 * @param token 用户 Token
 * @param targetUid 目标用户 UID
 * @returns 是否被其他用户屏蔽的请求响应
 */
export const checkIsBlockedByOtherUserService = async (checkIsBlockedByOtherRequest: CheckIsBlockedByOtherUserRequestDto, uuid: string, token: string): Promise<CheckIsBlockedByOtherUserResponseDto> => {
	try {
		if (!checkCheckIsBlockedByOtherUserRequest(checkIsBlockedByOtherRequest)) {
			logging('ERROR', '检查是否被其他用户屏蔽失败，请求载荷不合法')
			return { success: false, message: '检查是否被其他用户屏蔽失败，请求载荷不合法', isBlocked: false }
		}
		const { targetUid } = checkIsBlockedByOtherRequest

		if (!checkUserExistsByUIDService({uid: targetUid})) {
			return { success: false, message: '检查是否被其他用户屏蔽失败，用户不存在', isBlocked: false }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '检查是否被其他用户屏蔽失败，用户 Token 不合法')
			return { success: false, message: '检查是否被其他用户屏蔽失败，用户 Token 不合法', isBlocked: false }
		}
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		type BlockListSchemaType = InferSchemaType<typeof blockListSchemaInstance>
		const blockWhere: QueryType<BlockListSchemaType> = {
			type: 'block',
			operatorUid: targetUid,
			value: uuid,
		}
		const blockSelect: SelectType<BlockListSchemaType> = {
			value: 1,
		}
		const blockResult = await selectDataFromMongoDB<BlockListSchemaType>(blockWhere, blockSelect, blockListSchemaInstance, blockListCollectionName)
		if (!blockResult.success) {
			logging('ERROR', '检查是否被其他用户屏蔽失败，查询数据失败')
			return { success: false, message: '检查是否被其他用户屏蔽失败，查询数据失败', isBlocked: false }
		}

		if (blockResult.result && Array.isArray(blockResult.result) && blockResult.result.length > 0 ) {
			return { success: true, message: '检查是否被其他用户屏蔽成功，被其他用户屏蔽', isBlocked: true }
		} else {
			return { success: true, message: '检查是否被其他用户屏蔽成功，未被其他用户屏蔽', isBlocked: false }
		}

	} catch (error) {
		logging('ERROR', '检查是否被其他用户屏蔽失败，未知错误', error)
		return { success: false, message: '检查是否被其他用户屏蔽失败，未知错误', isBlocked: false }
	}
}

/**
 * 获取对应类型的黑名单数量
 * @param blocklistType 黑名单的类型
 * @param uuid 黑名单的创建者 UUID
 * @returns 对应类型的黑名单数量
 */
const getBlocklistCount = async (blocklistType: string, uuid: string): Promise<number> => {
	try {
		const { collectionName: blockListCollectionName, schemaInstance: blockListSchemaInstance } = BlockListSchema
		const countBlocklistPipeline: PipelineStage[] = [
			{
				$match: {
					operatorUUID: uuid,
					type: blocklistType,
				},
			},
			{
				$count: 'totalCount',
			},
		]
		const BlocklistCountResult = await selectDataByAggregateFromMongoDB(blockListSchemaInstance, blockListCollectionName, countBlocklistPipeline)
		if (!BlocklistCountResult.success) {
			logging('ERROR', '获取黑名单数量失败，查询数据失败')
			return 0
		}
		return BlocklistCountResult.result?.[0]?.totalCount
	} catch (error) {
		logging('ERROR', '获取黑名单数量失败，未知错误', error)
		return 0
	}
}


/**
 * 检测屏蔽用户的请求载荷
 * @param blockUserByUidRequest 屏蔽用户的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkBlockUserByUidRequest = (blockUserByUidRequest: BlockUserByUidRequestDto): boolean => {
	if (!blockUserByUidRequest.blockUid) {
		logging('ERROR', '屏蔽用户请求载荷不合法')
		return false
	}
	return true
}

/**
 * 检测隐藏用户的请求载荷
 * @param HideUserByUidRequest 隐藏用户的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkHideUserByUidRequest = (hideUserByUidRequest: HideUserByUidRequestDto): boolean => {
	if (!hideUserByUidRequest.hideUid) {
		logging('ERROR', '隐藏用户请求载荷不合法')
		return false
	}
	return true
}

/**
 * 检测屏蔽关键词的请求载荷
 * @param blockKeywordRequest 屏蔽关键词的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkBlockKeywordRequest = (blockKeywordRequest: BlockKeywordRequestDto): boolean => {
	if (!blockKeywordRequest?.blockKeyword) {
			logging('ERROR', '屏蔽关键词请求载荷不合法')
			return false
	}
	const keyword = blockKeywordRequest.blockKeyword
	const validKeywordRegex = /^[a-zA-Z0-9\u4e00-\u9fa5\s.,!?@#$%&*()_+-=[\]{}|;:'"`~<>]+$/
	if (
			keyword.trim().length === 0 || // 空字符串或纯空格
			keyword.length > MAX_KEYWORD_LENGTH || // 长度超限
			!validKeywordRegex.test(keyword) // 包含非法字符
	) {
			logging('ERROR', '屏蔽关键词请求载荷不合法')
			return false
	}

	return true
}

/**
 * 检测屏蔽标签的请求载荷
 * @param blockTagRequest 屏蔽标签的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkBlockTagRequest = (blockTagRequest: BlockTagRequestDto): boolean => {
	if (!blockTagRequest.tagId) {
		logging('ERROR', '屏蔽标签请求载荷不合法')
		return false
	}
	return true
}

/**
 * 检测添加正则表达式的请求载荷
 * @param addRegexRequest 添加正则表达式的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAddRegexRequest = (addRegexRequest: AddRegexRequestDto): boolean => {
	if (!addRegexRequest?.blockRegex) {
			logging('ERROR', '添加正则表达式请求载荷不合法')
			return false
	}
	const regex = addRegexRequest.blockRegex
	if (
			regex.trim().length === 0 || // 空字符串或纯空格
			regex.length > MAX_REGEX_LENGTH // 长度超限
	) {
			return false
	}
	try {
			new RegExp(regex)
	} catch (e) {
			return false
	}
	return true
}

/**
 * 检测获取黑名单的请求载荷
 * @param request 获取黑名单的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetBlockListRequest = (GetBlockListRequest: GetBlockListRequestDto) => {
	return (
		GetBlockListRequest.type !== undefined && GetBlockListRequest.type !== null
	)
}

/**
 * 检查用户是否被屏蔽的请求载荷
 * @param CheckIsBlockedRequest 内容是否被屏蔽的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCheckUserIsBlockedRequest = (checkIsBlockedRequest: CheckUserIsBlockedRequestDto): boolean => {
	return (
		checkIsBlockedRequest.uid !== undefined && checkIsBlockedRequest.uid !== null
	)
}

/**
 * 检测是否被其他用户屏蔽的请求载荷
 * @param CheckIsBlockedByOtherUserRequestDto 是否被其他用户屏蔽的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCheckIsBlockedByOtherUserRequest = (checkIsBlockedRequest: CheckIsBlockedByOtherUserRequestDto): boolean => {
	return (
		checkIsBlockedRequest.targetUid !== undefined && checkIsBlockedRequest.targetUid !== null
	)
}
