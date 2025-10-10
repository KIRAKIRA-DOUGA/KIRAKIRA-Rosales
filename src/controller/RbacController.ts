import { limitPageSize, parseInteger } from '../common/ValidTool.js'
import { isPassRbacCheck, createRbacApiPathService, createRbacRoleService, updateApiPathPermissionsForRoleService, getRbacApiPathService, deleteRbacApiPathService, deleteRbacRoleService, getRbacRoleService, adminGetUserRolesByUidService, adminUpdateUserRoleService } from '../service/RbacService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { AdminGetUserRolesByUidRequestDto, AdminUpdateUserRoleRequestDto, CreateRbacApiPathRequestDto, CreateRbacRoleRequestDto, DeleteRbacApiPathRequestDto, DeleteRbacRoleRequestDto, GetRbacApiPathRequestDto, GetRbacRoleRequestDto, UpdateApiPathPermissionsForRoleRequestDto } from './RbacControllerDto.js'

/**
 * 创建 RBAC API 路径
 * @param ctx context
 * @param next context
 */
export const createRbacApiPathController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateRbacApiPathRequestDto>
	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const createRbacApiPathRequest: CreateRbacApiPathRequestDto = {
		apiPath: data.apiPath ?? '',
		apiPathType: data.apiPathType,
		apiPathColor: data.apiPathColor,
		apiPathDescription: data.apiPathDescription,
	}
	const createRbacApiPathResponse = await createRbacApiPathService(createRbacApiPathRequest, uuid, token)
	ctx.body = createRbacApiPathResponse
	await next()
}

/**
 * 删除 RBAC API 路径
 * @param ctx context
 * @param next context
 */
export const deleteRbacApiPathController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<DeleteRbacApiPathRequestDto>
	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const deleteRbacApiPathRequest: DeleteRbacApiPathRequestDto = {
		apiPath: data.apiPath ?? '',
	}
	const deleteRbacApiPathResponse = await deleteRbacApiPathService(deleteRbacApiPathRequest, uuid, token)
	ctx.body = deleteRbacApiPathResponse
	await next()
}

/**
 * 获取 RBAC API 路径
 * @param ctx context
 * @param next context
 */
export const getRbacApiPathController = async (ctx: koaCtx, next: koaNext) => {
	const apiPath = ctx.query.apiPath as string
	const apiPathType = ctx.query.apiPathType as string
	const apiPathColor = ctx.query.apiPathColor as string
	const apiPathDescription = ctx.query.apiPathDescription as string
	const page = parseInteger(ctx.query.page as string)
	const finalPageSize = limitPageSize(ctx.query.pageSize as string)

	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const getRbacApiPathRequest: GetRbacApiPathRequestDto = {
		search: {
			apiPath,
			apiPathType,
			apiPathColor,
			apiPathDescription,
		},
		pagination: {
			page,
			pageSize: finalPageSize ?? 50,
		},
	}
	const getRbacApiPathResponse = await getRbacApiPathService(getRbacApiPathRequest, uuid, token)
	ctx.body = getRbacApiPathResponse
	await next()
}

/**
 * 创建 RBAC 角色
 * @param ctx context
 * @param next context
 */
export const createRbacRoleController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<CreateRbacRoleRequestDto>
	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const createRbacRoleRequest: CreateRbacRoleRequestDto = {
		roleName: data.roleName ?? '',
		roleType: data.roleType,
		roleColor: data.roleColor,
		roleDescription: data.roleDescription,
	}
	const createRbacRoleResponse = await createRbacRoleService(createRbacRoleRequest, uuid, token)
	ctx.body = createRbacRoleResponse
	await next()
}

/**
 * 删除 RBAC 角色
 * @param ctx context
 * @param next context
 */
export const deleteRbacRoleController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<DeleteRbacRoleRequestDto>
	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const deleteRbacRoleRequest: DeleteRbacRoleRequestDto = {
		roleName: data.roleName ?? '',
	}
	const deleteRbacRoleResponse = await deleteRbacRoleService(deleteRbacRoleRequest, uuid, token)
	ctx.body = deleteRbacRoleResponse
	await next()
}

