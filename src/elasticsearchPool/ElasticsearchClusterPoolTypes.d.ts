/**
 * Elasticsearch Document Schema Item 的 type 参数允许的类型
 */
type EsDocumentItemConstructorType = StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | ArrayConstructor | unknown[] | ArrayConstructor | Record<string, EsDocumentItemType>

/**
 * Elasticsearch Document Schema Item 的类型
 */
type EsDocumentItemType = {
	type: EsDocumentItemConstructorType;
	required?: boolean;
}

type ArrayElementType<T> = T extends (infer U)[] ? U : T

/**
 * 从构造器类型映射到对应的 TypeScript 基本类型；如果是对象，则递归判断
 */
type ConstructorTypeMapper<T> =
	T extends StringConstructor ? string :
		T extends NumberConstructor ? number :
			T extends BooleanConstructor ? boolean :
				T extends DateConstructor ? Date :
					T extends unknown[] ? EsSchema2TsType< ArrayElementType<T> >[] :
						T extends ArrayConstructor ? Array<unknown> :
							T extends Record<string, EsDocumentItemType> ? EsSchema2TsType<T> :
								never

/**
 * 守护类型，确保 Elasticsearch Document Schema Item 定义了 type，否则返回 never
 */
type PropertyType<T> = T extends { type: infer R } ? ConstructorTypeMapper<R> : never

/**
 * 将 Elasticsearch Document Schema 转换为 Ts 类型
 *
 * 使用这种方式定义的 schema 和 indexName ，能够建立关联关系，保证 schema 匹配到正确的 indexName（这与 Rust 的“[Slice 类型](https://kaisery.github.io/trpl-zh-cn/ch04-03-slices.html)”理念想要解决的问题有点像）
 *
 * // WARN 注意 required 属性的值必须这样声明→ true as const，而不是仅仅写一个 true 或 false，一定要加上 as const，否则不会生效
 *
 * @example
 * // 示例：定义一个包含 schema 和 indexName 的 Elasticsearch Document 对象
 * const fooDocument = {
 *   schema: {
 *     foo: { type: String },
 *     bar: { type: String, required: true as const },
 *     baz: {
 *       type: {
 *         foo1: { type: String },
 *         bar1: { type: Number, required: false as const },
 *       },
 *     },
 *   },
 *   indexName: 'test-index',
 * }
 *
 * // 使用 EsSchema2TsType 转换上述 schema
 * type fooDocumentType = EsSchema2TsType<typeof fooDocument.schema>;
 *
 * // 转换后的 TypeScript 类型：
 * // type fooDocumentType = {
 * //   foo?: string,
 * //   bar: string,
 * //   baz?: {
 * //     foo1?: string,
 * //     bar1?: number,
 * //   },
 * // }
 *
 */
export type EsSchema2TsType<T> = {
	[P in keyof T as T[P] extends { required: true } ? P : never]: PropertyType<T[P]>;
} & {
	[P in keyof T as T[P] extends { required: true } ? never : P]+?: PropertyType<T[P]>;
}


// /**
//  * Elasticsearch 搜索时的数据类型映射
//  */
// type QueryTypeMapper<T> =
// 	T extends Record<string, string> ? string :
// 		T extends Record<string, number> ? number :
// 			T extends Record<string, boolean> ? boolean :
// 				T extends Record<string, QueryTypeMapper<T> > ? QueryTypeMapper<T> :
// 					never


// /** Elasticsearch Query，相当于 SQL 中的 WHERE LIKE */
// export type EsQueryType<T> = {
// 	[K in keyof T]?: QueryTypeMapper<T[K]>;
// }

/** 去 Elasticsearch 执行操作的返回结果 */
export type EsResultType<T> = {
	/** 去 Elasticsearch 执行操作是否成功，成功为 true，失败为 false */
	success: boolean;
	/** 附加的消息 */
	message?: string;
	/** 执行操作返回的结果 */
	result?: T[];
}
