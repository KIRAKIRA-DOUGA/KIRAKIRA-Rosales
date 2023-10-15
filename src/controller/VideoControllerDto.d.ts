// export type ThumbVideoRequestDto = {
// 	username: string;
// }

/**
 * 展示视频卡片需要的返回参数
 * @param videoId KVID 视频 ID
 * @param image 封面图链接
 * @param data 视频上传的日期，时间戳格式
 * @param watchedCount 视频播放量
 * @param uploader 视频作者 ID
 * @param uploaderId 创作者 UID
 * @param duration 视频时长，单位 ms
 * @param description 视频描述
 */
export type ThumbVideoResponseDto = {
	videoId?: number;
	image?: string;
	date?: number;
	watchedCount?: number;
	uploader: string;
	uploaderId: number;
	duration?: number;
	description: string;
}
