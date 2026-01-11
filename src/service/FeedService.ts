import { InferSchemaType, PipelineStage } from "mongoose";
import { AddNewUid2FeedGroupRequestDto, AddNewUid2FeedGroupResponseDto, AdministratorApproveFeedGroupInfoChangeRequestDto, AdministratorApproveFeedGroupInfoChangeResponseDto, AdministratorDeleteFeedGroupRequestDto, AdministratorDeleteFeedGroupResponseDto, CreateFeedGroupRequestDto, CreateFeedGroupResponseDto, CreateOrEditFeedGroupInfoRequestDto, CreateOrEditFeedGroupInfoResponseDto, DeleteFeedGroupRequestDto, DeleteFeedGroupResponseDto, FOLLOWING_TYPE, FollowingUploaderRequestDto, FollowingUploaderResponseDto, GetFeedContentRequestDto, GetFeedContentResponseDto, GetFeedGroupCoverUploadSignedUrlResponseDto, GetFeedGroupListResponseDto, GetFollowingListRequestDto, GetFollowingListResponseDto, GetFollowerListRequestDto, GetFollowerListResponseDto, GetFollowStatsRequestDto, GetFollowStatsResponseDto, RemoveUidFromFeedGroupRequestDto, RemoveUidFromFeedGroupResponseDto, UnfollowingUploaderRequestDto, UnfollowingUploaderResponseDto, UserInfoForFollowList} from "../controller/FeedControllerDto.js";
import { FeedGroupSchema, FollowingSchema, UnfollowingSchema } from "../dbPool/schema/FeedSchema.js";
import { checkUserExistsByUuidService, checkUserTokenByUuidService, getUserUuid } from "./UserService.js";
import { QueryType, SelectType, UpdateType } from "../dbPool/DbClusterPoolTypes.js";
import { deleteDataFromMongoDB, findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataByAggregateFromMongoDB, selectDataFromMongoDB } from "../dbPool/DbClusterPool.js";
import { abortAndEndSession, commitAndEndSession, createAndStartSession } from "../common/MongoDBSessionTool.js";
import { CheckUserExistsByUuidRequestDto } from "../controller/UserControllerDto.js";
import { v4 as uuidV4 } from 'uuid'
import { generateSecureRandomString } from "../common/RandomTool.js";
import { createCloudflareImageUploadSignedUrl } from "../cloudflare/index.js";
import { VideoSchema } from "../dbPool/schema/VideoSchema.js";
import { UserInfoSchema, UserSettingsSchema } from "../dbPool/schema/UserSchema.js";
import { logging } from "./loggingService.js";

/**
 * 用户关注一个创作者
 * @param followingUploaderRequest 用户关注一个创作者的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户关注一个创作者的请求响应
 */
export const followingUploaderService = async (followingUploaderRequest: FollowingUploaderRequestDto, uuid: string, token: string): Promise<FollowingUploaderResponseDto> => {
	try {
		if (!checkFollowingUploaderRequest(followingUploaderRequest)) {
			logging('ERROR', '关注用户失败：参数不合法。')
			return { success: false, message: '关注用户失败：参数不合法。' }
		}

		const now = new Date().getTime()
		const followerUuid = uuid
		const { followingUid } = followingUploaderRequest

		const followingUuid = await getUserUuid(followingUid) as string

		if (followerUuid === followingUuid) {
			logging('ERROR', '关注用户失败，不能自己关注自己。')
			return { success: false, message: '关注用户失败：不能自己关注自己。' }
		}

		if (!(await checkUserTokenByUuidService(followerUuid, token)).success) {
			logging('ERROR', '关注用户失败，非法用户。')
			return { success: false, message: '关注用户失败，非法用户' }
		}

		const checkFollowingUuidResult = await checkUserExistsByUuidService({ uuid: followingUuid })
		if (!checkFollowingUuidResult.success || (checkFollowingUuidResult.success && !checkFollowingUuidResult.exists)) {
			logging('ERROR', '关注用户失败，被关注用户不存在。')
			return { success: false, message: '关注用户失败，被关注用户不存在。' }
		}

		const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
		type Following = InferSchemaType<typeof followingSchemaInstance>

		const getFollowingDataWhere: QueryType<Following> = {
			followerUuid,
			followingUuid,
		}

		const getFollowingDataSelect: SelectType<Following> = {
			followerUuid: 1,
			followingUuid: 1,
		}

		const session = await createAndStartSession()

		const getFollowingData = await selectDataFromMongoDB<Following>(getFollowingDataWhere, getFollowingDataSelect, followingSchemaInstance, followingCollectionName, { session })
		const getFollowingDataResult = getFollowingData.result
		if (getFollowingDataResult.length > 0) {
			await abortAndEndSession(session)
			logging('ERROR', '关注用户失败，用户已被关注。')
			return { success: false, message: '关注用户失败，用户已被关注。' }
		}

		const followingData: Following = {
			followerUuid,
			followingUuid,
			followingType: FOLLOWING_TYPE.normal,
			isFavorite: false,
			followingEditDateTime: now,
			followingCreateTime: now,
		}

		const insertFollowingDataResult = await insertData2MongoDB<Following>(followingData, followingSchemaInstance, followingCollectionName, { session })

		if (!insertFollowingDataResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '关注用户失败，插入数据失败。')
			return { success: false, message: '关注用户失败，插入数据失败。' }
		}

		await commitAndEndSession(session)
		return { success: true, message: '关注用户成功！' }
	} catch (error) {
		logging('ERROR', '关注用户时出错：未知原因。', error)
		return { success: false, message: '关注用户时出错：未知原因。' }
	}
}

/**
 * 用户取消关注一个创作者
 * @param followingUploaderRequest 用户取消关注一个创作者的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 用户取消关注一个创作者的请求响应
 */
export const unfollowingUploaderService = async (unfollowingUploaderRequest: UnfollowingUploaderRequestDto, uuid: string, token: string): Promise<UnfollowingUploaderResponseDto> => {
	try {
		if (!checkUnfollowingUploaderRequest(unfollowingUploaderRequest)) {
			logging('ERROR', '取消关注用户失败，参数不合法。')
			return { success: false, message: '取消关注用户失败：参数不合法。' }
		}

		const now = new Date().getTime()
		const followerUuid = uuid
		const { unfollowingUid } = unfollowingUploaderRequest

		const unfollowingUuid = await getUserUuid(unfollowingUid) as string

		if (followerUuid === unfollowingUuid) {
			logging('ERROR', '取消关注用户失败，不能取消关注自己。')
			return { success: false, message: '取消关注用户失败：不能取消关注自己。' }
		}

		if (!(await checkUserTokenByUuidService(followerUuid, token)).success) {
			logging('ERROR', '取消关注用户失败，非法用户。')
			return { success: false, message: '取消关注用户失败，非法用户' }
		}

		const checkFollowingUuidResult = await checkUserExistsByUuidService({ uuid: unfollowingUuid })
		if (!checkFollowingUuidResult.success || (checkFollowingUuidResult.success && !checkFollowingUuidResult.exists)) {
			logging('ERROR', '取消关注用户失败，被关注用户不存在。')
			return { success: false, message: '取消关注用户失败，被关注用户不存在。' }
		}

		const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
		const { collectionName: unfollowingCollectionName, schemaInstance: unfollowingSchemaInstance } = UnfollowingSchema
		type Following = InferSchemaType<typeof followingSchemaInstance>
		type Unfollowing = InferSchemaType<typeof unfollowingSchemaInstance>

		const followingWhere: QueryType<Following> = {
			followerUuid,
			followingUuid: unfollowingUuid,
		}
		const followingSelect: SelectType<Following> = {
			followerUuid: 1,
			followingUuid: 1,
			followingType: 1,
			isFavorite: 1,
			followingEditDateTime: 1,
			followingCreateTime: 1,
		}

		const session = await createAndStartSession()

		const selectUnfollowingDataResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingCollectionName, { session })
		const selectUnfollowingData = selectUnfollowingDataResult.result?.[0]

		if (!selectUnfollowingDataResult.success || selectUnfollowingDataResult.result.length !== 1 || !selectUnfollowingData) {
			await abortAndEndSession(session)
			logging('ERROR', '取消关注用户失败，读取关注数据失败。')
			return { success: false, message: '取消关注用户失败，读取关注数据失败。' }
		}

		const unfollowingData: Unfollowing = {
			...selectUnfollowingData,
			unfollowingReasonType: 'normal',
			unfollowingDateTime: now,
			unfollowingEditDateTime: now,
			unfollowingCreateTime: now,
		}

		const insertUnfollowingDataResult = await insertData2MongoDB<Unfollowing>(unfollowingData, unfollowingSchemaInstance, unfollowingCollectionName, { session })

		if (!insertUnfollowingDataResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '取消关注用户失败，记录处理失败。')
			return { success: false, message: '取消关注用户失败，记录处理失败。' }
		}

		const deleteFollowingDataResult = await deleteDataFromMongoDB<Following>(followingWhere, followingSchemaInstance, followingCollectionName, { session })

		if (!deleteFollowingDataResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '取消关注用户失败，删除关注记录失败。')
			return { success: false, message: '取消关注用户失败，删除关注记录失败。' }
		}

		await commitAndEndSession(session)
		return { success: true, message: '取消关注用户成功！' }
	} catch (error) {
		logging('ERROR', '取消关注用户时出错：未知原因。', error)
		return { success: false, message: '取消关注用户时出错：未知原因。' }
	}
}

