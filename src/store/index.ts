import { koaCtx, koaNext } from '../type/index'

export const koaPublicStore = async (ctx: koaCtx, next: koaNext) => {
	ctx.state.__API_SERVER_LIST__ = [] // API 服务器列表
	ctx.state.__HEARTBEAT_DB_SHARD_LIST__ = [] // 心跳数据库列表
	
	await next()
}
