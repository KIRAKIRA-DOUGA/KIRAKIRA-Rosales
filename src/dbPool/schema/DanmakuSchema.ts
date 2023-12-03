/**
 * 弾幕数据
 */
const DanmakuSchema = {
	/** MongoDB Schema */
	schema: {
		/** 非空 - KVID 视频 ID */
		videoId: { type: Number, required: true },
		/** 非空 - 弹幕发送者的用户的 UID */
		uid: { type: Number, required: true },
		/** 非空 - 弹幕发送的时机，单位：秒（支持小数） */
		time: { type: Number, required: true },
		/** 非空 - 弾幕文本 */
		text: { type: String, required: true },
		/** 非空 - 弾幕颜色 */
		color: { type: String, required: true },
		/** 非空 - 弹幕字体大小，后端只存储三种数据，在前端再根据类型映射为 css 可用的像素 */
		fontSIze: { type: String, enum: ['small', 'medium', 'large'], required: true, default: 'medium' },
		/** 非空 - 弹幕发射模式，默认 'rtl' —— 从右舷向左发射 */
		mode: { type: String, enum: ['ltr', 'rtl', 'top', 'bottom'], required: true, default: 'rtl' },
		/** 非空 - 是否启用彩虹弹幕，默认不启用 */
		enableRainbow: { type: Boolean, required: false, default: false },
		/** 非空 - 系统专用字段-最后编辑时间 */
		editDateTime: { type: Number, required: true },
	},
	/** MongoDB 集合名 */
	collectionName: 'danmaku',
}

export default DanmakuSchema
