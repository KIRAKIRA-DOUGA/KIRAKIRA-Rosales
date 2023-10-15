
/**
 * 展示视频卡片需要的返回参数
 * @param videoId 必填-KVID 视频 ID
 * @param link 必填-视频的播放直链
 * @param image 必填-封面图链接
 * @param updateDate 必填-视频上传的日期，时间戳格式
 * @param watchedCount 必填-视频播放量
 * @param uploader 必填-视频作者 ID
 * @param uploaderId 必填-创作者 UID
 * @param duration 必填-视频时长，单位 ms
 * @param description 视频描述
 * @param editDateTime 必填-系统专用字段-最后编辑时间
 */
const VideoSchema = {
	schema: {
		videoId: { type: Number, unique: true, required: true },
		link: { type: Number, unique: true, required: true },
		image: { type: String, required: true },
		updateDate: { type: Number, required: true },
		watchedCount: { type: Number, required: true },
		uploader: { type: Number, required: true },
		uploaderId: { type: Number, required: true },
		duration: { type: Number, required: true },
		description: String,
		editDateTime: { type: Number, required: true },
	},
	collectionName: 'video',
}

export default VideoSchema
