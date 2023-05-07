import mongoose, { Schema } from 'mongoose'
import { getTsTypeFromSchemaType, getTsTypeFromSchemaTypeOptional, mongoDBConnectType, mongoServiceInfoType } from '../type/AdminType'
import { GlobalSingleton } from '../store/index'
import { removeDuplicateObjectsInDeepArrayAndDeepObjectStrong } from './ArrayTool'

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
		return Promise.all([]) // ! is it right? 这是正确的吗？，一旦出现 catch 就要返回一个空 Promise 吗？
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

/**
 *
 * 使用 Mongoose 向 MongoDB 插入一行数据
 *
 * @param mongoDBConnects MongoDB 的连接、
 * @param collectionName 数据被插入的集合名字 (精准名字，不需要在后面追加复数 “s”)
 * @param schemaObject 数据的 Schema
 * @param data 准备插入的数据
 *
 * @returns Promise<boolean> 布尔类型的 Promise 返回值，仅有 then (resolve) 回调，不存在 catch (reject) 回调，如果 then 的结果是 true，则证明数据插入成功了
 */
export const saveData2MongoDBShard = <T>(mongoDBConnects: mongoDBConnectType[], collectionName: string, schemaObject: schemaType, dataArray: getTsTypeFromSchemaType<T>): Promise<boolean> => {
	return new Promise<boolean>(resolve => {
		try {
			if (mongoDBConnects && collectionName && schemaObject && dataArray) {
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
			} else {
				resolve(false)
				console.error('something error in function saveData2MongoDBShard, required data is empty')
			}
		} catch (e) {
			resolve(false)
			console.error('something error in function saveData2MongoDBShard, when we save data to All MongoDB 2')
		}
	})
}

