/**
 * 定义 EsDocumentItem 的构造器类型，包括基础类型和对象类型
 */
type EsDocumentItemConstructorType = StringConstructor | NumberConstructor | BooleanConstructor | DateConstructor | Record<string, EsDocumentItemType>

/**
 * 定义 EsDocumentItem 的类型，包括类型和是否必需的标记
 */
type EsDocumentItemType = {
	type: EsDocumentItemConstructorType;
	required?: boolean;
}

/**
 * 根据 required 是否为空来判断是否是一个可选的值
 */
type EsDocumentTypeMapper<T> =
	T extends { type: infer U } ? ConstructorTypeMapper<U> | undefined :
		T extends { type: infer V; required: false } ? ConstructorTypeMapper<V> | undefined :
			T extends { type: infer W; required: true } ? ConstructorTypeMapper<W> :
				never

/**
 * 从构造器类型映射到对应的 TypeScript 基本类型；如果是对象，则递归判断
 */
type ConstructorTypeMapper<T> =
	T extends StringConstructor ? string :
		T extends NumberConstructor ? number :
			T extends BooleanConstructor ? boolean :
				T extends DateConstructor ? Date :
					T extends Record<string, EsDocumentItemType> ? EsSchema2TsType<T> :
						never

/**
 * 将 Elasticsearch Document Schema 转换为 Ts 类型
 *
 * 使用这种方式定义的 schema 和 indexName ，能够建立关联关系，保证 schema 匹配到正确的 indexName（这与 Rust 的“[Slice 类型](https://kaisery.github.io/trpl-zh-cn/ch04-03-slices.html)”理念想要解决的问题有点像）
 *
 * @example
 * // 示例：定义一个包含 schema 和 indexName 的 Elasticsearch Document 对象
 * // 使用这种方式定义的 schema 和 indexName ，能够建立关联关系，保证 schema 匹配到正确的 indexName（这与 Rust 的“Slice 类型”理念想要解决的问题有点像）
 * const fooDocument = {
 *   schema: {
 *     foo: { type: String },
 *     bar: { type: String, required: true },
 *     baz: {
 *       type: {
 *         foo1: { type: String },
 *         bar1: { type: Number },
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
 * //   bar: 'bar',
 * //   baz?: {
 * //     foo1?: string,
 * //     bar1?: number,
 * //   },
 * // }
 *
 */
export type EsSchema2TsType<T> = {
  [P in keyof T]: EsDocumentTypeMapper<T[P]>;
}
