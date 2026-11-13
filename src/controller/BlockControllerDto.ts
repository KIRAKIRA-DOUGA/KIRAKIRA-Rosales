import { type VideoTag } from './VideoTagControllerDto.js'

/**
 * 屏蔽用户的请求载荷
 */
export type BlockUserByUidRequestDto = {
	/** 被屏蔽的用户的 UID - 非空 */
	blockUid: number;
}

/**
 * 屏蔽用户的请求响应
 */
export type BlockUserByUidResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 隐藏用户的请求载荷
 */
export type HideUserByUidRequestDto = {
	/** 被隐藏的用户的 UID - 非空 */
	hideUid: number;
}

/**
 * 隐藏用户的请求响应
 */
export type HideUserByUidResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 屏蔽标签的请求载荷
 */
export type BlockTagRequestDto = {
	/* 屏蔽的标签 ID - 非空 */
	tagId: number;
}

/**
 * 屏蔽标签的请求响应
 */
export type BlockTagResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 屏蔽关键词的请求载荷
 */
export type BlockKeywordRequestDto = {
	/* 屏蔽的关键词 - 非空 */
	blockKeyword: string;
}

/**
 * 屏蔽关键词的请求响应
 */
export type BlockKeywordResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 添加正则表达式的请求载荷
 */
export type AddRegexRequestDto = {
	/** 正则表达式 - 非空 */
	blockRegex: string;
	/** 正则表达式的标志 - 非空 */
	// flag: string;
}

/**
 * 添加正则表达式的请求响应
 */
export type AddRegexResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 用户是否输入了一个不安全的正则表达式 */
	unsafeRegex: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 取消屏蔽用户的请求载荷
 */
export type UnblockUserByUidRequestDto = {
	/** 被屏蔽的用户的 UID - 非空 */
	blockUid: number;
}

/**
 * 取消屏蔽用户的请求响应
 */
export type UnblockUserByUidResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 显示用户的请求载荷
 */
export type ShowUserByUidRequestDto = {
	/** 被显示的用户的 UID - 非空 */
	hideUid: number;
}

/**
 * 显示用户的请求响应
 */
export type ShowUserByUidResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 取消屏蔽标签的请求载荷
 */
export type UnblockTagRequestDto = {
	/* 屏蔽的标签 ID - 非空 */
	tagId: number;
}

/**
 * 取消屏蔽标签的请求响应
 */
export type UnblockTagResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 取消屏蔽关键词的请求载荷
 */
export type UnblockKeywordRequestDto = {
	/** 屏蔽的关键词 - 非空 */
	blockKeyword: string;
}

/**
 * 删除正则表达式的请求载荷
 */
export type RemoveRegexRequestDto = {
	/** 正则表达式 - 非空 */
	blockRegex: string;
	/** 正则表达式的标志 - 非空 */
	// flag: string;
}

/**
 * 删除正则表达式的请求响应
 */
export type RemoveRegexResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 取消屏蔽关键词的请求响应
 */
export type UnblockKeywordResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 获取屏蔽用户列表的请求载荷
 */
export type GetBlockListRequestDto = {
	/** 屏蔽的类型 - 非空 */
	type: string;
	/** 分页查询 */
	pagination: {
		/** 当前在第几页 */
		page: number;
		/** 一页显示多少条 */
		pageSize: number;
	};
}

export type GetBlocklistResult = {
	/** 屏蔽类型 */
	type: string;
	/** 屏蔽值 */
	value: string;
	/** 屏蔽时间 */
	createDateTime: number;
	/** 被屏蔽用户 UID */
	uid?: number;
	/** 被屏蔽用户名 */
	username?: string;
	/** 被屏蔽用户昵称 */
	userNickname?: string;
	/** 被屏蔽用户头像 */
	avatar?: string;
	/** 被屏蔽的 TAG */
	tag?: VideoTag;
}

/**
 * 获取屏蔽用户列表的请求响应
 */
export type GetBlockListResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 黑名单数量 */
	blocklistCount?: number;
	/** 屏蔽用户列表 */
	result?: GetBlocklistResult[];
}

/**
 * 检查内容是否被屏蔽的请求载荷
 */
export type CheckContentIsBlockedRequestDto = {
	/** 检查的内容 */
	content: string;
}

/**
 * 检查标签是否被屏蔽的请求载荷
 */
export type CheckTagIsBlockedRequestDto = {
	/** 检查的标签 ID */
	tagId: number[];
}

/**
 * 检查用户是否被屏蔽的请求载荷
 */
export type CheckUserIsBlockedRequestDto = {
	/** 检查的用户 UID */
	uid: number;
}

/**
 * 检测是否被其他用户屏蔽的请求载荷
 */
export type CheckIsBlockedByOtherUserRequestDto = {
	/** 检查的内容 */
	targetUid: number;
}

/** 检测是否被其他用户屏蔽的请求响应 */
export type CheckIsBlockedByOtherUserResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 是否被屏蔽 */
	isBlocked: boolean;
}
/**
 * 检查是否被屏蔽的请求响应
 */
export type CheckIsBlockedResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 是否被屏蔽 */
	isBlocked: boolean;
}

/**
 * 检查用户是否被屏蔽的请求响应
 */
export type CheckUserIsBlockedResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
	/** 是否被屏蔽 */
	isBlocked: boolean;
	/** 是否被隐藏 */
	isHidden: boolean;
}
