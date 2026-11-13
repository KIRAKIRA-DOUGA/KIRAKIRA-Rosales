import { Schema } from 'mongoose'

/**
 * 用户关注数据
 */
class FollowingSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 关注者 UUID - 非空 */
		followerUuid: { type: String, required: true },
		/** 被关注者 UUID - 非空 */
		followingUuid: { type: String, required: true },
		/** 关注类型 - 非空 - 可选值：'normal', 'auto', 'event', 'eventAutoBatch' */
		followingType: { type: String, enum: ['normal', 'auto', 'event', 'eventAutoBatch'], required: true },
		/** 是否是特别关心 - 非空 */
		isFavorite: { type: Boolean, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		followingEditDateTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		followingCreateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'following'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const FollowingSchema = new FollowingSchemaFactory()

/**
 * 用户取消关注数据
 */
class UnfollowingSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 原始关注数据，继承自 FollowingSchema */
		...FollowingSchema.schema,
		/** 取消关注原因类型 - 非空 */
		unfollowingReasonType: { type: String, request: true },
		/** 用户取消关注的日期 - 非空 */
		unfollowingDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		unfollowingEditDateTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		unfollowingCreateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'unfollowing'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UnfollowingSchema = new UnfollowingSchemaFactory()

/**
 * 用户创建的动态分组
 */
class FeedGroupSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 动态分组的 UUID - 非空 */
		feedGroupUuid: { type: String, required: true },
		/** 动态分组的名称 - 非空 */
		feedGroupName: { type: String, required: true },
		/** 动态分组创建者 UUID - 非空 */
		feedGroupCreatorUuid: { type: String, required: true },
		/** 动态分组中的用户 - 非空 */
		uuidList: { type: [String], required: true },
		/** 动态分组的自定义封面 */
		customCover: { type: String },
		/** 是否在上一次审核通过后修改了动态分组的信息 - 非空 - 当第一次创建用户信息以及发生了更新后需要设为 true，当管理员通过审核时时将其改为 false */
		isUpdatedAfterReview: { type: Boolean, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'feed-group'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const FeedGroupSchema = new FeedGroupSchemaFactory()
