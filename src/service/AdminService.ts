import { callErrorMessage } from '../common/CallErrorMessage'
import { serverTypeType, adminCheckStates, initEnvType, serviceInitState, mongoServiceInfoType, nodeServiceInfoType, mongoDBConnectType, adminUserType, getTsTypeFromSchemaType, nodeServiceTestResultType } from '../type/AdminType'
import { createDatabaseConnectByDatabaseInfo, createOrMergeHeartBeatDatabaseConnectByDatabaseInfo, getDataFromAllMongoDBShardAndDuplicate, saveData2MongoDBShard, saveDataArray2MongoDBShard } from '../common/DbPool'
import { sleep } from '../common/Sleep'
import { GlobalSingleton } from '../store/index'
import { mergeAndDeduplicateObjectArrays } from '../common/ArrayTool'
import axios from 'axios'

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
				
				globalSingleton.setVariable<nodeServiceInfoType[]>('__API_SERVER_LIST__', [{ publicIPAddress: localhostServicePublicIPAddress, privateIPAddress: localhostServicePrivateIPAddress, port: parseInt(localhostServicePort, 10), serviceType: 'api', state: 'up', editDateTime: new Date().getTime() }]) // 在全局变量中存储 API 信息
				globalSingleton.setVariable<mongoServiceInfoType[]>('__HEARTBEAT_DB_SHARD_LIST__', urlHeartbeatDatabaseShardData2Array(heartbeatDatabaseShardData)) // 将URL中的心跳数据库字符数组转为对象数组，并存储到全局变量
				
				const heartBeatDBShardList: mongoServiceInfoType[] = globalSingleton.getVariable<mongoServiceInfoType[]>('__HEARTBEAT_DB_SHARD_LIST__')
				if (heartBeatDBShardList) {
					createOrMergeHeartBeatDatabaseConnectByDatabaseInfo(heartBeatDBShardList).then(async (heartBeatDataBaseConnects: mongoDBConnectType[]) => { // 连接到心跳数据库，回调结果是数据库连接(asPromise)
						globalSingleton.setVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__', heartBeatDataBaseConnects) // 将连接存储到全局变量
				
						const administratorDataSchema = { userName: String, password: String } // 数据 schema
						const administratorData: adminUserType[] = [{ userName: systemAdminUserName, password: adminPassword }] // 数据
						const administratorCollectionName: string = 'administrator' // 集合名
						const saveAdministratorDataStatus = await saveDataArray2MongoDBShard<typeof administratorDataSchema>(heartBeatDataBaseConnects, administratorCollectionName, administratorDataSchema, administratorData) // 向 所有心跳数据库的 administrator 集合广播 管理用户，密码

						const serviceCollectionName: string = 'service'
						const localhostAPIserviceDataSchema = {
							publicIPAddress: String,
							privateIPAddress: String,
							port: Number,
							serviceType: String,
							state: { type: String, default: 'up' },
							editDateTime: Number,
						}
						const localhostAPIServiceData: nodeServiceInfoType[] = [{
							publicIPAddress: localhostServicePublicIPAddress,
							privateIPAddress: localhostServicePrivateIPAddress,
							port: parseInt(localhostServicePort, 10),
							serviceType: 'api',
							state: 'up',
							editDateTime: new Date().getTime(),
						}]
						const saveAPIServiceDataStatus = await saveDataArray2MongoDBShard<typeof localhostAPIserviceDataSchema>(heartBeatDataBaseConnects, serviceCollectionName, localhostAPIserviceDataSchema, localhostAPIServiceData) // 向 所有心跳数据库的 service 集合广播 本机 API server 信息

						const heartBeatDataBaseShardListDataSchema = {
							publicIPAddress: String,
							privateIPAddress: String,
							port: Number,
							adminAccountName: String,
							adminPassword: String,
							serviceType: { type: String, default: 'heartbeat' },
							shardGroup: { type: Number, default: 0 },
							identity: String,
							state: { type: String, default: 'up' },
							editDateTime: Number,
						}
						const saveHeartBeatDataBaseShardListDataStatus = await saveDataArray2MongoDBShard<typeof heartBeatDataBaseShardListDataSchema>(heartBeatDataBaseConnects, serviceCollectionName, heartBeatDataBaseShardListDataSchema, heartBeatDBShardList) // 向 所有心跳数据库的 service 集合广播 心跳数据库 信息

						console.log('saveAdministratorDataStatus', saveAdministratorDataStatus) // DELETE
						console.log('saveAPIServiceDataStatus', saveAPIServiceDataStatus) // DELETE
						console.log('saveHeartBeatDataBaseShardListDataStatus', saveHeartBeatDataBaseShardListDataStatus) // DELETE
						if (saveAdministratorDataStatus && saveAPIServiceDataStatus && saveHeartBeatDataBaseShardListDataStatus) { // 如果向所有心跳数据库广播的：集群管理员信息、本地serviceAPI信息、心跳数据库信息 全部完成
							await sleep(3000)
							
							// startHeartBeat(60000) // 每分钟就执行一次心跳检测 // WARN 现在还没启动心跳，如需启用，请取消注释

							resolve({ state: true, callbackMessage: '<p>success</p>' })
							// TODO
						} else {
							console.error('初始化失败，插入数据时出现错误')
							reject({ state: false, callbackMessage: '<p>初始化失败，插入数据时出现错误</p>' })
							// TODO 插入数据失败，要怎么做？要不要删除？ (大概率不用)
						}
					}).catch(() => {
						console.error('初始化失败，根据输入的数据库信息创建心跳数据库连接时陷入困境')
						reject({ state: false, callbackMessage: '<p>初始化失败，根据输入的数据库信息创建心跳数据库连接时陷入困境</p>' })
					})
				}
				

				// DONE 验证一次性身份验证密钥
				// DONE 将API信息，心跳数据库信息和分片信息写入全局变量
				// DONE 处理 heartbeatDatabaseShardData 并将其存入环境变量 __HEARTBEAT_DB_SHARD_LIST__
				// DONE 判断 __HEARTBEAT_DB_SHARD_LIST__ 是否为空，如果不是，那这些信息去创建数据库连接并保存连接
				// DONE 判断 __HEARTBEAT_DB_SHARD_CONNECT_LIST__ 是否为空，如果不是，向每一个心跳数据库分片广播 集群管理用户，密码、API信息，心跳数据库信息 (向 administrator 集合广播 管理用户，密码，向 service 集合广播 本机 API server 信息，向 service 集合广播 心跳数据库 信息)
				// DONE 睡眠 3s
				// TODO 启动心跳（健康检测）
				// DONE 销毁 一次性身份验证密钥
			} else {
				console.error('初始化失败, initEnvs 检查未通过')
				resolve({ state: false, callbackMessage: '<p>initEnvs 检查未通过</p>' })
			}
		} else {
			console.error(`初始化失败，${adminOneTimeSecretKeyCheckResult.callbackMessage}`)
			resolve({ state: false, callbackMessage: adminOneTimeSecretKeyCheckResult.callbackMessage })
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
	// TODO 对于存放数据的 MongoDB 执行 checkMongoDB, 对于 API 执行 checkAPI，对于心跳 MongoDB 执行 checkHeartBeatMongoDB
	// TODO 将本地的 __API_SERVER_LIST__ 和 __HEARTBEAT_DB_SHARD_LIST__ 更新到最新
	// TODO 将无效的报告
	setInterval(async () => {
		await Promise.all([checkAPI(), checkMongoDB(), checkHeartBeatMongoDB()]) // 心跳测试
	}, ms)
}