/**
 * 获取 RBAC 角色
 * @param ctx context
 * @param next context
 */
export const getRbacRoleController = async (ctx: koaCtx, next: koaNext) => {
	const roleName = ctx.query.roleName as string
	const roleType = ctx.query.roleType as string
	const roleColor = ctx.query.roleColor as string
	const roleDescription = ctx.query.roleDescription as string
	const page = parseInteger(ctx.query.page as string)
	const finalPageSize = limitPageSize(ctx.query.pageSize as string)

	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const getRbacRoleRequest: GetRbacRoleRequestDto = {
		search: {
			roleName,
			roleType,
			roleColor,
			roleDescription,
		},
		pagination: {
			page,
			pageSize: finalPageSize ?? 50,
		},
	}
	const getRbacRoleResponse = await getRbacRoleService(getRbacRoleRequest, uuid, token)
	ctx.body = getRbacRoleResponse
	await next()
}

/**
 * 为角色更新 API 路径权限
 * @param ctx context
 * @param next context
 */
export const updateApiPathPermissionsForRoleController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<UpdateApiPathPermissionsForRoleRequestDto>
	const uuid = ctx.cookies.get('uuid') ?? ''
	const token = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const updateApiPathPermissionsForRoleRequest: UpdateApiPathPermissionsForRoleRequestDto = {
		roleName: data.roleName ?? '',
    apiPathPermissions: data.apiPathPermissions ?? []
	}
	const updateApiPathPermissionsForRoleResponse = await updateApiPathPermissionsForRoleService(updateApiPathPermissionsForRoleRequest, uuid, token)
	ctx.body = updateApiPathPermissionsForRoleResponse
	await next()
}

/**
 * 管理员更新用户角色
 * @param ctx context
 * @param next context
 */
export const adminUpdateUserRoleController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<AdminUpdateUserRoleRequestDto>

	const adminUuid = ctx.cookies.get('uuid') ?? ''
	const adminToken = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid: adminUuid, apiPath: ctx.path }, ctx)) {
		return
	}

	let adminUpdateUserRoleRequest: AdminUpdateUserRoleRequestDto = {
		uuid: undefined as never,
		uid: undefined as never,
		newRoles: []
	};

	if ('uuid' in data && data.uuid) {
		adminUpdateUserRoleRequest = {
			uuid: data.uuid ?? '',
			uid: undefined as never, // 触发类型校验
			newRoles: data.newRoles ?? []
		};
	} else if ('uid' in data && data.uid !== undefined && data.uid !== null) {
		adminUpdateUserRoleRequest = {
			uid: data.uid ?? 0,
			uuid: undefined as never, // 触发类型校验
			newRoles: data.newRoles ?? []
		};
	}

	const adminUpdateUserRoleResponseDto = await adminUpdateUserRoleService(adminUpdateUserRoleRequest, adminUuid, adminToken)
	ctx.body = adminUpdateUserRoleResponseDto
	await next()
}

/**
 * 通过 uid 获取一个用户的角色
 * @param ctx context
 * @param next context
 */
export const adminGetUserRolesByUidController = async (ctx: koaCtx, next: koaNext) => {
	const uid = parseInteger(ctx.query.uid as string)

	const adminUuid = ctx.cookies.get('uuid') ?? ''
	const adminToken = ctx.cookies.get('token') ?? ''

	// RBAC 权限验证
	if (!await isPassRbacCheck({ uuid: adminUuid, apiPath: ctx.path }, ctx)) {
		return
	}

	const adminGetUserRolesByUidRequest: AdminGetUserRolesByUidRequestDto = {
		uid,
	}
	const adminGetUserRolesByUidResponse = await adminGetUserRolesByUidService(adminGetUserRolesByUidRequest, adminUuid, adminToken)
	ctx.body = adminGetUserRolesByUidResponse
	await next()
}
