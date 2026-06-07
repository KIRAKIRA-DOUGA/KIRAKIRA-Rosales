import { TosClient } from '@volcengine/tos-sdk'
import { logging } from '../service/loggingService.js'

const connectionTimeout = 10000
const minTosSignedUrlExpiresIn = 1
const maxTosSignedUrlExpiresIn = 604800

export type VolcengineTosSignedUrlMethod = 'GET' | 'PUT'

export type VolcengineTosImageUploadSignedPostPolicy = {
  signedUrl: string;
  fileName: string;
  url: string;
  fields: Record<string, string>;
  maxSize: number;
}

const tosImageMaxSize = 2 * 1024 * 1024
const tosImageMinSize = 1
const allowedTosImageContentTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif']

const getTosImageBucketName = (): string | undefined => process.env['TOS_IMAGE_BUCKET'] || process.env['TOS_BUCKET']

const getTosImageEndpoint = (): string | undefined => process.env['TOS_IMAGE_UPLOAD_ENDPOINT'] || process.env['TOS_ENDPOINT']

const getTosImagePublicBaseUrl = (): string | undefined => process.env['TOS_IMAGE_CDN_BASE_URL'] || process.env['TOS_IMAGE_PUBLIC_BASE_URL']

const getTosProtocolEndpoint = (endpoint: string): URL => {
  const protocolEndpoint = endpoint.startsWith('http://') || endpoint.startsWith('https://') ? endpoint : `https://${endpoint}`
  return new URL(protocolEndpoint)
}

export const getVolcengineTosImageObjectUrl = (fileName: string): string | undefined => {
  const publicBaseUrl = getTosImagePublicBaseUrl()

  if (!publicBaseUrl?.trim() || !fileName?.trim()) {
    logging('ERROR', '无法创建 TOS 图片对象 URL，必要参数为空。请检查 TOS_IMAGE_CDN_BASE_URL 或 TOS_IMAGE_PUBLIC_BASE_URL', undefined, {
      hasPublicBaseUrl: Boolean(publicBaseUrl),
      hasFileName: Boolean(fileName),
    })
    return undefined
  }

  return `${publicBaseUrl.replace(/\/+$/, '')}/${encodeURIComponent(fileName)}`
}

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

/**
 * 生成用于上传图片到 TOS 的 POST Policy，限制图片大小最大 2MiB
 */
export const createVolcengineTosImageUploadSignedPostPolicy = async (fileName: string, expiresIn: number = 660): Promise<VolcengineTosImageUploadSignedPostPolicy | undefined> => {
  const bucketName = getTosImageBucketName()
  const endpoint = getTosImageEndpoint()

  if (!bucketName?.trim()) {
    logging('ERROR', '无法创建 TOS 图片上传签名，图片 bucket 不能为空。请检查 TOS_IMAGE_BUCKET 或 TOS_BUCKET', undefined, { fileName, expiresIn })
    return undefined
  }

  if (!endpoint?.trim()) {
    logging('ERROR', '无法创建 TOS 图片上传签名，endpoint 不能为空。请检查 TOS_IMAGE_UPLOAD_ENDPOINT 或 TOS_ENDPOINT', undefined, { fileName, expiresIn })
    return undefined
  }

  if (!fileName?.trim()) {
    logging('ERROR', '无法创建 TOS 图片上传签名，fileName 不能为空', undefined, { fileName, expiresIn })
    return undefined
  }

  if (expiresIn < minTosSignedUrlExpiresIn || expiresIn > maxTosSignedUrlExpiresIn) {
    logging('ERROR', `无法创建 TOS 图片上传签名, expiresIn 必须在 ${minTosSignedUrlExpiresIn} 到 ${maxTosSignedUrlExpiresIn} 秒之间`, undefined, { fileName, expiresIn })
    return undefined
  }

  const client = createTosClient()
  if (!client) {
    return undefined
  }

  try {
    const fields = await client.calculatePostSignature({
      bucket: bucketName,
      key: fileName,
      expiresIn,
      conditions: [
        ['content-length-range', tosImageMinSize, tosImageMaxSize],
        ['starts-with', '$Content-Type', 'image/'],
      ],
    })
    const endpointUrl = getTosProtocolEndpoint(endpoint)
    const signedUrl = `${endpointUrl.protocol}//${bucketName}.${endpointUrl.host}${endpointUrl.pathname === '/' ? '' : endpointUrl.pathname}`
    const url = getVolcengineTosImageObjectUrl(fileName)

    if (!url) {
      logging('ERROR', '创建 TOS 图片上传签名失败，无法生成图片对象 URL', undefined, { fileName, expiresIn })
      return undefined
    }

    return {
      signedUrl,
      fileName,
      url,
      fields: Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)])),
      maxSize: tosImageMaxSize,
    }
  } catch (error) {
    logging('ERROR', '创建 TOS 图片上传签名失败', error, { fileName, expiresIn })
    return undefined
  }
}

export const checkVolcengineTosImageObjectValid = async (fileName: string): Promise<boolean> => {
  const bucketName = getTosImageBucketName()

  if (!bucketName?.trim() || !fileName?.trim()) {
    logging('ERROR', '检查 TOS 图片对象是否存在失败，必要参数为空', undefined, {
      hasBucketName: Boolean(bucketName),
      hasFileName: Boolean(fileName),
    })
    return false
  }

  const client = createTosClient()
  if (!client) {
    return false
  }

  try {
    const objectHeadResult = await client.headObject({
      bucket: bucketName,
      key: fileName,
    })
    const objectHeadData = objectHeadResult.data
    const contentLength = Number(objectHeadData['content-length'])
    const contentType = String(objectHeadData['content-type'] || '').split(';')[0].trim().toLowerCase()

    if (!Number.isFinite(contentLength) || contentLength < tosImageMinSize || contentLength > tosImageMaxSize) {
      logging('ERROR', 'TOS 图片对象大小不合法', undefined, { fileName, contentLength, tosImageMinSize, tosImageMaxSize })
      return false
    }

    if (!allowedTosImageContentTypes.includes(contentType)) {
      logging('ERROR', 'TOS 图片对象 Content-Type 不合法', undefined, { fileName, contentType, allowedTosImageContentTypes })
      return false
    }

    return true
  } catch (error) {
    logging('ERROR', '检查 TOS 图片对象是否合法失败', error, { fileName })
    return false
  }
}
