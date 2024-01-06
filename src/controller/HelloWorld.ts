// 试验场

import { Client } from '@elastic/elasticsearch'
import { getNextSequenceValueEjectService } from '../service/SequenceValueService.js'
import { GlobalSingleton } from '../store/index.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'

const globalSingleton = GlobalSingleton.getInstance()


export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	const something = ctx.query.something

	console.log('something: ', something)
	
	// const oldTestNumber = globalSingleton.getVariable<string>('testNumber')
	// globalSingleton.setVariable<string | string[]>('testNumber', ctx.query.testNumber)
	// const newTestNumber = globalSingleton.getVariable<string>('testNumber')

	// const r2SignedUrl = await createR2SignedUrl('kirakira-file-public-apac', `The Calling-${new Date()}.mp4`, 180)

	// ctx.body = `Hello World ${r2SignedUrl}`

	
	// const aaa = await getNextSequenceValueEjectService('test', [-10, -208, -220, -222, -224, -223, -225, -226, -230, -232, -234, -235, -237, -238], -200, -2)
	// console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', aaa)

	// ctx.body = `Hello World ${something}, oldNumber: ${oldTestNumber}, newNumber: ${newTestNumber}`

	// const ELASTICSEARCH_ADMIN_USERNAME = process.env.ELASTICSEARCH_ADMIN_USERNAME
	// const ELASTICSEARCH_ADMIN_PASSWORD = process.env.ELASTICSEARCH_ADMIN_PASSWORD
	// const ELASTICSEARCH_CLUSTER_HOST = process.env.ELASTICSEARCH_CLUSTER_HOST
	// const ELASTICSEARCH_CLUSTER_HOST_LIST = ELASTICSEARCH_CLUSTER_HOST?.split(',')?.map(host => `https://${host}`)

	// const client = new Client({
	// 	node: ELASTICSEARCH_CLUSTER_HOST_LIST,
	// 	auth: {
	// 		username: ELASTICSEARCH_ADMIN_USERNAME,
	// 		password: ELASTICSEARCH_ADMIN_PASSWORD,
	// 	},
	// 	tls: {
	// 		rejectUnauthorized: false, // 这将忽略 SSL 证书验证
	// 	},
	// })

	// client.ping().then(result => {
	// 	console.log('es ok', result)
	// }).catch(error => {
	// 	if (error) {
	// 		console.error('Elasticsearch cluster is down!', error)
	// 	}
	// })

	// client.info().then(result => {
	// 	console.log('es ok', result)
	// }).catch(error => {
	// 	if (error) {
	// 		console.error('Get elasticsearch cluster info field!', error)
	// 	}
	// })

	// interface Document {
	// 	character: string;
	// }

	// const result = await client.index<Document>({
	// 	index: 'search-kirakira-video-elasticsearch',
	// 	document: {

	// 	}
	// })


	ctx.body = 'Hello World'

	await next()
}

