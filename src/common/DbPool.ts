import mongoose, { Schema } from 'mongoose'
import { koaCtx } from '../type'
import { mongoDBConnectType, serviceInfoType } from '../type/AdminType'
import { base64ToStr } from './Base64Gen'

/**
 * 根据资源信息，异步创建或 merge 数据库连接并返回
 * @param databaseInfos 数据库连接信息
 * @param ctx koa 上下文
 * @param databaseName 要连接的数据库名
 */
export const createOrMergeHeartBeatDatabaseConnectByDatabaseInfo = (databaseInfos: serviceInfoType[], ctx: koaCtx): Promise<mongoDBConnectType[]> => {
	return new Promise<mongoDBConnectType[]>((resolve, reject) => {
		const databaseConnectPromise: Promise<mongoDBConnectType>[] = []
		databaseInfos.forEach((databaseInfo: serviceInfoType) => {
			const mongoConnectPromise = new Promise<mongoDBConnectType>((resolve, reject) => {
				const databaseConnectString = `mongodb://${databaseInfo.adminAccountName}:${base64ToStr(base64ToStr(databaseInfo.adminPasswordBase64Base64))}@${databaseInfo.privateIPAddress}:${databaseInfo.port}/heart_base?authSource=admin`
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


// 数据库连接、数据的类型、数据
/**
 * 数据的类型：
 * type dataTypeType = Record<string, 'string' | 'number' | ''>
 * const dataType = {
 * 	a: 'string'
 * }
 * */

// export const broadcastData2MongoDB = (mongoDBConnects: mongoDBConnectType[], databaseName: string, collection: string, data: object): Promise<boolean> => {
// 	return new Promise<boolean>((resolve, reject) => {

// 	})
// }

// export const saveData2MongoDBShard = <T>(mongoDBConnects: mongoDBConnectType[], schema: Schema, data: T[]): Promise<boolean> => {
// 	// data[0] as schemaType

// 	// const testSchema = new Schema(T)

// 	const heartBeat = mongoDBConnects[0].connect.model('heart', schema)
// 	const entity = new heartBeat(data[0])
// 	entity.save()

// 	return new Promise<boolean>((resolve, reject) => {
// 		resolve(true)
// 	})
// }




// function bbb<U>(mongoDBConnects: mongoDBConnectType[], schemaObject: object, data: U[]): Promise<boolean> {
// 	const schema = new Schema(schemaObject)

// 	return new Promise<boolean>((resolve, reject) => {
// 		resolve(true)
// 	})
// }








export type schemaType = Record<string, unknown>

type constructor2Type<T> =
	T extends DateConstructor ? Date :
		T extends BufferConstructor ? Buffer :
			T extends { (): infer V } ? V :
				T extends { type: infer V } ? constructor2Type<V> :
					T extends never[] ? unknown[] :
						T extends object ? getTsTypeFromSchemaType<T> : T

export type getTsTypeFromSchemaType<T> = {
	[key in keyof T]: constructor2Type<T[key]>;
}

export const saveData2MongoDBShard = <T>(mongoDBConnects: mongoDBConnectType[], schema: schemaType, data: T[]): Promise<boolean> => {
	return new Promise<boolean>((resolve, reject) => {
		resolve(true)
	})
}