/**
 * 创建动态分组
 * @param createFeedGroupRequest 创建动态分组的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 创建动态分组的请求响应
 */
export const createFeedGroupService = async (createFeedGroupRequest: CreateFeedGroupRequestDto, uuid: string, token: string): Promise<CreateFeedGroupResponseDto> => {
	try {
		if (!checkCreateFeedGroupRequest(createFeedGroupRequest)) {
			logging('ERROR', '创建动态分组失败，参数不合法。')
			return { success: false, tooManyUidInOnce: false, message: '创建动态分组失败，参数不合法。' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '创建动态分组失败，非法用户。')
			return { success: false, tooManyUidInOnce: false, message: '创建动态分组失败，非法用户' }
		}

		const { feedGroupName, withUidList: uidList, withCustomCoverUrl } = createFeedGroupRequest
		const uuidList = []
		if (uidList && Array.isArray(uidList) && uidList.length > 0) {
			if (uidList.length > 50) {
				logging('ERROR', '创建动态分组失败，一次性添加的 UID 太多了')
				return { success: false, tooManyUidInOnce: true, message: '创建动态分组失败，一次性添加的 UID 太多了' }
			}

			let isCorrectUuidList = true
			uidList.forEach(async uid => {
				const uuid = await getUserUuid(uid) as string
				const checkUserExistsByUuidRequest: CheckUserExistsByUuidRequestDto = {
					uuid,
				}
				const uuidExistsResult = await checkUserExistsByUuidService(checkUserExistsByUuidRequest)
				if (!uuidExistsResult.success || !uuidExistsResult.exists) {
					isCorrectUuidList = false
				}

				uuidList.push(uuid)
			})

			if (!isCorrectUuidList) {
				logging('ERROR', '创建动态分组失败，UUID 列表不合法。')
				return { success: false, tooManyUidInOnce: false, message: '创建动态分组失败，UUID 列表不合法' }
			}
		}

		const now = new Date().getTime()
		const feedGroupUuid = uuidV4()

		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const feedGroupData: FeedGroup = {
			feedGroupUuid,
			feedGroupName,
			feedGroupCreatorUuid: uuid,
			uuidList: [...new Set<string>(uuidList)],
			customCover: withCustomCoverUrl,
			isUpdatedAfterReview: true,
			createDateTime: now,
			editDateTime: now,
		}

		const insertFeedGroupDataResult = await insertData2MongoDB<FeedGroup>(feedGroupData, feedGroupSchemaInstance, feedGroupCollectionName)

		if (!insertFeedGroupDataResult.success) {
			logging('ERROR', '创建动态分组失败，插入数据失败。')
			return { success: false, tooManyUidInOnce: false, message: '创建动态分组失败，插入数据失败' }
		}

		return { success: true, tooManyUidInOnce: false, message: '创建动态分组成功。' }
	} catch (error) {
		logging('ERROR', '创建动态分组时出错：未知原因。', error)
		return { success: false, tooManyUidInOnce: false, message: '创建动态分组时出错：未知原因。' }
	}
}

/**
 * 向一个动态分组中添加新的 UID
 * @param addNewUser2FeedGroupRequest 向一个动态分组中添加新的 UID 的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 向一个动态分组中添加新的 UID 的请求响应
 */
export const addNewUid2FeedGroupService = async (addNewUser2FeedGroupRequest: AddNewUid2FeedGroupRequestDto, uuid: string, token: string): Promise<AddNewUid2FeedGroupResponseDto> => {
	try {
		if (!checkAddNewUser2FeedGroupRequest(addNewUser2FeedGroupRequest)) {
			logging('ERROR', '向一个动态分组中添加新的 UID 失败，参数不合法。')
			return { success: false, tooManyUidInOnce: false, isOverload: false, message: '向一个动态分组中添加新的 UID 失败，参数不合法。' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '向一个动态分组中添加新的 UID 失败，非法用户。')
			return { success: false, tooManyUidInOnce: false, isOverload: false, message: '向一个动态分组中添加新的 UID 失败，非法用户' }
		}

		const { feedGroupUuid, uidList } = addNewUser2FeedGroupRequest

		const uuidList = []
		if (uidList && Array.isArray(uidList) && uidList.length > 0) {
			if (uidList.length > 50) {
				logging('ERROR', '向一个动态分组中添加新的 UID 失败，一次性添加的 UID 太多了')
				return { success: false, tooManyUidInOnce: true, isOverload: false, message: '向一个动态分组中添加新的 UID 失败，一次性添加的 UID 太多了' }
			}

			let isCorrectUuidList = true
			uidList.forEach(async uid => {
				const uuid = await getUserUuid(uid) as string
				const checkUserExistsByUuidRequest: CheckUserExistsByUuidRequestDto = {
					uuid,
				}
				const uuidExistsResult = await checkUserExistsByUuidService(checkUserExistsByUuidRequest)
				if (!uuidExistsResult.success || !uuidExistsResult.exists) {
					isCorrectUuidList = false
				}

				uuidList.push(uuid)
			})

			if (!isCorrectUuidList) {
				logging('ERROR', '向一个动态分组中添加新的 UID 失败，UUID 列表不合法。')
				return { success: false, tooManyUidInOnce: false, isOverload: false, message: '向一个动态分组中添加新的 UID 失败，UUID 列表不合法' }
			}
		}

		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const getFeedGroupSelect: SelectType<FeedGroup> = {
			feedGroupUuid: 1,
			uuidList: 1,
		}
		const feedGroupWhere: QueryType<FeedGroup> = {
			feedGroupUuid,
			feedGroupCreatorUuid: uuid, // 确保修改的是自己创建的动态分组
		}

		const session = await createAndStartSession()

		const getFeedGroupDataResult = await selectDataFromMongoDB<FeedGroup>(feedGroupWhere, getFeedGroupSelect, feedGroupSchemaInstance, feedGroupCollectionName, { session })
		const getFeedGroupData = getFeedGroupDataResult.result?.[0]

		if (!getFeedGroupDataResult.success || !getFeedGroupData.feedGroupUuid) {
			await abortAndEndSession(session)
			logging('ERROR', '向一个动态分组中添加新的 UID 失败，更新的动态列表不存在或者不是由当前用户创建')
			return { success: false, tooManyUidInOnce: false, isOverload: false, message: '向一个动态分组中添加新的 UID 失败，更新的动态列表不存在或者不是由当前用户创建' }
		}

		const newUuidList = [...new Set<string>(uuidList.concat(getFeedGroupData.uuidList ?? []))]

		if (newUuidList.length > 10000) {
			await abortAndEndSession(session)
			logging('ERROR', '向一个动态分组中添加新的 UID 失败，动态分组中用户太多了')
			return { success: false, tooManyUidInOnce: false, isOverload: true, message: '向一个动态分组中添加新的 UID 失败，动态分组中用户太多了' }
		}

		const now = new Date().getTime()
		const updateFeedGroupData: UpdateType<FeedGroup> = {
			uuidList: newUuidList,
			editDateTime: now,
		}

		const findOneAndUpdateFeedGroupDataResult = await findOneAndUpdateData4MongoDB<FeedGroup>(feedGroupWhere, updateFeedGroupData, feedGroupSchemaInstance, feedGroupCollectionName, { session })
		const findOneAndUpdateFeedGroupData = findOneAndUpdateFeedGroupDataResult.result?.[0]

		if (!findOneAndUpdateFeedGroupDataResult.success || !findOneAndUpdateFeedGroupData) {
			await abortAndEndSession(session)
			logging('ERROR', '向一个动态分组中添加新的 UID 失败，更新失败')
			return { success: false, tooManyUidInOnce: false, isOverload: false, message: '向一个动态分组中添加新的 UID 失败，更新失败' }
		}

		await commitAndEndSession(session)
		return { success: true, tooManyUidInOnce: false, isOverload: false, message: '向一个动态分组中添加新的 UID 成功', feedGroupResult: findOneAndUpdateFeedGroupData }
	} catch (error) {
		logging('ERROR', '向一个动态分组中添加新的 UID 时出错：未知原因。', error)
		return { success: false, tooManyUidInOnce: false, isOverload: false, message: '向一个动态分组中添加新的 UID 时出错：未知原因。' }
	}
}

