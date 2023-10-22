/**
 * 分P 视频的数据
 * @param id 必填 - 唯一 - 分P 视频的顺序
 * @param videoPartTitle 必填 - 唯一 - 每 P 视频的标题
 * @param link 必填 - 唯一 - 每 P 视频的链接
 * @param editDateTime 必填 - 系统专用字段-最后编辑时间
 */
const videoPartSchema = {
	id: { type: Number, required: true },
	videoPartTitle: { type: String, required: true },
	link: { type: String, required: true },
	editDateTime: { type: Number, required: true },
}

/**
 * 视频数据
 * @param videoId 必填 - 唯一 - KVID 视频 ID
 * @param title 必填 - 视频标题
 * @param videoPart 每 P 视频的数据
		* @param videoPartSchema[] 每 P 视频的数据
 * @param image 必填 - 封面图链接
 * @param updateDate 必填 - 视频上传的日期，时间戳格式
 * @param watchedCount 必填 - 视频播放量
 * @param uploader 必填 - 视频作者 ID
 * @param uploaderId 必填 - 创作者 UID
 * @param duration 必填 - 视频时长，单位 ms
 * @param description 视频描述
 * @param editDateTime 必填 - 系统专用字段-最后编辑时间
 */
const VideoSchema = {
	schema: {
		videoId: { type: Number, unique: true, required: true },
		title: { type: String, required: true },
		videoPart: [videoPartSchema],
		image: { type: String, required: true },
		updateDate: { type: Number, required: true },
		watchedCount: { type: Number, required: true },
		uploader: { type: String, required: true },
		uploaderId: { type: Number, required: true },
		duration: { type: Number, required: true },
		description: String,
		editDateTime: { type: Number, required: true },
	},
	collectionName: 'video',
}

export default VideoSchema
