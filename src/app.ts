import bodyParser from 'koa-bodyparser'
import router from './route/router'
import Koa from 'koa'
import fs from 'fs'
import https from 'https'

const SERVER_PORT: number = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 4000 // 从环境变量中获取端口号，如果没获取到，则使用4000

const serverEnv = process.env.SERVER_ENV

const app = new Koa()

if (serverEnv && serverEnv !== 'dev') { // 非开发环境
	app
		.use(bodyParser())
		.use(router.routes()) // 使用 koa-router
		.use(router.allowedMethods()) // 所有路由中间件调用完成，ctx.status 仍为空或 404，程序自动丰富请求的响应头，方便 debug 或 handle
		// .listen(SERVER_PORT) // 监听指定端口
		
	https.createServer({
		key: fs.readFileSync('/usr/src/app/ssl/privkey.pem', 'utf8'),
		cert: fs.readFileSync('/usr/src/app/ssl/fullchain.pem', 'utf8'),
	}, app.callback()).listen(SERVER_PORT)
} else { // 开发环境
	app
		.use(bodyParser())
		.use(router.routes()) // 使用 koa-router
		.use(router.allowedMethods()) // 所有路由中间件调用完成，ctx.status 仍为空或 404，程序自动丰富请求的响应头，方便 debug 或 handle
		.listen(SERVER_PORT) // 监听指定端口
}




