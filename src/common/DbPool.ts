import mongoose, { Schema } from 'mongoose'
import { koaCtx } from '../type'
import { mongoDBConnectType, serviceInfoType } from '../type/AdminType'

// /**
//  * 根据资源信息，异步创建或 merge 心跳数据库连接并返回
//  * @param databaseInfos 数据库连接信息
//  * @param ctx koa 上下文
//  * @param databaseName 要连接的数据库名
//  */
// export const createOrMergeHeartBeatDatabaseConnectByDatabaseInfo = (databaseInfos: serviceInfoType[], ctx: koaCtx): Promise<mongoDBConnectType[]> => {
// 	return new Promise<mongoDBConnectType[]>((resolve, reject) => {
// 		// 创建连接部分
// 		const databaseConnectPromise: Promise<mongoDBConnectType>[] = []
// 		databaseInfos.forEach((databaseInfo: serviceInfoType) => {
// 			const mongoConnectPromise = new Promise<mongoDBConnectType>((resolve, reject) => {
// 				const databaseConnectString = `mongodb://${databaseInfo.adminAccountName}:${databaseInfo.adminPasswordBase64Base64}@${databaseInfo.privateIPAddress}:${databaseInfo.port}/heart_base?authSource=admin`
// 				const mongoConnect = mongoose.createConnection(databaseConnectString)
				
// 				mongoConnect.on('connected', (err: unknown) => {
// 					if (err) {
// 						reject({
// 							connect: err,
// 							connectStatus: 'error',
// 							connectInfo: databaseInfo,
// 						} as mongoDBConnectType)
// 					} else {
// 						resolve({
// 							connect: mongoConnect,
// 							connectStatus: 'ok',
// 							connectInfo: databaseInfo,
// 						} as mongoDBConnectType)
// 					}
// 				})
// 			})
// 			databaseConnectPromise.push(mongoConnectPromise)
// 		})
// 		// 创建连接部分结束

// 		// merge 心跳信息部分开始
// 		const __HEARTBEAT_DB_SHARD_CONNECT_LIST__: mongoDBConnectType[] = ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__ || []
// 		Promise.all(databaseConnectPromise).then((connects: mongoDBConnectType[]) => {
// 			// 去重并连接现有两个数组
// 			// 去除状态是 error 的对象

// 			// console.log('connects in promise', connects)

// 			const allAvailableConnects: mongoDBConnectType[] = connects.concat(__HEARTBEAT_DB_SHARD_CONNECT_LIST__.filter((oldConnect: mongoDBConnectType) => {
// 				return !connects.every((newConnect: mongoDBConnectType) => (newConnect.connectInfo.privateIPAddress === oldConnect.connectInfo.privateIPAddress || newConnect.connectInfo.publicIPAddress === oldConnect.connectInfo.publicIPAddress) && newConnect.connectInfo.port === oldConnect.connectInfo.port)
// 			})).filter((mergedConnect: mongoDBConnectType) => mergedConnect.connectStatus !== 'error')
	
// 			if (allAvailableConnects.length > 0) {
// 				resolve(allAvailableConnects)
// 			} else {
// 				reject(allAvailableConnects)
// 			}
// 		})
// 		// merge 心跳信息部分结束
// 	})
// }


/**
 * 根据资源信息，异步创建数据库连接并返回
 * @param databaseInfos 数据库连接信息
 * @param databaseName 要连接的数据库名
 */
