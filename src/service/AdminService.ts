import { callErrorMessage } from '../common/CallErrorMessage'
import { adminCheckStates, initEnvType, serviceInitState, serviceInfoType, mongoDBConnectType } from '../type/AdminType'
import { koaCtx } from '../type/index'
import { strToBase64 } from '../common/Base64Gen'
import { createOrMergeHeartBeatDatabaseConnectByDatabaseInfo, schemaType, saveData2MongoDBShard, getTsTypeFromSchemaType } from '../common/DbPool'
import { Schema } from 'mongoose'

/**
 * 验证用户的一次性身份验证密钥
 * @param envOneTimeSecretKey 环境变量中的一次性身份验证密钥
 * @param userSendSecretKey 用户请求中的一次性身份验证密钥
 * @returns adminCheckStates{state: 验证结果，true为成功，false为失败, callbackMessage: 返回的信息}
 */
export const checkOneTimeSecretKey = (envOneTimeSecretKey: string | undefined | null, userSendSecretKey: string | undefined | null): adminCheckStates => {
	if (envOneTimeSecretKey && userSendSecretKey) {
		if (envOneTimeSecretKey === userSendSecretKey) {
			return { state: true, callbackMessage: `Check Okey, Env Key: [${envOneTimeSecretKey}], Your Key: [${userSendSecretKey}]` }
		}
		return { state: false, callbackMessage: callErrorMessage('<p>漏洞提交： wooyun@kirakira.com</p>') }
	}
	if (envOneTimeSecretKey && !userSendSecretKey) {
		return { state: false, callbackMessage: callErrorMessage('<p>请检查请求中的一次性身份验证密钥参数。</p>') }
	}
	if (!envOneTimeSecretKey && userSendSecretKey) {
		return { state: false, callbackMessage: callErrorMessage('<p>请检查环境变量中的一次性身份验证密钥配置情况。</p>') }
	}
	return { state: false, callbackMessage: callErrorMessage('<p>未知错误。</p>') }
}

/**
 * 验证服务初始化字段是否合法
 * @param initEnvs 服务初始化字段
 * @returns boolean false 为不合法，true 为合法
 */
const checkInitEnvs = (initEnvs: initEnvType): boolean => {
	return initEnvs.userSendSecretKey && initEnvs.systemAdminUserName && initEnvs.systemAdminPasswordBase64 && initEnvs.localhostServicePublicIPAddress && initEnvs.localhostServicePrivateIPAddress && initEnvs.localhostServicePort && initEnvs.heartbeatDatabaseShardData && initEnvs.heartbeatDatabaseShardData.length > 0
}



const urlHeartbeatDatabaseShardData2Array = (heartbeatDatabaseShardDataList: string[]): serviceInfoType[] => {
	const formatHeartbeatDatabaseShardData: serviceInfoType[] = [] as serviceInfoType[]

	console.log('heartbeatDatabaseShardDataList', heartbeatDatabaseShardDataList)

	heartbeatDatabaseShardDataList.forEach((heartbeatDatabaseShardData: string) => {
		const heartbeatDatabaseShardDataArray = heartbeatDatabaseShardData.split(':')
		if (heartbeatDatabaseShardDataArray[0] && heartbeatDatabaseShardDataArray[1] && heartbeatDatabaseShardDataArray[2] && heartbeatDatabaseShardDataArray[3] && heartbeatDatabaseShardDataArray[4] && heartbeatDatabaseShardDataArray[5] && heartbeatDatabaseShardDataArray[6]) {
			if (heartbeatDatabaseShardDataArray[6] === 'master' || heartbeatDatabaseShardDataArray[6] === 'servant') {
				const heartbeatDatabaseShardDataObject: serviceInfoType = {
					publicIPAddress: heartbeatDatabaseShardDataArray[0],
					privateIPAddress: heartbeatDatabaseShardDataArray[1],
					port: parseInt(heartbeatDatabaseShardDataArray[2], 10),
					adminAccountName: heartbeatDatabaseShardDataArray[3],
					adminPasswordBase64Base64: strToBase64(heartbeatDatabaseShardDataArray[4]),
					serviceType: 'heartbeat',
					shardGroup: parseInt(heartbeatDatabaseShardDataArray[5], 10),
					identity: heartbeatDatabaseShardDataArray[6],
					state: 'up',
					editDateTime: new Date().getTime(),
				}
				formatHeartbeatDatabaseShardData.push(heartbeatDatabaseShardDataObject)
			}
		}
	})

	return formatHeartbeatDatabaseShardData
}