/**
 *
 * 检查 Node 的情况
 *
 * @returns void
 */
export const checkAPI = async () => {
	const oldApiServerList = globalSingleton.getVariable<nodeServiceInfoType[]>('__API_SERVER_LIST__')
	const newApiServerList = await getActiveAPIServerInfo()
	if (oldApiServerList || newApiServerList) {
		const checkAPIServerPromiseList: Promise<nodeServiceTestResultType>[] = []
		newApiServerList.forEach(apiServer => {
			const checkAPIServerPromise = new Promise<nodeServiceTestResultType>(resolve => {
				const targetIpAddress = apiServer.privateIPAddress || apiServer.publicIPAddress
				const targetPort = apiServer.port
				if (targetIpAddress && targetPort) {
					const requestURL = `http://${targetIpAddress}:${targetPort}/02/koa/admin/heartbeat/test`
					axios.get(requestURL).then(result => {
						if (result) {
							const testResult: nodeServiceTestResultType = { nodeServiceInfo: apiServer, testResult: true }
							resolve(testResult)
						}
					}).catch(error => {
						// Report // TODO
						console.error('something error in function checkAPI -> checkAPIServerPromise -> axios.get -> catch, error: ', error)
						const testResult: nodeServiceTestResultType = { nodeServiceInfo: apiServer, testResult: false }
						resolve(testResult)
					})
				} else {
					// Report // TODO
					console.error('something error in function checkAPI -> checkAPIServerPromise, required data targetIpAddress or targetPort is empty')
					const testResult: nodeServiceTestResultType = { nodeServiceInfo: apiServer, testResult: false }
					resolve(testResult)
				}
			})
			checkAPIServerPromiseList.push(checkAPIServerPromise)
		})

		const checkAPIResults = await Promise.all(checkAPIServerPromiseList)
		const someApiCheckREsultIsFalse = checkAPIResults.some(result => !result.testResult)
		if (someApiCheckREsultIsFalse) {
			// Report // TODO
			console.error('something error in function checkAPI, someApiCheckREsultIsFalse')
		}
		const correctAPIServer: nodeServiceInfoType[] = []
		
		checkAPIResults.forEach(result => {
			if (result.testResult) {
				return correctAPIServer.push(result.nodeServiceInfo)
			}
		})

		globalSingleton.setVariable<nodeServiceInfoType[]>('__API_SERVER_LIST__', correctAPIServer)

		// DONE 去 heartbeat 数据库的 service 集合中寻找 node API 的连接信息
		// DONE 向 nodeAPI 发送网络请求
		// DONE 请求成功, API 信息追加到全局变量中（如果以前不存在）
		// TODO 请求失败，在 heartbeat 数据库的 report 集合中报告（广播）连接失败, API 信息从全局变量中删除
		return
	} else {
		// Report // TODO
		console.error('something error in function checkAPI, required data oldApiServerList is empty')
		return
	}
}