/**
 * 从一个动态分组中移除 UID
 * @param removeUidFromFeedGroupRequest 从一个动态分组中移除 UID 的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 从一个动态分组中移除 UID 的请求响应
 */
export const removeUidFromFeedGroupService = async (removeUidFromFeedGroupRequest: RemoveUidFromFeedGroupRequestDto, uuid: string, token: string): Promise<RemoveUidFromFeedGroupResponseDto> => {
	try {
		if (!checkRemoveUidFromFeedGroupRequest(removeUidFromFeedGroupRequest)) {
			logging('ERROR', '从一个动态分组中移除 UID 失败，参数不合法。')
			return { success: false, tooManyUidInOnce: false, message: '从一个动态分组中移除 UID 失败，参数不合法。' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '从一个动态分组中移除 UID 失败，非法用户。')
			return { success: false, tooManyUidInOnce: false, message: '从一个动态分组中移除 UID 失败，非法用户' }
		}

		const { feedGroupUuid, uidList } = removeUidFromFeedGroupRequest

		const uuidList = []
		if (uidList && Array.isArray(uidList) && uidList.length > 0) {
			if (uidList.length > 50) {
				logging('ERROR', '从一个动态分组中移除 UID 失败，一次性移除的 UID 太多了')
				return { success: false, tooManyUidInOnce: true, message: '从一个动态分组中移除 UID 失败，一次性移除的 UID 太多了' }
			}

			let isCorrectUuidList = true
			uidList.forEach(async uid => {
				const uuid = await getUserUuid(uid) as string
				const checkUserExistsByUuidRequest: CheckUserExistsByUuidRequestDto = {
					uuid,
				}
				const uuidExistsResult = await checkUserExistsByUuidService(checkUserExistsByUuidRequest)
				if (!uuidExistsResult.success || !uuidExistsResult.exists) {
					isCorrectUuidList = false
				}

				uuidList.push(uuid)
			})

			if (!isCorrectUuidList) {
				logging('ERROR', '从一个动态分组中移除 UID 失败，UUID 列表不合法。')
				return { success: false, tooManyUidInOnce: false, message: '从一个动态分组中移除 UID 失败，UUID 列表不合法' }
			}
		}

		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const getFeedGroupSelect: SelectType<FeedGroup> = {
			feedGroupUuid: 1,
			uuidList: 1,
		}
		const feedGroupWhere: QueryType<FeedGroup> = {
			feedGroupUuid,
			feedGroupCreatorUuid: uuid, // 确保修改的是自己创建的动态分组
		}

		const session = await createAndStartSession()

		const getFeedGroupDataResult = await selectDataFromMongoDB<FeedGroup>(feedGroupWhere, getFeedGroupSelect, feedGroupSchemaInstance, feedGroupCollectionName, { session })
		const getFeedGroupData = getFeedGroupDataResult.result?.[0]

		if (!getFeedGroupDataResult.success || !getFeedGroupData.feedGroupUuid) {
			await abortAndEndSession(session)
			logging('ERROR', '从一个动态分组中移除 UID 失败，更新的动态列表不存在或者不是由当前用户创建')
			return { success: false, tooManyUidInOnce: false, message: '从一个动态分组中移除 UID 失败，更新的动态列表不存在或者不是由当前用户创建' }
		}

		const oldUuidList = [...new Set<string>(getFeedGroupData.uuidList ?? [])]
		const shouldRemoveUuidList = [...new Set<string>(uuidList)]
		const differenceUuidList = oldUuidList.filter(uuid => !shouldRemoveUuidList.includes(uuid))
		const now = new Date().getTime()
		const updateFeedGroupData: UpdateType<FeedGroup> = {
			uuidList: differenceUuidList,
			editDateTime: now,
		}

		const findOneAndUpdateFeedGroupDataResult = await findOneAndUpdateData4MongoDB<FeedGroup>(feedGroupWhere, updateFeedGroupData, feedGroupSchemaInstance, feedGroupCollectionName, { session })
		const findOneAndUpdateFeedGroupData = findOneAndUpdateFeedGroupDataResult.result?.[0]

		if (!findOneAndUpdateFeedGroupDataResult.success || !findOneAndUpdateFeedGroupData) {
			await abortAndEndSession(session)
			logging('ERROR', '从一个动态分组中移除 UID 失败，更新失败')
			return { success: false, tooManyUidInOnce: false, message: '从一个动态分组中移除 UID 失败，更新失败' }
		}

		await commitAndEndSession(session)
		return { success: true, tooManyUidInOnce: false, message: '从一个动态分组中移除 UID 成功', feedGroupResult: findOneAndUpdateFeedGroupData }
	} catch (error) {
		logging('ERROR', '从一个动态分组中移除 UID 时出错：未知原因。', error)
		return { success: false, tooManyUidInOnce: false, message: '从一个动态分组中移除 UID 时出错：未知原因。' }
	}
}

/**
 * 删除动态分组
 * @param deleteFeedGroupRequest 删除动态分组的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 删除动态分组的请求响应
 */
