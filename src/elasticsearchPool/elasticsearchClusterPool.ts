import { Client } from '@elastic/elasticsearch'
import { EsSchema2TsType } from './elasticsearchClusterPoolTypes.js'

/**
 * 创建 Elasticsearch 连接，这个函数在整个应用的生命周期里应该只被调用一次（only in elasticsearchMiddleware.ts）
 * @returns Elasticsearch 客户端连接
 */
export const connectElasticSearchCluster = async (): Promise<Client> => {
	try {
		const ELASTICSEARCH_ADMIN_USERNAME = process.env.ELASTICSEARCH_ADMIN_USERNAME
		const ELASTICSEARCH_ADMIN_PASSWORD = process.env.ELASTICSEARCH_ADMIN_PASSWORD
		const ELASTICSEARCH_CLUSTER_HOST = process.env.ELASTICSEARCH_CLUSTER_HOST
	
		if (!ELASTICSEARCH_ADMIN_USERNAME) {
			console.error('ERROR', '创建或连接搜索引擎集群失败：ELASTICSEARCH_ADMIN_USERNAME 为空，请检查环境变量设置')
			process.exit()
		}
		if (!ELASTICSEARCH_ADMIN_PASSWORD) {
			console.error('ERROR', '创建或连接搜索引擎集群失败：ELASTICSEARCH_ADMIN_PASSWORD 为空，请检查环境变量设置')
			process.exit()
		}
		if (!ELASTICSEARCH_CLUSTER_HOST) {
			console.error('ERROR', '创建或连接搜索引擎集群失败：ELASTICSEARCH_CLUSTER_HOST 为空，请检查环境变量设置')
			process.exit()
		}
	
		const ELASTICSEARCH_CLUSTER_HOST_LIST = ELASTICSEARCH_CLUSTER_HOST?.split(',')?.map(host => `https://${host}`)
	
		if (!ELASTICSEARCH_CLUSTER_HOST_LIST || ELASTICSEARCH_CLUSTER_HOST_LIST?.length <= 0) {
			console.error('ERROR', '创建或连接搜索引擎集群失败：ELASTICSEARCH_CLUSTER_HOST_LIST 为空，请检查环境变量设置，集群地址必须由以逗号分隔的集群地址和端口号组成，例：XXX.XXX.XXX.XXX:32000,YYY.YYY.YYY.YYY:32000,ZZZ.ZZZ.ZZZ.ZZZ:32000')
			process.exit()
		}
	
		const client = new Client({
			node: ELASTICSEARCH_CLUSTER_HOST_LIST,
			auth: {
				username: ELASTICSEARCH_ADMIN_USERNAME,
				password: ELASTICSEARCH_ADMIN_PASSWORD,
			},
			tls: {
				rejectUnauthorized: false, // 这将忽略 SSL 证书验证
			},
		})

		try {
			await client.ping()
		} catch (error) {
			console.error('ERROR', '创建或连接搜索引擎集群失败：PING 返回了一个错误的结果：', error)
			process.exit()
		}
	
		try {
			const elasticsearchClusterInfoResult = await client.info()
			console.log('Elasticsearch Cluster Connect successfully!')
			console.log(`cluster_name: ${elasticsearchClusterInfoResult?.cluster_name}, cluster_uuid: ${elasticsearchClusterInfoResult?.cluster_uuid}, current_connect_name: ${elasticsearchClusterInfoResult?.name}, version: ${elasticsearchClusterInfoResult?.version?.number}, tagline: ${elasticsearchClusterInfoResult?.tagline}`)
			console.log()
		} catch (error) {
			console.error('ERROR', '创建或连接搜索引擎集群失败：INFO 返回了一个错误的结果：', error)
			process.exit()
		}

		return client
	} catch (error) {
		console.error('ERROR', '创建搜索引擎连接失败：connectElasticSearchCluster 意外终止：', error)
		process.exit()
	}
}

// export const insertData2Elasticsearch = async (): Promise< ElasticsearchResult<> > => {

// }





