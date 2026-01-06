/**
 * 获取待审核视频列表的请求载荷
 */
export type GetPendingReviewVideoListRequestDto = {
	/** 分页参数：返回数量 */
	num: number;
	/** 分页参数：偏移量 */
	offset: number;
}

/**
 * 获取待审核视频列表的响应
 */
export type GetPendingReviewVideoListResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 总数 */
	totalCount?: number;
	/** 视频列表 */
	videos?: Array<{
		videoId: number;
		title: string;
		image?: string;
		uploadDate?: number;
		watchedCount?: number;
		uploaderId?: number;
		uploader?: string;
		uploaderNickname?: string;
		duration?: number;
		description?: string;
		editDateTime?: number;
	}>;
}

/**
 * 获取待审核评论列表的请求载荷
 */
export type GetPendingReviewCommentListRequestDto = {
	/** 分页参数：返回数量 */
	num: number;
	/** 分页参数：偏移量 */
	offset: number;
}

/**
 * 评论信息（用于待审核列表）
 */
export type PendingReviewCommentInfo = {
	/** 评论的路由 */
	commentRoute: string;
	/** KVID 视频 ID */
	videoId: number;
	/** 评论发送者的 UUID */
	UUID: string;
	/** 评论发送者的 UID */
	uid: number;
	/** 发送评论的时间 */
	emitTime: number;
	/** 评论正文 */
	text: string;
	/** 评论点赞数 */
	upvoteCount: number;
	/** 评论点踩数 */
	downvoteCount: number;
	/** 评论楼层数 */
	commentIndex: number;
	/** 该评论的下一级子评论数量 */
	subCommentsCount: number;
	/** 系统专用字段-最后编辑时间 */
	editDateTime: number;
}

/**
 * 获取待审核评论列表的响应
 */
export type GetPendingReviewCommentListResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 总数 */
	totalCount?: number;
	/** 评论列表 */
	comments?: PendingReviewCommentInfo[];
}

/**
 * 获取待审核弹幕列表的请求载荷
 */
export type GetPendingReviewDanmakuListRequestDto = {
	/** 分页参数：返回数量 */
	num: number;
	/** 分页参数：偏移量 */
	offset: number;
}

/**
 * 弹幕信息（用于待审核列表）
 */
export type PendingReviewDanmakuInfo = {
	/** MongoDB _id */
	_id?: string;
	/** KVID 视频 ID */
	videoId: number;
	/** 弹幕发送者的 UUID */
	UUID: string;
	/** 弹幕发送者的 UID */
	uid: number;
	/** 弹幕发送的时机，单位：秒（支持小数） */
	time: number;
	/** 弾幕文本 */
	text: string;
	/** 弾幕颜色 */
	color: string;
	/** 弹幕字体大小 */
	fontSize: string;
	/** 弹幕发射模式 */
	mode: string;
	/** 是否启用彩虹弹幕 */
	enableRainbow: boolean;
	/** 系统专用字段-最后编辑时间 */
	editDateTime: number;
}

/**
 * 获取待审核弹幕列表的响应
 */
export type GetPendingReviewDanmakuListResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 总数 */
	totalCount?: number;
	/** 弹幕列表 */
	danmaku?: PendingReviewDanmakuInfo[];
}

/**
 * 通过视频审核的请求载荷
 */
export type ApproveVideoReviewRequestDto = {
	/** 视频 ID (KVID) */
	videoId: number;
}

/**
 * 通过视频审核的响应
 */
export type ApproveVideoReviewResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 退回视频审核的请求载荷
 */
export type RejectVideoReviewRequestDto = {
	/** 视频 ID (KVID) */
	videoId: number;
	/** 退回原因 */
	reason: string;
}

/**
 * 退回视频审核的响应
 */
export type RejectVideoReviewResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 通过评论审核的请求载荷
 */
export type ApproveCommentReviewRequestDto = {
	/** 评论的路由 */
	commentRoute: string;
}

/**
 * 通过评论审核的响应
 */
export type ApproveCommentReviewResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 退回评论审核的请求载荷
 */
export type RejectCommentReviewRequestDto = {
	/** 评论的路由 */
	commentRoute: string;
	/** 退回原因 */
	reason: string;
}

/**
 * 退回评论审核的响应
 */
export type RejectCommentReviewResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 通过弹幕审核的请求载荷
 */
export type ApproveDanmakuReviewRequestDto = {
	/** 弹幕的 MongoDB _id */
	danmakuId: string;
}

/**
 * 通过弹幕审核的响应
 */
export type ApproveDanmakuReviewResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 退回弹幕审核的请求载荷
 */
export type RejectDanmakuReviewRequestDto = {
	/** 弹幕的 MongoDB _id */
	danmakuId: string;
	/** 退回原因 */
	reason: string;
}

/**
 * 退回弹幕审核的响应
 */
export type RejectDanmakuReviewResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 单条审核记录
 */
export type ReviewLogItem = {
	/** 被审核内容所属用户 UUID */
	ownerUUID: string;
	/** 被审核内容所属用户 UID */
	ownerUid: number;
	/** 审核人 UUID */
	reviewerUUID: string;
	/** 审核人 UID */
	reviewerUid: number;
	/** 审核目标类型：video/comment/danmaku */
	targetType: 'video' | 'comment' | 'danmaku';
	/** 审核目标 ID：视频为 videoId，评论为 commentRoute，弹幕为 danmakuId 等 */
	targetId: string;
	/** 审核动作：approve/reject */
	action: 'approve' | 'reject';
	/** 审核备注/原因（可能为空字符串，但字段始终存在） */
	reason: string;
	/** 额外信息（如视频标题快照等） */
	extra?: Record<string, any>;
	/** 审核时间 */
	createDateTime: number;
}

/**
 * 获取本人审核记录的请求载荷
 */
export type GetSelfReviewLogRequestDto = {
	/** 分页参数：页码（可选，默认 1） */
	page?: number;
	/** 分页参数：每页大小（可选，默认 20） */
	pageSize?: number;
}

/**
 * 获取本人审核记录的响应
 */
export type GetSelfReviewLogResponseDto = {
	/** 执行结果 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 总数 */
	totalCount?: number;
	/** 审核记录列表 */
	logs?: ReviewLogItem[];
}