export const deleteFeedGroupService = async (deleteFeedGroupRequest: DeleteFeedGroupRequestDto, uuid: string, token: string): Promise<DeleteFeedGroupResponseDto> => {
	try {
		if (!checkDeleteFeedGroupRequest(deleteFeedGroupRequest)) {
			logging('ERROR', '删除动态分组失败，参数不合法')
			return { success: false, message: '删除动态分组失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除动态分组失败，非法用户')
			return { success: false, message: '删除动态分组失败，非法用户' }
		}

		const { feedGroupUuid } = deleteFeedGroupRequest
		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const deleteFeedGroupWhere: QueryType<FeedGroup> = {
			feedGroupUuid,
			feedGroupCreatorUuid: uuid, // 确保删除的是自己创建的动态分组
		}

		const deleteFeedGroupResult = await deleteDataFromMongoDB<FeedGroup>(deleteFeedGroupWhere, feedGroupSchemaInstance, feedGroupCollectionName)

		if (!deleteFeedGroupResult.success) {
			logging('ERROR', '删除动态分组失败，删除失败')
			return { success: false, message: '删除动态分组失败，删除失败' }
		}

		return { success: true, message: '删除动态分组成功' }
	} catch (error) {
		logging('ERROR', '删除动态分组时出错：未知原因', error)
		return { success: false, message: '删除动态分组时出错：未知原因' }
	}
}

/**
 * 获取用于上传动态分组封面图的预签名 URL
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns GetFeedGroupCoverUploadSignedUrlResponseDto 获取用于上传动态分组封面图的预签名 URL 的请求响应
 */
export const getFeedGroupCoverUploadSignedUrlService = async (uuid: string, token: string): Promise<GetFeedGroupCoverUploadSignedUrlResponseDto> => {
	try {
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取用于上传动态分组封面图的预签名 URL 失败，用户校验未通过')
			return { success: false, message: '获取用于上传动态分组封面图的预签名 URL 失败，用户校验未通过' }
		}
		const now = new Date().getTime()
		const fileName = `feed-group-cover-${uuid}-${generateSecureRandomString(32)}-${now}`
		try {
			const signedUrl = await createCloudflareImageUploadSignedUrl(fileName, 660)
			if (signedUrl) {
				return { success: true, message: '获取用于上传动态分组封面图的预签名 URL 成功', result: { fileName, signedUrl } }
			}
		} catch (error) {
			logging('ERROR', '获取用于上传动态分组封面图的预签名 URL 失败，请求失败', error)
			return { success: false, message: '获取用于上传动态分组封面图的预签名 URL 失败，请求失败' }
		}
	} catch (error) {
		logging('ERROR', '获取用于上传动态分组封面图的预签名 URL 时出错：', error)
		return { success: false, message: '获取用于上传动态分组封面图的预签名 URL 时出错，未知原因' }
	}
}

/**
 * 创建或更新动态分组信息
 * 更新动态分组的名称或者头像 URL 都是这个接口
 *
 * @param createOrEditFeedGroupInfoRequest 创建或更新动态分组信息的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 创建或更新动态分组信息的请求响应
 */
