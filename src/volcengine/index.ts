import { TosClient } from '@volcengine/tos-sdk'
import { logging } from '../service/loggingService.js'

const connectionTimeout = 10000
const minTosSignedUrlExpiresIn = 1
const maxTosSignedUrlExpiresIn = 604800

export type VolcengineTosSignedUrlMethod = 'GET' | 'PUT'

export type VolcengineTosImageUploadSignedPostPolicy = {
  signedUrl: string;
  uploadUrl: string;
  fileName: string;
  url: string;
  publicUrl: string;
  fields: Record<string, string>;
  uploadFields: Record<string, string>;
  uploadMethod: 'POST';
  maxSize: number;
  contentType: string;
}

const tosImageMaxSize = 2 * 1024 * 1024
const tosImageMinSize = 1
const allowedTosImageContentTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif', 'image/avif']

const getTosImageBucketName = (): string | undefined => process.env['TOS_IMAGE_BUCKET'] || process.env['TOS_BUCKET']

const getTosImageEndpoint = (): string | undefined => process.env['TOS_IMAGE_UPLOAD_ENDPOINT'] || process.env['TOS_ENDPOINT']

const getTosImagePublicBaseUrl = (): string | undefined => process.env['TOS_IMAGE_CDN_BASE_URL'] || process.env['TOS_IMAGE_PUBLIC_BASE_URL']

const getTosProtocolEndpoint = (endpoint: string): URL => {
  const protocolEndpoint = endpoint.startsWith('http://') || endpoint.startsWith('https://') ? endpoint : `https://${endpoint}`
  return new URL(protocolEndpoint)
}

const getTosSdkEndpointConfig = (endpoint: string): { endpoint: string; secure: boolean } => {
  const endpointUrl = getTosProtocolEndpoint(endpoint)
  return {
    endpoint: endpointUrl.host,
    secure: endpointUrl.protocol === 'https:',
  }
}

const encodeTosObjectKey = (objectKey: string): string => objectKey.split('/').map(pathPart => encodeURIComponent(pathPart)).join('/')

const decodeTosObjectKey = (objectKey: string): string => objectKey.split('/').map(pathPart => decodeURIComponent(pathPart)).join('/')

const normalizeTosImageContentType = (contentType?: string): string | undefined => {
  const normalizedContentType = contentType?.split(';')[0]?.trim().toLowerCase()
  if (!normalizedContentType || !allowedTosImageContentTypes.includes(normalizedContentType)) {
    return undefined
  }

  return normalizedContentType
}

const getTosImageObjectPublicBaseUrl = (): string | undefined => {
  const publicBaseUrl = getTosImagePublicBaseUrl()

  if (publicBaseUrl?.trim()) {
    return publicBaseUrl.replace(/\/+$/, '')
  }

  const bucketName = getTosImageBucketName()
  const endpoint = getTosImageEndpoint()

  if (!bucketName?.trim() || !endpoint?.trim()) {
    logging('ERROR', '无法创建 TOS 图片公开访问 Base URL，必要参数为空。请检查 TOS_IMAGE_PUBLIC_BASE_URL, TOS_IMAGE_BUCKET 和 TOS_ENDPOINT', undefined, {
      hasBucketName: Boolean(bucketName),
      hasEndpoint: Boolean(endpoint),
    })
    return undefined
  }

  try {
    const endpointUrl = getTosProtocolEndpoint(endpoint)
    const endpointPath = endpointUrl.pathname === '/' ? '' : endpointUrl.pathname.replace(/\/+$/, '')
    return `${endpointUrl.protocol}//${bucketName}.${endpointUrl.host}${endpointPath}`
  } catch (error) {
    logging('ERROR', '无法创建 TOS 图片公开访问 Base URL，endpoint 不合法', error, { endpoint })
    return undefined
  }
}