/**
 *
 * 检查 MongoDB 心跳数据库的情况
 *
 * @returns void
 */
export const checkHeartBeatMongoDB = async () => {
	const activeHeartBeatMongoDBShardInfo = await getActiveHeartBeatMongoDBShardInfo()
	const oldHeartBeatMongoDBShardList = globalSingleton.getVariable<mongoServiceInfoType[]>('__HEARTBEAT_DB_SHARD_LIST__')
	if (activeHeartBeatMongoDBShardInfo || oldHeartBeatMongoDBShardList) {
		const newHeartBeatMongoDBShardList = mergeAndDeduplicateObjectArrays<mongoServiceInfoType>(oldHeartBeatMongoDBShardList, activeHeartBeatMongoDBShardInfo as mongoServiceInfoType[])
		const connects = await createDatabaseConnectByDatabaseInfo(newHeartBeatMongoDBShardList, 'kirakira')
		const oldHeartBeatMongoDBShardConnectList = globalSingleton.getVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__') // 拿到旧连接
		const correctHeartBeatMongoDBShardConnectList = correctMergeNewMongoDBConnect(oldHeartBeatMongoDBShardConnectList, connects)
		globalSingleton.setVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__', correctHeartBeatMongoDBShardConnectList)
	
		const correctHeartBeatMongoShardDBList = correctHeartBeatMongoDBShardConnectList.reduce((accumulator: mongoServiceInfoType[], currentValue: mongoDBConnectType) => {
			accumulator.push(currentValue.connectInfo)
			return accumulator
		}, [] as mongoServiceInfoType[])
		globalSingleton.setVariable<mongoServiceInfoType[]>('__HEARTBEAT_DB_SHARD_LIST__', correctHeartBeatMongoShardDBList)

		const haveBrokenConnects = connects.filter(connect => connect.connectStatus !== 'ok').length >= 0
		if (haveBrokenConnects) {
		// Report // TODO
		}
		return
	} else {
		// Report // TODO 这个 node 一个可用的 HeartBeat 数据库连接都没有了，当然要上报
		console.error('something error in function checkHeartBeatMongoDB, required data activeHeartBeatMongoDBShardInfo and oldHeartBeatMongoDBShardList is empty')
		return
	}
	
	// DONE 去 heartbeat 数据库的 service 集合中寻找状态为 up 的 heartbeat 的连接信息
	// DONE 获取以前的心跳数据库连接信息，并且于刚刚获取的信息去重并 Merge，使用 Merge 后的连接列表创建
	// DONE 连接成功，新创建的连接覆写全局变量
	// TODO 连接失败，在 heartbeat 数据库的 report 集合中报告（广播）连接失败, 如果这个失败的连接在全局变量中存在，则把这个连接从全局变量中删除
}

