/**
 * 展示视频卡片需要的返回参数
 * @param videoId KVID 视频 ID
 * @param link 视频的播放直链
 * @param image 封面图链接
 * @param uploader 视频作者 ID
 * @param uploaderId 创作者 UID
 * @param duration 视频时长，单位 ms
 * @param description 视频描述
 */
export type UploadVideoRequestDto = {
	link: string;
	image: string;
	uploader: string;
	uploaderId: number;
	duration: number;
	description?: string;
}

/**
 * 视频上传的请求响应
 * @param success 是否请求成功
 * @param message 附加的文本消息
 * @parma videoId 视频 ID
 */
export type UploadVideoResponseDto = {
	success: boolean;
	message?: string;
	videoId?: number;
}

// export type ThumbVideoRequestDto = {
// 	username: string;
// }

/**
 * 展示视频卡片需要的返回参数
 * @param success 是否请求成功
 * @param message 附加的文本消息
 * @param videos 请求到的视频的数据
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
	success: boolean;
	message?: string;
	videos: {
		videoId?: number;
		image?: string;
		date?: number;
		watchedCount?: number;
		uploader?: string;
		uploaderId?: number;
		duration?: number;
		description?: string;
	}[];
}
