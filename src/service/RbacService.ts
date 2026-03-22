import { InferSchemaType, PipelineStage, Query } from "mongoose";
import { AdminGetUserRolesByUidRequestDto, AdminGetUserRolesByUidResponseDto, AdminUpdateUserRoleRequestDto, AdminUpdateUserRoleResponseDto, CheckUserRbacParams, CheckUserRbacResult, CreateRbacApiPathRequestDto, CreateRbacApiPathResponseDto, CreateRbacRoleRequestDto, CreateRbacRoleResponseDto, DeleteRbacApiPathRequestDto, DeleteRbacApiPathResponseDto, DeleteRbacRoleRequestDto, DeleteRbacRoleResponseDto, GetRbacApiPathRequestDto, GetRbacApiPathResponseDto, GetRbacRoleRequestDto, GetRbacRoleResponseDto, UpdateApiPathPermissionsForRoleRequestDto, UpdateApiPathPermissionsForRoleResponseDto } from "../controller/RbacControllerDto.js";
import { checkUserTokenByUuidService, getUserUuid } from "./UserService.js";
import { deleteOneDataFromMongoDB, findOneAndUpdateData4MongoDB, insertData2MongoDB, selectDataByAggregateFromMongoDB, selectDataFromMongoDB } from "../dbPool/DbClusterPool.js";
import { UserAuthSchema, UserInfoSchema } from "../dbPool/schema/UserSchema.js";
import { RbacApiSchema, RbacRoleSchema } from "../dbPool/schema/RbacSchema.js";
import { v4 as uuidV4 } from 'uuid'
import { QueryType, SelectType, UpdateType } from "../dbPool/DbClusterPoolTypes.js";
import { abortAndEndSession, commitAndEndSession, createAndStartSession } from "../common/MongoDBSessionTool.js";
import { koaCtx } from "../type/koaTypes.js";
import { clearUndefinedItemInObject, isEmptyObject } from "../common/ObjectTool.js";
import { logging } from "./loggingService.js";

/**
 * 通过 RBAC 检查用户的权限
 * @param params 通过 RBAC 检查用户的权限的参数
 * @returns 通过 RBAC 检查用户的权限的结果
 */
