import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import axios from 'axios'

/**
 * 生成一个预签名 URL，该 URL 可以用于向 Cloudflare R2 存储上传数据
 * @param bucketName 目标存储桶名字
 * @param fileName 文件名字，注意：是文件上传到 Cloudflare R2 之后的名字，不是要上传的文件名字
 * @param expiresIn 预签名 URL 的有效期限，单位：秒。默认 3600 秒
 * @returns Cloudflare R2 预签名 URL
 */
export const createCloudflareR2PutSignedUrl = async (bucketName: string, fileName: string, expiresIn: number = 3600): Promise<string | undefined> => {
	const r2EndPoint = process.env.CF_R2_END_POINT
	const accessKeyId = process.env.CF_ACCESS_KEY_ID
	const secretAccessKey = process.env.CF_SECRET_ACCESS_KEY

	if (expiresIn <= 0) {
		console.error('ERROR', '无法创建 R2 预签名 URL, 过期时间必须大于等于 0 秒 ', { bucketName, fileName, expiresIn })
		return undefined
	}

	if (expiresIn > 604800) {
		console.error('ERROR', '无法创建 R2 预签名 URL, 过期时间必须大于等于 604800 秒（七天）', { bucketName, fileName, expiresIn })
		return undefined
	}

	if (!r2EndPoint && !accessKeyId && !secretAccessKey) {
		console.error('ERROR', '无法创建 S3(R2) 存储桶实例，必要的参数： r2EndPoint, accessKeyId 和 secretAccessKey 可能为空。', { bucketName, fileName, expiresIn })
		return undefined
	}

	try {
		const R2 = new S3Client({
			endpoint: r2EndPoint,
			credentials: {
				accessKeyId,
				secretAccessKey,
			},
			region: 'auto',
		})

		if (!R2) {
			console.error('ERROR', '创建的 R2 客户端为空', { bucketName, fileName, expiresIn })
			return undefined
		}

		try {
			const url = await getSignedUrl(
				R2,
				new PutObjectCommand({
					Bucket: bucketName,
					Key: fileName,
				}),
				{ expiresIn },
			)

			if (!url) {
				console.error('ERROR', '创建的预签名 URL 为空', { bucketName, fileName, expiresIn })
				R2.destroy()
				return undefined
			}

			R2.destroy()
			return url
		} catch (error) {
			console.error('ERROR', '创建预签名 URL 失败，错误信息：', error, { bucketName, fileName, expiresIn })
			R2.destroy()
			return undefined
		}
	} catch (error) {
		console.error('ERROR', '连接 S3(R2) 存储桶或创建预签名 URL 失败，错误信息：', error, { bucketName, fileName, expiresIn })
		return undefined
	}
}

/**
 * 生成一个预签名 URL，该 URL 可以用于向 Cloudflare Images 上传图片
 * @param fileName 图片名字，注意：是文件上传到 R2 之后的名字，不是要上传的文件名字，不要求文件后缀名，建议文件名使用 URL 友好字符
 * @param expiresIn 预签名 URL 的有效期限，单位：秒。默认 180秒（3 分钟），最小 120（2 分钟），最大 21600（360 分钟，6 小时）
 * @param metaData 图片元数据
 * @returns 预签名 URL，该 URL 可以用于向 Cloudflare Images 上传图片
 */
export const createCloudflareImageUploadSignedUrl = async (fileName?: string, expiresIn: number = 180, metaData?: Record<string, string>): Promise<string | undefined> => {
	try {
		const imagesEndpointUrl = process.env.CF_IMAGES_ENDPOINT_URL
		const imagesToken = process.env.CF_IMAGES_TOKEN

		if (expiresIn < 120) {
			console.error('ERROR', '无法创建 Cloudflare Images 预签名 URL, 过期时间必须大于等于 120 秒 （2 分钟）', { fileName, expiresIn, metaData })
			return undefined
		}

		if (expiresIn > 21600) {
			console.error('ERROR', '无法创建 Cloudflare Images 预签名 URL, 过期时间必须大于等于 21600 秒（360 分钟，6 小时）', { fileName, expiresIn, metaData })
			return undefined
		}

		if (!imagesEndpointUrl && !imagesToken) {
			console.error('ERROR', '无法创建 Cloudflare Images 预签名 URL： imagesEndpointUrl 和 imagesToken 可能为空。', { fileName, expiresIn, metaData })
			return undefined
		}

		// 创建 Axios 请求数据
		const data: Record<string, string | Record<string, string> > = {}
		data.expiry = (new Date((new Date()).getTime() + expiresIn * 1000)).toISOString().replace(/\.\d{3}/, '') // 生成的日期格式为：2024-03-17T13:47:28Z
		fileName && (data.id = fileName)
		metaData && (data.metaData = metaData)

		// 创建 Axios 请求配置
		const config = {
			headers: {
				Authorization: `Bearer ${imagesToken}`,
				'Content-Type': 'multipart/form-data',
			},
		}

		try {
			const imageUploadSignedUrlResult = await axios.post(imagesEndpointUrl, data, config)
			const imageUploadSignedUrl = imageUploadSignedUrlResult?.data?.result?.uploadURL
			if (imageUploadSignedUrlResult.status === 200 && imageUploadSignedUrl) {
				return imageUploadSignedUrl
			} else {
				console.error('ERROR', '无法创建 Cloudflare Images 预签名 URL：未能创建 URL！', { fileName, expiresIn, metaData })
				return undefined
			}
		} catch (error) {
			console.error('ERROR', '无法创建 Cloudflare Images 预签名 URL：网络请求失败！', error, { fileName, expiresIn, metaData })
			return undefined
		}
	} catch (error) {
		console.error('ERROR', '创建 Cloudflare Images 上传预签名 URL 失败：', error)
	}
}