export const saveDataArray2MongoDBShard = <T>(mongoDBConnects: mongoDBConnectType[], collectionName: string, schemaObject: schemaType, dataArray: getTsTypeFromSchemaType<T>[]): Promise<boolean> => {
	return new Promise<boolean>(resolve => {
		try {
			if (mongoDBConnects && collectionName && schemaObject && dataArray){
				const saveDataArray2DatabasePromises: Promise<boolean>[] = []

				dataArray.forEach(data => {
					const saveDataArray2DatabasePromise = new Promise<boolean>(resolve => {
						saveData2MongoDBShard(mongoDBConnects, collectionName, schemaObject, data).then((result: boolean) => {
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
			} else {
				resolve(false)
				console.error('something error in function saveDataArray2MongoDBShard, required data is empty')
			}
		} catch (e) {
			console.error('something error in function saveDataArray2MongoDBShard, when we save dataArray to All MongoDB')
		}
	})
}


/**
 *
 * 在某个 MongoDB 分片中查找数据
 *
 * @param mongoDBConnects 一个 MongoDB 数据库连接
 * @param collectionName MongoDB 集合名 (精准名字，不需要在后面追加复数 “s”)
 * @param schemaObject 数据的 Schema
 * @param conditions 查询条件
 *
 * @returns 查询结果
 */
export const getDataFromOneMongoDBShard = <T>(mongoDBConnects: mongoDBConnectType, collectionName: string, schemaObject: schemaType, conditions: getTsTypeFromSchemaTypeOptional<T>): Promise< getTsTypeFromSchemaType<T>[] > => {
	return new Promise<getTsTypeFromSchemaType<T>[] >(resolve => {
		try {
			if (mongoDBConnects && collectionName && schemaObject) {
				const fixedConditions = conditions ? conditions : {}
				
				const schema = new Schema(schemaObject)
				const model = mongoDBConnects.connect.model(collectionName, schema, collectionName)
				model.find(fixedConditions)
					.exec()
					.then(results => results.map(result => result.toObject()))
					.then(resultsObject => {
						resolve(resultsObject as getTsTypeFromSchemaType<T>[])
					})
			} else {
				resolve([{}] as getTsTypeFromSchemaType<T>[])
				console.error('something error in function getDataFromOneMongoDBShard, required data is empty')
			}
		} catch {
			resolve([{}] as getTsTypeFromSchemaType<T>[])
			console.error('something error in function getDataFromOneMongoDBShard')
		}
	})
}

/**
 *
 * 在某个 MongoDB 分片中查找数据，但允许自定义 select
 * 比如说你想排除 MongoDB 默认生成的 '_id' 和 '__v' 字段，那么 @param customSelectAttributes 的值就应该是 '-_id -__v'
 * 关于自定义排除字段，即 Mongoose select() 的使用方法，请参考：https://mongoosejs.com/docs/6.x/docs/api/query.html#query_Query-select
 *
 * @param mongoDBConnects 一个 MongoDB 数据库连接
 * @param collectionName MongoDB 集合名 (精准名字，不需要在后面追加复数 “s”)
 * @param schemaObject 数据的 Schema
 * @param conditions 查询条件
 * @param customSelectAttributes select 条件
 *
 * @returns 查询结果
 */
export const getDataFromOneMongoDBShardAllowCustomSelectAttributes = <T>(mongoDBConnects: mongoDBConnectType, collectionName: string, schemaObject: schemaType, conditions: getTsTypeFromSchemaTypeOptional<T>, customSelectAttributes: string): Promise< getTsTypeFromSchemaType<T>[] > => {
	return new Promise<getTsTypeFromSchemaType<T>[] >(resolve => {
		try {
			if (mongoDBConnects && collectionName && schemaObject) {
				const fixedConditions = conditions ? conditions : {}
				const fixedCustomSelectAttributes = customSelectAttributes ? customSelectAttributes : ''
				
				const schema = new Schema(schemaObject)
				const model = mongoDBConnects.connect.model(collectionName, schema, collectionName)
				model
					.find(fixedConditions)
					.select(fixedCustomSelectAttributes)
					.exec()
					.then(results => results.map(result => result.toObject()))
					.then(resultsObject => {
						resolve(resultsObject as getTsTypeFromSchemaType<T>[])
					})
			} else {
				resolve([{}] as getTsTypeFromSchemaType<T>[])
				console.error('something error in function getDataFromOneMongoDBShard, required data is empty')
			}
		} catch {
			resolve([{}] as getTsTypeFromSchemaType<T>[])
			console.error('something error in function getDataFromOneMongoDBShard')
		}
	})
}

/**
 *
 * 随机去一个给定的数据库连接查询结果，并返回查询结果
 * "有一个存放数据库连接的数组，随机的去这个数组中取出一个数据库连接并执行查询，如果查询到结果，就返回，如果没查询到结果，就去数组中再次取出一个连接并执行查询，重复此步骤直到数组中的每个连接都被执行过一遍查询，要求：不改变原数组"
 * BY: ChatGPT-4, 02
 *
 * @param mongoDBConnects MongoDB 数据库连接列表
 * @param collectionName MongoDB 集合名 (精准名字，不需要在后面追加复数 “s”)
 * @param schemaObject 数据的 Schema
 * @param conditions 查询条件
 *
 * @returns 查询结果
 */
export const getDataFromRandomMongoDBShard = async <T>(mongoDBConnects: mongoDBConnectType[], collectionName: string, schemaObject: schemaType, conditions: getTsTypeFromSchemaTypeOptional<T>): Promise< getTsTypeFromSchemaType<T>[] > => {
	try {
		if (mongoDBConnects && collectionName && schemaObject) {
			const indexArray: number[] = Array.from({ length: mongoDBConnects.length }, (_, i) => i)
			let result: getTsTypeFromSchemaType<T>[] = null
		
			while (indexArray.length > 0 && result === null) {
				const randomIndex: number = Math.floor(Math.random() * indexArray.length)
				const connectionIndex: number = indexArray.splice(randomIndex, 1)[0]
				const connection: mongoDBConnectType = mongoDBConnects[connectionIndex]
		
				
				result = await getDataFromOneMongoDBShard(connection, collectionName, schemaObject, conditions)
			}
	
			return result
		} else {
			console.error('something error in function getDataFromRandomMongoDBShard, required data is empty')
			return [{}] as getTsTypeFromSchemaType<T>[]
		}
	} catch {
		console.error('something error in function getDataFromRandomMongoDBShard')
		return [{}] as getTsTypeFromSchemaType<T>[]
	}
}


/**
 *
 * 去给定的全部数据库连接查询数据，并将查询结果去重后返回
 * BY: ChatGPT-4, 02
 *
 * @param mongoDBConnects MongoDB 数据库连接列表
 * @param collectionName MongoDB 集合名 (精准名字，不需要在后面追加复数 “s”)
 * @param schemaObject 数据的 Schema
 * @param conditions 查询条件
 *
 * @returns 查询结果
 */
export const getDataFromAllMongoDBShardAndDuplicate = async <T>(mongoDBConnects: mongoDBConnectType[], collectionName: string, schemaObject: schemaType, conditions: getTsTypeFromSchemaTypeOptional<T>): Promise< getTsTypeFromSchemaType<T>[] > => {
	try {
		if (mongoDBConnects && collectionName && schemaObject) {
			const getDataFromMongoDBPromise: Promise<getTsTypeFromSchemaType<T>[] >[] = []
			mongoDBConnects.forEach((mongoDBConnect: mongoDBConnectType) => {
				const excludeAttributes = '-_id -__v -editDateTime'
				const getDataFromMongoDB = getDataFromOneMongoDBShardAllowCustomSelectAttributes<T>(mongoDBConnect, collectionName, schemaObject, conditions, excludeAttributes)
				getDataFromMongoDBPromise.push(getDataFromMongoDB)
			})

			const queryResult: getTsTypeFromSchemaType<T>[][] = await Promise.all(getDataFromMongoDBPromise)
			return removeDuplicateObjectsInDeepArrayAndDeepObjectStrong(queryResult)
		} else {
			console.error('something error in function getDataFromAllMongoDBShardAndDuplicate, required data is empty')
			return [{}] as getTsTypeFromSchemaType<T>[]
		}
	} catch {
		console.error('something error in function getDataFromAllMongoDBShardAndDuplicate')
		return [{}] as getTsTypeFromSchemaType<T>[]
	}
}

// TODO 增加数据路由查询，可以通过路由计算出数据存储的分片组位置，只去正确的分片组查询数据
