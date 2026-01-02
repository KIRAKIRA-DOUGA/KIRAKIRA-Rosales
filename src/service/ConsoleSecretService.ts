import { GetStgEnvBackEndSecretResponse } from "../controller/ConsoleSecretControllerDto.js";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import { checkUserTokenByUuidService } from "./UserService.js";
import { logging } from "./loggingService.js";

let client: SecretsManagerClient

const SERVER_ENV = process.env.SERVER_ENV

const AWS_SECRET_REGION = process.env.AWS_SECRET_REGION
const AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY
const AWS_SECRET_ACCESS_SECRET = process.env.AWS_SECRET_ACCESS_SECRET
const AWS_SECRET_NAME = process.env.AWS_SECRET_NAME

if (!!SERVER_ENV && ['dev', 'prod'].includes(SERVER_ENV)) {
	try {
		if (!AWS_SECRET_REGION || !AWS_SECRET_ACCESS_KEY || !AWS_SECRET_ACCESS_SECRET) {
			logging("ERROR", "缺少 AWS 认证信息，请检查环境变量 AWS_SECRET_REGION、AWS_SECRET_ACCESS_KEY 和 AWS_SECRET_ACCESS_SECRET")
			process.exit()
		}

		// 创建 AWS Secrets Manager 客户端
		client = new SecretsManagerClient({
			region: AWS_SECRET_REGION, // 自定义 AWS 区域
			credentials: {
				accessKeyId: AWS_SECRET_ACCESS_KEY, // 自定义 Access Key
				secretAccessKey: AWS_SECRET_ACCESS_SECRET, // 自定义 Secret Key
			},
		})
		console.info('\nCreated an AWS Secrets Manager Client base on the environment variables you provided!\n')
	} catch(error) {
		logging('ERROR', '创建 AWS Secrets Manager 客户端失败：', error)
		process.exit()
	}
} else {
	console.info('\nNow starting the server without created an AWS Secrets Manager Client.\n')
}

/**
 * 获取预生产环境后端环境变量机密
 * @param uuid 用户 UUID
 * @param token 用户 Token
 * @returns 获取预生产环境后端环境变量机密的请求响应
 */
export async function getStgEnvBackEndSecretService(uuid: string, token: string): Promise<GetStgEnvBackEndSecretResponse> {
	try {
		if (!SERVER_ENV || !['dev', 'prod'].includes(SERVER_ENV)) {
			logging('ERROR', '获取预生产环境后端环境变量机密失败，连接的后端并非生产或本地环境')
			return { success: false, message: '获取预生产环境后端环境变量机密失败，连接的后端并非生产或本地环境', result: {} }
		}

		if (!client) {
			logging('ERROR', '获取预生产环境后端环境变量机密失败，未连接 AWS Secret Manager')
			return { success: false, message: '获取预生产环境后端环境变量机密失败，未连接 AWS Secret Manage', result: {} }
		}

		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			logging('ERROR', '获取预生产环境后端环境变量机密失败，用户 Token 校验未通过')
			return { success: false, message: '获取预生产环境后端环境变量机密失败，用户 Token 校验未通过', result: {} }
		}

		if (!AWS_SECRET_NAME) {
			logging('ERROR', '获取预生产环境后端环境变量机密失败，环境变量中未提供机密名，请设置 AWS_SECRET_REGION 环境变量。')
			return { success: false, message: '获取预生产环境后端环境变量机密失败，环境变量中未提供机密名', result: {} }
		}

		try {
			const command = new GetSecretValueCommand({ SecretId: AWS_SECRET_NAME });
			const response = await client.send(command);

			try {
				const secerts: Record<string, string> = JSON.parse(response.SecretString);
				return { success: true, message: '获取预生产环境后端环境变量机密成功', result: { envs: secerts } }
			} catch(error) {
				logging('ERROR', '获取预生产环境后端环境变量机密时出错，解析 JSON 失败：', error)
				return { success: false, message: '获取预生产环境后端环境变量机密时出错，解析 JSON 失败', result: {} }
			}
		} catch(error) {
			logging('ERROR', '获取预生产环境后端环境变量机密时出错，获取数据失败：', error)
			return { success: false, message: '获取预生产环境后端环境变量机密时出错，获取数据失败', result: {} }
		}
	} catch (error) {
		logging('ERROR', '获取预生产环境后端环境变量机密时出错，未知错误：', error)
		return { success: false, message: '获取预生产环境后端环境变量机密时出错，未知错误', result: {} }
	}
}