export const createDatabaseConnectByDatabaseInfo = (databaseInfos: serviceInfoType[], databaseName: string): Promise<mongoDBConnectType[]> => {
	const databaseConnectPromises: Promise<mongoDBConnectType>[] = []
	databaseInfos.forEach((databaseInfo: serviceInfoType) => {
		const availableIPAddress = databaseInfo.privateIPAddress || databaseInfo.publicIPAddress
		if (availableIPAddress) {
			const mongoConnectPromise = new Promise<mongoDBConnectType>((resolve, reject) => {
				const databaseConnectString = `mongodb://${databaseInfo.adminAccountName}:${databaseInfo.adminPassword}@${availableIPAddress}:${databaseInfo.port}/${databaseName}?authSource=admin`
				// DELETE
				console.log('databaseConnectString', databaseConnectString) // DELETE
				// DELETE
				// mongoose.createConnection(databaseConnectString).asPromise().then(mongoConnect => {
				// 	mongoConnect.on('connected', (err: unknown) => {
				// 		if (err) {
				// 			reject({
				// 				connect: err,
				// 				connectStatus: 'error',
				// 				connectInfo: databaseInfo,
				// 			} as mongoDBConnectType)
				// 		} else {
				// 			resolve({
				// 				connect: mongoConnect,
				// 				connectStatus: 'ok',
				// 				connectInfo: databaseInfo,
				// 			} as mongoDBConnectType)
				// 		}
				// 	})
				// }).catch(() => {
				// 	// TODO
				// })
				
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
			databaseConnectPromises.push(mongoConnectPromise)
		}
	})

	return Promise.all(databaseConnectPromises)
}

/**
 * 根据资源信息，异步创建或 merge 心跳数据库连接并返回
 * @param databaseInfos 数据库连接信息
 * @param ctx koa 上下文
 */
export const createOrMergeHeartBeatDatabaseConnectByDatabaseInfo = (databaseInfos: serviceInfoType[], ctx: koaCtx): Promise<mongoDBConnectType[]> => {
	return new Promise<mongoDBConnectType[]>((resolve, reject) => {
		const __HEARTBEAT_DB_SHARD_CONNECT_LIST__: mongoDBConnectType[] = ctx.state.__HEARTBEAT_DB_SHARD_CONNECT_LIST__ || [] // 获取系统中已存在的心跳数据库连接信息

		const databaseName: string = 'heart_base'
		createDatabaseConnectByDatabaseInfo(databaseInfos, databaseName).then((connects: mongoDBConnectType[]) => { // 获取新的心跳数据库连接信息
			// 去重并连接现有两个数组, 然后去除状态是 error 的对象
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


// DELETE
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
// DELETE







type schemaType = Record<string, unknown>

type constructor2Type<T> =
	T extends DateConstructor ? Date :
		T extends BufferConstructor ? Buffer :
			T extends { (): infer V } ? V :
				T extends { type: infer V } ? constructor2Type<V> :
					T extends never[] ? unknown[] :
						T extends object ? getTsTypeFromSchemaType<T> : T

type getTsTypeFromSchemaType<T> = {
	[key in keyof T]: constructor2Type<T[key]>;
}

/**
 *
 * 使用 Mongoose 向 MongoDB 插入数据 (事务级别)
 *
 * @param mongoDBConnects MongoDB 的连接，为了启用事务，需要是 asPromise 的 Mongoose 连接
 * @param schemaObject 数据的 Schema
 * @param data 数据
 * @param collectionName 数据被插入的集合名字 (精准名字，不会在后面追加复数 “s”)
 *
 * @returns Promise<boolean> 布尔类型的 Promise 返回值，仅有 then (resolve) 回调，不存在 catch (reject) 回调，如果 then 的结果是 true，则证明数据插入成功了
 */
export const saveData2MongoDBShard = <T>(mongoDBConnects: mongoDBConnectType[], schemaObject: schemaType, data: getTsTypeFromSchemaType<T>[], collectionName: string): Promise<boolean> => {
	return new Promise<boolean>(resolve => {
		const saveData2DatabasePromises: Promise<boolean>[] = []

		mongoDBConnects.forEach((mongoDBConnect: mongoDBConnectType) => {
			const saveData2DatabasePromise = new Promise<boolean>(resolve => {
				mongoDBConnect.connect.startSession().then(session => {
					session.withTransaction(() => {
						return new Promise<void>(() => {
							const schema = new Schema(schemaObject)
							const model = mongoDBConnect.connect.model(collectionName, schema, collectionName)
							const entity = new model(data)
							// FIXME 在 new model 的时候的 data 参数应该是对象，而此处传入的是对象数组
							
							entity.save().then(savedDoc => {
								if (savedDoc === entity) {
									session.commitTransaction()
									resolve(true)
								} else {
									session.abortTransaction()
									resolve(false)
								}
							}).catch(() => {
								session.abortTransaction()
								resolve(false)
							}).finally(() => {
								session.endSession()
							})
						})
					})
				})
			})
			saveData2DatabasePromises.push(saveData2DatabasePromise)
		})

		Promise.all(saveData2DatabasePromises).then((results: boolean[]) => {
			const saveDataResult = results.filter(result => !result).length === 0 // 判断是否全是 true
			if (saveDataResult) {
				resolve(true)
			} else {
				resolve(false)
			}
		})
	})
}
