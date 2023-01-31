import { callErrorMessage } from '../common/CallErrorMessage'
import { adminCheckStates } from '../type/AdminType'

/**
 * 验证用户的一次身份密钥
 * @param envOneTimeSecretKey 环境变量中的一次性身份验证密钥
 * @param userSendSecretKey 用户请求中的一次性身份验证密钥
 * @returns adminCheckStates{state: 验证结果，true为成功，false为失败, callbackMessage: 返回的信息} 响应 (临时方案)
 */
export const checkOneTimeSecretKey = (envOneTimeSecretKey: string | undefined | null, userSendSecretKey: string | undefined | null): adminCheckStates => {
	if (envOneTimeSecretKey && userSendSecretKey) {
		if (envOneTimeSecretKey === userSendSecretKey) {
			return { state: true, callbackMessage: `Check Okey, Env Key: [${envOneTimeSecretKey}], Your Key: [${userSendSecretKey}]` }
		}
		return { state: false, callbackMessage: callErrorMessage('<p>漏洞提交： wooyun@kirakira.com</p>') }
	}
	if (envOneTimeSecretKey && !userSendSecretKey) {
		return { state: false, callbackMessage: callErrorMessage('<p>请检查请求中的一次性身份验证密钥参数。</p>') }
	}
	if (!envOneTimeSecretKey && userSendSecretKey) {
		return { state: false, callbackMessage: callErrorMessage('<p>请检查环境变量中的一次性身份验证密钥配置情况。</p>') }
	}
	return { state: false, callbackMessage: callErrorMessage('<p>未知错误。</p>') }
}