export const createOrEditFeedGroupInfoService = async (createOrEditFeedGroupInfoRequest: CreateOrEditFeedGroupInfoRequestDto, uuid: string, token: string): Promise<CreateOrEditFeedGroupInfoResponseDto> => {
	try {
		if (!checkCreateOrEditFeedGroupInfoRequest(createOrEditFeedGroupInfoRequest)) {
			logging('ERROR', '创建或更新动态分组信息失败，参数不合法')
			return { success: false, message: '创建或更新动态分组信息失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '创建或更新动态分组信息失败，非法用户')
			return { success: false, message: '创建或更新动态分组信息失败，非法用户' }
		}

		const { feedGroupUuid, feedGroupName, feedGroupCustomCoverUrl } = createOrEditFeedGroupInfoRequest
		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const now = new Date().getTime()

		const updateFeedGroupWhere: QueryType<FeedGroup> = {
			feedGroupUuid,
			feedGroupCreatorUuid: uuid, // 确保修改的是自己创建的动态分组
		}
		const updateFeedGroupData: UpdateType<FeedGroup> = {
			feedGroupName,
			customCover: feedGroupCustomCoverUrl,
			isUpdatedAfterReview: true,
			editDateTime: now,
		}

		const findOneAndUpdateFeedGroupDataResult = await findOneAndUpdateData4MongoDB<FeedGroup>(updateFeedGroupWhere, updateFeedGroupData, feedGroupSchemaInstance, feedGroupCollectionName)

		if (!findOneAndUpdateFeedGroupDataResult.success || !findOneAndUpdateFeedGroupDataResult.result) {
			logging('ERROR', '创建或更新动态分组信息失败，更新失败')
			return { success: false, message: '创建或更新动态分组信息失败，更新失败' }
		}

		return { success: false, message: '创建或更新动态分组信息成功', feedGroupResult: findOneAndUpdateFeedGroupDataResult.result }
	} catch (error) {
		logging('ERROR', '创建或更新动态分组信息时出错：未知原因', error)
		return { success: false, message: '创建或更新动态分组信息时出错：未知原因' }
	}
}

/**
 * // WARN: 仅限管理员
 * 管理员通过动态分组信息更新审核
 * @param administratorApproveFeedGroupInfoChangeRequest 管理员通过动态分组信息更新审核的请求载荷
 * @param administratorUuid 管理员的 UUID
 * @param administratorToken 管理员的 token
 * @returns 管理员通过动态分组信息更新审核的请求响应
 */
export const administratorApproveFeedGroupInfoChangeService = async (administratorApproveFeedGroupInfoChangeRequest: AdministratorApproveFeedGroupInfoChangeRequestDto, administratorUuid: string, administratorToken: string): Promise<AdministratorApproveFeedGroupInfoChangeResponseDto> => {
	try {
		if (!checkAdministratorApproveFeedGroupInfoChangeRequest(administratorApproveFeedGroupInfoChangeRequest)) {
			logging('ERROR', '管理员通过动态分组信息更新审核失败，参数不合法')
			return { success: false, message: '管理员通过动态分组信息更新审核失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(administratorUuid, administratorToken)).success) {
			logging('ERROR', '管理员通过动态分组信息更新审核失败，非法用户')
			return { success: false, message: '管理员通过动态分组信息更新审核失败，非法用户' }
		}

		const { feedGroupUuid } = administratorApproveFeedGroupInfoChangeRequest
		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const now = new Date().getTime()

		const updateFeedGroupWhere: QueryType<FeedGroup> = {
			feedGroupUuid,
		}
		const updateFeedGroupData: UpdateType<FeedGroup> = {
			isUpdatedAfterReview: false,
			editDateTime: now,
		}

		const findOneAndUpdateFeedGroupDataResult = await findOneAndUpdateData4MongoDB<FeedGroup>(updateFeedGroupWhere, updateFeedGroupData, feedGroupSchemaInstance, feedGroupCollectionName)

		if (!findOneAndUpdateFeedGroupDataResult.success || !findOneAndUpdateFeedGroupDataResult.result) {
			logging('ERROR', '管理员通过动态分组信息更新审核失败，更新失败')
			return { success: false, message: '管理员通过动态分组信息更新审核失败，更新失败' }
		}

		return { success: false, message: '管理员通过动态分组信息更新审核成功' }
	} catch (error) {
		logging('ERROR', '管理员通过动态分组信息更新审核时出错：', error)
		return { success: false, message: '管理员通过动态分组信息更新审核时出错，未知原因' }
	}
}

/**
 * // WARN: 仅限管理员
 * 管理员删除动态分组
 * @param administratorDeleteFeedGroupRequest 管理员删除动态分组的请求载荷
 * @param administratorUuid 管理员的 UUID
 * @param administratorToken 管理员的 token
 * @returns 管理员删除动态分组的请求响应
 */
export const administratorDeleteFeedGroupService = async (administratorDeleteFeedGroupRequest: AdministratorDeleteFeedGroupRequestDto, administratorUuid: string, administratorToken: string): Promise<AdministratorDeleteFeedGroupResponseDto> => {
	try {
		if (!checkAdministratorDeleteFeedGroupRequest(administratorDeleteFeedGroupRequest)) {
			logging('ERROR', '管理员删除动态分组失败，参数不合法')
			return { success: false, message: '管理员删除动态分组失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(administratorUuid, administratorToken)).success) {
			logging('ERROR', '管理员删除动态分组失败，非法用户')
			return { success: false, message: '管理员删除动态分组失败，非法用户' }
		}

		const { feedGroupUuid } = administratorDeleteFeedGroupRequest
		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const deleteFeedGroupWhere: QueryType<FeedGroup> = {
			feedGroupUuid,
		}

		const administratorDeleteFeedGroupResult = await deleteDataFromMongoDB<FeedGroup>(deleteFeedGroupWhere, feedGroupSchemaInstance, feedGroupCollectionName)

		if (!administratorDeleteFeedGroupResult.success) {
			logging('ERROR', '管理员删除动态分组失败，更新失败')
			return { success: false, message: '管理员删除动态分组失败，更新失败' }
		}

		return { success: false, message: '管理员通过动态分组信息更新审核成功' }
	} catch (error) {
		logging('ERROR', '管理员删除动态分组时出错：', error)
		return { success: false, message: '管理员删除动态分组时出错，未知原因' }
	}
}

/**
 * 获取动态分组
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 获取动态分组的请求响应
 */
export const getFeedGroupListService = async (uuid: string, token: string): Promise<GetFeedGroupListResponseDto> => {
	try {
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取动态分组失败，非法用户')
			return { success: false, message: '获取动态分组失败，非法用户' }
		}

		const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
		type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

		const getFeedGroupWhere: QueryType<FeedGroup> = {
			feedGroupCreatorUuid: uuid,
		}

		const getFeedGroupSelect: SelectType<FeedGroup> = {
			feedGroupUuid: 1, // 动态分组的 UUID
			feedGroupName: 1, // 动态分组的名称
			feedGroupCreatorUuid: 1, // 动态分组创建者 UUID
			uuidList: 1, // 动态分组中的用户
			customCover: 1, // 动态分组的自定义封面
			editDateTime: 1, // 系统专用字段-最后编辑时间
			createDateTime: 1, // 系统专用字段-创建时间
		}

		const getFeedGroupResult = await selectDataFromMongoDB<FeedGroup>(getFeedGroupWhere, getFeedGroupSelect, feedGroupSchemaInstance, feedGroupCollectionName)

		if (!getFeedGroupResult.success || !getFeedGroupResult.result) {
			logging('ERROR', '获取动态分组失败，查询失败')
			return { success: false, message: '获取动态分组失败，查询失败' }
		}

		return { success: true, message: '获取动态分组成功', result: getFeedGroupResult.result }
	} catch (error) {
		logging('ERROR', '获取动态分组时出错：', error)
		return { success: false, message: '获取动态分组时出错，未知原因' }
	}
}

/**
 * 获取动态内容
 * @param getFeedContentRequest 获取动态内容的请求载荷
 * @param uuid 用户的 UUID
 * @param token 用户的 token
 * @returns 获取动态内容的请求响应
 */
export const getFeedContentService = async (getFeedContentRequest: GetFeedContentRequestDto, uuid: string, token: string): Promise<GetFeedContentResponseDto> => {
	try {
		if (!checkGetFeedContentRequest(getFeedContentRequest)) {
			logging('ERROR', '获取动态内容失败，参数不合法')
			return { success: false, message: '获取动态内容失败，参数不合法', isLonely: false }
		}

		if (!(await checkUserTokenByUuidService(uuid, uuid)).success) {
			logging('ERROR', '获取动态内容失败，非法用户')
			return { success: false, message: '获取动态内容失败，非法用户', isLonely: false }
		}

		const { feedGroupUuid, pagination } = getFeedContentRequest

		const uuidList = []
		if (feedGroupUuid) {
			const { collectionName: feedGroupCollectionName, schemaInstance: feedGroupSchemaInstance } = FeedGroupSchema
			type FeedGroup = InferSchemaType<typeof feedGroupSchemaInstance>

			const getFeedGroupUuidListWhere: QueryType<FeedGroup> = {
				feedGroupUuid,
			}

			const getFeedGroupUuidListSelect: SelectType<FeedGroup> = {
				uuidList: 1, // 动态分组中的用户
			}

			const getFeedGroupUserListResult = await selectDataFromMongoDB<FeedGroup>(getFeedGroupUuidListWhere, getFeedGroupUuidListSelect, feedGroupSchemaInstance, feedGroupCollectionName)
			const uuidListResult = getFeedGroupUserListResult.result?.[0]?.uuidList

			if (!getFeedGroupUserListResult.success) {
				logging('ERROR', '获取动态内容失败，查询动态分组中的用户失败')
				return { success: false, message: '获取动态内容失败，查询动态分组中的用户失败', isLonely: { noUserInFeedGroup: true } }
			}

			if (Array.isArray(uuidListResult) && uuidList.length <= 0) {
				logging('WARN', '你选择动态分组中没有用户')
				return { success: true, message: '你选择动态分组中没有用户', isLonely: { noUserInFeedGroup: true }, result: { count: 0, content: [] } }
			}

			uuidList.push(uuidListResult)
		} else {
			const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
			type Following = InferSchemaType<typeof followingSchemaInstance>

			const getFollowingUuidListWhere: QueryType<Following> = {
				followerUuid: uuid,
			}

			const getFollowingUuidListSelect: SelectType<Following> = {
				followingUuid: 1,
			}

			const getFollowingUserListResult = await selectDataFromMongoDB<Following>(getFollowingUuidListWhere, getFollowingUuidListSelect, followingSchemaInstance, followingCollectionName)
			const uuidListResult = getFollowingUserListResult.result?.map(followingResult => followingResult.followingUuid)

			if (!getFollowingUserListResult.success) {
				logging('ERROR', '获取动态内容失败，查询用户关注的用户失败')
				return { success: false, message: '获取动态内容失败，查询用户关注的用户失败', isLonely: { noFollowing: true } }
			}

			if (Array.isArray(uuidListResult) && uuidList.length <= 0) {
				logging('WARN', '你没有关注任何用户')
				return { success: true, message: '你没有关注任何用户', isLonely: { noFollowing: true }, result: { count: 0, content: [] } }
			}

			uuidList.push(uuidListResult)
		}

		// 根据 uuid 匹配视频的基础 pipeline
		const feedContentMatchPipeline: PipelineStage[] = [
			{
				$match: {
					uploaderUUID: { $in: uuidList },
				},
			},
		]

		// 获取动态视频总数的 pipeline
		const countFeedContentBasePipeline: PipelineStage[] = [
			{
				$count: 'totalCount', // 统计总文档数
			}
		]

		let skip = 0
		let pageSize = undefined
		if (pagination && pagination.page > 0 && pagination.pageSize > 0) {
			skip = (pagination.page - 1) * pagination.pageSize
			pageSize = pagination.pageSize
		}

		// 匹配视频信息的 pipeline
		const getFeedContentBasePipeline: PipelineStage[] = [
			{
				$lookup: {
					from: 'user-infos',
					localField: 'uploaderUUID',
					foreignField: 'UUID',
					as: 'uploader_info',
				},
			},
			{ $skip: skip }, // 跳过指定数量的文档
			{ $limit: pageSize }, // 限制返回的文档数量
			{
				$unwind: '$uploader_info',
			},
			{
				$sort: {
					uploadDate: -1, // 按 uploadDate 降序排序
				},
			},
			{
				$project: {
					videoId: 1,
					title: 1,
					image: 1,
					uploadDate: 1,
					watchedCount: 1,
					uploaderId: 1, // 上传者 UID
					duration: 1,
					description: 1,
					editDateTime: 1,
					uploader: '$uploader_info.username', // 上传者的名字
					uploaderNickname: '$uploader_info.userNickname', // 上传者的昵称
				}
			}
		]

		const countFeedContentPipeline = feedContentMatchPipeline.concat(countFeedContentBasePipeline)
		const getFeedContentPipeline = feedContentMatchPipeline.concat(getFeedContentBasePipeline)

		const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
		type ThumbVideo = InferSchemaType<typeof videoSchemaInstance>

		const feedContentCountPromise = selectDataByAggregateFromMongoDB(videoSchemaInstance, videoCollectionName, countFeedContentPipeline)
		const feedContentDataPromise = selectDataByAggregateFromMongoDB<ThumbVideo>(videoSchemaInstance, videoCollectionName, getFeedContentPipeline)

		const [ feedContentCountResult, feedContentDataResult ] = await Promise.all([feedContentCountPromise, feedContentDataPromise])
		const count = feedContentCountResult.result?.[0]?.totalCount
		const content = feedContentDataResult.result

		if ( !feedContentCountResult.success || !feedContentDataResult.success
			|| typeof count !== 'number' || count < 0
			|| ( Array.isArray(content) && !content )
		) {
			logging('ERROR', '获取动态内容失败，查询视频数据失败')
			return { success: false, message: '获取动态内容失败，查询视频数据失败', isLonely: false }
		}

		return {
			success: true,
			message: count > 0 ? '获取动态内容成功' : '获取动态内容成功，长度为零',
			isLonely: false,
			result: {
				count,
				content,
			},
		}
	} catch (error) {
		logging('ERROR', '获取动态内容时出错：', error)
		return { success: false, message: '获取动态内容时出错，未知原因', isLonely: false }
	}
}

/**
 * 获取用户关注列表
 * @param getFollowingListRequest 获取用户关注列表的请求载荷
 * @param uuid 查看者的 UUID
 * @param token 查看者的 token
 * @returns 获取用户关注列表的请求响应
 */
export const getFollowingListService = async (getFollowingListRequest: GetFollowingListRequestDto, uuid: string | undefined, token: string | undefined): Promise<GetFollowingListResponseDto> => {
	try {
		if (!checkGetFollowingListRequest(getFollowingListRequest)) {
			logging('ERROR', '获取关注列表失败：参数不合法')
			return { success: false, message: '获取关注列表失败：参数不合法' }
		}

		// 验证 token（如果提供了）
		if (uuid && token && !(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取关注列表失败：用户验证失败')
			return { success: false, message: '获取关注列表失败：用户验证失败' }
		}

		const { targetUid, pagination } = getFollowingListRequest
		const { page, pageSize } = pagination
		const offset = (page - 1) * pageSize
		const targetUuid = await getUserUuid(targetUid)
		if (!targetUuid) {
			logging('ERROR', '获取关注列表失败：目标用户不存在')
			return { success: false, message: '获取关注列表失败：目标用户不存在' }
		}

		// 检查隐私权限
		const canView = await checkPrivacyPermission(targetUuid, uuid, 'privary.follow')
		if (!canView) {
			logging('ERROR', '获取关注列表失败：没有权限查看')
			return { success: false, message: '获取关注列表失败：没有权限查看该用户的关注列表' }
		}

		const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
		type Following = InferSchemaType<typeof followingSchemaInstance>

		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					followerUuid: targetUuid,
				},
			},
			{
				$count: 'total',
			},
		]
		const countResult = await selectDataByAggregateFromMongoDB(followingSchemaInstance, followingCollectionName, countPipeline)
		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].total : 0

		// 获取列表数据
		const listPipeline: PipelineStage[] = [
			{
				$match: {
					followerUuid: targetUuid,
				},
			},
			{
				$sort: { followingCreateTime: -1 },
			},
			{
				$skip: offset,
			},
			{
				$limit: pageSize,
			},
			{
				$lookup: {
					from: 'user-infos',
					localField: 'followingUuid',
					foreignField: 'UUID',
					as: 'userInfo',
				},
			},
			{
				$unwind: {
					path: '$userInfo',
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$project: {
					uid: '$userInfo.uid',
					username: '$userInfo.username',
					userNickname: '$userInfo.userNickname',
					avatar: '$userInfo.avatar',
					followingCreateTime: '$followingCreateTime',
				},
			},
		]
		const listResult = await selectDataByAggregateFromMongoDB(followingSchemaInstance, followingCollectionName, listPipeline)

		if (!listResult.success) {
			logging('ERROR', '获取关注列表失败：查询失败')
			return { success: false, message: '获取关注列表失败：查询失败' }
		}

		const result: UserInfoForFollowList[] = (listResult.result || []).map((item: any) => ({
			uid: item.uid || 0,
			username: item.username,
			userNickname: item.userNickname,
			avatar: item.avatar,
			followingCreateTime: item.followingCreateTime,
		}))

		return {success: true, message: '获取关注列表成功', totalCount, result,}
	} catch (error) {
		logging('ERROR', '获取关注列表失败：未知错误', error)
		return { success: false, message: '获取关注列表失败：未知错误' }
	}
}

