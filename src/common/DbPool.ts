import mongoose from 'mongoose'
import { koaCtx } from '../type'
import { mongoDBConnectType, serviceInfoType } from '../type/AdminType'
import { base64ToStr } from './Base64Gen'

/**
 * 根据资源信息，异步创建或 merge 数据库连接并返回
 * @param databaseInfos 数据库连接信息
 * @param ctx koa 上下文
 */
export const createOrMergeDatabaseConnectByDatabaseInfo = (databaseInfos: serviceInfoType[], ctx: koaCtx): Promise<unknown> => {
	return new Promise<mongoDBConnectType[]>((resolve, reject) => {
		const databaseConnectPromise: Promise<unknown>[] = []
		databaseInfos.forEach((databaseInfo: serviceInfoType) => {
			const mongoConnectPromise = new Promise<mongoDBConnectType>((resolve, reject) => {
				const databaseConnectString = `mongodb://${databaseInfo.adminAccountName}:${base64ToStr(base64ToStr(databaseInfo.adminPasswordBase64Base64))}@${databaseInfo.privateIPAddress}:${databaseInfo.port}/heartbeat?authSource=admin`
				const mongoConnect = mongoose.createConnection(databaseConnectString)
				
				mongoConnect.on('connected', (err: unknown) => {
					if (err) {
						reject({
							connect: err,
							connectStatus: 'error',
							connectInfo: databaseInfo,
						} as mongoDBConnectType)
					} else {
						resolve({
							connect: mongoConnect,
							connectStatus: 'ok',
							connectInfo: databaseInfo,
						} as mongoDBConnectType)
					}
				})
			})
			databaseConnectPromise.push(mongoConnectPromise)
		})
	
		const __HEARTBEAT_DB_SHARD_CONNECT_LIST__: mongoDBConnectType[] = ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__ || []
		Promise.all(databaseConnectPromise).then((connects: mongoDBConnectType[]) => {
			// 去重并连接现有两个数组
			// 去除状态是 error 的对象

			// console.log('connects in promise', connects)

			const allAvailableConnects: mongoDBConnectType[] = connects.concat(__HEARTBEAT_DB_SHARD_CONNECT_LIST__.filter((oldConnect: mongoDBConnectType) => {
				return !connects.every((newConnect: mongoDBConnectType) => (newConnect.connectInfo.privateIPAddress === oldConnect.connectInfo.privateIPAddress || newConnect.connectInfo.publicIPAddress === oldConnect.connectInfo.publicIPAddress) && newConnect.connectInfo.port === oldConnect.connectInfo.port)
			})).filter((mergedConnect: mongoDBConnectType) => mergedConnect.connectStatus !== 'error')
	
			if (allAvailableConnects.length > 0) {
				resolve(allAvailableConnects)
			} else {
				reject(allAvailableConnects)
			}
		})
	})
}
