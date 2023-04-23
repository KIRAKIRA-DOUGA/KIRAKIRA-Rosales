import mongoose, { Schema } from 'mongoose'
import { mongoDBConnectType, mongoServiceInfoType } from '../type/AdminType'
import { GlobalSingleton } from '../store/index'

const globalSingleton = GlobalSingleton.getInstance()


/**
 * 根据资源信息，异步创建数据库连接并返回
 * @param databaseInfos 数据库连接信息
 * @param databaseName 要连接的数据库名
 */
export const createDatabaseConnectByDatabaseInfo = (databaseInfos: mongoServiceInfoType[], databaseName: string): Promise<mongoDBConnectType[]> => {
	const databaseConnectPromises: Promise<mongoDBConnectType>[] = []
	databaseInfos.forEach((databaseInfo: mongoServiceInfoType) => {
		const availableIPAddress = databaseInfo.privateIPAddress || databaseInfo.publicIPAddress
		if (availableIPAddress) {
			const mongoConnectPromise = new Promise<mongoDBConnectType>(resolve => {
				const databaseConnectString = `mongodb://${databaseInfo.adminAccountName}:${databaseInfo.adminPassword}@${availableIPAddress}:${databaseInfo.port}/${databaseName}?authSource=admin`

				try {
					mongoose.createConnection(databaseConnectString).asPromise().then(mongoConnect => {
						resolve({
							connect: mongoConnect,
							connectStatus: 'ok',
							connectInfo: databaseInfo,
						} as mongoDBConnectType)
					}).catch(error => {
						resolve({
							connect: error,
							connectStatus: 'error',
							connectInfo: databaseInfo,
						} as mongoDBConnectType)
					})
				} catch (error) {
					resolve({
						connect: error,
						connectStatus: 'error',
						connectInfo: databaseInfo,
					} as mongoDBConnectType)
				}
			})
			databaseConnectPromises.push(mongoConnectPromise)
		}
	})

	try {
		return Promise.all(databaseConnectPromises)
	} catch (e) {
		console.error('something error in function createDatabaseConnectByDatabaseInfo -> "Promise.all"')
	}
}

/**
 * 根据资源信息，异步创建或 merge 心跳数据库连接并返回
 * @param databaseInfos 数据库连接信息
 */
export const createOrMergeHeartBeatDatabaseConnectByDatabaseInfo = (databaseInfos: mongoServiceInfoType[]): Promise<mongoDBConnectType[]> => {
	return new Promise<mongoDBConnectType[]>((resolve, reject) => {
		const heartBeatDBShardConnectList: mongoDBConnectType[] | undefined = globalSingleton.getVariable<mongoDBConnectType[]>('__HEARTBEAT_DB_SHARD_CONNECT_LIST__')

		const databaseName: string = 'heart_base'
		try {
			createDatabaseConnectByDatabaseInfo(databaseInfos, databaseName).then((connects: mongoDBConnectType[]) => { // 获取新的心跳数据库连接信息
				// 去重并连接现有两个数组, 然后去除状态是 error 的对象
				const allAvailableConnects: mongoDBConnectType[] = connects.concat(heartBeatDBShardConnectList ? heartBeatDBShardConnectList.filter((oldConnect: mongoDBConnectType) => {
					return !connects.every((newConnect: mongoDBConnectType) => (newConnect.connectInfo.privateIPAddress === oldConnect.connectInfo.privateIPAddress || newConnect.connectInfo.publicIPAddress === oldConnect.connectInfo.publicIPAddress) && newConnect.connectInfo.port === oldConnect.connectInfo.port)
				}) : []).filter((mergedConnect: mongoDBConnectType) => mergedConnect.connectStatus !== 'error')

				if (allAvailableConnects.length > 0) {
					resolve(allAvailableConnects)
				} else {
					reject(allAvailableConnects)
				}
			}).catch(() => {
				reject() // TODO we must reject something...
				console.error('something error in function createOrMergeHeartBeatDatabaseConnectByDatabaseInfo')
			})
		} catch {
			reject() // TODO we must reject something...
			console.error('something error in function createOrMergeHeartBeatDatabaseConnectByDatabaseInfo when we try {} catch{}')
		}
	})
}


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
 * 使用 Mongoose 向 MongoDB 插入一行数据
 *
 * @param mongoDBConnects MongoDB 的连接，为了启用事务，需要是 asPromise 的 Mongoose 连接
 * @param schemaObject 数据的 Schema
 * @param data 数据
 * @param collectionName 数据被插入的集合名字 (精准名字，不会在后面追加复数 “s”)
 *
 * @returns Promise<boolean> 布尔类型的 Promise 返回值，仅有 then (resolve) 回调，不存在 catch (reject) 回调，如果 then 的结果是 true，则证明数据插入成功了
 */
export const saveData2MongoDBShard = <T>(mongoDBConnects: mongoDBConnectType[], schemaObject: schemaType, dataArray: getTsTypeFromSchemaType<T>, collectionName: string): Promise<boolean> => {
	return new Promise<boolean>(resolve => {
		try {
			const saveData2DatabasePromises: Promise<boolean>[] = []

			mongoDBConnects.forEach((mongoDBConnect: mongoDBConnectType) => {
				const saveData2DatabasePromise = new Promise<boolean>(resolve => {
					mongoDBConnect.connect.startSession().then(session => {
						session.withTransaction(() => {
							return new Promise<void>(() => {
								const schema = new Schema(schemaObject)
								const model = mongoDBConnect.connect.model(collectionName, schema, collectionName)
								const entity = new model(dataArray)
	
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
					}).catch(() => {
						resolve(false)
						console.error('something error in function saveData2MongoDBShard, when we save data to MongoDB')
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
			}).catch(() => {
				resolve(false)
				console.error('something error in function saveData2MongoDBShard, when we save data to All MongoDB')
			})
		} catch (e) {
			resolve(false)
			console.error('something error in function saveData2MongoDBShard, when we save data to All MongoDB 2')
		}
	})
}

export const saveDataArray2MongoDBShard = <T>(mongoDBConnects: mongoDBConnectType[], schemaObject: schemaType, dataArray: getTsTypeFromSchemaType<T>[], collectionName: string): Promise<boolean> => {
	return new Promise<boolean>(resolve => {
		const saveDataArray2DatabasePromises: Promise<boolean>[] = []

		dataArray.forEach(data => {
			const saveDataArray2DatabasePromise = new Promise<boolean>(resolve => {
				saveData2MongoDBShard(mongoDBConnects, schemaObject, data, collectionName).then((result: boolean) => {
					resolve(result)
				}).catch(() => {
					resolve(false)
					console.error('something error in function saveDataArray2MongoDBShard, when we call saveData2MongoDBShard to save data to All MongoDB')
				})
			})

			saveDataArray2DatabasePromises.push(saveDataArray2DatabasePromise)
		})
		Promise.all(saveDataArray2DatabasePromises).then((results: boolean[]) => {
			const saveDataResult = results.filter(result => !result).length === 0 // 判断是否全是 true
			if (saveDataResult) {
				resolve(true)
			} else {
				resolve(false)
			}
		}).catch(() => {
			resolve(false)
			console.error('something error in function saveDataArray2MongoDBShard, when we save dataArray to All MongoDB')
		})
	})
}
