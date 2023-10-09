import { ReadPreferenceMode } from 'mongodb'
import mongoose, { Model, Schema } from 'mongoose'
import { DbPoolResultType, QueryType, SelectType } from './DbClusterPoolTypes.js'

/**
 * 连接 MongoDB 复制集，应当在系统初始化时调用
 */
export const connectMongoDBCluster = async (): Promise<void> => {
	try {
		const databaseHost = process.env.MONGODB_CLUSTER_HOST
		const databaseName = process.env.MONGODB_NAME
		const databaseUsername = process.env.MONGODB_USERNAME
		const databasePassword = process.env.MONGODB_PASSWORD
		
		if (!databaseHost) {
			console.error('ERROR', '创建数据库连接失败， databaseHost 为空')
			process.exit()
		}
		if (!databaseName) {
			console.error('ERROR', '创建数据库连接失败， databaseName 为空')
			process.exit()
		}
		if (!databaseUsername) {
			console.error('ERROR', '创建数据库连接失败， databaseUsername 为空')
			process.exit()
		}
		if (!databasePassword) {
			console.error('ERROR', '创建数据库连接失败， databasePassword 为空')
			process.exit()
		}
	
		const mongoURL = `mongodb://${databaseUsername}:${databasePassword}@${databaseHost}/${databaseName}?authSource=admin&replicaSet=rs0&readPreference=secondaryPreferred`
	
		const connectionOptions = {
			useNewUrlParser: true,
			useUnifiedTopology: true,
			readPreference: ReadPreferenceMode.secondaryPreferred,
		}
	
		try {
			await mongoose.connect(mongoURL, connectionOptions)
		} catch (error) {
			console.error('ERROR', '创建数据库连接失败：', error)
			process.exit()
		}
	} catch (error) {
		console.error('ERROR', '创建数据库连接失败：connectMongoDBCluster 意外终止：', error)
		process.exit()
	}
}

export const insertData2MongoDB = async <T>(data: T, schema: Schema, collectionName: string): Promise< DbPoolResultType<T> > => {
	try {
		let mongoModel: Model<T>
		// 检查模型是否已存在
		if (mongoose.models[collectionName]) {
			mongoModel = mongoose.models[collectionName]
		} else {
			mongoModel = mongoose.model<T>(collectionName, schema)
		}
		mongoModel.createIndexes()
		const model = new mongoModel(data)
		try {
			await model.save()
		} catch (error) {
			console.error('ERROR', '数据插入失败：', error)
			throw { success: false, message: '数据插入失败', error }
		}
		return { success: true, message: '数据插入成功' }
	} catch (error) {
		console.error('ERROR', 'insertData2MongoDB 发生错误')
		throw { success: false, message: '数据插入失败，insertData2MongoDB 中发生错误：', error }
	}
}

export const selectDataFromMongoDB = async <T>(where: QueryType<T>, select: SelectType<T>, schema: Schema<T>, collectionName: string): Promise< DbPoolResultType<T> > => {
	try {
		let mongoModel: Model<T>
		// 检查模型是否已存在
		if (mongoose.models[collectionName]) {
			mongoModel = mongoose.models[collectionName]
		} else {
			mongoModel = mongoose.model<T>(collectionName, schema)
		}
		try {
			const result = (await mongoModel.find(where, select)).map(results => results.toObject() as T)
			return { success: true, message: '数据查询成功', result }
		} catch (error) {
			console.error('ERROR', '数据查询失败：', error)
			throw { success: false, message: '数据查询失败', error }
		}
	} catch (error) {
		console.error('ERROR', 'selectDataFromMongoDB 发生错误')
		throw { success: false, message: '数据查询失败，selectDataFromMongoDB 中发生错误：', error }
	}
}
