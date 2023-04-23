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
