/**
 * 点赞通知的媒体性质
 */
export type UpvoteNotificationCategory = 'video' | 'video_comment'

/**
 * 单条点赞通知（列表项）
 */
export type UpvoteNotificationItemDto = {
	/** 通知编号（MongoDB _id） */
	notificationId: string;
	/** 接收者 UUID */
	receiverUuid: string;
	/** 接收者 UID */
	receiverUid: number;
	/** 点赞者 UUID */
	likerUuid: string;
	/** 点赞者 UID */
	likerUid: number;
	/** 媒体性质 */
	category: UpvoteNotificationCategory;
	/** 目标编号 */
	targetId: string;
	/** 视频 ID */
	videoId: number;
	/** 评论 ID（仅 video_comment） */
	commentId?: string;
	/** 是否已读 */
	isRead: boolean;
	/** 最近点赞时间 */
	upvoteTime: number;
	/** 创建时间 */
	createDateTime: number;
}

/**
 * 获取点赞通知列表的请求载荷
 */
export type GetUpvoteNotificationListRequestDto = {
	/**
	 * 是否已读：false = 未读，true = 已读；
	 * 不传则返回全部（仍过滤 block/hide，且不含软删）
	 */
	isRead?: boolean;
	/** 可选，按 category 过滤 */
	category?: UpvoteNotificationCategory;
	/** 分页 */
	pagination: {
		page: number;
		pageSize: number;
	};
}

/**
 * 获取点赞通知列表的响应
 */
export type GetUpvoteNotificationListResponseDto = {
	success: boolean;
	message?: string;
	/** 符合条件的总数（已应用 block/hide 过滤） */
	count?: number;
	result?: UpvoteNotificationItemDto[];
}

/**
 * 获取未读点赞通知数的请求载荷
 */
export type GetUnreadUpvoteNotificationCountRequestDto = {
	/** 可选，按 category 过滤；不传则统计全部 */
	category?: UpvoteNotificationCategory;
}

/**
 * 获取未读点赞通知数的响应
 */
export type GetUnreadUpvoteNotificationCountResponseDto = {
	success: boolean;
	message?: string;
	/** 未读数（已应用 block/hide 过滤） */
	count?: number;
}

/**
 * 按通知编号标记已读的请求载荷
 */
export type MarkUpvoteNotificationReadByIdsRequestDto = {
	/** 通知编号列表 */
	notificationIds: string[];
}

/**
 * 按通知编号标记已读的响应
 */
export type MarkUpvoteNotificationReadByIdsResponseDto = {
	success: boolean;
	message?: string;
	/** 成功标为已读的 ID */
	markedIds?: string[];
	/** 因 block/hide 被过滤而未标记的 ID */
	skippedFilteredIds?: string[];
	/** 已软删而未标记的 ID */
	skippedDeletedIds?: string[];
	/** 不存在或不属于当前用户的 ID */
	skippedForbiddenOrMissingIds?: string[];
}

/**
 * 全部已读的请求载荷
 */
export type MarkAllUpvoteNotificationReadRequestDto = {
	/** 可选，只清某一 category */
	category?: UpvoteNotificationCategory;
}

/**
 * 全部已读的响应
 */
export type MarkAllUpvoteNotificationReadResponseDto = {
	success: boolean;
	message?: string;
	/** 实际标记为已读的数量 */
	markedCount?: number;
}
