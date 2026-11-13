import { Schema } from 'mongoose'

/**
 * KIRAKIRA RBAC
 *
 * KIRAKIRA RBAC 原子化权限控制的最小单位是 API 路径。
 * * 一个用户可以拥有多个角色
 * * 一个角色可以对应多位用户
 * * 一个角色可以拥有对多个 API 的访问权限
 * * 一个 API 可以对应多个角色
 */

/**
 * API 路径的列表
 * KIRAKIRA RBAC 原子化权限控制的最小单位，即精确控制每个 API 接口的访问权限
 */
class RbacApiSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** API 路径的 UUID - 非空 - 唯一 */
		apiPathUuid: { type: String, required: true, unique: true },
		/** API 路径 - 非空 - 唯一 */
		apiPath: { type: String, required: true, unique: true },
		/** API 路径的类型 */
		apiPathType: { type: String },
		/** API 路径的颜色 */
		apiPathColor: { type: String },
		/** API 路径的描述 */
		apiPathDescription: { type: String },
		/** API 路径创建者 - 非空 */
		creatorUuid: { type: String, required: true },
		/** API 路径最后更新者 - 非空 */
		lastEditorUuid: { type: String, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'rbac-api-list'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const RbacApiSchema = new RbacApiSchemaFactory()

/**
 * RBAC 角色
 *
 * 一个用户可以拥有多个角色
 * 一个角色可以对应多位用户
 * 一个角色可以拥有对多个 API 的访问权限
 * 一个 API 可以对应多个角色
 */
class RbacRoleSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 角色的 UUID */
		roleUuid: { type: String, required: true, unique: true },
		/** 角色的名字 */
		roleName: { type: String, required: true, unique: true },
		/** 角色的类型 */
		roleType: { type: String },
		/** 角色的颜色 */
		roleColor: { type: String },
		/** 角色的描述 */
		roleDescription: { type: String },
		/** 这个角色有哪些 API 路径的访问权 */
		apiPathPermissions: { type: [String], required: true },
		/** API 路径创建者 - 非空 */
		creatorUuid: { type: String, required: true },
		/** API 路径最后更新者 - 非空 */
		lastEditorUuid: { type: String, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'rbac-role'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const RbacRoleSchema = new RbacRoleSchemaFactory()
