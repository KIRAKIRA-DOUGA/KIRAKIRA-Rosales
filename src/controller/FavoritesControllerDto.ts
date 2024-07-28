/**
 * 浏览的内容的类型
 */
export type BrowsingHistoryCategory = 'video' | 'photo' | 'comment'

/**
 * 收藏夹
 */
type Favorites = {
	/** 收藏夹唯一 ID - 非空 - 唯一 */
	favoritesListId: number;
	/** 收藏夹创建者 - 非空 */
	creator: number;
	/** 收藏夹其他维护者 */
	editor?: number[];
	/** 收藏夹标题 - 非空 */
	favoritesTitle: string;
	/** 收藏夹简介 */
	favoritesBio?: string;
	/** 收藏夹封面 */
	favoritesCover?: string;
	/** 收藏夹可见性 - 非空 - 1 公开，0 仅关注者，-1 私有‘ */
	favoritesVisibility: number;
	/** 收藏夹创建时间 - 非空 */
	favoritesCreateDateTime: number;
}

/**
 * 创建收藏夹的请求载荷
 */
export type CreateFavoritesRequestDto = {
	/** 收藏夹标题 - 非空 */
	favoritesTitle: string;
	/** 收藏夹简介 */
	favoritesBio?: string;
	/** 收藏夹封面 */
	favoritesCover?: string;
	/** 收藏夹的可见性 - 非空 */
	favoritesVisibility: number;
}

/**
 * 创建收藏夹的请求响应
 */
export type CreateFavoritesResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 如果成功，返回创建的这个收藏夹数据 */
	result?: Favorites;
}
