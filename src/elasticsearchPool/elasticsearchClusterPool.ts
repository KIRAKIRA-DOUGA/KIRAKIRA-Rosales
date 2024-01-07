import { Client } from '@elastic/elasticsearch'
import { QueryDslQueryContainer } from '@elastic/elasticsearch/lib/api/types.js'
import { isEmptyObject } from '../common/ObjectTool.js'
import { EsQueryType, EsResultType, EsSchema2TsType } from './elasticsearchClusterPoolTypes.js'

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

/**
 * 向 Elasticsearch 集群插入数据，并刷新（如果 refreshFlag 为 true 则立即刷新，但默认为 false，等待集群自动刷新）
 * @param client Elasticsearch 连接，应存放在 ctx 中
 * @param indexName 索引的名字，该字段应当与 schema 存放于同一个对象中（这样 schema 和 indexName 构成了绑定关系）
 * @param schema 要插入的索引的 schema （在 Elasticsearch 中应该叫做：索引模板），主要功能是只是提供了泛型 T 并限定了 data 的类型，该字段应当与 indexName 存放于同一个对象中（这样 schema 和 indexName 构成了绑定关系）
 * @param data 要插入的数据，类型是根据 schema 的类型泛型推算而来
 * @param refreshFlag 在插入数据后是否立即刷新搜索（在高并发场景下不建议立即刷新搜索）
 * @returns 插入数据的结果，如果成功则返回 {success: true}，否则 {success: false}
 */
export const insertData2ElasticsearchCluster = async <T>(client: Client, indexName: string, schema: T, data: EsSchema2TsType<T>, refreshFlag: boolean = false): Promise< EsResultType< EsSchema2TsType<T> > > => {
	try {
		if (!isEmptyObject(schema as object) && !isEmptyObject(data) && indexName && client && !isEmptyObject(client)) {
			try {
				const indexResult = await client.index< EsSchema2TsType<T> >({
					index: indexName,
					document: data,
				})
				if (indexResult && indexResult.result) {
					if (refreshFlag) {
						// 在索引（v.）数据之后可以手动执行 refresh 才能显示在搜索结果里，如果不手动执行，集群会每隔一段时间自动执行一次
						try {
							const refreshResult = await client.indices.refresh({ index: indexName })
							if (refreshResult) {
								return { success: true, message: '向 Elasticsearch 插入数据成功，手动刷新搜索成功', result: [indexResult.result] as unknown as EsSchema2TsType<T>[] }
							} else {
								return { success: true, message: '向 Elasticsearch 插入数据成功，但刷新搜索的结果为空', result: [indexResult.result] as unknown as EsSchema2TsType<T>[] }
							}
						} catch (error) {
							console.warn('WARN', 'WARNING', '向 Elasticsearch 插入数据成功，但刷新搜索时出错', error)
							return { success: true, message: '向 Elasticsearch 插入数据成功，但刷新搜索时出错', result: [indexResult.result] as unknown as EsSchema2TsType<T>[] }
						}
					} else {
						return { success: true, message: '向 Elasticsearch 插入数据成功，请等待自动刷新', result: [indexResult.result] as unknown as EsSchema2TsType<T>[] }
					}
				} else {
					console.error('ERROR', '向 Elasticsearch 插入数据时出错，索引（v.）数据的返回结果异常')
					return { success: false, message: '向 Elasticsearch 插入数据时出错，索引（v.）数据的返回结果异常' }
				}
			} catch (error) {
				console.error('ERROR', '向 Elasticsearch 插入数据时出错，索引（v.）数据时出错', error)
				return { success: false, message: '向 Elasticsearch 插入数据时出错，索引（v.）数据时出错' }
			}
		} else {
			console.error('ERROR', '向 Elasticsearch 插入数据时出错，schema、data、indexName 或 client 为空')
			return { success: false, message: '向 Elasticsearch 插入数据时出错，必要的数据为空' }
		}
	} catch (error) {
		console.error('ERROR', '向 Elasticsearch 插入数据时出错，未知异常', error)
		return { success: false, message: '向 Elasticsearch 插入数据时出错，未知异常' }
	}
}

/**
 * 从 Elasticsearch 集群搜索数据
 * @param client Elasticsearch 连接，应存放在 ctx 中
 * @param indexName 索引的名字，该字段应当与 schema 存放于同一个对象中（这样 schema 和 indexName 构成了绑定关系）
 * @param schema 要插入的索引的 schema （在 Elasticsearch 中应该叫做：索引模板），主要功能是只是提供了泛型 T 并限定了 data 的类型，该字段应当与 indexName 存放于同一个对象中（这样 schema 和 indexName 构成了绑定关系）
 * @param query 查询的参数，类似于数据库的 WHERE，但 Elasticsearch 有一套自己的逻辑，建议参考官方文档。
 * @returns 查询的返回结果
 */
export const searchDataFromElasticsearchCluster = async <T>(client: Client, indexName: string, schema: T, query: QueryDslQueryContainer): Promise< EsResultType< EsSchema2TsType<T> > > => {
	try {
		if (client && !isEmptyObject(client) && indexName && schema && !isEmptyObject(schema as object) && query && !isEmptyObject(query)) {
			try {
				const result = await client.search< EsQueryType<T> >({
					index: indexName,
					query,
				})
				if (result && !isEmptyObject(result) && !result.timed_out) {
					const hits = result?.hits?.hits
					if (hits?.length && hits.length > 0) {
						return { success: true, message: '在 Elasticsearch 搜索成功', result: hits.map(hit => hit._source as EsSchema2TsType<T>) }
					} else {
						return { success: true, message: '在 Elasticsearch 搜索成功，但没有结果', result: [] }
					}
				} else {
					console.error('ERROR', '在 Elasticsearch 搜索数据失败，返回结果为空或异常')
					return { success: false, message: '在 Elasticsearch 搜索数据失败，返回结果为空或异常' }
				}
			} catch (error) {
				console.error('ERROR', '在 Elasticsearch 搜索数据失败，搜索数据时出错', error)
				return { success: false, message: '在 Elasticsearch 搜索数据失败，搜索数据时出错' }
			}
		} else {
			console.error('ERROR', '在 Elasticsearch 搜索数据失败，必要的参数为空')
			return { success: false, message: '在 Elasticsearch 搜索数据失败，必要的参数为空' }
		}
	} catch (error) {
		console.error('ERROR', '在 Elasticsearch 搜索数据失败，未知异常', error)
		return { success: false, message: '在 Elasticsearch 搜索数据失败，未知异常' }
	}
}





