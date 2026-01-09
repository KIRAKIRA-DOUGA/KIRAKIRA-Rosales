/**
 * 为视频点赞的请求的请求参数
 */
export type EmitVideoUpvoteRequestDto = {
	/** KVID 视频 ID */
	videoId: number;
}

/**
 * 为视频点赞的请求的响应结果
 */
export type EmitVideoUpvoteResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 取消视频点赞的请求的请求参数
 */
export type CancelVideoUpvoteRequestDto = {
	/** KVID 视频 ID */
	videoId: number;
}

/**
 * 取消视频点赞的请求的响应结果
 */
export type CancelVideoUpvoteResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 为视频点踩的请求的请求参数
 */
export type EmitVideoDownvoteRequestDto = {
	/** KVID 视频 ID */
	videoId: number;
}

/**
 * 为视频点踩的请求的响应结果
 */
export type EmitVideoDownvoteResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

/**
 * 取消视频点踩的请求的请求参数
 */
export type CancelVideoDownvoteRequestDto = {
	/** KVID 视频 ID */
	videoId: number;
}

/**
 * 取消视频点踩的请求的响应结果
 */
export type CancelVideoDownvoteResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}