/**
 *
 * 检查 MongoDB 的情况
 *
 * @returns void
 */
export const checkMongoDB = async () => {
	const activeMongoDBShardInfo = await getActiveMongoDBShardInfo()
	const oldMongoDBShardList = globalSingleton.getVariable<mongoServiceInfoType[]>('__MONGO_DB_SHARD_LIST__')
	if (activeMongoDBShardInfo || oldMongoDBShardList) {
		const newMongoDBShardList = mergeAndDeduplicateObjectArrays<mongoServiceInfoType>(oldMongoDBShardList, activeMongoDBShardInfo as mongoServiceInfoType[])

		const connects = await createDatabaseConnectByDatabaseInfo(newMongoDBShardList, 'kirakira')

		const oldMongoDBShardConnectList = globalSingleton.getVariable<mongoDBConnectType[]>('__MONGO_DB_SHARD_CONNECT_LIST__') // 拿到旧连接
		const correctMongoDBShardConnectList = correctMergeNewMongoDBConnect(oldMongoDBShardConnectList, connects)
		globalSingleton.setVariable<mongoDBConnectType[]>('__MONGO_DB_SHARD_CONNECT_LIST__', correctMongoDBShardConnectList)
	
		const correctMongoShardDBList = correctMongoDBShardConnectList.reduce((accumulator: mongoServiceInfoType[], currentValue: mongoDBConnectType) => {
			accumulator.push(currentValue.connectInfo)
			return accumulator
		}, [] as mongoServiceInfoType[])
		globalSingleton.setVariable<mongoServiceInfoType[]>('__MONGO_DB_SHARD_LIST__', correctMongoShardDBList)
		const haveBrokenConnects = connects.filter(connect => connect.connectStatus !== 'ok').length >= 0
		if (haveBrokenConnects) {
		// Report // TODO
		}
		return
	} else {
		// Report // TODO 这个 node 一个可用的 MongoDB 数据库连接都没有了，当然要上报
		console.error('something error in function checkMongoDB, required data activeMongoDBShardInfo and oldMongoDBShardList is empty')
		return
	}
	// DONE 去 heartbeat 数据库的 service 集合中寻找状态为 up 的 mongodb 的连接信息 // __MONGO_DB_SHARD_LIST__ MongoDB 数据库连接信息
	// DONE 根据连接信息，去全局变量中找有没有相同的 connect 信息，如果没有，就创建，如果有，就拿来用 // __MONGO_DB_SHARD_CONNECT_LIST__ MongoDB 数据库连接
	// DONE 连接成功，新创建的连接追加到全局变量中（如果以前不存在）
	// TODO 连接失败，在 heartbeat 数据库的 report 集合中报告（广播）连接失败, 如果这个失败的连接在全局变量中存在，则把这个连接从全局变量中删除
}

/**
 * 正确合并新创建的连接和环境变量中以前的连接
 * BY: 02
 *
 * @param connects 新的连接
 * @returns 合并后的连接
 */
