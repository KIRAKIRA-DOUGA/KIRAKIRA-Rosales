import { Schema } from 'mongoose'

/**
 * 视频播放记录数据（用于统计播放量，一人一天看一个视频不管看多少次都只加一次播放量）
 */
export class VideoWatchRecordSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID - 非空 */
		UUID: { type: String, required: true, index: true },
		/** 用户的 UID - 非空 */
		uid: { type: Number, required: true, index: true },
		/** 视频 ID (KVID) - 非空 */
		videoId: { type: Number, required: true, index: true },
		/** 观看日期 - 非空 */
		watchDateTime: { type: Number, required: true, index: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
		/** 系统专用字段-创建者 - 非空 */
		createBy: { type: String, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑者 - 非空 */
		editBy: { type: String, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'video-watch-record'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)

	/** 按用户 UUID、视频 ID 和日期键 `watchDate` 声明联合唯一索引。 */
	constructor() {
		this.schemaInstance.index({ UUID: 1, videoId: 1, watchDate: 1 }, { unique: true })
	}
}
export const VideoWatchRecordSchema = new VideoWatchRecordSchemaFactory()

