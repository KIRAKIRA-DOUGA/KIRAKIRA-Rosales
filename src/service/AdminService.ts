import { callErrorMessage } from '../common/CallErrorMessage'
import { adminCheckStates, initEnvType, serviceInitState, mongoServiceInfoType, nodeServiceInfoType, mongoDBConnectType, adminUserType } from '../type/AdminType'
import { createOrMergeHeartBeatDatabaseConnectByDatabaseInfo, saveData2MongoDBShard, saveDataArray2MongoDBShard } from '../common/DbPool'
import { sleep } from '../common/Sleep'
import { GlobalSingleton } from '../store/index'

const globalSingleton = GlobalSingleton.getInstance()


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
const urlHeartbeatDatabaseShardData2Array = (heartbeatDatabaseShardDataList: string[]): mongoServiceInfoType[] => {
	const formatHeartbeatDatabaseShardData: mongoServiceInfoType[] = [] as mongoServiceInfoType[]

	heartbeatDatabaseShardDataList.forEach((heartbeatDatabaseShardData: string) => {
		const heartbeatDatabaseShardDataArray = heartbeatDatabaseShardData.split(':') // WARN 切割字符串，看起来不太妙...

		if (heartbeatDatabaseShardDataArray[0] && heartbeatDatabaseShardDataArray[2] && heartbeatDatabaseShardDataArray[3] && heartbeatDatabaseShardDataArray[4] && heartbeatDatabaseShardDataArray[5] && heartbeatDatabaseShardDataArray[6]) {
			if (heartbeatDatabaseShardDataArray[6] === 'master' || heartbeatDatabaseShardDataArray[6] === 'servant') {
				const heartbeatDatabaseShardDataObject: mongoServiceInfoType = {
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
				console.error('初始化失败，获取心跳数据库数据时，服务类型既不是主，也不是从')
				// TODO 添加错误处理
			}
		} else {
			console.error('初始化失败，获取心跳数据库数据时，必要的参数不全')
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
export const initService = (ONE_TIME_SECRET_KEY: string, initEnvs: initEnvType): Promise<serviceInitState> => {
	return new Promise<serviceInitState>((resolve, reject) => {
		const adminOneTimeSecretKeyCheckResult: adminCheckStates = checkOneTimeSecretKey(ONE_TIME_SECRET_KEY, initEnvs.userSendSecretKey) // 验证一次性密钥是否正确
		if (adminOneTimeSecretKeyCheckResult.state) { // 如果一次性密钥正确，则继续
			const allInitEnvRight = checkInitEnvs(initEnvs) // 验证必要的初始化变量是否有空
			if (allInitEnvRight) { // 如果验证通过
				const { systemAdminUserName, adminPassword, localhostServicePublicIPAddress, localhostServicePrivateIPAddress, localhostServicePort, heartbeatDatabaseShardData } = initEnvs // 玩的就是解构，不解构你就不酷了
				
				globalSingleton.setVariable<nodeServiceInfoType[]>('__API_SERVER_LIST__', [{ publicIPAddress: localhostServicePublicIPAddress, privateIPAddress: localhostServicePrivateIPAddress, port: parseInt(localhostServicePort, 10), state: 'up', editDateTime: new Date().getTime() }]) // 在全局变量中存储 API 信息
				globalSingleton.setVariable<mongoServiceInfoType[]>('__HEARTBEAT_DB_SHARD_LIST__', urlHeartbeatDatabaseShardData2Array(heartbeatDatabaseShardData)) // 将URL中的心跳数据库字符数组转为对象数组，并存储到全局变量
				
				const heartBeatDBShardList: mongoServiceInfoType[] = globalSingleton.getVariable<mongoServiceInfoType[]>('__HEARTBEAT_DB_SHARD_LIST__')
				if (heartBeatDBShardList) {
					createOrMergeHeartBeatDatabaseConnectByDatabaseInfo(heartBeatDBShardList).then(async (heartBeatDataBaseConnects: mongoDBConnectType[]) => { // 连接到心跳数据库，回调结果是数据库连接(asPromise)
						globalSingleton.setVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__', heartBeatDataBaseConnects) // 将链接存储到全局变量
				
						const administratorDataSchema = { userName: String, password: String } // 数据 schema
						const administratorData: adminUserType[] = [{ userName: systemAdminUserName, password: adminPassword }] // 数据
						const administratorCollectionName: string = 'administrator' // 集合名
						const saveAdministratorDataStatus = await saveDataArray2MongoDBShard<typeof administratorDataSchema>(heartBeatDataBaseConnects, administratorDataSchema, administratorData, administratorCollectionName) // 向 所有心跳数据库的 administrator 集合广播 管理用户，密码

						const serviceCollectionName: string = 'service'

						const localhostAPIserviceDataSchema = {
							publicIPAddress: String,
							privateIPAddress: String,
							port: Number,
							state: { type: String, default: 'up' },
							editDateTime: Number,
						}
						const localhostAPIServiceData: nodeServiceInfoType[] = [{
							publicIPAddress: localhostServicePublicIPAddress,
							privateIPAddress: localhostServicePrivateIPAddress,
							port: parseInt(localhostServicePort, 10),
							state: 'up',
							editDateTime: new Date().getTime(),
						}]
						const saveAPIServiceDataStatus = await saveDataArray2MongoDBShard<typeof localhostAPIserviceDataSchema>(heartBeatDataBaseConnects, localhostAPIserviceDataSchema, localhostAPIServiceData, serviceCollectionName) // 向 所有心跳数据库的 service 集合广播 本机 API server 信息

						const heartBeatDataBaseShardListDataSchema = {
							publicIPAddress: String,
							privateIPAddress: String,
							port: Number,
							adminAccountName: String,
							adminPassword: String,
							serviceType: { type: String, default: 'api' },
							shardGroup: { type: Number, default: 0 },
							identity: String,
							state: { type: String, default: 'up' },
							editDateTime: Number,
						}
						const saveHeartBeatDataBaseShardListDataStatus = await saveDataArray2MongoDBShard<typeof heartBeatDataBaseShardListDataSchema>(heartBeatDataBaseConnects, heartBeatDataBaseShardListDataSchema, heartBeatDBShardList, serviceCollectionName) // 向 所有心跳数据库的 service 集合广播 心跳数据库 信息

						if (saveAdministratorDataStatus && saveAPIServiceDataStatus && saveHeartBeatDataBaseShardListDataStatus) { // 如果向所有心跳数据库广播的：集群管理员信息、本地serviceAPI信息、心跳数据库信息 全部完成
							await sleep(3000)
							
							startHeartBeat(5000)

							resolve({ state: true, callbackMessage: '<p>success</p>' })
							// TODO
						} else {
							reject({ state: false, callbackMessage: '<p>初始化失败，插入数据时出现错误</p>' })
							// TODO 插入数据失败，要怎么做？要不要删除？ (大概率时不用)
						}
					}).catch(() => {
						reject({ state: false, callbackMessage: '<p>初始化失败，根据输入的数据库信息创建心跳数据库连接时陷入困境</p>' })
					})
				}
				

				// DONE 验证一次性身份验证密钥
				// DONE 将API信息，心跳数据库信息和分片信息写入全局变量
				// DONE 处理 heartbeatDatabaseShardData 并将其存入环境变量 __HEARTBEAT_DB_SHARD_LIST__
				// DONE 判断 __HEARTBEAT_DB_SHARD_LIST__ 是否为空，如果不是，那这些信息去创建数据库连接并保存连接
				// DONE 判断 __HEARTBEAT_DB_SHARD_CONNECT_LIST__ 是否为空，如果不是，向每一个心跳数据库分片广播 集群管理用户，密码、API信息，心跳数据库信息 (向 administrator 集合广播 管理用户，密码，向 service 集合广播 本机 API server 信息，向 service 集合广播 心跳数据库 信息)
				// DONE 睡眠 3s
				// TODO 每隔 1s 随机去一个心跳数据库分片中获取 API信息列表 和 心跳数据库分片列表，并覆写全局变量
				// TODO 启动健康检测
				// TODO 销毁 一次性身份验证密钥
			}
		}
	})
}

// TODO
// 验证一次性身份验证密钥
// 将API信息，心跳数据库信息和分片信息写入全局变量
// 将 集群管理用户，密码 转发给每一个心跳数据库分片
// 将 API 信息，心跳数据库信息和分片信息转发给每一个心跳数据库分片
// 暂停 3s
// 启动心跳：读取全局变量，每 1s 请求任意一个心跳数据库，使用请求得到的数据覆写全局变量
// 销毁 一次性身份验证密钥



/**
 * 开始心跳检测
 * @param ms 每次心跳的毫秒数
 */
const startHeartBeat = (ms: number) => {
	// TODO 获取本地缓存的服务器列表
	// TODO 对于 MongoDB 执行 checkMongoDB, 对于 API 执行 checkAPI
	// TODO 将无效的设为 down 并广播
	// TODO 将本地的 __API_SERVER_LIST__ 和 __HEARTBEAT_DB_SHARD_LIST__ 更新到最新
	setInterval(async () => {
		const nodeService: nodeServiceInfoType[] | undefined = globalSingleton.getVariable<nodeServiceInfoType[]>('__API_SERVER_LIST__')
		const heartBeatDBShardList: mongoServiceInfoType[] = globalSingleton.getVariable<mongoServiceInfoType[]>('__HEARTBEAT_DB_SHARD_LIST__')
		
		if (nodeService && heartBeatDBShardList && nodeService.length !== 0 && heartBeatDBShardList.length !== 0) {
			const trueHeartBeatDBShardList = heartBeatDBShardList.filter(heartBeatDBShard => heartBeatDBShard.serviceType === 'heartbeat')
			await console.log('lest:', nodeService, trueHeartBeatDBShardList) // DELETE
		}
	}, ms)
}



// IDEA // TODO 查找时，先去目标分片组中随机一个数据库分片检索，如果没找到，则去主分片读取，如果读取不到则证明没这条数据
