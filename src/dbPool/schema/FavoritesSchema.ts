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
		favoritesListId: { type: Number, required: true },
		/** 谁将本条内容添加到收藏夹 - 非空 */
		operator: { type: Number, required: true },
		/** 内容的类型，比如说 video, photo 等 - 非空 */
		category: { type: String, required: true },
		/** 内容的唯一 ID - 非空 */
		id: { type: String, required: true },
		/** 添加到收藏的时间 - 非空 */
		addedDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'favorites-detail'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const FavoritesDetailSchema = new FavoritesDetailSchemaFactory()