/**
 * 初始化 API 服务
 * @param ONE_TIME_SECRET_KEY 环境变量中的一次性身份验证密钥
 * @param initEnvs 服务初始化字段
 */
export const initService = (ONE_TIME_SECRET_KEY: string, initEnvs: initEnvType, ctx: koaCtx): Promise<serviceInitState> => {
	return new Promise<serviceInitState>((resolve, reject) => {
		const adminOneTimeSecretKeyCheckResult: adminCheckStates = checkOneTimeSecretKey(ONE_TIME_SECRET_KEY, initEnvs.userSendSecretKey)

		if (adminOneTimeSecretKeyCheckResult.state) {
			if (checkInitEnvs(initEnvs)) {
				const { userSendSecretKey, systemAdminUserName, systemAdminPasswordBase64, localhostServicePublicIPAddress, localhostServicePrivateIPAddress, localhostServicePort, heartbeatDatabaseShardData } = initEnvs
				ctx.state.__API_SERVER_LIST__ = [{ servicePublicIPAddress: localhostServicePublicIPAddress, servicePrivateIPAddress: localhostServicePrivateIPAddress, servicePort: localhostServicePort }]
				ctx.state.__HEARTBEAT_DB_SHARD_LIST__ = urlHeartbeatDatabaseShardData2Array(heartbeatDatabaseShardData)
				if (ctx.state.__HEARTBEAT_DB_SHARD_LIST__) {
					createOrMergeHeartBeatDatabaseConnectByDatabaseInfo(ctx.state.__HEARTBEAT_DB_SHARD_LIST__, ctx).then((connects: mongoDBConnectType[]) => {
						console.log('connect: ', connects)
						ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__ = connects
	
						const heartBeatDataBaseConnects = ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__
						const schemaObject: schemaType = { name: String }
						const data = [{ name: 'abc' }]
						type dataType = getTsTypeFromSchemaType<typeof schemaObject> // TODO Can I move it into the function saveData2MongoDBShard ?
						saveData2MongoDBShard<dataType>(heartBeatDataBaseConnects, schemaObject, data).then(result => {
							if (result) {
								// TODO
							} else {
								// TODO
							}
						}).catch(e => {
							// TODO
						})
					})
				}
				
	
				// DONE 处理 heartbeatDatabaseShardData 并将其存入环境变量 __HEARTBEAT_DB_SHARD_LIST__
				// DONE 判断 __HEARTBEAT_DB_SHARD_LIST__ 是否为空，如果不是，那这些信息去创建数据库连接并保存连接
				// TODO 判断 __HEARTBEAT_DB_SHARD_CONNECT_LIST__ 是否为空，如果不是，向每一个心跳数据库分片广播 集群管理用户，密码、API信息，心跳数据库信息
				// TODO 中断5s
				// TODO 每隔 1s 随机去一个心跳数据库分片中获取 API信息列表 和 心跳数据库分片列表，并覆写全局变量
				// TODO 启动健康检测
				// TODO 销毁 一次性身份验证密钥
			}
		}
		reject({ state: false, callbackMessage: '<p>初始化失败</p>' })
	})
}

// TODO
// 验证一次性身份验证密钥
// 将API信息，心跳数据库信息和分片信息写入全局变量
// 将集群管理用户，密码、API信息，心跳数据库信息和分片信息转发给每一个心跳数据库分片
// 暂停 5s
// 启动心跳：读取全局变量，每 1s 请求任意一个心跳数据库，使用请求得到的数据覆写全局变量
// 销毁 一次性身份验证密钥
