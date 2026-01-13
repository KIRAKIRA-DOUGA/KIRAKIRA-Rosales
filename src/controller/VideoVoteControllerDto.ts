/**
 * 为视频点赞点踩或取消点赞点踩的请求的请求参数
 */
export type VideoVoteRequestDto = {
	/** KVID 视频 ID */
	videoId: number;
}

/**
 * 为视频点赞点踩或取消点赞点踩的请求的响应结果
 */
export type VideoVoteResponseDto = {
	/** 是否请求成功 */
	success: boolean;
	/** 附加的文本消息 */
	message?: string;
}