export const checkUserByRbac = async (params: CheckUserRbacParams): Promise<CheckUserRbacResult> => {
	try {
		const apiPath = params.apiPath
		let uuid: string | undefined = undefined
		let uid: number | undefined = undefined
		if ('uuid' in params) uuid = params.uuid
		if ('uid' in params) uid = params.uid

		if (!uuid && uid === undefined) {
			logging('ERROR', '用户执行 RBAC 鉴权时失败，未提供 UUID 或 UID')
			return { status: 500, message: `用户执行 RBAC 鉴权时失败，未提供 UUID 或 UID` }
		}

		const match = { UUID: uuid, uid }
		const clearedMatch = clearUndefinedItemInObject(match)

		const checkUserRbacPipeline: PipelineStage[] = [
			// 匹配用户
			{
				$match: clearedMatch,
			},
			// 关联 roles 集合
			{
				$lookup: {
					from: "rbac-roles",
					localField: "roles",
					foreignField: "roleName",
					as: "rolesData"
				}
			},
			// 展开 rolesData 数组（多个角色）
			{ $unwind: "$rolesData" },
			// 展开 apiPathNamePermissions 数组（多个权限）
			{ $unwind: "$rolesData.apiPathPermissions" },
			// 过滤出匹配的 API 路径
			{
				$match: {
					"rolesData.apiPathPermissions": apiPath
				}
			},
			// 只返回有权限的数据
			{ $project: { UUID: 1 } }
		]

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>
		const checkUserRbacResult = await selectDataByAggregateFromMongoDB<UserAuth>(userAuthSchemaInstance, userAuthCollectionName, checkUserRbacPipeline)

		if (checkUserRbacResult && checkUserRbacResult.success && checkUserRbacResult.result && Array.isArray(checkUserRbacResult.result) && checkUserRbacResult.result.length > 0) {
			return { status: 200, message: `用户 ${uuid ? `UUID: ${uuid}` : `UID: ${uid}`} 有权限访问 ${apiPath}` }
		} else {
			return { status: 403, message: `用户 ${uuid ? `UUID: ${uuid}` : `UID: ${uid}`} 在访问 ${apiPath} 的权限不足，或者用户不存在` }
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
		const rbacCheckResult = await checkUserByRbac(params)
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
			editDateTime: now
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
				creatorUuid: insertResultData.creatorUuid,
				lastEditorUuid: insertResultData.lastEditorUuid,
				createDateTime: insertResultData.createDateTime,
				editDateTime: insertResultData.editDateTime,
				isAssignedOnce: false
			}
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

		const { collectionName: rbacRoleCollectionName, schemaInstance: rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof rbacRoleSchemaInstance>

		const chackApiPathUnassignedWhere: QueryType<RbacRole> = {
			apiPathPermissions: { $in: [apiPath] }
		}
		const chackApiPathUnassignedSelect: SelectType<RbacRole> = {
			roleName: 1,
		}

		const session = await createAndStartSession()

		const chackApiPathUnassignedResult = await selectDataFromMongoDB<RbacRole>(chackApiPathUnassignedWhere, chackApiPathUnassignedSelect, rbacRoleSchemaInstance, rbacRoleCollectionName, { session })

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
						[key]: { $regex: value, $options: "i" } // 生成模糊查询
					}))
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
						[key]: { $regex: value, $options: "i" } // 生成模糊查询
					}))
				},
			}] : []),
			{
				$lookup: {
					from: "rbac-roles",
					localField: "apiPath",
					foreignField: "apiPathPermissions",
					as: "matchedDocs"
				}
			},
			{
				$addFields: {
					isAssignedOnce: { $gt: [{ $size: "$matchedDocs" }, 0] } // 如果 matchedDocs 有数据，则为 true
				}
			},
			{
				$project: {
					matchedDocs: 0 // 删除 matchedDocs 字段，保持 A 集合的原始结构
				}
			},
			{ $skip: skip }, // 跳过指定数量的文档
			{ $limit: pageSize }, // 限制返回的文档数量
		]

		const { collectionName: rbacApiCollectionName, schemaInstance: rbacApiSchemaInstance } = RbacApiSchema
		type RbacApi = InferSchemaType<typeof rbacApiSchemaInstance>

		const rbacApiPathCountPromise = selectDataByAggregateFromMongoDB(rbacApiSchemaInstance, rbacApiCollectionName, countRbacApiPathPipeline)
		const rbacApiPathDataPromise = selectDataByAggregateFromMongoDB<RbacApi & { isAssignedOnce: boolean }>(rbacApiSchemaInstance, rbacApiCollectionName, getRbacApiPathPipeline)

		const [ rbacApiPathCountResult, rbacApiPathDataResult ] = await Promise.all([rbacApiPathCountPromise, rbacApiPathDataPromise])
		const count = rbacApiPathCountResult.result?.[0]?.totalCount
		const result = rbacApiPathDataResult.result

		if (!rbacApiPathCountResult.success || !rbacApiPathDataResult.success
			|| typeof count !== 'number' || count < 0
			|| ( Array.isArray(result) && !result )
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

		const { collectionName: rbacRoleCollectionName, schemaInstance: rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof rbacRoleSchemaInstance>

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
			editDateTime: now
		}

		const insertResult = await insertData2MongoDB<RbacRole>(rbacRoleData, rbacRoleSchemaInstance, rbacRoleCollectionName)
		const insertResultData = insertResult?.result?.[0]

		if (!insertResult.success || !insertResultData) {
			logging('ERROR', '创建 RBAC 角色失败，数据插入失败')
			return { success: false, message: '创建 RBAC 角色失败，数据插入失败' }
		}

		return { success: true, message: '创建 RBAC 角色成功', result: insertResultData }
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

		const { collectionName: rbacRoleCollectionName, schemaInstance: rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof rbacRoleSchemaInstance>

		const deleteRbacRoleWhere: QueryType<RbacRole> = {
			roleName,
		}

		const deleteResult = await deleteOneDataFromMongoDB(deleteRbacRoleWhere, rbacRoleSchemaInstance, rbacRoleCollectionName)

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
						[key]: { $regex: value, $options: "i" } // 生成模糊查询
					}))
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
						[key]: { $regex: value, $options: "i" } // 生成模糊查询
					}))
				},
			}] : []),
			{
				$lookup: {
					from: "rbac-api-lists",
					localField: "apiPathPermissions",
					foreignField: "apiPath",
					as: "apiPathList"
				}
			},
			{
				$addFields: {
					apiPathList: "$apiPathList"
				}
			},
			{ $skip: skip }, // 跳过指定数量的文档
			{ $limit: pageSize }, // 限制返回的文档数量
		]

		const { collectionName: rbacRoleCollectionName, schemaInstance: rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof rbacRoleSchemaInstance>

		const rbacRoleCountPromise = selectDataByAggregateFromMongoDB(rbacRoleSchemaInstance, rbacRoleCollectionName, countRbacRolePipeline)
		const rbacRoleDataPromise = selectDataByAggregateFromMongoDB<RbacRole & { apiPathList: GetRbacRoleResponseDto['result'][number]['apiPathList'] }>(rbacRoleSchemaInstance, rbacRoleCollectionName, getRbacRolePipeline)

		const [ rbacRoleCountResult, rbacRoleDataResult ] = await Promise.all([rbacRoleCountPromise, rbacRoleDataPromise])
		const count = rbacRoleCountResult.result?.[0]?.totalCount
		const result = rbacRoleDataResult.result

		if (!rbacRoleCountResult.success || !rbacRoleDataResult.success
			|| typeof count !== 'number' || count < 0
			|| ( Array.isArray(result) && !result )
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

		const session = await createAndStartSession()

		const checkApiPathPermissionsCountResult = await selectDataFromMongoDB<RbacApiList>(checkApiPathPermissionsCountWhere, checkApiPathPermissionsCountSelect, rbacApiSchemaInstance, rbacApiCollectionName, { session })

		if (!checkApiPathPermissionsCountResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '为角色更新 API 路径权限失败，检查 API 路径失败')
			return { success: false, message: '为角色更新 API 路径权限失败，检查 API 路径失败' }
		}

		if (checkApiPathPermissionsCountResult.result.length !== uniqueApiPathPermissions.length) {
			await abortAndEndSession(session)
			logging('ERROR', '为角色更新 API 路径权限失败，检查 API 路径未通过，可能是因为将一个不存在的路径添加到角色中')
			return { success: false, message: '为角色更新 API 路径权限失败，检查 API 路径未通过，可能是因为将一个不存在的路径添加到角色中' }
		}

		const { collectionName: rbacRoleCollectionName, schemaInstance: rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof rbacRoleSchemaInstance>

		const updateApiPathPermissions4RoleWhere: QueryType<RbacRole> = {
			roleName,
		}

		const now = new Date().getTime()
		const updateApiPathPermissions4RoleData: UpdateType<RbacRole> = {
			lastEditorUuid: uuid,
			apiPathPermissions: uniqueApiPathPermissions as RbacRole['apiPathPermissions'], // TODO: Mongoose issue: #12420
			editDateTime: now,
		}

		const updateApiPathPermissions4Role = await findOneAndUpdateData4MongoDB<RbacRole>(updateApiPathPermissions4RoleWhere, updateApiPathPermissions4RoleData, rbacRoleSchemaInstance, rbacRoleCollectionName)

		if (!updateApiPathPermissions4Role.success) {
			await abortAndEndSession(session)
			logging('ERROR', '为角色更新 API 路径权限失败，更新失败')
			return { success: false, message: '为角色更新 API 路径权限失败，更新失败' }
		}

		return { success: true, message: '为角色更新 API 路径权限成功', result: updateApiPathPermissions4Role.result }
	} catch (error) {
		logging('ERROR', '为角色更新 API 路径权限时出错，未知错误：', error)
		return { success: false, message: '为角色更新 API 路径权限时出错，未知错误' }
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
		let { uuid } = adminUpdateUserRoleRequest
		const uniqueNewRoels = [...new Set(newRoles)]

		if (uid && !uuid) {
			uuid = await getUserUuid(uid) || ''
		}

		if (!uuid) {
			logging('ERROR', '管理员更新用户角色失败，未找到用户 UUID')
			return { success: false, message: '管理员更新用户角色失败，未找到用户 UUID' }
		}

		const { collectionName: rbacRoleCollectionName, schemaInstance: rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof rbacRoleSchemaInstance>

		const checkNewRoelsCountWhere: QueryType<RbacRole> = {
			roleName: { $in: uniqueNewRoels },
		}

		const checkNewRoelsCountSelect: SelectType<RbacRole> = {
			roleName: 1,
		}

		const session = await createAndStartSession()

		const checkNewRoelsCountResult = await selectDataFromMongoDB<RbacRole>(checkNewRoelsCountWhere, checkNewRoelsCountSelect, rbacRoleSchemaInstance, rbacRoleCollectionName, { session })

		if (!checkNewRoelsCountResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '管理员更新用户角色失败，检查 API 路径失败')
			return { success: false, message: '管理员更新用户角色失败，检查 API 路径失败' }
		}

		if (checkNewRoelsCountResult.result.length !== uniqueNewRoels.length) {
			await abortAndEndSession(session)
			logging('ERROR', '管理员更新用户角色失败，检查角色未通过，可能是因为将一个不存在的角色绑定给用户')
			return { success: false, message: '管理员更新用户角色失败，检查角色未通过，可能是因为将一个不存在的角色绑定给用户' }
		}

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const updateApiPathPermissions4RoleWhere: QueryType<UserAuth> = {
			UUID: uuid,
		}

		const now = new Date().getTime()
		const updateApiPathPermissions4RoleData: UpdateType<UserAuth> = {
			roles: uniqueNewRoels as UserAuth['roles'], // TODO: Mongoose issue: #12420
			editDateTime: now,
		}

		const updateRoles4UserResult = await findOneAndUpdateData4MongoDB<UserAuth>(updateApiPathPermissions4RoleWhere, updateApiPathPermissions4RoleData, userAuthSchemaInstance, userAuthCollectionName)

		if (!updateRoles4UserResult.success) {
			await abortAndEndSession(session)
			logging('ERROR', '管理员更新用户角色失败，更新失败')
			return { success: false, message: '管理员更新用户角色失败，更新失败' }
		}

		return { success: true, message: '管理员更新用户角色成功' }
	} catch (error) {
		logging('ERROR', '管理员更新用户角色时出错，未知错误：', error)
		return { success: false, message: '管理员更新用户角色时出错，未知错误' }
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
				}
			},
			{
				$lookup: {
					from: "rbac-roles",
					localField: "roles",
					foreignField: "roleName",
					as: "userRole"
				}
			},
			{
				$lookup: {
					from: "user-infos",
					localField: "UUID",
					foreignField: "UUID",
					as: "userInfo"
				}
			},
			{
				$unwind: '$userInfo',
			},
			{
				$project: {
					uid: 1,
					uuid: '$UUID',
					username: '$userInfo.username',
					userNickname: '$userInfo.userNickname',
					avatar: '$userInfo.avatar',
					roles: '$userRole',
				}
			},
		]

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaInstance>

		const { schemaInstance: userInfoSchemaInstance } = UserInfoSchema
		type UserInfo = InferSchemaType<typeof userInfoSchemaInstance>

		const { schemaInstance: rbacRoleSchemaInstance } = RbacRoleSchema
		type RbacRole = InferSchemaType<typeof rbacRoleSchemaInstance>


		const adminGerUserRolesResult = await selectDataByAggregateFromMongoDB<{
			uid: UserAuth['uid'];
			uuid: UserAuth['UUID'];
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
	return ( !!deleteRbacApiPathRequest.apiPath )
}


