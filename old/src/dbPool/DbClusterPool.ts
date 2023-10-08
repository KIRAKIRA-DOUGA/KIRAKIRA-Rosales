import { ReadPreferenceMode } from 'mongodb'
import mongoose, { ConnectOptions, Schema } from 'mongoose'
import { removeDuplicateObjectsInDeepArrayAndDeepObjectStrong } from '../common/ArrayTool.js'
import { GlobalSingleton } from '../store/index.js'
import { getTsTypeFromSchemaType, getTsTypeFromSchemaTypeOptional, mongoDBConnectType, mongoDbUpdateResultType, mongoServiceInfoType } from '../type/AdminTypes.js'
import { DbPoolResultType } from './DbPoolTypes.js'


type schemaType = Record<string, unknown>

/**
 * 连接 MongoDB 复制集
 */
export const connectMongoDBCluster = async (): Promise<void> => {
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

	await mongoose.connect(mongoURL, connectionOptions)
}

export const insertData2MongoDB = async (data: getTsTypeFromSchemaType<typeof schema>, schema: schemaType, modelName: string): Promise<DbPoolResultType> => {
	const mongoDbSchema = new mongoose.Schema(schema)
	const mongoModel = mongoose.model(modelName, mongoDbSchema)
	const model = new mongoModel(data)
	await model.save().catch(error => {
		console.error('ERROR', '数据插入失败：', error)
		return { success: false, message: '数据插入失败', error }
	})
	return { success: true, message: '数据插入成功' }
}
