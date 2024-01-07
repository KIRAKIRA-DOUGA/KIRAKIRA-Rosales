// 试验场

import { Client } from '@elastic/elasticsearch'
import { insertData2ElasticsearchCluster, searchDataFromElasticsearchCluster } from '../elasticsearchPool/elasticsearchClusterPool.js'
import { EsSchema2TsType } from '../elasticsearchPool/elasticsearchClusterPoolTypes.js'
import { VideoDocument } from '../elasticsearchPool/templent/videoDocument.js'
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

	const videoTagSchema = {
		tagName: { type: String },
	}

	// const videoTagSchema = {
	// 	type: String,
	// }

	// const videoDocument = {
	// 	schema: {
	// 		title: { type: String, required: true as const },
	// 		description: { type: String, required: true as const },
	// 		uploader: { type: String, required: true as const },
	// 		kvid: { type: Number, required: true as const },
	// 		videoCategory: { type: String, required: true as const },
	// 		videoTags: { type: [videoTagSchema] },
	// 	},
	// 	indexName: 'search-kirakira-video-elasticsearch',
	// }

	// const videoData: EsSchema2TsType<typeof videoDocument.schema> = {
	// 	title: 'Padoru.exe',
	// 	description: 'Padoru🎄Padoru🎄Padoru🎄Padoru🎄Padoru🎄Padoru🎄Padoru🎄Padoru🎄Padoru🎄Padoru🎄{视频中包含原作者信息}',
	// 	uploader: 'cfdxkk',
	// 	kvid: 13,
	// 	videoCategory: '音MAD',
	// 	videoTags: [
	// 		{ tagName: '音MAD' },
	// 		{ tagName: '鬼畜' },
	// 		{ tagName: '动漫' },
	// 		{ tagName: 'Padoru' },
	// 		{ tagName: '圣诞节' },
	// 		{ tagName: '音MAD' },
	// 	],
	// }


	// const videoData = {
	// 	title: 'TVアニメ「ダーリン・イン・ザ・フランキス」エンディング映像(ノンクレジット)',
	// 	description: 'DitF NCED 1，最喜欢的一集',
	// 	uploader: 'cfdxkk',
	// 	kvid: 8,
	// 	videoCategory: '动漫',
	// 	videoTags: [
	// 		{ tagName: '动漫' },
	// 		{ tagName: '二次元' },
	// 		{ tagName: '国家队' },
	// 		{ tagName: 'DARLING in the FRANXX' },
	// 		{ tagName: '02' },
	// 		{ tagName: 'NCED' },
	// 		{ tagName: '片尾曲' },
	// 		{ tagName: 'エンディング' },
	// 		{ tagName: '无字幕' },
	// 	],
	// }

	// const result = await insertData2ElasticsearchCluster(ctx.elasticsearchClient, videoDocument.indexName, videoDocument.schema, videoData)
	// console.log('aaaaaaaaaaaaaaaaaaa', result)






	const esquery = {
		query_string: {
			query: 'fgo',
		},
	}

	const result = await searchDataFromElasticsearchCluster(ctx.elasticsearchClient, VideoDocument.indexName, VideoDocument.schema, esquery)
	console.log('ssssssssssearchResult', result)

	ctx.body = 'Hello World'

	await next()
}