const correctMergeNewMongoDBConnect = (oldConnects: mongoDBConnectType[], newConnects: mongoDBConnectType[]): mongoDBConnectType[] => {
	try {
		if (oldConnects === undefined || oldConnects === null) {
			oldConnects = [] // ??? is this right? 这么写真的没问题吗？
		}

		if (newConnects === undefined || newConnects === null) {
			newConnects = [] // ??? is this right? 这么写真的没问题吗？
		}

		const newBrokenMongoDBShardConnectList = newConnects.filter(connect => connect.connectStatus !== 'ok') // 新的但是坏连接
		const newRightMongoDBShardConnectList = newConnects.filter(connect => connect.connectStatus === 'ok') // 新的好连接

		// 旧连接 对于 新的但是坏连接 的交集 (在最新一次检测中得到的 旧连接 中的 坏连接)
		const oldConnectListButInNewBroken = oldConnects.filter(oldConnect => {
			return newBrokenMongoDBShardConnectList.some(newBrokenConnect => {
				return newBrokenConnect.connectInfo.privateIPAddress === oldConnect.connectInfo.privateIPAddress || newBrokenConnect.connectInfo.publicIPAddress === oldConnect.connectInfo.publicIPAddress
			})
		})
	
		// 旧连接中已经被判定为坏连接的就直接 close 掉
		oldConnectListButInNewBroken.map(oldConnectButInNewBroken => oldConnectButInNewBroken.connect.close())
	
		// 旧连接 对于 新的但是坏连接 的差集 (删除 旧连接 中的 坏连接)
		const oldConnectListDeleteNewBroken = oldConnects.filter(oldConnect => {
			return !newBrokenMongoDBShardConnectList.some(newBrokenConnect => {
				return newBrokenConnect.connectInfo.privateIPAddress === oldConnect.connectInfo.privateIPAddress || newBrokenConnect.connectInfo.publicIPAddress === oldConnect.connectInfo.publicIPAddress
			})
		})
	
		// 新的好连接 对于 已删除坏连接的旧连接 的差集 (在 旧连接 中没出现过的 新的好连接)
		const newRightConnectButNeverFoundInOldConnect = newRightMongoDBShardConnectList.filter(newRightConnect => {
			return !oldConnectListDeleteNewBroken.some(oldConnectDeleteNewBroken => {
				return oldConnectDeleteNewBroken.connectInfo.privateIPAddress === newRightConnect.connectInfo.privateIPAddress || oldConnectDeleteNewBroken.connectInfo.publicIPAddress === newRightConnect.connectInfo.publicIPAddress
			})
		})
	
		// (在 旧连接 中没出现过的 新的好连接) 和 (没有坏连接的旧连接) 连接
		const correctHearBeatConnect = oldConnectListDeleteNewBroken.concat(newRightConnectButNeverFoundInOldConnect)
		return correctHearBeatConnect
	} catch (e) {
		console.error('something error in function correctMergeNewMongoDBConnect', e)
		return []
	}
}

/**
 * 去心跳数据库获取所有可用的 MongoDB 心跳数据库信息
 *
 * @returns 可用的心跳数据库信息
 */
export const getActiveHeartBeatMongoDBShardInfo = async (): Promise<getTsTypeFromSchemaType<typeof heartBeatDataBaseShardListDataSchema>[]> => {
	const heartBeatDBConnect: mongoDBConnectType[] = globalSingleton.getVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__')
	const collectionName = 'service'
	const heartBeatDataBaseShardListDataSchema = {
		publicIPAddress: String,
		privateIPAddress: String,
		port: Number,
		adminAccountName: String,
		adminPassword: String,
		serviceType: String,
		shardGroup: Number,
		identity: String,
		state: String,
		editDateTime: Number,
	}
	const conditions = { serviceType: 'heartbeat', state: 'up' }
	try {
		const mongoDBInfo = await getDataFromAllMongoDBShardAndDuplicate<typeof heartBeatDataBaseShardListDataSchema>(heartBeatDBConnect, collectionName, heartBeatDataBaseShardListDataSchema, conditions)
		return mongoDBInfo
	} catch {
		console.error('something error in function getActiveHeartBeatMongoDBShardInfo')
		return []
	}
}


/**
 * 去心跳数据库获取所有可用的 MongoDB 数据库信息
 *
 * @returns 可用的 MongoDB 数据库信息
 */
export const getActiveMongoDBShardInfo = async (): Promise<getTsTypeFromSchemaType<typeof heartBeatDataBaseShardListDataSchema>[]> => {
	const heartBeatDBConnect: mongoDBConnectType[] = globalSingleton.getVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__')
	const collectionName = 'service'
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
	const conditions = { serviceType: 'mongo', state: 'up' }
	try {
		const mongoDBInfo = await getDataFromAllMongoDBShardAndDuplicate<typeof heartBeatDataBaseShardListDataSchema>(heartBeatDBConnect, collectionName, heartBeatDataBaseShardListDataSchema, conditions)
		return mongoDBInfo
	} catch {
		console.error('something error in function getActiveMongoDBShardInfo')
		return []
	}
}


/**
 * 去心跳数据库获取所有可用的 API Server 信息
 *
 * @returns 可用的 API Server 信息
 */
