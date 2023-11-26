import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'

/**
 * 生成一个预签名 URL，该 URL 可以用于向 R2 存储上传数据
 * @param bucketName 目标存储桶名字
 * @param fileName 文件名字，注意：是文件上传到 R2 之后的名字，不是要上传的文件名字
 * @param expiresIn 预签名 URL 的有效期限，单位：秒。默认 3600 秒
 * @returns 预签名 URL
 */
export const createR2PutSignedUrl = async (bucketName: string, fileName: string, expiresIn: number = 3600): Promise<string | undefined> => {
	const r2EndPoint = process.env.R2_END_POINT
	const accessKeyId = process.env.ACCESS_KEY_ID
	const secretAccessKey = process.env.SECRET_ACCESS_KEY

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
