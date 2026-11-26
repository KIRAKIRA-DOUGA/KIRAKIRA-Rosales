import { InferSchemaType, PipelineStage } from 'mongoose'
import { AdminGetUserRolesByUidRequestDto, AdminGetUserRolesByUidResponseDto, AdminUpdateUserRoleRequestDto, AdminUpdateUserRoleResponseDto, CheckUserRbacParams, CheckUserRbacResult, CreateRbacApiPathRequestDto, CreateRbacApiPathResponseDto, CreateRbacRoleRequestDto, CreateRbacRoleResponseDto, DeleteRbacApiPathRequestDto, DeleteRbacApiPathResponseDto, DeleteRbacRoleRequestDto, DeleteRbacRoleResponseDto, GetRbacApiPathRequestDto, GetRbacApiPathResponseDto, GetRbacRoleRequestDto, GetRbacRoleResponseDto, UpdateApiPathPermissionsForRoleRequestDto, UpdateApiPathPermissionsForRoleResponseDto } from '../controller/RbacControllerDto.js'
import { checkUserTokenByUuidService } from './UserService.js'
import { deleteOneDataFromMongoDB, findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataByAggregateFromMongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { UserAuthSchema, UserInfoSchema } from '../dbPool/schema/UserSchema.js'
import { RbacApiSchema, RbacRoleSchema } from '../dbPool/schema/RbacSchema.js'
import { v4 as uuidV4 } from 'uuid'
import { QueryType, SelectType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { abortAndEndSession, commitAndEndSession, createAndStartSession } from '../common/MongoDBSessionTool.js'
import { koaCtx } from '../type/koaTypes.js'
import { clearUndefinedItemInObject, isEmptyObject } from '../common/ObjectTool.js'
import { logging } from './loggingService.js'

function publicRole(role: InferSchemaType<typeof RbacRoleSchema.schemaInstance>): NonNullable<CreateRbacRoleResponseDto['result']> {
	return {
		roleUuid: role.roleUuid,
		roleName: role.roleName,
		roleType: role.roleType,
		roleColor: role.roleColor,
		roleDescription: role.roleDescription,
		apiPathPermissions: role.apiPathPermissions,
		createDateTime: role.createDateTime,
		editDateTime: role.editDateTime,
	}
}

async function accountHasPermission(account: { UUID: string; token: string } | { uid: number }, apiPath: string): Promise<boolean> {
	// 账号和角色都读主节点，以便登出、撤销角色和修改权限立即生效。
	const accountResult = await selectDataFromMongoDB(account, { roles: 1 }, UserAuthSchema.schemaInstance, UserAuthSchema.collectionName, { readPreference: 'primary' })
	const roles = accountResult.result?.[0]?.roles
	if (!accountResult.success || !roles?.length) {
		return false
	}

	const permissions = await selectDataFromMongoDB(
		{ roleName: { $in: roles }, apiPathPermissions: { $in: [apiPath] } }, { roleName: 1 },
		RbacRoleSchema.schemaInstance, RbacRoleSchema.collectionName, { readPreference: 'primary' },
	)
	return permissions.success && permissions.result?.length > 0
}

/**
 * 通过 RBAC 检查用户的权限
 * @param params 通过 RBAC 检查用户的权限的参数
 * @param token 当前会话的登录凭据
 * @returns 通过 RBAC 检查用户的权限的结果
 */
export const checkUserByRbac = async (params: CheckUserRbacParams, token: string): Promise<CheckUserRbacResult> => {
	try {
		const { uuid, apiPath } = params
		if (!uuid || !token) {
			return { status: 403, message: '请先登录' }
		}

		const { targetUid } = params
		if (targetUid !== undefined && (!Number.isSafeInteger(targetUid) || targetUid < 0)) {
			return { status: 403, message: '目标用户无效' }
		}
		const allowed = await accountHasPermission({ UUID: uuid, token }, apiPath)
		if (allowed && (targetUid === undefined || await accountHasPermission({ uid: targetUid }, apiPath))) {
			return { status: 200, message: '有权限访问该接口' }
		} else {
			return { status: 403, message: '访问该接口的权限不足' }
		}
	} catch (error) {
		logging('ERROR', '用户执行 RBAC 鉴权时出现错误，未知错误：', error)
		return { status: 500, message: '用户执行 RBAC 鉴权时出现错误，未知错误' }
	}
}

/**
 * 在 Controller 层通过 RBAC 检查用户的权限
 * 该函数是 checkUserByRbac 的二次封装，包含校验失败时 ctx 中状态码和错误信息的补全功能，并返回简单的 boolean 类型结果，该结果用于在 Controller 中判断后续代码是否需要继续执行
 * @param params 通过 RBAC 检查用户的权限的参数
 * @param ctx koa context
 * @returns boolean 类型的权限检查结果，通过返回 true，不通过返回 false
 */
export const isPassRbacCheck = async (params: CheckUserRbacParams, ctx: koaCtx): Promise<boolean> => {
	try {
		const rbacCheckResult = await checkUserByRbac(params, ctx.cookies.get('token'))
		const { status: rbacStatus, message: rbacMessage } = rbacCheckResult
		if (rbacStatus !== 200) {
			ctx.status = rbacStatus
			ctx.body = rbacMessage
			logging('WARN', `RBAC - ${rbacStatus} - ${rbacMessage}`)
			return false
		}

		return true
	} catch (error) {
		logging('ERROR', '在 Controller 层执行 RBAC 鉴权时出现错误，未知错误：', error)
		ctx.status = 500
		ctx.body = '在 Controller 层执行 RBAC 鉴权时出现错误，未知错误'
		return false
	}
}

/**
 * 创建 RBAC API 路径
 * @param createRbacApiPathRequest 创建 RBAC API 路径的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 创建 RBAC API 路径的请求响应
 */
export const createRbacApiPathService = async (createRbacApiPathRequest: CreateRbacApiPathRequestDto, uuid: string, token: string): Promise<CreateRbacApiPathResponseDto> => {
	try {
		if (!checkCreateRbacApiPathRequest(createRbacApiPathRequest)) {
			logging('ERROR', '创建 RBAC API 路径失败，参数不合法')
			return { success: false, message: '创建 RBAC API 路径失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '创建 RBAC API 路径失败，用户 Token 校验未通过')
			return { success: false, message: '创建 RBAC API 路径失败，用户 Token 校验未通过' }
		}

		const { apiPath, apiPathType, apiPathColor, apiPathDescription } = createRbacApiPathRequest
		const apiPathUuid = uuidV4()
		const now = new Date().getTime()

		const { collectionName: rbacApiCollectionName, schemaInstance: rbacApiSchemaInstance } = RbacApiSchema
		type RbacApi = InferSchemaType<typeof rbacApiSchemaInstance>

		const rbacApiData: RbacApi = {
			apiPathUuid,
			apiPath,
			apiPathType,
			apiPathColor,
			apiPathDescription,
			creatorUuid: uuid,
			lastEditorUuid: uuid,
			createDateTime: now,
			editDateTime: now,
		}

		const insertResult = await insertData2MongoDB<RbacApi>(rbacApiData, rbacApiSchemaInstance, rbacApiCollectionName)
		const insertResultData = insertResult?.result?.[0]

		if (!insertResult.success || !insertResultData) {
			logging('ERROR', '创建 RBAC API 路径失败，数据插入失败')
			return { success: false, message: '创建 RBAC API 路径失败，数据插入失败' }
		}

		return {
			success: true,
			message: '创建 RBAC API 路径成功',
			result: {
				apiPathUuid: insertResultData.apiPathUuid,
				apiPath: insertResultData.apiPath,
				apiPathType: insertResultData.apiPathType,
				apiPathColor: insertResultData.apiPathColor,
				apiPathDescription: insertResultData.apiPathDescription,
				createDateTime: insertResultData.createDateTime,
				editDateTime: insertResultData.editDateTime,
				isAssignedOnce: false,
			},
		}
	} catch (error) {
		logging('ERROR', '创建 RBAC API 路径时出错，未知错误：', error)
		return { success: false, message: '创建 RBAC API 路径时出错，未知错误' }
	}
}

/**
 * 删除 RBAC API 路径
 * @param deleteRbacApiPathRequest 删除 RBAC API 路径的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 删除 RBAC API 路径的请求响应
 */
export const deleteRbacApiPathService = async (deleteRbacApiPathRequest: DeleteRbacApiPathRequestDto, uuid: string, token: string): Promise<DeleteRbacApiPathResponseDto> => {
	try {
		if (!checkDeleteRbacApiPathRequest(deleteRbacApiPathRequest)) {
			logging('ERROR', '删除 RBAC API 路径失败，参数不合法')
			return { success: false, isAssigned: false, message: '删除 RBAC API 路径失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除 RBAC API 路径失败，用户 Token 校验未通过')
			return { success: false, isAssigned: false, message: '删除 RBAC API 路径失败，用户 Token 校验未通过' }
		}

		const { apiPath } = deleteRbacApiPathRequest

		const { collectionName: rbacRoleCollectionName, schemaInstance: _rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof _rbacRoleSchemaInstance>

		const chackApiPathUnassignedWhere: QueryType<RbacRole> = {
			apiPathPermissions: { $in: [apiPath] },
		}
		const chackApiPathUnassignedSelect: SelectType<RbacRole> = {
			roleName: 1,
		}

		const session = await createAndStartSession()
		if (!session) {
			return { success: false, message: '删除 RBAC API 路径失败，请稍后再试', isAssigned: false }
		}

		const chackApiPathUnassignedResult = await selectDataFromMongoDB<RbacRole>(chackApiPathUnassignedWhere, chackApiPathUnassignedSelect, _rbacRoleSchemaInstance, rbacRoleCollectionName, { session })

		if (chackApiPathUnassignedResult.result?.length > 0) {
			await abortAndEndSession(session)
			logging('ERROR', '删除 RBAC API 路径失败，该 API 路径已经被绑定到一个角色，请先将其从角色中移出才能删除。')
			return { success: false, isAssigned: true, message: '删除 RBAC API 路径失败，该 API 路径已经被绑定到一个角色，请先将其从角色中移出才能删除。' }
		}

		const { collectionName: rbacApiCollectionName, schemaInstance: rbacApiSchemaInstance } = RbacApiSchema
		type RbacApi = InferSchemaType<typeof rbacApiSchemaInstance>

		const deleteRbacApiWhere: QueryType<RbacApi> = {
			apiPath,
		}

		const deleteRbacApiResult = await deleteOneDataFromMongoDB(deleteRbacApiWhere, rbacApiSchemaInstance, rbacApiCollectionName, { session })

		if (!deleteRbacApiResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '删除 RBAC API 路径失败，数据删除失败')
			return { success: false, isAssigned: false, message: '删除 RBAC API 路径失败，数据删除失败' }
		}

		await commitAndEndSession(session)
		return { success: true, isAssigned: false, message: '删除 RBAC API 路径成功' }
	} catch (error) {
		logging('ERROR', '创建 RBAC API 路径时出错，未知错误：', error)
		return { success: false, isAssigned: false, message: '创建 RBAC API 路径时出错，未知错误' }
	}
}

/**
 * 获取 RBAC API 路径
 * @param getRbacApiPathRequest 获取 RBAC API 路径的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 获取 RBAC API 路径的请求响应
 */
export const getRbacApiPathService = async (getRbacApiPathRequest: GetRbacApiPathRequestDto, uuid: string, token: string): Promise<GetRbacApiPathResponseDto> => {
	try {
		if (!checkGetRbacApiPathRequest(getRbacApiPathRequest)) {
			logging('ERROR', '获取 RBAC API 路径失败，参数不合法')
			return { success: false, message: '获取 RBAC API 路径失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取 RBAC API 路径失败，用户 Token 校验未通过')
			return { success: false, message: '获取 RBAC API 路径失败，用户 Token 校验未通过' }
		}

		const { search, pagination } = getRbacApiPathRequest
		const clearedSearch = clearUndefinedItemInObject(search)

		let skip = 0
		let pageSize = undefined
		if (pagination && pagination.page > 0 && pagination.pageSize > 0) {
			skip = (pagination.page - 1) * pagination.pageSize
			pageSize = pagination.pageSize
		}

		const countRbacApiPathPipeline: PipelineStage[] = [
			...(!isEmptyObject(clearedSearch) ? [{
				$match: {
					$and: Object.entries(clearedSearch).map(([key, value]) => ({
						[key]: { $regex: value, $options: 'i' }, // 生成模糊查询
					})),
				},
			}] : []),
			{
				$count: 'totalCount', // 统计总文档数
			},
		]

		const getRbacApiPathPipeline: PipelineStage[] = [
			...(!isEmptyObject(clearedSearch) ? [{
				$match: {
					$and: Object.entries(clearedSearch).map(([key, value]) => ({
						[key]: { $regex: value, $options: 'i' }, // 生成模糊查询
					})),
				},
			}] : []),
			{
				$lookup: {
					from: 'rbac-roles',
					localField: 'apiPath',
					foreignField: 'apiPathPermissions',
					as: 'matchedDocs',
				},
			},
			{
				$addFields: {
					isAssignedOnce: { $gt: [{ $size: '$matchedDocs' }, 0] }, // 如果 matchedDocs 有数据，则为 true
				},
			},
			{
				$project: {
					apiPathUuid: 1,
					apiPath: 1,
					apiPathType: 1,
					apiPathColor: 1,
					apiPathDescription: 1,
					createDateTime: 1,
					editDateTime: 1,
					isAssignedOnce: 1,
				},
			},
			{ $skip: skip }, // 跳过指定数量的文档
			{ $limit: pageSize }, // 限制返回的文档数量
		]

		const { collectionName: rbacApiCollectionName, schemaInstance: rbacApiSchemaInstance } = RbacApiSchema
		type RbacApi = InferSchemaType<typeof rbacApiSchemaInstance>

		const rbacApiPathCountPromise = selectDataByAggregateFromMongoDB(rbacApiSchemaInstance, rbacApiCollectionName, countRbacApiPathPipeline)
		const rbacApiPathDataPromise = selectDataByAggregateFromMongoDB<RbacApi & { isAssignedOnce: boolean }>(rbacApiSchemaInstance, rbacApiCollectionName, getRbacApiPathPipeline)

		const [rbacApiPathCountResult, rbacApiPathDataResult] = await Promise.all([rbacApiPathCountPromise, rbacApiPathDataPromise])
		const count = rbacApiPathCountResult.result?.[0]?.totalCount
		const result = rbacApiPathDataResult.result

		if (!rbacApiPathCountResult.success || !rbacApiPathDataResult.success
			|| typeof count !== 'number' || count < 0
			|| (Array.isArray(result) && !result)
		) {
			logging('ERROR', '获取 RBAC API 路径失败，获取数据失败')
			return { success: false, message: '获取 RBAC API 路径失败，获取数据失败' }
		}

		if (count === 0) {
			return { success: true, message: '未查询到 RBAC API 路径', count: 0, result: [] }
		} else {
			return { success: true, message: '查询 RBAC API 路径成功', count, result }
		}
	} catch (error) {
		logging('ERROR', '获取 RBAC API 路径时出错，未知错误', error)
		return { success: false, message: '获取 RBAC API 路径时出错，未知错误' }
	}
}

/**
 * 创建 RBAC 角色
 * @param createRbacRoleRequest 创建 RBAC 角色的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 创建 RBAC 角色的请求响应
 */
export const createRbacRoleService = async (createRbacRoleRequest: CreateRbacRoleRequestDto, uuid: string, token: string): Promise<CreateRbacRoleResponseDto> => {
	try {
		if (!checkCreateRbacRoleRequest(createRbacRoleRequest)) {
			logging('ERROR', '创建 RBAC 角色失败，参数不合法')
			return { success: false, message: '创建 RBAC 角色失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '创建 RBAC 角色失败，用户 Token 校验未通过')
			return { success: false, message: '创建 RBAC 角色失败，用户 Token 校验未通过' }
		}

		const { roleName, roleType, roleColor, roleDescription } = createRbacRoleRequest
		const roleUuid = uuidV4()
		const now = new Date().getTime()

		const { collectionName: rbacRoleCollectionName, schemaInstance: _rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof _rbacRoleSchemaInstance>

		const rbacRoleData: RbacRole = {
			roleUuid,
			roleName,
			apiPathPermissions: [],
			roleType,
			roleColor,
			roleDescription,
			creatorUuid: uuid,
			lastEditorUuid: uuid,
			createDateTime: now,
			editDateTime: now,
		}

		const insertResult = await insertData2MongoDB<RbacRole>(rbacRoleData, _rbacRoleSchemaInstance, rbacRoleCollectionName)
		const insertResultData = insertResult?.result?.[0]

		if (!insertResult.success || !insertResultData) {
			logging('ERROR', '创建 RBAC 角色失败，数据插入失败')
			return { success: false, message: '创建 RBAC 角色失败，数据插入失败' }
		}

		return { success: true, message: '创建 RBAC 角色成功', result: publicRole(insertResultData) }
	} catch (error) {
		logging('ERROR', '创建 RBAC 角色时出错，未知错误：', error)
		return { success: false, message: '创建 RBAC 角色时出错，未知错误' }
	}
}

/**
 * 删除 RBAC 角色
 * @param deleteRbacRoleRequest 删除 RBAC 角色的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 删除 RBAC 角色的请求响应
 */
export const deleteRbacRoleService = async (deleteRbacRoleRequest: DeleteRbacRoleRequestDto, uuid: string, token: string): Promise<DeleteRbacRoleResponseDto> => {
	try {
		if (!checkDeleteRbacRoleRequest(deleteRbacRoleRequest)) {
			logging('ERROR', '删除 RBAC 角色失败，参数不合法')
			return { success: false, message: '删除 RBAC 角色失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '删除 RBAC 角色失败，用户 Token 校验未通过')
			return { success: false, message: '删除 RBAC 角色失败，用户 Token 校验未通过' }
		}

		const { roleName } = deleteRbacRoleRequest

		const { collectionName: rbacRoleCollectionName, schemaInstance: _rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof _rbacRoleSchemaInstance>

		const deleteRbacRoleWhere: QueryType<RbacRole> = {
			roleName,
		}

		const deleteResult = await deleteOneDataFromMongoDB(deleteRbacRoleWhere, _rbacRoleSchemaInstance, rbacRoleCollectionName)

		if (!deleteResult.success) {
			logging('ERROR', '删除 RBAC 角色失败，数据插入失败')
			return { success: false, message: '删除 RBAC 角色失败，数据插入失败' }
		}

		return { success: true, message: '删除 RBAC 角色成功' }
	} catch (error) {
		logging('ERROR', '删除 RBAC 角色时出错，未知错误：', error)
		return { success: false, message: '删除 RBAC 角色时出错，未知错误' }
	}
}

/**
 * 获取 RBAC 角色
 * @param getRbacRoleRequest 获取 RBAC 角色的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 获取 RBAC 角色的请求响应
 */
export const getRbacRoleService = async (getRbacRoleRequest: GetRbacRoleRequestDto, uuid: string, token: string): Promise<GetRbacRoleResponseDto> => {
	try {
		if (!checkGetRbacRoleRequest(getRbacRoleRequest)) {
			logging('ERROR', '获取 RBAC 角色失败，参数不合法')
			return { success: false, message: '获取 RBAC 角色失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取 RBAC 角色失败，用户 Token 校验未通过')
			return { success: false, message: '获取 RBAC 角色失败，用户 Token 校验未通过' }
		}

		const { search, pagination } = getRbacRoleRequest
		const clearedSearch = clearUndefinedItemInObject(search)

		let skip = 0
		let pageSize = undefined
		if (pagination && pagination.page > 0 && pagination.pageSize > 0) {
			skip = (pagination.page - 1) * pagination.pageSize
			pageSize = pagination.pageSize
		}

		const countRbacRolePipeline: PipelineStage[] = [
			...(!isEmptyObject(clearedSearch) ? [{
				$match: {
					$and: Object.entries(clearedSearch).map(([key, value]) => ({
						[key]: { $regex: value, $options: 'i' }, // 生成模糊查询
					})),
				},
			}] : []),
			{
				$count: 'totalCount', // 统计总文档数
			},
		]

		const getRbacRolePipeline: PipelineStage[] = [
			...(!isEmptyObject(clearedSearch) ? [{
				$match: {
					$and: Object.entries(clearedSearch).map(([key, value]) => ({
						[key]: { $regex: value, $options: 'i' }, // 生成模糊查询
					})),
				},
			}] : []),
			{
				$lookup: {
					from: 'rbac-api-lists',
					localField: 'apiPathPermissions',
					foreignField: 'apiPath',
					as: 'apiPathList',
					pipeline: [{ $project: { apiPathUuid: 1, apiPath: 1, apiPathType: 1, apiPathColor: 1, apiPathDescription: 1, createDateTime: 1, editDateTime: 1 } }],
				},
			},
			{
				$project: {
					roleUuid: 1,
					roleName: 1,
					roleType: 1,
					roleColor: 1,
					roleDescription: 1,
					apiPathPermissions: 1,
					createDateTime: 1,
					editDateTime: 1,
					apiPathList: 1,
				},
			},
			{ $skip: skip }, // 跳过指定数量的文档
			{ $limit: pageSize }, // 限制返回的文档数量
		]

		const { collectionName: rbacRoleCollectionName, schemaInstance: _rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof _rbacRoleSchemaInstance>

		const rbacRoleCountPromise = selectDataByAggregateFromMongoDB(_rbacRoleSchemaInstance, rbacRoleCollectionName, countRbacRolePipeline)
		const rbacRoleDataPromise = selectDataByAggregateFromMongoDB<RbacRole & { apiPathList: GetRbacRoleResponseDto['result'][number]['apiPathList'] }>(_rbacRoleSchemaInstance, rbacRoleCollectionName, getRbacRolePipeline)

		const [rbacRoleCountResult, rbacRoleDataResult] = await Promise.all([rbacRoleCountPromise, rbacRoleDataPromise])
		const count = rbacRoleCountResult.result?.[0]?.totalCount
		const result = rbacRoleDataResult.result

		if (!rbacRoleCountResult.success || !rbacRoleDataResult.success
			|| typeof count !== 'number' || count < 0
			|| (Array.isArray(result) && !result)
		) {
			logging('ERROR', '获取 RBAC 角色失败，获取数据失败')
			return { success: false, message: '获取 RBAC 角色失败，获取数据失败' }
		}

		if (count === 0) {
			return { success: true, message: '未查询到 RBAC 角色', count: 0, result: [] }
		} else {
			return { success: true, message: '查询 RBAC API 路径成功', count, result }
		}
	} catch (error) {
		logging('ERROR', '获取 RBAC 角色时出错，未知错误', error)
		return { success: false, message: '获取 RBAC 角色时出错，未知错误' }
	}
}

/**
 * 为角色更新 API 路径权限
 * @param updateApiPathPermissionsForRoleRequest 为角色更新 API 路径权限的请求载荷
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 为角色更新 API 路径权限的请求响应
 */
export const updateApiPathPermissionsForRoleService = async (updateApiPathPermissionsForRoleRequest: UpdateApiPathPermissionsForRoleRequestDto, uuid: string, token: string): Promise<UpdateApiPathPermissionsForRoleResponseDto> => {
	let session: Awaited<ReturnType<typeof createAndStartSession>> = false
	try {
		if (!checkUpdateApiPathPermissionsForRoleRequest(updateApiPathPermissionsForRoleRequest)) {
			logging('ERROR', '为角色更新 API 路径权限失败，参数不合法')
			return { success: false, message: '为角色更新 API 路径权限失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '为角色更新 API 路径权限失败，用户 Token 校验未通过')
			return { success: false, message: '为角色更新 API 路径权限失败，用户 Token 校验未通过' }
		}

		const { roleName, apiPathPermissions } = updateApiPathPermissionsForRoleRequest
		const uniqueApiPathPermissions = [...new Set(apiPathPermissions)]

		const { collectionName: rbacApiCollectionName, schemaInstance: rbacApiSchemaInstance } = RbacApiSchema
		type RbacApiList = InferSchemaType<typeof rbacApiSchemaInstance>

		const checkApiPathPermissionsCountWhere: QueryType<RbacApiList> = {
			apiPath: { $in: uniqueApiPathPermissions },
		}

		const checkApiPathPermissionsCountSelect: SelectType<RbacApiList> = {
			apiPath: 1,
		}

		session = await createAndStartSession()
		if (!session) {
			return { success: false, message: '更新角色权限失败，请稍后再试' }
		}

		const checkApiPathPermissionsCountResult = await selectDataFromMongoDB<RbacApiList>(checkApiPathPermissionsCountWhere, checkApiPathPermissionsCountSelect, rbacApiSchemaInstance, rbacApiCollectionName, { session })

		if (!checkApiPathPermissionsCountResult.success) {
			logging('ERROR', '为角色更新 API 路径权限失败，检查 API 路径失败')
			return { success: false, message: '为角色更新 API 路径权限失败，检查 API 路径失败' }
		}

		if (checkApiPathPermissionsCountResult.result.length !== uniqueApiPathPermissions.length) {
			logging('ERROR', '为角色更新 API 路径权限失败，检查 API 路径未通过，可能是因为将一个不存在的路径添加到角色中')
			return { success: false, message: '为角色更新 API 路径权限失败，检查 API 路径未通过，可能是因为将一个不存在的路径添加到角色中' }
		}

		const { collectionName: rbacRoleCollectionName, schemaInstance: _rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof _rbacRoleSchemaInstance>

		const updateApiPathPermissions4RoleWhere: QueryType<RbacRole> = {
			roleName,
		}

		const now = new Date().getTime()
		const updateApiPathPermissions4RoleData: UpdateType<RbacRole> = {
			lastEditorUuid: uuid,
			apiPathPermissions: uniqueApiPathPermissions as RbacRole['apiPathPermissions'], // TODO: Mongoose issue: #12420
			editDateTime: now,
		}

		const updateApiPathPermissions4Role = await findOneAndUpdateData4MongoDB<RbacRole>(updateApiPathPermissions4RoleWhere, updateApiPathPermissions4RoleData, _rbacRoleSchemaInstance, rbacRoleCollectionName, { session }, false)

		if (!updateApiPathPermissions4Role.success) {
			logging('ERROR', '为角色更新 API 路径权限失败，更新失败')
			return { success: false, message: '为角色更新 API 路径权限失败，更新失败' }
		}

		const completedSession = session
		session = false
		await commitAndEndSession(completedSession)
		return { success: true, message: '为角色更新 API 路径权限成功', result: publicRole(updateApiPathPermissions4Role.result) }
	} catch (error) {
		logging('ERROR', '为角色更新 API 路径权限时出错，未知错误：', error)
		return { success: false, message: '为角色更新 API 路径权限时出错，未知错误' }
	} finally {
		if (session) {
			await abortAndEndSession(session)
		}
	}
}

/**
 * 管理员更新用户角色
 * @param adminUpdateUserRoleRequest 管理员更新用户角色的请求载荷
 * @param adminUuid 管理员 UUID
 * @param adminToken 管理员 Token
 * @returns 管理员更新用户角色的请求响应
 */
export const adminUpdateUserRoleService = async (adminUpdateUserRoleRequest: AdminUpdateUserRoleRequestDto, adminUuid: string, adminToken: string): Promise<AdminUpdateUserRoleResponseDto> => {
	let session: Awaited<ReturnType<typeof createAndStartSession>> = false
	try {
		if (!checkAdminUpdateUserRoleRequest(adminUpdateUserRoleRequest)) {
			logging('ERROR', '管理员更新用户角色失败，参数不合法')
			return { success: false, message: '管理员更新用户角色失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(adminUuid, adminToken)).success) {
			logging('ERROR', '管理员更新用户角色失败，用户 Token 校验未通过')
			return { success: false, message: '管理员更新用户角色失败，用户 Token 校验未通过' }
		}

		const { uid, newRoles } = adminUpdateUserRoleRequest
		const uniqueNewRoels = [...new Set(newRoles)]

		const { collectionName: rbacRoleCollectionName, schemaInstance: _rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof _rbacRoleSchemaInstance>

		const checkNewRoelsCountWhere: QueryType<RbacRole> = {
			roleName: { $in: uniqueNewRoels },
		}

		const checkNewRoelsCountSelect: SelectType<RbacRole> = {
			roleName: 1,
		}

		session = await createAndStartSession()
		if (!session) {
			return { success: false, message: '更新用户角色失败，请稍后再试' }
		}

		const checkNewRoelsCountResult = await selectDataFromMongoDB<RbacRole>(checkNewRoelsCountWhere, checkNewRoelsCountSelect, _rbacRoleSchemaInstance, rbacRoleCollectionName, { session })

		if (!checkNewRoelsCountResult.success) {
			logging('ERROR', '管理员更新用户角色失败，检查 API 路径失败')
			return { success: false, message: '管理员更新用户角色失败，检查 API 路径失败' }
		}

		if (checkNewRoelsCountResult.result.length !== uniqueNewRoels.length) {
			logging('ERROR', '管理员更新用户角色失败，检查角色未通过，可能是因为将一个不存在的角色绑定给用户')
			return { success: false, message: '管理员更新用户角色失败，检查角色未通过，可能是因为将一个不存在的角色绑定给用户' }
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const updateApiPathPermissions4RoleWhere: QueryType<UserAuth> = {
			uid,
		}

		const now = new Date().getTime()
		const updateApiPathPermissions4RoleData: UpdateType<UserAuth> = {
			roles: uniqueNewRoels as UserAuth['roles'], // TODO: Mongoose issue: #12420
			editDateTime: now,
		}

		const updateRoles4UserResult = await findOneAndUpdateData4MongoDB<UserAuth>(updateApiPathPermissions4RoleWhere, updateApiPathPermissions4RoleData, userAuthSchemaInstance, userAuthCollectionName, { session }, false)

		if (!updateRoles4UserResult.success) {
			logging('ERROR', '管理员更新用户角色失败，更新失败')
			return { success: false, message: '管理员更新用户角色失败，更新失败' }
		}

		const completedSession = session
		session = false
		await commitAndEndSession(completedSession)
		return { success: true, message: '管理员更新用户角色成功' }
	} catch (error) {
		logging('ERROR', '管理员更新用户角色时出错，未知错误：', error)
		return { success: false, message: '管理员更新用户角色时出错，未知错误' }
	} finally {
		if (session) {
			await abortAndEndSession(session)
		}
	}
}


/**
 * 通过 UID 获取一个用户的角色
 * @param adminGetUserRolesByUidRequest 通过 UID 获取一个用户的角色的请求载荷
 * @param adminUuid 管理员 UUID
 * @param adminToken 管理员 Token
 * @returns 通过 UID 获取一个用户的角色的请求响应
 */
export const adminGetUserRolesByUidService = async (adminGetUserRolesByUidRequest: AdminGetUserRolesByUidRequestDto, adminUuid: string, adminToken: string): Promise<AdminGetUserRolesByUidResponseDto> => {
	try {
		if (!checkAdminGetUserRolesByUidRequest(adminGetUserRolesByUidRequest)) {
			logging('ERROR', '通过 UID 获取一个用户的角色失败，参数不合法')
			return { success: false, message: '通过 UID 获取一个用户的角色失败，参数不合法' }
		}

		if (!(await checkUserTokenByUuidService(adminUuid, adminToken)).success) {
			logging('ERROR', '通过 UID 获取一个用户的角色失败，用户 Token 校验未通过')
			return { success: false, message: '通过 UID 获取一个用户的角色失败，用户 Token 校验未通过' }
		}

		const { uid } = adminGetUserRolesByUidRequest

		const adminGetUserRolesPipeline: PipelineStage[] = [
			{
				$match: {
					uid,
				},
			},
			{
				$lookup: {
					from: 'rbac-roles',
					localField: 'roles',
					foreignField: 'roleName',
					as: 'userRole',
					pipeline: [{ $project: { roleUuid: 1, roleName: 1, roleType: 1, roleColor: 1, roleDescription: 1, apiPathPermissions: 1, createDateTime: 1, editDateTime: 1 } }],
				},
			},
			{
				$lookup: {
					from: 'user-infos',
					localField: 'UUID',
					foreignField: 'UUID',
					as: 'userInfo',
				},
			},
			{
				$unwind: '$userInfo',
			},
			{
				$project: {
					uid: 1,
					username: '$userInfo.username',
					userNickname: '$userInfo.userNickname',
					avatar: '$userInfo.avatar',
					roles: '$userRole',
				},
			},
		]

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const { schemaInstance: _userInfoSchemaInstance } = UserInfoSchema
		type UserInfo = InferSchemaType<typeof _userInfoSchemaInstance>

		const { schemaInstance: _rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof _rbacRoleSchemaInstance>


		const adminGerUserRolesResult = await selectDataByAggregateFromMongoDB<{
			uid: UserAuth['uid'];
			username: UserInfo['username'];
			userNickname: UserInfo['userNickname'];
			avatar: UserInfo['avatar'];
			roles: RbacRole[];
		}>(userAuthSchemaInstance, userAuthCollectionName, adminGetUserRolesPipeline)
		const adminGerUserRolesData = adminGerUserRolesResult.result?.[0]

		if (!adminGerUserRolesResult.success || !adminGerUserRolesData) {
			logging('ERROR', '通过 UID 获取一个用户的角色失败，查询数据失败')
			return { success: false, message: '通过 UID 获取一个用户的角色失败，查询数据失败' }
		}

		return { success: true, message: '通过 UID 获取一个用户的角色成功', result: adminGerUserRolesData }
	} catch (error) {
		logging('ERROR', '通过 UID 获取一个用户的角色时出错，未知错误：', error)
		return { success: false, message: '通过 UID 获取一个用户的角色时出错，未知错误' }
	}
}

/**
 * 校验创建 RBAC API 路径的请求载荷
 * @param createRbacApiPathRequest 创建 RBAC API 路径的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateRbacApiPathRequest = (createRbacApiPathRequest: CreateRbacApiPathRequestDto): boolean => {
	return (
		!!createRbacApiPathRequest.apiPath
		&& createRbacApiPathRequest.apiPathColor ? /^#([0-9A-Fa-f]{8})$/.test(createRbacApiPathRequest.apiPathColor) : true // 如果 apiPathColor 不为空，则测试是否符合八位 HAX 颜色代码格式（例如：#66CCFFFF），如果 apiPathColor 为空，则直接为 true
	)
}

/**
 * 校验删除 RBAC API 路径的请求载荷
 * @param deleteRbacApiPathRequest 删除 RBAC API 路径的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkDeleteRbacApiPathRequest = (deleteRbacApiPathRequest: DeleteRbacApiPathRequestDto): boolean => {
	return (!!deleteRbacApiPathRequest.apiPath)
}


/**
 * 校验获取 RBAC API 路径的请求载荷
 * @param getRbacApiPathRequest 获取 RBAC API 路径的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetRbacApiPathRequest = (_getRbacApiPathRequest: GetRbacApiPathRequestDto): boolean => {
	return true // 没有什么好校验的
}

/**
 * 校验创建 RBAC 角色的请求载荷
 * @param createRbacApiPathRequest 创建 RBAC 角色的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkCreateRbacRoleRequest = (createRbacRoleRequest: CreateRbacRoleRequestDto): boolean => {
	return (
		!!createRbacRoleRequest.roleName
		&& createRbacRoleRequest.roleColor ? /^#([0-9A-Fa-f]{8})$/.test(createRbacRoleRequest.roleColor) : true // 如果 roleColor 不为空，则测试是否符合八位 HAX 颜色代码格式（例如：#66CCFFFF），如果 roleColor 为空，则直接为 true
	)
}

/**
 * 校验删除 RBAC 角色的请求载荷
 * @param createRbacApiPathRequest 删除 RBAC 角色的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkDeleteRbacRoleRequest = (deleteRbacRoleRequest: DeleteRbacRoleRequestDto): boolean => {
	return (!!deleteRbacRoleRequest.roleName)
}

/**
 * 检查获取 RBAC 角色的请求载荷
 * @param getRbacRoleRequest 获取 RBAC 角色的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetRbacRoleRequest = (_getRbacRoleRequest: GetRbacRoleRequestDto): boolean => {
	return true // 没什么好检查的
}

/**
 * 校验为角色更新 API 路径权限的请求载荷
 * @param updateApiPathPermissionsForRoleRequest 为角色更新 API 路径权限的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkUpdateApiPathPermissionsForRoleRequest = (updateApiPathPermissionsForRoleRequest: UpdateApiPathPermissionsForRoleRequestDto): boolean => {
	return (
		!!updateApiPathPermissionsForRoleRequest.roleName
		&& !!updateApiPathPermissionsForRoleRequest.apiPathPermissions && Array.isArray(updateApiPathPermissionsForRoleRequest.apiPathPermissions)
		&& updateApiPathPermissionsForRoleRequest.apiPathPermissions.every(apiPath => !!apiPath)
	)
}

/**
 * 校验管理员更新用户角色的请求载荷
 * @param adminUpdateUserRoleRequest 管理员更新用户角色的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAdminUpdateUserRoleRequest = (adminUpdateUserRoleRequest: AdminUpdateUserRoleRequestDto): boolean => {
	return (
		Number.isSafeInteger(adminUpdateUserRoleRequest.uid) && adminUpdateUserRoleRequest.uid >= 0
		&& !!adminUpdateUserRoleRequest.newRoles && Array.isArray(adminUpdateUserRoleRequest.newRoles)
		&& adminUpdateUserRoleRequest.newRoles.every(role => typeof role === 'string' && !!role)
	)
}

/**
 * 通过 UID 获取一个用户的角色
 * @param adminGetUserRolesByUidRequest 通过 UID 获取一个用户的角色的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAdminGetUserRolesByUidRequest = (adminGetUserRolesByUidRequest: AdminGetUserRolesByUidRequestDto): boolean => {
	return (adminGetUserRolesByUidRequest.uid !== undefined && adminGetUserRolesByUidRequest.uid !== null)
}
