// Thanks ChatGPT
export class GlobalSingleton {
	private static instance: GlobalSingleton
	private globalVariables: Map<string, unknown>

	private constructor() {
		this.globalVariables = new Map<string, unknown>()
	}

	public static getInstance(): GlobalSingleton {
		if (!GlobalSingleton.instance) {
			GlobalSingleton.instance = new GlobalSingleton()
		}
		return GlobalSingleton.instance
	}

	public setVariable<T>(key: string, value: T): void {
		this.globalVariables.set(key, value)
	}

	public getVariable<T>(key: string): T | undefined {
		return this.globalVariables.get(key) as T
	}
}

// - 所有用到的全局变量名
// __API_SERVER_LIST__ API  // - 服务器的列表
// __HEARTBEAT_DB_SHARD_LIST__ // - 心跳数据库列表
// __HEARTBEAT_DB_SHARD_CONNECT_LIST__ // - 心跳数据库连接列表
