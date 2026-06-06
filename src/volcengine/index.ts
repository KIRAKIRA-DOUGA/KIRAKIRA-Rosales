import { TosClient } from '@volcengine/tos-sdk'
import { logging } from '../service/loggingService.js'

const connectionTimeout = 10000
const minTosSignedUrlExpiresIn = 1
const maxTosSignedUrlExpiresIn = 604800

export type VolcengineTosSignedUrlMethod = 'GET' | 'PUT'


/**
 * 创建火山引擎 TOS 客户端实例
 * @returns TOS 客户端实例，创建失败返回 undefined
 */
const createTosClient = (): TosClient | undefined => {
  const accessKeyId = process.env['TOS_ACCESS_KEY']
  const accessKeySecret = process.env['TOS_SECRET_KEY']
  const region = process.env['TOS_REGION']
  const endpoint = process.env['TOS_ENDPOINT']

  if (!accessKeyId || !accessKeySecret || !region || !endpoint) {
    logging('ERROR', '无法创建 TOS 客户端，环境变量缺失。请检查 TOS_ACCESS_KEY, TOS_SECRET_KEY, TOS_REGION, TOS_ENDPOINT', undefined, {
      hasAccessKeyId: Boolean(accessKeyId),
      hasAccessKeySecret: Boolean(accessKeySecret),
      hasRegion: Boolean(region),
      hasEndpoint: Boolean(endpoint),
    })
    return undefined
  }

  try {
    return new TosClient({
      accessKeyId,
      accessKeySecret,
      region,
      endpoint,
      connectionTimeout,
    })
  } catch (error) {
    logging('ERROR', '创建 TOS 客户端失败', error)
    return undefined
  }
}

/**
 * 生成火山引擎 TOS 预签名 URL
 * @param bucketName 存储桶名称
 * @param fileName 对象键名（上传后在 TOS 中的对象名）
 * @param method HTTP 方法，支持 GET/PUT，默认 PUT
 * @param expiresIn 预签名 URL 过期时间（秒），范围 [1, 604800]
 * @returns 预签名 URL
 */
export const createVolcengineTosSignedUrl = async (bucketName: string, fileName: string, method: VolcengineTosSignedUrlMethod = 'PUT', expiresIn: number = 3600): Promise<string | undefined> => {
  if (!bucketName?.trim()) {
    logging('ERROR', '无法创建 TOS 预签名 URL, bucketName 不能为空', undefined, { bucketName, fileName, method, expiresIn })
    return undefined
  }

  if (!fileName?.trim()) {
    logging('ERROR', '无法创建 TOS 预签名 URL, fileName 不能为空', undefined, { bucketName, fileName, method, expiresIn })
    return undefined
  }

  if (expiresIn < minTosSignedUrlExpiresIn || expiresIn > maxTosSignedUrlExpiresIn) {
    logging('ERROR', `无法创建 TOS 预签名 URL, expiresIn 必须在 ${minTosSignedUrlExpiresIn} 到 ${maxTosSignedUrlExpiresIn} 秒之间`, undefined, {
      bucketName,
      fileName,
      method,
      expiresIn,
    })
    return undefined
  }

  const client = createTosClient()
  if (!client) {
    return undefined
  }

  try {
    const signedUrl = client.getPreSignedUrl({
      bucket: bucketName,
      key: fileName,
      method,
      expires: expiresIn,
    })

    if (!signedUrl) {
      logging('ERROR', '创建的 TOS 预签名 URL 为空', undefined, { bucketName, fileName, method, expiresIn })
      return undefined
    }

    return signedUrl
  } catch (error) {
    logging('ERROR', '创建 TOS 预签名 URL 失败', error, { bucketName, fileName, method, expiresIn })
    return undefined
  }
}

/**
 * 生成用于上传对象到 TOS 的 PUT 预签名 URL
 */
export const createVolcengineTosPutSignedUrl = async (bucketName: string, fileName: string, expiresIn: number = 3600): Promise<string | undefined> => {
  return createVolcengineTosSignedUrl(bucketName, fileName, 'PUT', expiresIn)
}