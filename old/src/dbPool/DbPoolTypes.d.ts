// BY 兰音
type constructor2Type<T> =
	T extends DateConstructor ? Date :
		T extends BufferConstructor ? Buffer :
			T extends { (): infer V } ? V :
				T extends { type: infer V } ? constructor2Type<V> :
					T extends never[] ? unknown[] :
						T extends object ? getTsTypeFromSchemaType<T> : T

/**
 * 从 SchemaType 转换为正常的 Type
 * BY 兰音
 *  */
export type getTsTypeFromSchemaType<T> = {
	[key in keyof T]: constructor2Type<T[key]>;
}

/**
 * 从 SchemaType 转换为正常的对象 Type，但每个元素都是可选的
 * BY 02
 *  */
export type getTsTypeFromSchemaTypeOptional<T> = {
	[key in keyof T]?: constructor2Type<T[key]>;
}

export type DbPoolResultType = {
	success: boolean;
	message: string;
	error?: unknown;
}
