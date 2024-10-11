import { emitDanmakuService, getDanmakuListByKvidService } from '../service/DanmakuService.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { EmitDanmakuRequestDto, GetDanmakuByKvidRequestDto } from './DanmakuControllerDto.js'

/**
 * 用户发送弹幕
 * @param ctx context
 * @param next context
 * @returns 发送弹幕的结果
 */
export const emitDanmakuController = async (ctx: koaCtx, next: koaNext) => {
	const data = ctx.request.body as Partial<EmitDanmakuRequestDto>
	const uid = parseInt(ctx.cookies.get('uid'), 10)
	const token = ctx.cookies.get('token')
	const emitDanmakuRequest: EmitDanmakuRequestDto = {
		/** 非空 - KVID 视频 ID */
		videoId: data.videoId,
		/** 非空 - 弹幕发送的时机，单位：秒（支持小数） */
		time: data.time,
		/** 非空 - 弾幕文本 */
		text: data.text,
		/** 非空 - 弾幕颜色 */
		color: data.color,
		/** 非空 - 弹幕字体大小，后端只存储三种数据，在前端再根据类型映射为 css 可用的像素 */
		fontSize: data.fontSize,
		/** 非空 - 弹幕发射模式，默认 'rtl' —— 从右舷向左发射 */
		mode: data.mode,
		/** 非空 - 是否启用彩虹弹幕，默认不启用 */
		enableRainbow: data.enableRainbow,
	}
	const emitDanmakuResponse = await emitDanmakuService(emitDanmakuRequest, uid, token)
	ctx.body = emitDanmakuResponse
	await next()
}


export const getDanmakuListByKvidController = async (ctx: koaCtx, next: koaNext) => {
	const videoId = ctx.query.videoId as string
	const getDanmakuByKvidRequest: GetDanmakuByKvidRequestDto = {
		videoId: videoId ? parseInt(videoId, 10) : -1, // WARN -1 means you can't find any video
	}
	const danmakuListResponse = await getDanmakuListByKvidService(getDanmakuByKvidRequest)
	ctx.body = danmakuListResponse
	await next()
}
