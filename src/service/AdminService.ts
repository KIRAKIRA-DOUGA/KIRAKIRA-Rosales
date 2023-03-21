import { callErrorMessage } from '../common/CallErrorMessage'
import { adminCheckStates, initEnvType, serviceInitState, serviceInfoType, mongoDBConnectType, adminUserType } from '../type/AdminType'
import { koaCtx } from '../type/index'
import { createOrMergeHeartBeatDatabaseConnectByDatabaseInfo, saveData2MongoDBShard } from '../common/DbPool'

/**
 * 验证用户的一次性身份验证密钥
 * @param envOneTimeSecretKey 环境变量中的一次性身份验证密钥
 * @param userSendSecretKey 用户请求中的一次性身份验证密钥
 * @returns adminCheckStates{state: 验证结果，true为成功，false为失败, callbackMessage: 返回的信息}
 */
export const checkOneTimeSecretKey = (envOneTimeSecretKey: string | undefined | null, userSendSecretKey: string | undefined | null): adminCheckStates => {
	if (envOneTimeSecretKey && userSendSecretKey) {
		if (envOneTimeSecretKey === userSendSecretKey) {
			return { state: true, callbackMessage: `Check Okay, Env Key: [${envOneTimeSecretKey}], Your Key: [${userSendSecretKey}]` }
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
	return initEnvs.userSendSecretKey && initEnvs.systemAdminUserName && initEnvs.adminPassword && initEnvs.localhostServicePublicIPAddress && initEnvs.localhostServicePrivateIPAddress && initEnvs.localhostServicePort && initEnvs.heartbeatDatabaseShardData && initEnvs.heartbeatDatabaseShardData.length > 0
}


/**
 *
 * 把 url 传来的心跳数据库信息字符串数组转换为对象数组
 *
 * @param heartbeatDatabaseShardDataList url 传来的心跳数据库信息的字符串数组
 * @returns 心跳数据库信息的对象数组
 */
const urlHeartbeatDatabaseShardData2Array = (heartbeatDatabaseShardDataList: string[]): serviceInfoType[] => {
	const formatHeartbeatDatabaseShardData: serviceInfoType[] = [] as serviceInfoType[]
	// DELETE
	console.log('heartbeatDatabaseShardDataList', heartbeatDatabaseShardDataList) // DELETE
	// DELETE
	heartbeatDatabaseShardDataList.forEach((heartbeatDatabaseShardData: string) => {
		const heartbeatDatabaseShardDataArray = heartbeatDatabaseShardData.split(':')
		// DELETE
		console.log('heartbeatDatabaseShardDataArray', heartbeatDatabaseShardDataArray) // DELETE
		// DELETE
		if (heartbeatDatabaseShardDataArray[0] && heartbeatDatabaseShardDataArray[2] && heartbeatDatabaseShardDataArray[3] && heartbeatDatabaseShardDataArray[4] && heartbeatDatabaseShardDataArray[5] && heartbeatDatabaseShardDataArray[6]) {
			if (heartbeatDatabaseShardDataArray[6] === 'master' || heartbeatDatabaseShardDataArray[6] === 'servant') {
				const heartbeatDatabaseShardDataObject: serviceInfoType = {
					publicIPAddress: heartbeatDatabaseShardDataArray[0],
					privateIPAddress: heartbeatDatabaseShardDataArray[1] || undefined,
					port: parseInt(heartbeatDatabaseShardDataArray[2], 10),
					adminAccountName: heartbeatDatabaseShardDataArray[3],
					adminPassword: heartbeatDatabaseShardDataArray[4],
					serviceType: 'heartbeat',
					shardGroup: parseInt(heartbeatDatabaseShardDataArray[5], 10),
					identity: heartbeatDatabaseShardDataArray[6],
					state: 'up',
					editDateTime: new Date().getTime(),
				}
				formatHeartbeatDatabaseShardData.push(heartbeatDatabaseShardDataObject)
			} else {
				console.log('初始化失败，获取心跳数据库数据时，服务类型既不是主，也不是从')
				// TODO 添加错误处理
			}
		} else {
			console.log('初始化失败，获取心跳数据库数据时，必要的参数不全')
			// TODO 添加错误处理
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
		const adminOneTimeSecretKeyCheckResult: adminCheckStates = checkOneTimeSecretKey(ONE_TIME_SECRET_KEY, initEnvs.userSendSecretKey) // 验证一次性密钥是否正确
		if (adminOneTimeSecretKeyCheckResult.state) { // 如果一次性密钥正确，则继续
			const allInitEnvRight = checkInitEnvs(initEnvs) // 验证必要的初始化变量是否有空
			if (allInitEnvRight) { // 如果验证通过
				const { systemAdminUserName, adminPassword, localhostServicePublicIPAddress, localhostServicePrivateIPAddress, localhostServicePort, heartbeatDatabaseShardData } = initEnvs // 玩的就是解构，不解构你就不酷了
				ctx.state.__API_SERVER_LIST__ = [{ servicePublicIPAddress: localhostServicePublicIPAddress, servicePrivateIPAddress: localhostServicePrivateIPAddress, servicePort: localhostServicePort }] // 在全局变量中存储 API 信息
				ctx.state.__HEARTBEAT_DB_SHARD_LIST__ = urlHeartbeatDatabaseShardData2Array(heartbeatDatabaseShardData) // 将URL中的心跳数据库字符数组转为对象数组，并存储到全局变量
				// DELETE
				console.log('__HEARTBEAT_DB_SHARD_LIST__', ctx.state.__HEARTBEAT_DB_SHARD_LIST__) // DELETE
				// DELETE
				if (ctx.state.__HEARTBEAT_DB_SHARD_LIST__) {
					createOrMergeHeartBeatDatabaseConnectByDatabaseInfo(ctx.state.__HEARTBEAT_DB_SHARD_LIST__, ctx).then(async (connects: mongoDBConnectType[]) => { // 连接到心跳数据库，回调结果是数据库连接(asPromise)
						ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__ = connects
						// DELETE
						console.log('__HEARTBEAT_DB_SHARD_CONNECT_LIST__', ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__) // DELETE
						// DELETE
						const heartBeatDataBaseConnects = ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__

						const administratorDataSchema = { userName: String, password: String } // 数据 schema
						const administratorData: adminUserType[] = [{ userName: systemAdminUserName, password: adminPassword }] // 数据
						const administratorCollectionName: string = 'administrator' // 集合名
						const saveAdministratorDataStatus = await saveData2MongoDBShard<typeof administratorDataSchema>(heartBeatDataBaseConnects, administratorDataSchema, administratorData, administratorCollectionName) // 向 所有心跳数据库的 administrator 集合广播 管理用户，密码

						const serviceCollectionName: string = 'service'

						const localhostAPIserviceDataSchema = {
							publicIPAddress: String,
							privateIPAddress: String,
							port: Number,
							serviceType: { type: String, default: 'api' },
							shardGroup: { type: Number, default: 0 },
							identity: String,
							state: { type: String, default: 'up' },
							editDateTime: Number,
						}
						const localhostAPIServiceData: serviceInfoType[] = [{
							publicIPAddress: localhostServicePublicIPAddress,
							privateIPAddress: localhostServicePrivateIPAddress,
							port: parseInt(localhostServicePort, 10),
							serviceType: 'api',
							shardGroup: 0,
							identity: 'master',
							state: 'up',
							editDateTime: new Date().getTime(),
						}]
						const saveAPIServiceDataStatus = await saveData2MongoDBShard<typeof localhostAPIserviceDataSchema>(heartBeatDataBaseConnects, localhostAPIserviceDataSchema, localhostAPIServiceData, serviceCollectionName) // 向 所有心跳数据库的 service 集合广播 本机 API server 信息

						const heartBeatDataBaseShardListDataSchema = {
							publicIPAddress: String,
							privateIPAddress: String,
							port: Number,
							adminAccountName: String,
							adminPasswordBase64Base64: String,
							serviceType: { type: String, default: 'api' },
							shardGroup: { type: Number, default: 0 },
							identity: String,
							state: { type: String, default: 'up' },
							editDateTime: Number,
						}
						const heartBeatDataBaseShardListData = ctx.state.__HEARTBEAT_DB_SHARD_LIST__
						const saveHeartBeatDataBaseShardListDataStatus = await saveData2MongoDBShard<typeof heartBeatDataBaseShardListDataSchema>(heartBeatDataBaseConnects, heartBeatDataBaseShardListDataSchema, heartBeatDataBaseShardListData, serviceCollectionName) // 向 所有心跳数据库的 service 集合广播 心跳数据库 信息

						if (saveAdministratorDataStatus && saveAPIServiceDataStatus && saveHeartBeatDataBaseShardListDataStatus) { // 如果向所有心跳数据库广播的：集群管理员信息、本地serviceAPI信息、心跳数据库信息 全部完成
							console.log('save success')
							resolve({ state: false, callbackMessage: '<p>success</p>' })
							// TODO
						} else {
							console.log('save failed')
							// TODO
						}
					})
				}
				

				// DONE 验证一次性身份验证密钥
				// DONE 将API信息，心跳数据库信息和分片信息写入全局变量
				// DONE 处理 heartbeatDatabaseShardData 并将其存入环境变量 __HEARTBEAT_DB_SHARD_LIST__
				// DONE 判断 __HEARTBEAT_DB_SHARD_LIST__ 是否为空，如果不是，那这些信息去创建数据库连接并保存连接
				// DONE 判断 __HEARTBEAT_DB_SHARD_CONNECT_LIST__ 是否为空，如果不是，向每一个心跳数据库分片广播 集群管理用户，密码、API信息，心跳数据库信息 (向 administrator 集合广播 管理用户，密码，向 service 集合广播 本机 API server 信息，向 service 集合广播 心跳数据库 信息)
				// TODO 中断 5s
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
// 将 集群管理用户，密码 转发给每一个心跳数据库分片
// 将 API 信息，心跳数据库信息和分片信息转发给每一个心跳数据库分片
// 暂停 5s
// 启动心跳：读取全局变量，每 1s 请求任意一个心跳数据库，使用请求得到的数据覆写全局变量
// 销毁 一次性身份验证密钥



// IDEA // TODO 查找时，先随机去一个数据库分片检索，如果没找到，则去主分片读取，如果读取不到则证明没这条数据
