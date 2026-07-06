import { limitPageSize, parseInteger } from "../common/ValidTool.js";
import { addNewUid2FeedGroupService, administratorApproveFeedGroupInfoChangeService, administratorDeleteFeedGroupService, confirmFeedGroupCoverUploadService, createFeedGroupService, createOrEditFeedGroupInfoService, deleteFeedGroupService, followingUploaderService, getFeedContentService, getFeedGroupCoverUploadSignedUrlService, getFeedGroupListService, getFollowerListService, getFollowingListService, getFollowStatsService, removeUidFromFeedGroupService, unfollowingUploaderService } from "../service/FeedService.js";
import { isPassRbacCheck } from "../service/RbacService.js";
import { koaCtx, koaNext } from "../type/koaTypes.js";
import { AddNewUid2FeedGroupRequestDto, AdministratorApproveFeedGroupInfoChangeRequestDto, AdministratorDeleteFeedGroupRequestDto, ConfirmFeedGroupCoverUploadRequestDto, CreateFeedGroupRequestDto, CreateOrEditFeedGroupInfoRequestDto, DeleteFeedGroupRequestDto, FollowingUploaderRequestDto, GetFeedContentRequestDto, GetFollowListRequestDto, GetFollowStatsRequestDto, RemoveUidFromFeedGroupRequestDto, UnfollowingUploaderRequestDto } from "./FeedControllerDto.js";

/**
 * 用户关注一个创作者
 * @param ctx context
 * @param next context
 * @return 用户关注一个创作者的请求响应
 */
export const followingUploaderController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<FollowingUploaderRequestDto>
	const { followingUid } = data

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	// RBAC 权限验证，对于关注目标用户
	if (!await isPassRbacCheck({ uid: followingUid, apiPath: ctx.path }, ctx)) {
		return
	}

	const feedingUploaderRequest: FollowingUploaderRequestDto = {
		followingUid: data.followingUid ?? -1
	}

	const feedingUploaderResult = await followingUploaderService(feedingUploaderRequest, uuid, token)
	ctx.body = feedingUploaderResult
	await next()
}

/**
 * 用户取消关注一个创作者
 * @param ctx context
 * @param next context
 * @return 用户取消关注一个创作者的请求响应
 */
export const unfollowingUploaderController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<UnfollowingUploaderRequestDto>

	const unfeedingUploaderRequest: UnfollowingUploaderRequestDto = {
		unfollowingUid: data.unfollowingUid ?? -1
	}

	const feedingUploaderResult = await unfollowingUploaderService(unfeedingUploaderRequest, uuid, token)
	ctx.body = feedingUploaderResult
	await next()
}

/**
 * 创建动态分组
 * @param ctx context
 * @param next context
 * @return 创建动态分组的请求响应
 */
export const createFeedGroupController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<CreateFeedGroupRequestDto>

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const createFeedGroupRequest: CreateFeedGroupRequestDto = {
		feedGroupName: data.feedGroupName ?? "",
		withUidList: data.withUidList ?? [],
	}

	const feedingUploaderResult = await createFeedGroupService(createFeedGroupRequest, uuid, token)
	ctx.body = feedingUploaderResult
	await next()
}

/**
 * 向一个动态分组中添加新的 UID
 * @param ctx context
 * @param next context
 * @return 向一个动态分组中添加新的 UID 的请求响应
 */
export const addNewUid2FeedGroupController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<AddNewUid2FeedGroupRequestDto>

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const addNewUser2FeedGroupRequest: AddNewUid2FeedGroupRequestDto = {
		feedGroupUuid: data.feedGroupUuid ?? "",
		uidList: data.uidList ?? [],
	}

	const feedingUploaderResult = await addNewUid2FeedGroupService(addNewUser2FeedGroupRequest, uuid, token)
	ctx.body = feedingUploaderResult
	await next()
}

/**
 * 从一个动态分组中移除 UID
 * @param ctx context
 * @param next context
 * @return 从一个动态分组中移除 UID 的请求响应
 */
export const removeUidFromFeedGroupController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<RemoveUidFromFeedGroupRequestDto>

	const removeUidFromFeedGroupRequest: RemoveUidFromFeedGroupRequestDto = {
		feedGroupUuid: data.feedGroupUuid ?? "",
		uidList: data.uidList ?? [],
	}

	const feedingUploaderResult = await removeUidFromFeedGroupService(removeUidFromFeedGroupRequest, uuid, token)
	ctx.body = feedingUploaderResult
	await next()
}

/**
 * 删除动态分组
 * @param ctx context
 * @param next context
 * @return 删除动态分组的请求响应
 */
export const deleteFeedGroupController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<DeleteFeedGroupRequestDto>

	const deleteFeedGroupRequest: DeleteFeedGroupRequestDto = {
		feedGroupUuid: data.feedGroupUuid ?? "",
	}

	const feedingUploaderResult = await deleteFeedGroupService(deleteFeedGroupRequest, uuid, token)
	ctx.body = feedingUploaderResult
	await next()
}

/**
 * 获取用于用户上传头像的预签名 URL, 上传限时 60 秒
 * @param ctx context
 * @param next context
 * @return 获取用于用户上传头像的预签名 URL 的请求响应
 */
export const getFeedGroupCoverUploadSignedUrlController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const contentType = typeof ctx.query.contentType === 'string' ? ctx.query.contentType : ''
	ctx.body = await getFeedGroupCoverUploadSignedUrlService(uuid, token, contentType)
	await next()
}

