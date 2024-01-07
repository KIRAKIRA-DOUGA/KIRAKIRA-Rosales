import cors from '@koa/cors'
import fs from 'fs'
import https from 'https'
import Koa from 'koa'
import bodyParser from 'koa-bodyparser'
import { connectMongoDBCluster } from './dbPool/DbClusterPool.js'
import elasticsearchMiddleware from './middleware/elasticsearchMiddleware.js'
import router from './route/router.js'

const SERVER_PORT = process.env.SERVER_PORT ? parseInt(process.env.SERVER_PORT, 10) : 9999 // 从环境变量中获取端口号，如果没获取到，则使用 9999
const SERVER_ENV = process.env.SERVER_ENV

const app = new Koa()

// 配置程序 // WARN 注意：顺序很重要
app
	.use(elasticsearchMiddleware) // 为 ctx 附加 elasticsearchClient（elasticsearch 集群连接客户端）属性
	.use(bodyParser())
	.use(router.routes()) // 使用 koa-router
	.use(router.allowedMethods()) // 所有路由中间件调用完成，ctx.status 仍为空或 404，程序自动丰富请求的响应头，方便 debug 或 handle
	.use(cors({
		credentials: true, // 允许跨域，并且允许保存跨域的 Cookie
	}))

// 连接 MongoDB
await connectMongoDBCluster().catch(error => {
	console.error('ERROR', '无法连接到 MongoDB, 错误原因：', error)
	process.exit()
})

// 配置证书
if (SERVER_ENV && SERVER_ENV !== 'dev') { // dev 环境，使用自签名证书，非开发环境，从环境变量中读取证书
	const SSL_KEY = process.env.SSL_KEY || ''
	const SSL_CERT = process.env.SSL_CERT || ''
	https.createServer({
		key: SSL_KEY,
		cert: SSL_CERT,
	}, app.callback()).listen(SERVER_PORT)
} else { // 开发环境，使用自签名证书
	https.createServer({
		key: fs.readFileSync('src/ssl/key.pem', 'utf8'),
		cert: fs.readFileSync('src/ssl/cert.pem', 'utf8'),
	}, app.callback()).listen(SERVER_PORT)
}
