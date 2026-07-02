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
 * 将图片字段值规范化为数据库存储的 TOS 对象名（key）
 * 仅当传入值为 http(s) URL 时尝试解析为对象名；解析失败（非本站 TOS 域名等）时原样返回。
 * 空值、裸对象名、旧 Cloudflare 图片 ID 等非 URL 值直接原样返回，避免在正常业务路径上产生错误日志
 * @param value 图片字段值（TOS 完整 URL、对象名、旧图片 ID 或空值）
 * @returns 规范化后的值
 */
export function normalizeTosImageObjectKey(value: string): string
export function normalizeTosImageObjectKey(value: string | undefined): string | undefined
export function normalizeTosImageObjectKey(value: string | undefined): string | undefined {
  if (!value || !/^https?:\/\//i.test(value)) {
    return value
  }
  return getVolcengineTosImageObjectKeyFromUrl(value) ?? value
}

/**
 * 预生成的图片变体档位。
 * 变体命名为 `{原对象名}.{suffix}.webp`，前端 provider（KIRAKIRA-Cerasus providers/nuxt-image/tos-images.ts）按宽度选档，须与此保持一致。
 * w32 为预模糊的占位图档位，用于渐进加载的第一帧
 */
export const tosImageVariants = [
  { suffix: 'w32', process: 'image/resize,w_32/format,webp/quality,q_50/blur,r_3,s_2' },
  { suffix: 'w200', process: 'image/resize,w_200/format,webp/quality,q_80' },
  { suffix: 'w640', process: 'image/resize,w_640/format,webp/quality,q_80' },
  { suffix: 'w1280', process: 'image/resize,w_1280/format,webp/quality,q_80' },
] as const

/**
 * 用 TOS 图片处理「另存为」为已上传的原图预生成多分辨率变体并落盘
 * 逐档发起带 x-tos-save-object 的签名 GET 请求（串行，避开图片处理并发上限），处理结果作为普通对象存回同一存储桶。
 * 读取路径因此无需任何实时处理。文档：https://www.volcengine.com/docs/6349/762921
 * @param fileName 原图对象名（key）
 * @returns 是否全部档位生成成功
 */
export const persistTosImageVariants = async (fileName: string): Promise<boolean> => {
  const bucketName = getTosImageBucketName()
  const trimmedFileName = fileName?.trim()

  if (!bucketName?.trim()) {
    logging('ERROR', '无法生成 TOS 图片变体，图片 bucket 不能为空。请检查 TOS_IMAGE_BUCKET 或 TOS_BUCKET', undefined, { fileName })
    return false
  }

  if (!trimmedFileName) {
    logging('ERROR', '无法生成 TOS 图片变体，fileName 不能为空', undefined, { fileName })
    return false
  }

  const client = createTosClient()
  if (!client) {
    return false
  }

  try {
    for (const variant of tosImageVariants) {
      const variantKey = `${trimmedFileName}.${variant.suffix}.webp`
      const signedUrl = client.getPreSignedUrl({
        bucket: bucketName,
        key: trimmedFileName,
        method: 'GET',
        expires: 660,
        query: {
          'x-tos-process': variant.process,
          'x-tos-save-object': Buffer.from(variantKey).toString('base64url'), // 目标对象名需 URL 安全的 Base64 编码
        },
      })

      const response = await fetch(signedUrl)
      if (!response.ok) {
        const errorText = (await response.text()).slice(0, 500)
        logging('ERROR', '生成 TOS 图片变体失败，处理请求未成功', undefined, { fileName: trimmedFileName, variant: variant.suffix, status: response.status, errorText })
        return false
      }
      await response.arrayBuffer() // 另存为仍会返回处理后的图片数据，消费掉以释放连接
    }
    return true
  } catch (error) {
    logging('ERROR', '生成 TOS 图片变体失败，未知错误', error, { fileName: trimmedFileName })
    return false
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