export const getActiveAPIServerInfo = async (): Promise<getTsTypeFromSchemaType<typeof apiServiceDataSchema>[]> => {
	const heartBeatDBConnect: mongoDBConnectType[] = globalSingleton.getVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__')
	const collectionName = 'service'
	const apiServiceDataSchema = {
		publicIPAddress: String,
		privateIPAddress: String,
		port: Number,
		serviceType: String,
		state: String,
		editDateTime: Number,
	}
	const conditions = { serviceType: 'api', state: 'up' }
	try {
		const mongoDBInfo = await getDataFromAllMongoDBShardAndDuplicate<typeof apiServiceDataSchema>(heartBeatDBConnect, collectionName, apiServiceDataSchema, conditions)
		return mongoDBInfo
	} catch {
		console.error('something error in function getActiveAPIServerInfo')
		return []
	}
}



// IDEA // TODO 查找时，先去目标分片组中随机一个数据库分片检索，如果没找到，则去主分片读取，如果读取不到则证明没这条数据




/**
 *
 * 创建一个服务
 *
 * @param serviceInfo 服务的信息
 */
export const registerService2ClusterService = async (serviceInfo: unknown): Promise<boolean> => {
	try {
		if (serviceInfo) {
			if (typeof serviceInfo === 'object' && serviceInfo !== null && 'serviceType' in serviceInfo) {
				const serviceType = serviceInfo.serviceType as serverTypeType
				if (typeof serviceType === 'string') {
					if (serviceType === 'mongo') {
						return await registerMongoDBService2ClusterService(serviceInfo as mongoServiceInfoType)
					} else if (serviceType === 'api') {
						return await registerNodeService2ClusterService(serviceInfo as nodeServiceInfoType)
					} else {
						console.error('something error in function registerService2Cluster, required data serviceInfo.serviceType not a correct "serverTypeType"')
						return false
					}
				} else {
					console.error('something error in function registerService2Cluster, required data serviceInfo.serviceType not is string')
					return false
				}
				// 现在你可以安全地使用 serviceType
			} else {
				console.error('something error in function registerService2Cluster, required data serviceInfo.serviceType is empty')
				return false
			}
		} else {
			console.error('something error in function registerService2Cluster, required data serviceInfo is empty')
			return false
		}
	} catch (e) {
		console.error('something error in function registerService2Cluster', e)
		return false
	}
}


const registerMongoDBService2ClusterService = async (mongoServiceInfo: mongoServiceInfoType): Promise<boolean> => {
	try {
		const heartBeatDBConnect: mongoDBConnectType[] = globalSingleton.getVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__')
		if (heartBeatDBConnect) {
			const serviceCollectionName: string = 'service'
			const mongoDataBaseShardListDataSchema = {
				publicIPAddress: String,
				privateIPAddress: String,
				port: Number,
				adminAccountName: String,
				adminPassword: String,
				serviceType: { type: String, default: 'mongo' },
				shardGroup: { type: Number, default: 0 },
				identity: String,
				state: { type: String, default: 'up' },
				editDateTime: Number,
			}
			return await saveData2MongoDBShard<typeof mongoDataBaseShardListDataSchema>(heartBeatDBConnect, serviceCollectionName, mongoDataBaseShardListDataSchema, mongoServiceInfo)
		} else {
			console.error('something error in function registerMongoDBService2ClusterService, required data serviceInfo.serviceType is empty')
			return false
		}
	} catch (e) {
		console.error('something error in function registerMongoDBService2ClusterService', e)
		return false
	}
}

const registerNodeService2ClusterService = async (nodeServiceInfo: nodeServiceInfoType): Promise<boolean> => {
	try {
		const heartBeatDBConnect: mongoDBConnectType[] = globalSingleton.getVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__')
		if (heartBeatDBConnect) {
			const serviceCollectionName: string = 'service'
			const localhostAPIserviceDataSchema = {
				publicIPAddress: String,
				privateIPAddress: String,
				port: Number,
				serviceType: String,
				state: { type: String, default: 'up' },
				editDateTime: Number,
			}
			return await saveData2MongoDBShard<typeof localhostAPIserviceDataSchema>(heartBeatDBConnect, serviceCollectionName, localhostAPIserviceDataSchema, nodeServiceInfo)
		} else {
			console.error('something error in function registerNodeService2ClusterService, required data serviceInfo.serviceType is empty')
			return false
		}
	} catch (e) {
		console.error('something error in function registerNodeService2ClusterService', e)
		return false
	}
}