export const getVolcengineTosImageObjectUrl = (fileName: string): string | undefined => {
  const trimmedFileName = fileName?.trim()

  if (!trimmedFileName) {
    logging('ERROR', '无法创建 TOS 图片对象 URL，fileName 不能为空', undefined, {
      hasFileName: Boolean(trimmedFileName),
    })
    return undefined
  }

  const publicBaseUrl = getTosImageObjectPublicBaseUrl()

  if (!publicBaseUrl) {
    return undefined
  }

  return `${publicBaseUrl}/${encodeTosObjectKey(trimmedFileName)}`
}

export const getVolcengineTosImageObjectKeyFromUrl = (objectUrl: string): string | undefined => {
  const publicBaseUrl = getTosImageObjectPublicBaseUrl()

  if (!publicBaseUrl?.trim() || !objectUrl?.trim()) {
    logging('ERROR', '无法从 TOS 图片对象 URL 解析对象名，必要参数为空', undefined, {
      hasPublicBaseUrl: Boolean(publicBaseUrl),
      hasObjectUrl: Boolean(objectUrl),
    })
    return undefined
  }

  try {
    const baseUrl = new URL(`${publicBaseUrl.replace(/\/+$/, '')}/`)
    const url = new URL(objectUrl)

    if (url.origin !== baseUrl.origin) {
      logging('ERROR', '无法从 TOS 图片对象 URL 解析对象名，URL 不属于当前图片公开访问域名', undefined, { objectUrl })
      return undefined
    }

    const basePath = baseUrl.pathname.replace(/\/+$/, '')
    const objectPathPrefix = basePath ? `${basePath}/` : '/'

    if (!url.pathname.startsWith(objectPathPrefix)) {
      logging('ERROR', '无法从 TOS 图片对象 URL 解析对象名，URL 路径不属于当前图片公开访问路径', undefined, { objectUrl })
      return undefined
    }

    const encodedObjectKey = url.pathname.slice(objectPathPrefix.length)

    if (!encodedObjectKey) {
      logging('ERROR', '无法从 TOS 图片对象 URL 解析对象名，对象名为空', undefined, { objectUrl })
      return undefined
    }

    return decodeTosObjectKey(encodedObjectKey)
  } catch (error) {
    logging('ERROR', '无法从 TOS 图片对象 URL 解析对象名，URL 不合法', error, { objectUrl })
    return undefined
  }
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
    const endpointConfig = getTosSdkEndpointConfig(endpoint)
    return new TosClient({
      accessKeyId,
      accessKeySecret,
      region,
      endpoint: endpointConfig.endpoint,
      secure: endpointConfig.secure,
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
export const createVolcengineTosImageUploadSignedPostPolicy = async (fileName: string, expiresIn: number = 660, contentType?: string): Promise<VolcengineTosImageUploadSignedPostPolicy | undefined> => {
  const bucketName = getTosImageBucketName()
  const endpoint = getTosImageEndpoint()
  const normalizedContentType = normalizeTosImageContentType(contentType)

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

  if (!normalizedContentType) {
    logging('ERROR', '无法创建 TOS 图片上传签名，Content-Type 不合法', undefined, {
      fileName,
      expiresIn,
      contentType,
      allowedTosImageContentTypes,
    })
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
      fields: {
        'Content-Type': normalizedContentType,
      },
      conditions: [
        ['content-length-range', tosImageMinSize, tosImageMaxSize],
      ],
    })
    const endpointUrl = getTosProtocolEndpoint(endpoint)
    const signedUrl = `${endpointUrl.protocol}//${bucketName}.${endpointUrl.host}${endpointUrl.pathname === '/' ? '' : endpointUrl.pathname}`
    const url = getVolcengineTosImageObjectUrl(fileName)

    if (!url) {
      logging('ERROR', '创建 TOS 图片上传签名失败，无法生成图片对象 URL', undefined, { fileName, expiresIn })
      return undefined
    }

    const uploadFields = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, String(value)]))

    return {
      signedUrl,
      uploadUrl: signedUrl,
      fileName,
      url,
      publicUrl: url,
      fields: uploadFields,
      uploadFields,
      uploadMethod: 'POST',
      maxSize: tosImageMaxSize,
      contentType: normalizedContentType,
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
