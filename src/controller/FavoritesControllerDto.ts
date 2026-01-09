/**
 * 浏览的内容的类型
 */
export type BrowsingHistoryCategory = 'video' | 'photo' | 'comment'

/**
 * 收藏夹
 */
type Favorites = {
	/** 收藏夹唯一 ID - 非空 - 唯一 */
	favoritesId: number;
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

/**
 * 获取当前登录用户自己的收藏夹列表
 */
export type GetFavoritesResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 如果成功，返回用户所有的收藏夹 */
	result?: Favorites[];
}

/**
 * 获取指定用户收藏夹列表的请求载荷
 */
export type GetFavoritesByUidRequestDto = {
	/** 目标用户 UID - 非空 */
	uid: number;
}

/**
 * 获取指定用户收藏夹列表的请求响应
 */
export type GetFavoritesByUidResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 如果成功，返回可见的收藏夹列表 */
	result?: Favorites[];
}

/**
 * 收藏夹明细项
 */
type FavoritesDetailItem = {
	/** 收藏夹明细记录的唯一 ID */
	_id?: string;
	/** 收藏夹唯一 ID */
	favoritesListId: number;
	/** 谁将本条内容添加到收藏夹 */
	operator: number;
	/** 内容的类型 */
	category: string;
	/** 内容的唯一 ID */
	id: string;
	/** 添加到收藏的时间 */
	addedDateTime: number;
	/** 排序顺序 */
	sortOrder: number;
	/** 最后编辑时间 */
	editDateTime: number;
}

/**
 * 添加内容到收藏夹的请求载荷
 */
export type AddToFavoritesRequestDto = {
	/** 收藏夹唯一 ID - 非空 */
	favoritesListId: number;
	/** 内容的类型 - 非空 */
	category: BrowsingHistoryCategory;
	/** 内容的唯一 ID - 非空 */
	id: string;
}

/**
 * 添加内容到收藏夹的请求响应
 */
export type AddToFavoritesResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 从收藏夹移除内容的请求载荷
 */
export type RemoveFromFavoritesRequestDto = {
	/** 收藏夹唯一 ID - 非空 */
	favoritesListId: number;
	/** 内容的类型 - 非空 */
	category: BrowsingHistoryCategory;
	/** 内容的唯一 ID - 非空 */
	id: string;
}

/**
 * 从收藏夹移除内容的请求响应
 */
export type RemoveFromFavoritesResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 获取收藏夹内容的请求载荷
 */
export type GetFavoritesDetailRequestDto = {
	/** 收藏夹唯一 ID - 非空 */
	favoritesListId: number;
	/** 排序方式：1 为正序（sortOrder 从小到大），-1 为倒序（sortOrder 从大到小），默认为 1 */
	sortOrder?: 1 | -1;
}

/**
 * 获取收藏夹内容的请求响应
 */
export type GetFavoritesDetailResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 如果成功，返回收藏夹中的所有内容 */
	result?: FavoritesDetailItem[];
}

/**
 * 更新收藏夹信息的请求载荷
 */
export type UpdateFavoritesRequestDto = {
	/** 收藏夹唯一 ID - 非空 */
	favoritesId: number;
	/** 收藏夹标题 */
	favoritesTitle?: string;
	/** 收藏夹简介 */
	favoritesBio?: string;
	/** 收藏夹封面 */
	favoritesCover?: string;
	/** 收藏夹可见性 */
	favoritesVisibility?: number;
}

/**
 * 更新收藏夹信息的请求响应
 */
export type UpdateFavoritesResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 如果成功，返回更新后的收藏夹数据 */
	result?: Favorites;
}

/**
 * 删除收藏夹的请求载荷
 */
export type DeleteFavoritesRequestDto = {
	/** 收藏夹唯一 ID - 非空 */
	favoritesId: number;
}

/**
 * 删除收藏夹的请求响应
 */
export type DeleteFavoritesResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 调整收藏夹内部排序的请求载荷
 */
export type ReorderFavoritesDetailRequestDto = {
	/** 收藏夹唯一 ID - 非空 */
	favoritesListId: number;
	/** 要调整排序的内容项列表，按新的顺序排列 */
	items: {
		/** 内容的类型 - 非空 */
		category: BrowsingHistoryCategory;
		/** 内容的唯一 ID - 非空 */
		id: string;
		/** 新的排序顺序 - 非空 */
		sortOrder: number;
	}[];
}

/**
 * 调整收藏夹内部排序的请求响应
 */
export type ReorderFavoritesDetailResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}
