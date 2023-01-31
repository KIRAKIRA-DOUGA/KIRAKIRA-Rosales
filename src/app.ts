import route from './route/router'
import Koa from 'koa'

const SERVER_PORT: number = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 4000 // 从环境变量中获取端口号，如果没获取到，则使用4000

const app = new Koa()
app
	.use(route.routes()) // 使用 koa-router
	.use(route.allowedMethods()) // 所有路由中间件调用完成，ctx.status 仍为空或 404，程序自动丰富请求的响应头，方便 debug 或 handle
	.listen(SERVER_PORT) // 监听指定端口
