import { Client } from '@elastic/elasticsearch'
import { connectElasticSearchCluster } from '../elasticsearchPool/ElasticsearchClusterPool.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'

let client: Client
try {
	client = await connectElasticSearchCluster()
} catch (error) {
	console.error('ERROR', '创建 Elasticsearch 客户端失败：', error)
	process.exit()
}

export default async function elasticsearchMiddleware(ctx: koaCtx, next: koaNext) {
	if (client) {
		ctx.elasticsearchClient = client
	} else {
		console.error('ERROR', '创建 Elasticsearch 客户端失败：client 为空')
		process.exit()
	}
	await next()
}
