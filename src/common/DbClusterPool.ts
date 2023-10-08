import { ReadPreferenceMode } from 'mongodb'
import mongoose, { ConnectOptions, Schema } from 'mongoose'
import { GlobalSingleton } from '../store/index.js'
import { getTsTypeFromSchemaType, getTsTypeFromSchemaTypeOptional, mongoDBConnectType, mongoDbUpdateResultType, mongoServiceInfoType } from '../type/AdminTypes.js'
import { removeDuplicateObjectsInDeepArrayAndDeepObjectStrong } from './ArrayTool.js'

export const connectMongoDBCluster = async (): Promise<void> => {
	const databaseHost = process.env.MONGODB_CLUSTER_HOST
	const databasePort = process.env.MONGODB_CLUSTER_PORT
	const databaseName = process.env.MONGODB_NAME
	const databaseUsername = process.env.MONGODB_USERNAME
	const databasePassword = process.env.MONGODB_PASSWORD
	
	if (!databaseHost) {
		console.error('ERROR', '创建数据库连接失败， databaseHost 为空')
		process.exit()
	}
	if (!databasePort) {
		console.error('ERROR', '创建数据库连接失败， databasePort 为空')
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

	const mongoURL = `mongodb://${databaseUsername}:${databasePassword}@${databaseHost}:${databasePort}/${databaseName}?authSource=admin&replicaSet=kirakira-mongodb`

	const connectionOptions = {
		useNewUrlParser: true,
		useUnifiedTopology: true,
		readPreference: ReadPreferenceMode.secondaryPreferred,
	}

	await mongoose.connect(mongoURL, connectionOptions)
}
