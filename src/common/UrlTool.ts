import { logging } from "../service/loggingService.js"

/**
 * 获取正确的 Cookie Domain 设置
 * @returns string Cookie Domain
 */
export function getCorrectCookieDomain(): string {
	try {
		const serverEnv = process.env.SERVER_ENV
		const serverRootUrl = process.env.SERVER_ROOT_URL
		const devEnvFlag = 'dev'
		const localhostCookieDomain = ''
		return serverEnv && serverEnv === devEnvFlag ? localhostCookieDomain : (serverRootUrl || localhostCookieDomain)
	} catch (error) {
		logging('ERROR', '获取 Cookie Domain 时出错：', error)
	}
}

/**
 * 根据头像文件名获取完整的头像 URL
 * @param avatarFilename 头像文件名
 * @returns 完整的头像 URL，如果构建失败返回 undefined
 */
export function getUserAvatarUrl(avatarFilename: string): string | undefined {
	try {
		if (!avatarFilename || avatarFilename.trim().length === 0) {
			logging('ERROR', '构建头像 URL 失败，头像文件名为空', undefined, { avatarFilename })
			return undefined
		}

		const cfImagesBaseUrl = process.env.CF_IMAGES_BASE_URL
		const cfImagesAccountId = process.env.CF_IMAGES_ACCOUNT_ID

		if (!cfImagesBaseUrl || !cfImagesAccountId) {
			logging('ERROR', '构建头像 URL 失败，环境变量配置缺失', undefined, { avatarFilename, cfImagesBaseUrl: !!cfImagesBaseUrl, cfImagesAccountId: !!cfImagesAccountId })
			return undefined
		}

		// 构建完整的头像 URL
		// 格式：https://kirafile.com/cdn-cgi/imagedelivery/{ACCOUNT_ID}/{filename}/w=200,h=200,f=avif
		const avatarUrl = `${cfImagesBaseUrl}/cdn-cgi/imagedelivery/${cfImagesAccountId}/${avatarFilename.trim()}/w=200,h=200,f=avif`
		return avatarUrl
	} catch (error) {
		logging('ERROR', '构建头像 URL 失败，未知错误', error, { avatarFilename })
		return undefined
	}
}
