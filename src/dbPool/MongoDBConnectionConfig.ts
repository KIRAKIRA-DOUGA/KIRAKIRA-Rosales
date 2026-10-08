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

function decodeCertificate(value: string | undefined, variable: string): Buffer | undefined {
	if (!value) return undefined
	const compact = value.replace(/\s/g, '')
	if (!compact || !/^[A-Za-z0-9+/]+={0,2}$/.test(compact) || compact.length % 4 === 1) {
		configurationError(`${variable} 必须是有效的 Base64`)
	}
	const decoded = Buffer.from(compact, 'base64')
	if (decoded.toString('base64').replace(/=+$/, '') !== compact.replace(/=+$/, '')) {
		configurationError(`${variable} 必须是有效的 Base64`)
	}
	return decoded
}

/**
 * 使用标准 MongoDB URI；未提供 URI 时兼容旧的分项环境变量。
 * 返回值包含认证资料，不应记录到日志。
 */
export function buildMongoDBConnectionConfig(env: Environment = process.env): { uri: string; options: ConnectOptions } {
	const options: ConnectOptions = {}
	let uri = env.MONGODB_URI?.trim()

	if (!uri) {
		const protocol = env.MONGODB_PROTOCOL?.trim() || 'mongodb'
		if (protocol !== 'mongodb' && protocol !== 'mongodb+srv') {
			configurationError('MONGODB_PROTOCOL 必须是 mongodb 或 mongodb+srv')
		}
		const hosts = env.MONGODB_CLUSTER_HOST?.trim()
		if (!hosts) configurationError('缺少 MONGODB_URI 或 MONGODB_CLUSTER_HOST')
		if (/[\s/@?#]/.test(hosts)) configurationError('MONGODB_CLUSTER_HOST 只能包含主机名和端口')
		if (protocol === 'mongodb+srv' && /[:,]/.test(hosts)) {
			configurationError('SRV 的 MONGODB_CLUSTER_HOST 必须是一个不带端口的域名')
		}
		if (!env.MONGODB_NAME) configurationError('缺少 MONGODB_NAME')
		uri = `${protocol}://${hosts}/${encodeURIComponent(env.MONGODB_NAME)}?authSource=admin`
	}

	// 不使用 URL 解析多个 host:port；具体的 URI 参数由 MongoDB 驱动校验。
	const authority = /^mongodb(?:\+srv)?:\/\/([^/?#]+)(?:[/?]|$)/.exec(uri)?.[1]
	if (!authority || /[\s#]/.test(uri)) configurationError('MONGODB_URI 必须是有效的 MongoDB 连接字符串')
	const query = new URLSearchParams(uri.includes('?') ? uri.slice(uri.indexOf('?') + 1) : '')
	const entries = [...query.entries()].map(([key, value]) => [key.toLowerCase(), value] as const)
	const values = (key: string) => entries.filter(([name]) => name === key).map(([, value]) => value)
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

	const caFile = env.MONGODB_TLS_CA_FILE?.trim()
	const certificateKeyFile = env.MONGODB_TLS_CERTIFICATE_KEY_FILE?.trim()
	const certificateKeyPassword = env.MONGODB_TLS_CERTIFICATE_KEY_PASSWORD
	const ca = decodeCertificate(env.MONGODB_TLS_CA_BASE64, 'MONGODB_TLS_CA_BASE64')
	const cert = decodeCertificate(env.MONGODB_TLS_CERT_BASE64, 'MONGODB_TLS_CERT_BASE64')
	const key = decodeCertificate(env.MONGODB_TLS_KEY_BASE64, 'MONGODB_TLS_KEY_BASE64')
	if (!!cert !== !!key) configurationError('MONGODB_TLS_CERT_BASE64 和 MONGODB_TLS_KEY_BASE64 必须同时提供')
	if ((caFile && ca) || ((caFile || ca) && values('tlscafile').length)) {
		configurationError('CA 证书只能选择 URI 文件路径、MONGODB_TLS_CA_FILE 或 MONGODB_TLS_CA_BASE64 中的一种')
	}
	if ((certificateKeyFile && (cert || key)) || ((certificateKeyFile || cert || key) && values('tlscertificatekeyfile').length)) {
		configurationError('客户端证书只能选择一种文件或 Base64 配置方式')
	}
	if (certificateKeyPassword !== undefined && values('tlscertificatekeyfilepassword').length) {
		configurationError('客户端私钥密码只能在 URI 或 MONGODB_TLS_CERTIFICATE_KEY_PASSWORD 中配置一次')
	}
	const hasClientCertificate = !!(certificateKeyFile || cert || values('tlscertificatekeyfile').length)
	if (certificateKeyPassword !== undefined && !hasClientCertificate) {
		configurationError('MONGODB_TLS_CERTIFICATE_KEY_PASSWORD 需要同时配置客户端证书')
	}
	const hasCertificate = !!(caFile || certificateKeyFile || ca || cert || key || values('tlscafile').length || values('tlscertificatekeyfile').length)
	if (tlsDisabled && hasCertificate) configurationError('tls=false 不能同时配置 MongoDB TLS 证书')
	if (hasCertificate) options.tls = true
	if (caFile) options.tlsCAFile = caFile
	if (certificateKeyFile) options.tlsCertificateKeyFile = certificateKeyFile
	if (certificateKeyPassword !== undefined) {
		if (cert) options.passphrase = certificateKeyPassword
		else options.tlsCertificateKeyFilePassword = certificateKeyPassword
	}
	if (ca) options.ca = ca
	if (cert) options.cert = cert
	if (key) options.key = key

	// SRV 使用驱动的默认 TLS 行为；不再因缺少 CA 自动跳过证书校验。
	return { uri, options }
}
