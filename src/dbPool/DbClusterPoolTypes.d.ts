/**
 * success 操作是否成功
 * message 附加消息
 * error 错误信息（如果有的话）
 * result 数据操作的结果（如果有的话）
 */
export type DbPoolResultType<T> = {
	success: boolean;
	message: string;
	error?: unknown;
	result?: T[];
}

/**
 * success 更新操作是否成功
 * message 附加消息
 * error 错误信息（如果有的话）
 * result 更新操作的结果（如果有的话）
	* acknowledged 是否更新成功
	* matchedCount 匹配到的数量（在更新操作之前，匹配到多少条应该被更新的数据）
	* modifiedCount 实际更新数量（在更新操作之后，实际更新的数据）
 */
export type UpdateResultType = {
	success: boolean;
	message: string;
	error?: unknown;
	result?: {
		acknowledged: boolean;
		matchedCount: number;
		modifiedCount: number;
	};
}

// 数据库 Query，相当于 SQL 中的 WHERE
export type QueryType<T> = {
	[K in keyof T]?: T[K];
}

// 数据库 Update，相当于 SQL UPDATE 中的 SET
export type UpdateType<T> = {
	[K in keyof T]?: T[K];
}

// 数据库 Select 投影，相当于 SQL 中的 SELECT
export type SelectType<T> = {
	[K in keyof T]?: 1;
}
