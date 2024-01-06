import { ReadPreferenceMode } from 'mongodb'
import mongoose, { Model, Schema } from 'mongoose'
import { DbPoolResultsType, DbPoolResultType, QueryType, SelectType, UpdateResultType, UpdateType } from './DbClusterPoolTypes.js'

/**
 * 连接 MongoDB 复制集，这个方法应当在系统初始化时调用
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
			mongoose.set('strictQuery', true) // 设为 true 的话，如果在查询时传入了 schema 定义的字段以外的字段，则会忽略这些字段
			await mongoose.connect(mongoURL, connectionOptions)
			console.log('MongoDB Cluster Connect successfully!')
		} catch (error) {
			console.error('ERROR', '创建数据库连接失败：', error)
			process.exit()
		}
	} catch (error) {
		console.error('ERROR', '创建数据库连接失败：connectMongoDBCluster 意外终止：', error)
		process.exit()
	}
}

/**
 * 向数据库中插入数据
 * @param data 被插入的数据
 * @param schema MongoDB Schema 对象
 * @param collectionName 数据即将插入的 MongoDB 集合的名字（输入单数名词会自动创建该名词的复数形式的集合名）
 * @returns 插入数据的状态和结果
 */
export const insertData2MongoDB = async <T>(data: T, schema: Schema, collectionName: string): Promise< DbPoolResultsType<T & {_id: string}> > => {
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
			const result = await model.save() as T & {_id: string}
			return { success: true, message: '数据插入成功', result: [result] }
		} catch (error) {
			console.error('ERROR', '数据插入失败：', error)
			throw { success: false, message: '数据插入失败', error }
		}
	} catch (error) {
		console.error('ERROR', 'insertData2MongoDB 发生错误')
		throw { success: false, message: '数据插入失败，insertData2MongoDB 中发生错误：', error }
	}
}

/**
 * 在 MongoDB 数据库中查找数据
 * @param where 查询条件
 * @param select 投影（可以理解为 SQL 的 SELECT 子句）
 * @param schema MongoDB Schema 对象
 * @param collectionName 查询数据时使用的 MongoDB 集合的名字（输入单数名词会自动创建该名词的复数形式的集合名）
 * @returns 查询状态和结果
 */