/**
 * 获取用户粉丝列表
 * @param getFollowerListRequest 获取用户粉丝列表的请求载荷
 * @param uuid 查看者的 UUID
 * @param token 查看者的 token
 * @returns 获取用户粉丝列表的请求响应
 */
export const getFollowerListService = async (getFollowerListRequest: GetFollowerListRequestDto, uuid: string | undefined, token: string | undefined): Promise<GetFollowerListResponseDto> => {
	try {
		if (!checkGetFollowerListRequest(getFollowerListRequest)) {
			logging('ERROR', '获取粉丝列表失败：参数不合法')
			return { success: false, message: '获取粉丝列表失败：参数不合法' }
		}

		// 验证 token（如果提供了）
		if (uuid && token && !(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取粉丝列表失败：用户验证失败')
			return { success: false, message: '获取粉丝列表失败：用户验证失败' }
		}

		const { targetUid, pagination } = getFollowerListRequest
		const { page, pageSize } = pagination
		const offset = (page - 1) * pageSize
		const targetUuid = await getUserUuid(targetUid)
		if (!targetUuid) {
			logging('ERROR', '获取粉丝列表失败：目标用户不存在')
			return { success: false, message: '获取粉丝列表失败：目标用户不存在' }
		}

		// 检查隐私权限
		const canView = await checkPrivacyPermission(targetUuid, uuid, 'privary.fans')
		if (!canView) {
			logging('ERROR', '获取粉丝列表失败：没有权限查看')
			return { success: false, message: '获取粉丝列表失败：没有权限查看该用户的粉丝列表' }
		}

		const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
		type Following = InferSchemaType<typeof followingSchemaInstance>

		// 获取总数
		const countPipeline: PipelineStage[] = [
			{
				$match: {
					followingUuid: targetUuid,
				},
			},
			{
				$count: 'total',
			},
		]
		const countResult = await selectDataByAggregateFromMongoDB(followingSchemaInstance, followingCollectionName, countPipeline)
		const totalCount = countResult.success && countResult.result && countResult.result.length > 0 ? countResult.result[0].total : 0

		// 获取列表数据
		const listPipeline: PipelineStage[] = [
			{
				$match: {
					followingUuid: targetUuid,
				},
			},
			{
				$sort: { followingCreateTime: -1 },
			},
			{
				$skip: offset,
			},
			{
				$limit: pageSize,
			},
			{
				$lookup: {
					from: 'user-infos',
					localField: 'followerUuid',
					foreignField: 'UUID',
					as: 'userInfo',
				},
			},
			{
				$unwind: {
					path: '$userInfo',
					preserveNullAndEmptyArrays: true,
				},
			},
			{
				$project: {
					uid: '$userInfo.uid',
					_followerUuid: '$followerUuid', // 内部使用，不返回给前端
					username: '$userInfo.username',
					userNickname: '$userInfo.userNickname',
					avatar: '$userInfo.avatar',
					followingCreateTime: '$followingCreateTime',
				},
			},
		]
		const listResult = await selectDataByAggregateFromMongoDB(followingSchemaInstance, followingCollectionName, listPipeline)

		if (!listResult.success) {
			logging('ERROR', '获取粉丝列表失败：查询失败')
			return { success: false, message: '获取粉丝列表失败：查询失败' }
		}

		// 如果查看者已登录，检查查看者是否关注了每个粉丝
		// 先创建包含 uuid 的临时数组用于内部逻辑
		const tempResult = (listResult.result || []).map((item: any) => ({
			uid: item.uid || 0,
			_followerUuid: item._followerUuid || '',
			username: item.username,
			userNickname: item.userNickname,
			avatar: item.avatar,
			followingCreateTime: item.followingCreateTime,
			isFollowing: false,
		}))

		let result: UserInfoForFollowList[] = tempResult.map(({ _followerUuid, ...rest }) => rest)

		if (uuid) {
			// 批量检查查看者是否关注了这些用户
			const followerUuids = tempResult.map(r => r._followerUuid).filter(Boolean)
			if (followerUuids.length > 0) {
				const followingWhere: QueryType<Following> = {
					followerUuid: uuid,
					followingUuid: { $in: followerUuids },
				}
				const followingSelect: SelectType<Following> = {
					followingUuid: 1,
				}
				const followingResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingCollectionName)
				if (followingResult.success && followingResult.result) {
					const followingUuidSet = new Set(followingResult.result.map(f => f.followingUuid))
					result = tempResult.map(r => {
						const { _followerUuid, ...rest } = r
						return {
							...rest,
							isFollowing: followingUuidSet.has(_followerUuid),
						}
					})
				}
			}
		}

		return {success: true, message: '获取粉丝列表成功', totalCount, result,}
	} catch (error) {
		logging('ERROR', '获取粉丝列表失败：未知错误', error)
		return { success: false, message: '获取粉丝列表失败：未知错误' }
	}
}

