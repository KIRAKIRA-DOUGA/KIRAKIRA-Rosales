import { Schema } from 'mongoose'

/**
 * 收藏夹数据
 */
class FavoritesSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 收藏夹唯一 ID - 非空 - 唯一 */
		favoritesId: { type: Number, required: true, unique: true },
		/** 收藏夹创建者 - 非空 */
		creator: { type: Number, required: true },
		/** 收藏夹其他维护者 */
		editor: { type: [Number] },
		/** 收藏夹标题 - 非空 */
		favoritesTitle: { type: String, required: true },
		/** 收藏夹简介 */
		favoritesBio: { type: String },
		/** 收藏夹封面 */
		favoritesCover: { type: String },
		/** 收藏夹可见性 - 非空 - 1 公开，0 仅关注者，-1 私有‘ */
		favoritesVisibility: { type: Number, required: true },
		/** 收藏夹创建时间 - 非空 */
		favoritesCreateDateTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'favorites'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const FavoritesSchema = new FavoritesSchemaFactory()

/**
 * 收藏夹明细数据
 */
class FavoritesDetailSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 收藏夹唯一 ID - 非空 */
		favoritesListId: { type: Number, required: true, index: true },
		/** 谁将本条内容添加到收藏夹 - 非空 */
		operator: { type: Number, required: true },
		/** 内容的类型，比如说 video, photo 等 - 非空 */
		category: { type: String, required: true },
		/** 内容的唯一 ID - 非空 */
		id: { type: String, required: true },
		/** 添加到收藏的时间 - 非空 */
		addedDateTime: { type: Number, required: true },
		/** 排序顺序（用于收藏夹内部排序，数字越小越靠前）- 非空 */
		sortOrder: { type: Number, required: true, index: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'favorites-detail'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)

	// 构造器
	constructor() {
		// 添加收藏夹ID和内容ID的组合唯一索引，防止重复添加
		this.schemaInstance.index({ favoritesListId: 1, category: 1, id: 1 }, { unique: true });
	}
}
export const FavoritesDetailSchema = new FavoritesDetailSchemaFactory()

/**
 * 已删除的收藏夹数据表
 */
class RemovedFavoritesSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 原来的收藏夹数据集合 */
		...FavoritesSchema.schema,
		/** 操作者 UUID - 非空 */
		_operatorUUID_: { type: String, required: true },
		/** 操作者 UID - 非空 */
		_operatorUid_: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'removed-favorites'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const RemovedFavoritesSchema = new RemovedFavoritesSchemaFactory()

/**
 * 已删除的收藏夹明细数据表
 */
class RemovedFavoritesDetailSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 原来的收藏夹明细数据集合 */
		...FavoritesDetailSchema.schema,
		/** 操作者 UUID - 非空 */
		_operatorUUID_: { type: String, required: true },
		/** 操作者 UID - 非空 */
		_operatorUid_: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'removed-favorites-detail'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)

	// 构造器
	constructor() {
		// 不添加唯一索引，允许同一个视频在同一个收藏夹中被多次删除时保留多条删除记录
		// 这样可以保留完整的删除历史
	}
}
export const RemovedFavoritesDetailSchema = new RemovedFavoritesDetailSchemaFactory()
