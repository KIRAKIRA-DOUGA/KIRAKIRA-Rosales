import { Schema } from 'mongoose'

/**
 * 弾幕数据
 */
class DanmakuSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** KVID 视频 ID - 非空 */
		videoId: { type: Number, required: true },
		/** 弹幕发送者的的 UUID，关联用户安全集合的 UUID - 非空 */
		uuid: { type: String, required: true },
		/** 弹幕发送者的 UID - 非空 */
		uid: { type: Number, required: true },
		/** 弹幕发送的时机，单位：秒（支持小数） - 非空  */
		time: { type: Number, required: true },
		/** 弾幕文本 - 非空 */
		text: { type: String, required: true },
		/** 弾幕颜色 - 非空 */
		color: { type: String, required: true },
		/** 弹幕字体大小 - 非空 */ /** 后端只存储三种数据，在前端再根据类型映射为 css 可用的像素 */ /** 默认 'medium' —— 中等尺寸 */
		fontSIze: { type: String, enum: ['small', 'medium', 'large'], required: true, default: 'medium' },
		/** 弹幕发射模式 - 非空 */ /** 默认 'rtl' —— 从右舷向左发射 */
		mode: { type: String, enum: ['ltr', 'rtl', 'top', 'bottom'], required: true, default: 'rtl' },
		/** 是否启用彩虹弹幕 - 非空 */ /** 默认 false —— 不启用 */
		enableRainbow: { type: Boolean, required: false, default: false },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'danmaku'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}

export const DanmakuSchema = new DanmakuSchemaFactory()
