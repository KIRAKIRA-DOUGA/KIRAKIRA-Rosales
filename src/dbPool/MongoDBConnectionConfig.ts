import { URLSearchParams } from 'node:url'
import type { ConnectOptions } from 'mongoose'

/** 配置错误只包含变量名称，不包含 URI、密码或证书内容。 */
export class MongoDBConfigurationError extends Error {
	constructor(message: string) {
		super(message)
		this.name = 'MongoDBConfigurationError'
	}
}

type Environment = Record<string, string | undefined>

function configurationError(message: string): never {
	throw new MongoDBConfigurationError(message)
}

function decodeCertificate(value: string | undefined, variable: string): string | undefined {
	if (!value) return undefined
	const compact = value.replace(/\s/g, '')
	if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 === 1) {
		configurationError(`${variable} 必须是有效的 Base64`)
	}
	const decoded = Buffer.from(compact, 'base64')
	if (decoded.toString('base64').replace(/=+$/, '') !== compact.replace(/=+$/, '')) {
		configurationError(`${variable} 必须是有效的 Base64`)
	}
	return decoded.toString('utf8')
}

/**
 * 使用标准 MongoDB URI；自定义证书仅接受 Base64 编码的 PEM 内容。
 * 返回值包含认证资料，不应记录到日志。
 */
export function buildMongoDBConnectionConfig(env: Environment = process.env): { uri: string; options: ConnectOptions } {
	const options: ConnectOptions = {}
	const uri = env.MONGODB_URI?.trim()
	if (!uri) configurationError('缺少 MONGODB_URI')

	// 不使用 URL 解析多个 host:port；具体的 URI 参数由 MongoDB 驱动校验。
	const authority = /^mongodb(?:\+srv)?:\/\/([^/?#]+)(?:[/?]|$)/.exec(uri)?.[1]
	if (!authority || /[\s#]/.test(uri)) configurationError('MONGODB_URI 必须是有效的 MongoDB 连接字符串')
	const query = new URLSearchParams(uri.includes('?') ? uri.slice(uri.indexOf('?') + 1) : '')
	const entries = [...query.entries()].map(([key, value]) => [key.toLowerCase(), value] as const)
	const values = (key: string) => entries.filter(([name]) => name === key).map(([, value]) => value)
	// 禁止驱动通过 URI 读取本地证书、私钥或 CRL 文件。
	if (['tlscafile', 'tlscertificatekeyfile', 'tlscertificatekeyfilepassword', 'tlscrlfile'].some(name => values(name).length)) {
		configurationError('MONGODB_URI 不支持 TLS 文件参数；证书使用 MONGODB_TLS_CA_BASE64、MONGODB_TLS_CERT_BASE64 和 MONGODB_TLS_KEY_BASE64')
	}
	const tlsValues = [...values('tls'), ...values('ssl')]
	if (tlsValues.some(value => value !== 'true' && value !== 'false') || new Set(tlsValues).size > 1) {
		configurationError('MONGODB_URI 的 tls/ssl 必须是相同的 true 或 false')
	}
	const tlsDisabled = tlsValues[0] === 'false'

	// URI 中的认证资料优先；未包含认证资料时，密码以独立 Secret 提供。
	if (!authority.includes('@') && (env.MONGODB_USERNAME !== undefined || env.MONGODB_PASSWORD !== undefined)) {
		if (!env.MONGODB_USERNAME) configurationError('使用独立凭据时必须提供 MONGODB_USERNAME')
		const x509 = values('authmechanism').some(value => value === 'MONGODB-X509')
		if (env.MONGODB_PASSWORD === undefined && !x509) configurationError('使用独立凭据时必须提供 MONGODB_PASSWORD')
		options.auth = { username: env.MONGODB_USERNAME, password: env.MONGODB_PASSWORD }
	}

	// 保留旧应用的默认读偏好；URI 中可以显式选择其他读偏好。
	if (!values('readpreference').length) options.readPreference = 'secondaryPreferred'

	const ca = decodeCertificate(env.MONGODB_TLS_CA_BASE64, 'MONGODB_TLS_CA_BASE64')
	const cert = decodeCertificate(env.MONGODB_TLS_CERT_BASE64, 'MONGODB_TLS_CERT_BASE64')
	const key = decodeCertificate(env.MONGODB_TLS_KEY_BASE64, 'MONGODB_TLS_KEY_BASE64')
	if (!!cert !== !!key) configurationError('MONGODB_TLS_CERT_BASE64 和 MONGODB_TLS_KEY_BASE64 必须同时提供')
	const hasCertificate = !!(ca || cert || key)
	if (tlsDisabled && hasCertificate) configurationError('tls=false 不能同时配置 MongoDB TLS 证书')
	if (hasCertificate) options.tls = true
	if (ca) options.ca = ca
	if (cert) options.cert = cert
	if (key) options.key = key

	// SRV 使用驱动的默认 TLS 行为；不再因缺少 CA 自动跳过证书校验。
	return { uri, options }
}
