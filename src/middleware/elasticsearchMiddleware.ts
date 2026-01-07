import { Client } from '@elastic/elasticsearch'
import { connectElasticSearchCluster } from '../elasticsearchPool/ElasticsearchClusterPool.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'
import { logging } from '../service/loggingService.js'

let client: Client
try {
	client = await connectElasticSearchCluster()
} catch (error) {
	logging('ERROR', '创建 Elasticsearch 客户端失败：', error, undefined, { recordingLogs: false })
	process.exit()
}

export default async function elasticsearchMiddleware(ctx: koaCtx, next: koaNext) {
	if (client) {
		ctx.elasticsearchClient = client
	} else {
		logging('ERROR', '创建 Elasticsearch 客户端失败：client 为空', undefined, undefined, { recordingLogs: false })
		process.exit()
	}
	await next()
}
