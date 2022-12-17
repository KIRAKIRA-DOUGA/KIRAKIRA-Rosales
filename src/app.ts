import route from './route/router'
import Koa from 'koa'

const app = new Koa()

app.use(route.routes()) // 使用 koa-router
app.use(route.allowedMethods()) // 所有路由中间件调用完成，ctx.status 为空或 404，自动丰富请求的响应头，方便 debug 等

app.listen(4000)
