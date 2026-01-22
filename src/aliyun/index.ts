import crypto from 'crypto'
import { logging } from '../service/loggingService.js'

/**
 * 图片审核结果
 */
export type ImageReviewResult = {
	/** 是否过审，true 表示通过（pass 和 review 算通过），false 表示不通过（block） */
	passed: boolean
	/** 触发的审核标签，如 "normal", "porn", "terrorism", "ad" 等，多个标签用逗号分隔 */
	label: string
}

/**
 * 审核图片内容是否合规
 * @param imageUrl 公网可访问的图片 URL
 * @returns 审核结果：包含是否过审和触发的标签，undefined 表示审核失败
 */
export const reviewImageContent = async (imageUrl: string): Promise<ImageReviewResult | undefined> => {
	// 1. 前置参数校验
	if (!imageUrl || !imageUrl.trim() || !/^https?:\/\//.test(imageUrl.trim())) {
		logging('ERROR', '无法审核图片内容，图片 URL 为空或格式非法', undefined, { imageUrl })
		return undefined
	}

	const accessKeyId = process.env.ALIYUN_ACCESS_KEY_ID
	const accessKeySecret = process.env.ALIYUN_ACCESS_KEY_SECRET
	const regionId = process.env.ALIYUN_REGION_ID || 'cn-shanghai'

	if (!accessKeyId || !accessKeySecret) {
		logging('ERROR', '无法审核图片内容，阿里云 AccessKey 配置为空', undefined, { imageUrl })
		return undefined
	}

	try {
		// 2. 构建请求参数
		const taskId = `audit_${Date.now()}`
		const requestBody = {
			tasks: [
				{
					dataId: taskId,
					url: imageUrl.trim(),
					time: Date.now().toString(),
				},
			],
			scenes: ['porn', 'terrorism', 'ad'], // 检测场景
		}
		const bodyString = JSON.stringify(requestBody)
		const contentType = 'application/json'

		// 3. 构建阿里云 V2 签名所需参数
		const endpoint = `green.${regionId}.aliyuncs.com`
		const apiPath = '/green/image/scan'
		const method = 'POST'
		const date = new Date().toUTCString()
		const contentMd5 = crypto.createHash('md5').update(bodyString).digest('base64') // 计算 body 的 MD5

		// 4. 构建 V2 签名字符串
		const canonicalHeaders = [
			`content-md5:${contentMd5}`,
			`content-type:${contentType}`,
			`date:${date}`,
			`host:${endpoint}`,
		].join('\n')
		const signedHeaders = 'content-md5;content-type;date;host' // 签名覆盖的头
		const canonicalRequest = [
			method,
			apiPath,
			'', // 查询参数，无则为空
			canonicalHeaders,
			signedHeaders,
			crypto.createHash('sha256').update(bodyString).digest('hex'), // body 的 SHA256
		].join('\n')

		const stringToSign = [
			'ACS4-HMAC-SHA256',
			date,
			crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
		].join('\n')

		// 5. 计算签名（V2 算法）
		const hmac = crypto.createHmac('sha256', accessKeySecret)
		const signature = hmac.update(stringToSign).digest('base64')
		// Credential 格式：AccessKeyId/YYYYMMDD/Region/Service/acs4_request
		const dateStr = new Date().toISOString().split('T')[0].replace(/-/g, '') // YYYYMMDD
		const authorization = `ACS4-HMAC-SHA256 Credential=${accessKeyId}/${dateStr}/${regionId}/green/acs4_request, SignedHeaders=${signedHeaders}, Signature=${signature}`

		// 6. 发送请求（设置超时 10 秒）
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), 10000) // 10 秒超时

		let response: Response
		try {
			response = await fetch(`https://${endpoint}${apiPath}`, {
				method,
				headers: {
					'Content-Type': contentType,
					'Content-MD5': contentMd5,
					'Date': date,
					'Host': endpoint,
					'Authorization': authorization,
				},
				body: bodyString,
				signal: controller.signal,
			})
		} finally {
			clearTimeout(timeoutId) // 确保超时定时器被清理
		}

		// 7. 处理响应
		let responseText = ''
		try {
			responseText = await response.text() // 先读文本，避免 JSON 解析失败直接抛错
			const reviewResult = JSON.parse(responseText)

			// 检查 HTTP 状态码和接口返回码
			if (!response.ok) {
				logging('ERROR', `阿里云 API 调用失败，HTTP 状态码：${response.status}`, undefined, {
					imageUrl,
					status: response.status,
					result: reviewResult,
				})
				return undefined
			}

			if (reviewResult.code !== 200) {
				logging('ERROR', `阿里云图片审核接口返回错误码`, undefined, {
					imageUrl,
					code: reviewResult.code,
					msg: reviewResult.msg,
					result: reviewResult,
				})
				return undefined
			}

			// 8. 解析审核结果（优先取 suggestion 作为业务决策依据）
			if (!reviewResult.data || reviewResult.data.length === 0) {
				logging('ERROR', '审核结果无数据', undefined, { imageUrl, reviewResult })
				return undefined
			}

			const taskResult = reviewResult.data[0]
			if (!taskResult.results || taskResult.results.length === 0) {
				logging('ERROR', '审核任务无检测结果', undefined, { imageUrl, taskResult })
				return undefined
			}

			// 收集所有场景的审核结果
			const results = taskResult.results as Array<{ scene: string; label: string; suggestion: string; rate?: number }>
			
			// 判断是否过审：pass 和 review 算通过，block 算不通过
			const hasBlock = results.some((item) => item.suggestion === 'block')
			const passed = !hasBlock // 只要有一个 block 就不通过，否则通过

			// 收集所有非 normal 的 label（表示触发了什么情况）
			const labels = results
				.filter((item) => item.label && item.label !== 'normal')
				.map((item) => item.label)
			
			// 如果没有触发任何情况，label 为 "normal"
			const label = labels.length > 0 ? labels.join(',') : 'normal'

			return {
				passed,
				label,
			}

		} catch (parseError) {
			logging('ERROR', '审核结果 JSON 解析失败', parseError, {
				imageUrl,
				responseText,
			})
			return undefined
		}

	} catch (error) {
		// 统一捕获所有异常（网络超时、连接失败等）
		logging('ERROR', '图片审核请求异常', error, {
			imageUrl,
			errorMsg: (error as Error).message,
			stack: (error as Error).stack,
		})
		return undefined
	}
}

