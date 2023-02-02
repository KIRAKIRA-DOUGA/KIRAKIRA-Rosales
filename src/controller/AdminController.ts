import { initService } from '../service/AdminService'
import { koaCtx, koaNext } from '../type/index'
import { initEnvType } from '../type/AdminType'
import { callErrorMessage } from '../common/CallErrorMessage'

let ONE_TIME_SECRET_KEY: string = process.env.ONE_TIME_SECRET_KEY

// TODO
// 验证一次性身份验证密钥
// 将API信息，心跳数据库信息和分片信息写入全局变量
// 将集群管理用户，密码、API信息，心跳数据库信息和分片信息转发给每一个心跳数据库分片
// 暂停 5s
// 启动心跳：读取全局变量，每 1s 请求任意一个心跳数据库，使用请求得到的数据覆写全局变量
// 销毁 一次性身份验证密钥

export const initKirakiraCluster = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	let responseBody: string

	try {
		const initEnvs: initEnvType = {
			userSendSecretKey: ctx.query.oneTimeSecretKey as string, // 一次性身份验证密钥
			systemAdminUserName: ctx.query.systemAdminUserName as string, // 系统管理员账户名
			systemAdminPasswordBase64: ctx.query.systemAdminPassword as string, // 在前端就已经经过一次 base64 编码的密码
			localhostServicePublicIPAddress: ctx.query.localhostServicePublicIPAddress as string, // 服务的公网 IP 地址
			localhostServicePrivateIPAddress: ctx.query.localhostServicePrivateIPAddress as string, // 服务的私网 IP 地址
			localhostServicePort: ctx.query.localhostServicePort as string, // 服务的端口号
			heartbeatDatabaseShardData: ctx.query.heartbeatDatabaseShardData as string[], // 心跳数据库分片 IP 地址和端口数组，以及数据库用户密码，格式示例：1.1.1.1:10.10.10.10:5000:mongoU1:123123:1:master
			//                                                                                                                                    公网ip:私网ip:端口:服务账号名:服务密码Base64:服务区块:服务身份
		}

		const serviceInitResult = initService(ONE_TIME_SECRET_KEY, initEnvs, ctx)
		if (serviceInitResult.state) {
			ONE_TIME_SECRET_KEY = undefined
		}
		if (serviceInitResult.callbackMessage) {
			responseBody = serviceInitResult.callbackMessage
		}
	} catch (e) {
		responseBody = callErrorMessage(e)
	}

	await next()
	ctx.body = responseBody
}