export const selectDataFromMongoDB = async <T>(where: QueryType<T>, select: SelectType<T>, schema: Schema<T>, collectionName: string): Promise< DbPoolResultsType<T> > => {
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

/**
 * 向数据库中更新数据
 * @param where 查询条件
 * @param update 需要更新的数据
 * @param schema MongoDB Schema 对象
 * @param collectionName 查询数据时使用的 MongoDB 集合的名字（输入单数名词会自动创建该名词的复数形式的集合名）
 * @returns 更新数据的结果
 */
export const updateData4MongoDB = async <T>(where: QueryType<T>, update: UpdateType<T>, schema: Schema<T>, collectionName: string): Promise<UpdateResultType> => {
	try {
		let mongoModel: Model<T>
		// 检查模型是否已存在
		if (mongoose.models[collectionName]) {
			mongoModel = mongoose.models[collectionName]
		} else {
			mongoModel = mongoose.model<T>(collectionName, schema)
		}
		try {
			const updateResult = await mongoModel.updateMany(where, { $set: update })
			const acknowledged = updateResult.acknowledged
			const matchedCount = updateResult.matchedCount
			const modifiedCount = updateResult.modifiedCount
			if (acknowledged && matchedCount > 0) {
				if (modifiedCount > 0) {
					return { success: true, message: '数据更新成功', result: { acknowledged, matchedCount, modifiedCount } }
				} else {
					console.warn('WARN', 'WARNING', '已匹配到数据并尝试更新数据，但数据未（无需）更新，可能是因为数据更新前后的值相同', { where, update })
					return { success: true, message: '尝试更新数据，但数据无需更新', result: { acknowledged, matchedCount, modifiedCount } }
				}
			} else {
				console.warn('ERROR', '尝试更新数据，但更新失败，因为未匹配到到数据', { where, update })
				return { success: false, message: '尝试更新数据，但更新失败，可能是未匹配到数据', result: { acknowledged, matchedCount, modifiedCount } }
			}
		} catch (error) {
			console.error('ERROR', '数据更新失败：', error, { where, update })
			throw { success: false, message: '数据更新失败', error }
		}
	} catch (error) {
		console.error('ERROR', '数据更新失败，未知错误')
		throw { success: false, message: '数据更新失败，updateData4MongoDB 中发生错误：', error }
	}
}

/**
 * 从数据库中寻找一条匹配的数据并更新，然后返回更新后的结果 // WARN 请在业务中避免查询条件匹配到多条数据，如果匹配到多条数据，则只会更新第一条，造成数据不匹配！
 * @param where 查询条件 // WARN 请在业务中避免查询条件匹配到多条数据，如果匹配到多条数据，则只会更新第一条，造成数据不匹配！
 * @param update 需要更新的数据
 * @param schema MongoDB Schema 对象
 * @param collectionName 查询数据时使用的 MongoDB 集合的名字（输入单数名词会自动创建该名词的复数形式的集合名）
 * @returns 更新后的数据
 */
export const findOneAndUpdateData4MongoDB = async <T>(where: QueryType<T>, update: UpdateType<T>, schema: Schema<T>, collectionName: string): Promise< DbPoolResultType<T> > => {
	try {
		let mongoModel: Model<T>
		// 检查模型是否已存在
		if (mongoose.models[collectionName]) {
			mongoModel = mongoose.models[collectionName]
		} else {
			mongoModel = mongoose.model<T>(collectionName, schema)
		}
		try {
			const updateResult = (await mongoModel.findOneAndUpdate(where, { $set: update }, { new: true, upsert: true })).toObject() as T

			if (updateResult) {
				return { success: true, message: '数据更新成功', result: updateResult }
			} else {
				console.warn('ERROR', '数据更新失败，没有找到返回结果', { where, update })
				return { success: false, message: '数据更新失败，没有找到返回结果' }
			}
		} catch (error) {
			console.error('ERROR', '数据更新失败：', error, { where, update })
			throw { success: false, message: '数据更新失败', error }
		}
	} catch (error) {
		console.error('ERROR', '数据更新失败，未知错误')
		throw { success: false, message: '数据更新失败，findOneAndUpdateData4MongoDB 中发生错误：', error }
	}
}

/**
 * 创建或获取自增序列的下一个值，并自增
 * // WARN 请调用 SequenceValueService 的 getNextSequenceValueEjectService 方法或 getNextSequenceValueService 方法来获取自增值，而不是直接调用 Pool 层
 * @param sequenceId 自增序列的 key
 * @param schema MongoDB Schema 对象
 * @param collectionName 查询数据时使用的 MongoDB 集合的名字（输入单数名词会自动创建该名词的复数形式的集合名）
 * @param sequenceDefaultNumber 序列的初始值，默认：0，如果序列已创建，则无效，该值可以为负数
 * @parma sequenceStep 序列的步长，默认：1，每次调用该方法时可以指定不同的步长，该值可以为负数
 * @returns 查询状态和结果，应为自增序列的下一个值
 */
export const getNextSequenceValuePool = async (sequenceId: string, schema: Schema, collectionName: string, sequenceDefaultNumber: number = 0, sequenceStep: number = 1): Promise< DbPoolResultType<number> > => {
	try {
		let mongoModel
		// 检查模型是否已存在
		if (mongoose.models[collectionName]) {
			mongoModel = mongoose.models[collectionName]
		} else {
			mongoModel = mongoose.model(collectionName, schema)
		}
		try {
			let sequenceDocument = await mongoModel.findOne({ _id: sequenceId })
			if (!sequenceDocument) {
				sequenceDocument = await mongoModel.findOneAndUpdate(
					{ _id: sequenceId },
					{ $inc: { sequenceValue: sequenceDefaultNumber } }, // 当文档首次创建时，通过设置步长的方式设置初始值
					{ upsert: true, new: true },
				)
			} else {
				sequenceDocument = await mongoModel.findOneAndUpdate(
					{ _id: sequenceId },
					{ $inc: { sequenceValue: sequenceStep } }, // 当文档已存在时，只增加一倍步长
					{ new: true },
				)
			}
			return { success: true, message: '自增 ID 查询成功', result: sequenceDocument.sequenceValue }
		} catch (error) {
			console.error('ERROR', '自增 ID 查询失败：', error)
			throw { success: false, message: '自增 ID 查询失败', error }
		}
	} catch (error) {
		console.error('ERROR', 'getNextSequenceValuePool 发生错误')
		throw { success: false, message: '自增 ID 查询时发生错误', error }
	}
}

/**
 * 在指定的 schema 及 collectionName 中，通过 MongoDB 唯一 ID 找到一个值并自增
 * @param mongodbId MongoDB 唯一 ID
 * @param key 查找到的 MongoDB 文档中被自增的项
 * @param schema MongoDB Schema 对象
 * @param collectionName 查询数据时使用的 MongoDB 集合的名字（输入单数名词会自动创建该名词的复数形式的集合名），需要与 schema 一致
 * @parma sequenceStep 自增的步长，默认：1，每次调用该方法时可以指定不同的步长，该值可以为负数
 * @returns 查询状态和结果，成功时，应为自增序列的下一个值
 */
export const findOneAndPlusByMongodbId = async (mongodbId: string, key: string, schema: Schema, collectionName: string, sequenceStep: number = 1): Promise< DbPoolResultType<number> > => {
	try {
		let mongoModel
		// 检查模型是否已存在
		if (mongoose.models[collectionName]) {
			mongoModel = mongoose.models[collectionName]
		} else {
			mongoModel = mongoose.model(collectionName, schema)
		}
		try {
			const sequenceDocument = await mongoModel.findOneAndUpdate(
				{ _id: mongodbId },
				{ $inc: { [key]: sequenceStep } }, // 步长，可以为负数
				{ new: false },
			)
			return { success: true, message: '自增成功', result: sequenceDocument.sequenceValue }
		} catch (error) {
			console.error('ERROR', '自增失败：', error)
			throw { success: false, message: '自增失败', error }
		}
	} catch (error) {
		console.error('ERROR', 'findOneAndPlusByMongodbId 发生错误')
		throw { success: false, message: '自增时发生错误', error }
	}
}