/**
 * 获取用户关注数和粉丝数
 * @param getFollowStatsRequest 获取用户关注数和粉丝数的请求载荷
 * @param uuid 查看者的 UUID（可选）
 * @param token 查看者的 token（可选）
 * @returns 获取用户关注数和粉丝数的请求响应
 */
export const getFollowStatsService = async (getFollowStatsRequest: GetFollowStatsRequestDto, uuid: string | undefined, token: string | undefined): Promise<GetFollowStatsResponseDto> => {
	try {
		if (!checkGetFollowStatsRequest(getFollowStatsRequest)) {
			logging('ERROR', '获取关注统计失败：参数不合法')
			return { success: false, message: '获取关注统计失败：参数不合法' }
		}

		// 验证 token（如果提供了）
		if (uuid && token && !(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取关注统计失败：用户验证失败')
			return { success: false, message: '获取关注统计失败：用户验证失败' }
		}

		const { targetUid } = getFollowStatsRequest
		const targetUuid = await getUserUuid(targetUid)
		if (!targetUuid) {
			logging('ERROR', '获取关注统计失败：目标用户不存在')
			return { success: false, message: '获取关注统计失败：目标用户不存在' }
		}

		const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
		type Following = InferSchemaType<typeof followingSchemaInstance>

		// 获取关注数（目标用户关注了多少人）
		const followingCountPipeline: PipelineStage[] = [
			{
				$match: {
					followerUuid: targetUuid,
				},
			},
			{
				$count: 'total',
			},
		]
		const followingCountResult = await selectDataByAggregateFromMongoDB(followingSchemaInstance, followingCollectionName, followingCountPipeline)
		const followingCount = followingCountResult.success && followingCountResult.result && followingCountResult.result.length > 0 ? followingCountResult.result[0].total : 0

		// 获取粉丝数（有多少人关注了目标用户）
		const followerCountPipeline: PipelineStage[] = [
			{
				$match: {
					followingUuid: targetUuid,
				},
			},
			{
				$count: 'total',
			},
		]
		const followerCountResult = await selectDataByAggregateFromMongoDB(followingSchemaInstance, followingCollectionName, followerCountPipeline)
		const followerCount = followerCountResult.success && followerCountResult.result && followerCountResult.result.length > 0 ? followerCountResult.result[0].total : 0

		return {success: true, message: '获取关注统计成功', followingCount, followerCount,}
	} catch (error) {
		logging('ERROR', '获取关注统计失败：未知错误', error)
		return { success: false, message: '获取关注统计失败：未知错误' }
	}
}

/**
 * 校验用户关注一个创作者的请求载荷
 * @param followingUploaderRequest 用户关注一个创作者的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkFollowingUploaderRequest = (followingUploaderRequest: FollowingUploaderRequestDto): boolean => {
	return ( followingUploaderRequest.followingUid !== undefined && followingUploaderRequest.followingUid !== null && followingUploaderRequest.followingUid > 0 )
}

/**
 * 校验用户取消关注一个创作者的请求载荷
 * @param followingUploaderRequest 用户取消关注一个创作者的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkUnfollowingUploaderRequest = (unfollowingUploaderRequest: UnfollowingUploaderRequestDto): boolean => {
	return ( unfollowingUploaderRequest.unfollowingUid !== undefined && unfollowingUploaderRequest.unfollowingUid !== null && unfollowingUploaderRequest.unfollowingUid > 0 )
}

/**
 * 校验创建动态分组的请求载荷
 * @param createFeedGroupRequest 创建动态分组的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateFeedGroupRequest = (createFeedGroupRequest: CreateFeedGroupRequestDto): boolean => {
	return ( !!createFeedGroupRequest.feedGroupName )
}

/**
 * 校验向一个动态分组中添加新的 UID 的请求载荷
 * @param addNewUser2FeedGroupRequest 向一个动态分组中添加新的 UID 的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAddNewUser2FeedGroupRequest = (addNewUser2FeedGroupRequest: AddNewUid2FeedGroupRequestDto): boolean => {
	return (
		!!addNewUser2FeedGroupRequest.feedGroupUuid
		&& !!addNewUser2FeedGroupRequest.uidList && addNewUser2FeedGroupRequest.uidList.every(uid => uid !== undefined && uid !== null && uid > 0)
	)
}

/**
 * 校验从一个动态分组中移除 UID 的请求载荷
 * @param removeUidFromFeedGroupRequest 从一个动态分组中移除 UID 的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkRemoveUidFromFeedGroupRequest = (removeUidFromFeedGroupRequest: RemoveUidFromFeedGroupRequestDto): boolean => {
	return (
		!!removeUidFromFeedGroupRequest.feedGroupUuid
		&& !!removeUidFromFeedGroupRequest.uidList && removeUidFromFeedGroupRequest.uidList.every(uid => uid !== undefined && uid !== null && uid > 0)
	)
}

/**
 * 校验删除动态分组的请求载荷
 * @param deleteFeedGroupRequest 删除动态分组的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkDeleteFeedGroupRequest = (deleteFeedGroupRequest: DeleteFeedGroupRequestDto): boolean => {
	return ( !!deleteFeedGroupRequest.feedGroupUuid )
}

/**
 * 校验创建或更新动态分组信息的请求载荷
 * @param createOrEditFeedGroupInfoRequest 创建或更新动态分组信息的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateOrEditFeedGroupInfoRequest = (createOrEditFeedGroupInfoRequest: CreateOrEditFeedGroupInfoRequestDto): boolean => {
	return ( !!createOrEditFeedGroupInfoRequest.feedGroupUuid )
}

/**
 * 校验管理员通过动态分组信息更新审核的请求载荷
 * @param administratorApproveFeedGroupInfoChangeRequest 管理员通过动态分组信息更新审核的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAdministratorApproveFeedGroupInfoChangeRequest = (administratorApproveFeedGroupInfoChangeRequest: AdministratorApproveFeedGroupInfoChangeRequestDto): boolean => {
	return ( !!administratorApproveFeedGroupInfoChangeRequest.feedGroupUuid )
}

/**
 * 校验管理员通过动态分组信息更新审核的请求载荷
 * @param administratorDeleteFeedGroupRequest 管理员通过动态分组信息更新审核的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAdministratorDeleteFeedGroupRequest = (administratorDeleteFeedGroupRequest: AdministratorDeleteFeedGroupRequestDto): boolean => {
	return ( !!administratorDeleteFeedGroupRequest.feedGroupUuid )
}

/**
 * 校验获取动态内容的请求载荷
 * @param getFeedContentRequest 获取动态内容的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFeedContentRequest = (getFeedContentRequest: GetFeedContentRequestDto): boolean => {
	return (
		!!getFeedContentRequest.pagination
		&& getFeedContentRequest.pagination.page >= 0 && getFeedContentRequest.pagination.pageSize > 0 && getFeedContentRequest.pagination.pageSize <= 200
	);
}

/**
 * 验证获取用户关注列表的参数
 * @param targetUid 目标用户 UID
 * @param pagination 分页参数
 * @returns 验证结果，合法返回 { success: true }，不合法返回 { success: false, message: string }
 */
export const validateGetFollowingListParams = (targetUid: number | null | undefined, pagination: { page: number | null | undefined; pageSize: number | null | undefined } | null | undefined): { success: boolean; message?: string } => {
	if (!targetUid || !pagination || !pagination.page || !pagination.pageSize) {
		return { success: false, message: '参数不合法' }
	}
	if (pagination.page < 1 || pagination.pageSize < 1 || pagination.pageSize > 200) {
		return { success: false, message: '参数不合法' }
	}
	return { success: true }
}

/**
 * 验证获取用户粉丝列表的参数
 * @param targetUid 目标用户 UID
 * @param pagination 分页参数
 * @returns 验证结果，合法返回 { success: true }，不合法返回 { success: false, message: string }
 */
export const validateGetFollowerListParams = (targetUid: number | null | undefined, pagination: { page: number | null | undefined; pageSize: number | null | undefined } | null | undefined): { success: boolean; message?: string } => {
	if (!targetUid || !pagination || !pagination.page || !pagination.pageSize) {
		return { success: false, message: '参数不合法' }
	}
	if (pagination.page < 1 || pagination.pageSize < 1 || pagination.pageSize > 200) {
		return { success: false, message: '参数不合法' }
	}
	return { success: true }
}

/**
 * 验证获取用户关注数和粉丝数的参数
 * @param targetUid 目标用户 UID
 * @returns 验证结果，合法返回 { success: true }，不合法返回 { success: false, message: string }
 */
export const validateGetFollowStatsParams = (targetUid: number | null | undefined): { success: boolean; message?: string } => {
	if (!targetUid || targetUid <= 0) {
		return { success: false, message: '参数不合法' }
	}
	return { success: true }
}

/**
 * 校验获取用户关注列表的请求载荷
 * @param getFollowingListRequest 获取用户关注列表的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFollowingListRequest = (getFollowingListRequest: GetFollowingListRequestDto): boolean => {
	return (
		getFollowingListRequest.targetUid !== undefined &&
		getFollowingListRequest.targetUid !== null &&
		getFollowingListRequest.targetUid > 0 &&
		getFollowingListRequest.pagination !== undefined &&
		getFollowingListRequest.pagination.page !== undefined &&
		getFollowingListRequest.pagination.page !== null &&
		getFollowingListRequest.pagination.page > 0 &&
		getFollowingListRequest.pagination.pageSize !== undefined &&
		getFollowingListRequest.pagination.pageSize !== null &&
		getFollowingListRequest.pagination.pageSize > 0 &&
		getFollowingListRequest.pagination.pageSize <= 200
	)
}

/**
 * 校验获取用户粉丝列表的请求载荷
 * @param getFollowerListRequest 获取用户粉丝列表的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFollowerListRequest = (getFollowerListRequest: GetFollowerListRequestDto): boolean => {
	return (
		getFollowerListRequest.targetUid !== undefined &&
		getFollowerListRequest.targetUid !== null &&
		getFollowerListRequest.targetUid > 0 &&
		getFollowerListRequest.pagination !== undefined &&
		getFollowerListRequest.pagination.page !== undefined &&
		getFollowerListRequest.pagination.page !== null &&
		getFollowerListRequest.pagination.page > 0 &&
		getFollowerListRequest.pagination.pageSize !== undefined &&
		getFollowerListRequest.pagination.pageSize !== null &&
		getFollowerListRequest.pagination.pageSize > 0 &&
		getFollowerListRequest.pagination.pageSize <= 200
	)
}

/**
 * 校验获取用户关注数和粉丝数的请求载荷
 * @param getFollowStatsRequest 获取用户关注数和粉丝数的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetFollowStatsRequest = (getFollowStatsRequest: GetFollowStatsRequestDto): boolean => {
	return (
		getFollowStatsRequest.targetUid !== undefined &&
		getFollowStatsRequest.targetUid !== null &&
		getFollowStatsRequest.targetUid > 0
	)
}

/**
 * 检查用户是否可以查看目标用户的隐私数据
 * @param targetUuid 目标用户的 UUID
 * @param viewerUuid 查看者的 UUID（可选，如果未登录则为 undefined）
 * @param privacyId 隐私数据项 ID（如 'privary.follow' 或 'privary.fans'）
 * @returns 可以查看返回 true，否则返回 false
 */
const checkPrivacyPermission = async (targetUuid: string, viewerUuid: string | undefined, privacyId: 'privary.follow' | 'privary.fans'): Promise<boolean> => {
	try {
		// 如果是自己查看，总是允许
		if (viewerUuid && viewerUuid === targetUuid) {
			return true
		}

		// 获取目标用户的隐私设置
		const { collectionName, schemaInstance } = UserSettingsSchema
		type UserSettings = InferSchemaType<typeof schemaInstance>
		const where: QueryType<UserSettings> = {
			UUID: targetUuid,
		}
		const select: SelectType<UserSettings> = {
			userPrivaryVisibilitiesSetting: 1,
		}
		const result = await selectDataFromMongoDB<UserSettings>(where, select, schemaInstance, collectionName)

		if (!result.success || !result.result || result.result.length === 0) {
			// 如果没有设置，默认公开
			return true
		}

		const settings = result.result[0]
		const privacySetting = settings.userPrivaryVisibilitiesSetting?.find(s => s.privaryId === privacyId)

		// 如果没有设置，默认公开
		if (!privacySetting) {
			return true
		}

		const visibilityType = privacySetting.visibilitiesType

		// public: 所有人能看
		if (visibilityType === 'public') {
			return true
		}

		// private: 隐藏，只有自己能看
		if (visibilityType === 'private') {
			return false
		}

		// following: 仅关注能看，需要检查查看者是否关注了目标用户
		if (visibilityType === 'following') {
			if (!viewerUuid) {
				return false
			}
			const { collectionName: followingCollectionName, schemaInstance: followingSchemaInstance } = FollowingSchema
			type Following = InferSchemaType<typeof followingSchemaInstance>
			const followingWhere: QueryType<Following> = {
				followerUuid: viewerUuid,
				followingUuid: targetUuid,
			}
			const followingSelect: any = {
				_id: 1,
			}
			const followingResult = await selectDataFromMongoDB<Following>(followingWhere, followingSelect, followingSchemaInstance, followingCollectionName)
			return followingResult.success && followingResult.result && followingResult.result.length > 0
		}

		// 默认不允许
		return false
	} catch (error) {
		logging('ERROR', '检查隐私权限失败：', error)
		return false
	}
}