/**
 * 校验获取 RBAC API 路径的请求载荷
 * @param getRbacApiPathRequest 获取 RBAC API 路径的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetRbacApiPathRequest = (getRbacApiPathRequest: GetRbacApiPathRequestDto): boolean => {
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
	return ( !!deleteRbacRoleRequest.roleName )
}

/**
 * 检查获取 RBAC 角色的请求载荷
 * @param getRbacRoleRequest 获取 RBAC 角色的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkGetRbacRoleRequest = (getRbacRoleRequest: GetRbacRoleRequestDto): boolean => {
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
		(!!adminUpdateUserRoleRequest.uuid || (adminUpdateUserRoleRequest.uid !== undefined && adminUpdateUserRoleRequest !== null)) // uuid 和 uid 至少有一个不为空
		&& !!adminUpdateUserRoleRequest.newRoles && Array.isArray(adminUpdateUserRoleRequest.newRoles)
		&& adminUpdateUserRoleRequest.newRoles.every(role => !!role)
	)
}

/**
 * 通过 UID 获取一个用户的角色
 * @param adminGetUserRolesByUidRequest 通过 UID 获取一个用户的角色的请求载荷
 * @returns 合法返回 true, 不合法返回 false
 */
const checkAdminGetUserRolesByUidRequest = (adminGetUserRolesByUidRequest: AdminGetUserRolesByUidRequestDto): boolean => {
	return ( adminGetUserRolesByUidRequest.uid !== undefined && adminGetUserRolesByUidRequest.uid !== null )
}