/**
 * 确认动态分组封面图已上传并写入数据库
 * @param ctx context
 * @param next context
 * @return 确认动态分组封面图上传的请求响应
 */
export const confirmFeedGroupCoverUploadController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const data = ctx.request.body as Partial<ConfirmFeedGroupCoverUploadRequestDto>
	const confirmFeedGroupCoverUploadRequest: ConfirmFeedGroupCoverUploadRequestDto = {
		feedGroupUuid: data.feedGroupUuid ?? "",
		fileName: data.fileName ?? "",
	}

	ctx.body = await confirmFeedGroupCoverUploadService(confirmFeedGroupCoverUploadRequest, uuid, token)
	await next()
}

/**
 * 创建或更新动态分组信息
 * 更新动态分组的名称或者头像 URL 都是这个接口
 * @param ctx context
 * @param next context
 * @return 创建或更新动态分组信息的请求响应
 */
export const createOrEditFeedGroupInfoController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<CreateOrEditFeedGroupInfoRequestDto>

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const createOrEditFeedGroupInfoRequest: CreateOrEditFeedGroupInfoRequestDto = {
		feedGroupUuid: data.feedGroupUuid ?? "",
		feedGroupName: data.feedGroupName ?? "",
	}

	ctx.body = await createOrEditFeedGroupInfoService(createOrEditFeedGroupInfoRequest, uuid, token)
	await next()
}

/**
 * // WARN: 仅限管理员
 * 管理员通过动态分组信息更新审核
 * @param ctx context
 * @param next context
 * @return 管理员通过动态分组信息更新审核的请求响应
 */
export const administratorApproveFeedGroupInfoChangeController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<AdministratorApproveFeedGroupInfoChangeRequestDto>

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const administratorApproveFeedGroupInfoChangeRequest: AdministratorApproveFeedGroupInfoChangeRequestDto = {
		feedGroupUuid: data.feedGroupUuid ?? "",
	}

	ctx.body = await administratorApproveFeedGroupInfoChangeService(administratorApproveFeedGroupInfoChangeRequest, uuid, token)
	await next()
}

/**
 * // WARN: 仅限管理员
 * 管理员删除动态分组
 * @param ctx context
 * @param next context
 * @return 管理员删除动态分组的请求响应
 */
export const administratorDeleteFeedGroupController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')
	const data = ctx.request.body as Partial<AdministratorDeleteFeedGroupRequestDto>

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const administratorDeleteFeedGroupRequest: AdministratorDeleteFeedGroupRequestDto = {
		feedGroupUuid: data.feedGroupUuid ?? "",
	}

	ctx.body = await administratorDeleteFeedGroupService(administratorDeleteFeedGroupRequest, uuid, token)
	await next()
}

/**
 * 获取动态分组
 * @param ctx context
 * @param next context
 * @return 获取动态分组的请求响应
 */
export const getFeedGroupListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	ctx.body = await getFeedGroupListService(uuid, token)
	await next()
}

/**
 * 获取动态内容
 * @param ctx context
 * @param next context
 * @return 获取动态内容的请求响应
 */
export const getFeedContentController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	const page = ctx.query.page as string
	const pageSize = ctx.query.pageSize as string
	const finalPageSize = limitPageSize(pageSize)

	const getFeedContentRequest: GetFeedContentRequestDto = {
		feedGroupUuid: uuid ?? "",
		pagination: {
			page: parseInteger(page || '1') ?? 1,
			pageSize: finalPageSize ?? 50,
		},
	}

	ctx.body = await getFeedContentService(getFeedContentRequest, uuid, token)
	await next()
}

/**
 * 获取用户关注数和粉丝数
 * @param ctx context
 * @param next context
 * @return 获取用户关注数和粉丝数的请求响应
 */
export const getFollowStatsController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	const targetUid = parseInteger(ctx.query.targetUid)

	const getFollowStatsRequest: GetFollowStatsRequestDto = {
		targetUid: targetUid ?? -1,
	}

	ctx.body = await getFollowStatsService(getFollowStatsRequest, uuid, token)
	await next()
}

/**
 * 获取用户关注列表
 * @param ctx context
 * @param next context
 * @return 获取用户关注列表的请求响应
 */
export const getFollowingListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	const targetUid = parseInteger(ctx.query.targetUid)
	const page = ctx.query.page as string
	const pageSize = ctx.query.pageSize as string
	const finalPageSize = limitPageSize(pageSize)

	const getFollowingListRequest: GetFollowListRequestDto = {
		targetUid: targetUid ?? -1,
		pagination: {
			page: parseInteger(page) ?? 1,
			pageSize: finalPageSize ?? 50,
		},
	}

	ctx.body = await getFollowingListService(getFollowingListRequest, uuid, token)
	await next()
}

/**
 * 获取用户粉丝列表
 * @param ctx context
 * @param next context
 * @return 获取用户粉丝列表的请求响应
 */
export const getFollowerListController = async (ctx: koaCtx, next: koaNext) => {
	const uuid = ctx.cookies.get('uuid')
	const token = ctx.cookies.get('token')

	const targetUid = parseInteger(ctx.query.targetUid)
	const page = ctx.query.page as string
	const pageSize = ctx.query.pageSize as string
	const finalPageSize = limitPageSize(pageSize)

	const getFollowerListRequest: GetFollowListRequestDto = {
		targetUid: targetUid ?? -1,
		pagination: {
			page: parseInteger(page) ?? 1,
			pageSize: finalPageSize ?? 50,
		},
	}

	ctx.body = await getFollowerListService(getFollowerListRequest, uuid, token)
	await next()
}
