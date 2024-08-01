import { Types } from 'mongoose'

/**
 * 数据操作的结果列表（结果为对象数组）
 */
export type DbPoolResultsType<T> = {
	/** 操作是否成功 */
	success: boolean;
	/** 附加消息 */
	message: string;
	/** 错误信息（如果有的话） */
	error?: unknown;
	/** 数据操作的结果数组（如果有的话） */
	result?: T[];
}

/**
 * 数据操作的结果（结果为对象）
 */
export type DbPoolResultType<T> = {
	/** 操作是否成功 */
	success: boolean;
	/** 附加消息 */
	message: string;
	/** 错误信息（如果有的话） */
	error?: unknown;
	/** 数据操作的结果对象（如果有的话） */
	result?: T;
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

/**
 * MongoDB 可用的查询条件
 */
type MongoDBConditionsType<T> = {
	$gt?: number; // 大于
	$gte?: number; // 大于等于
	$lt?: number; // 小于
	$lte?: number; // 小于等于
	$ne?: number; // 不等于

	$and?: QueryType<T>[]; // 与
	$or?: QueryType<T>[]; // 或
	$not?: QueryType<T>; // 非

	$exists?: boolean; // 属性是否存在，例： { 'phone.number': { $exists: true } } 查找所有包含 phone.number 的文档
	$type?: string; // 匹配字段的类型，例： { age: { $type: 'number' } }

	$in?: unknown[]; // 字段值匹配数组中的任何一个值，例： { status: { $in: ['A', 'B'] } }
	$nin?: unknown[]; // 字段值不匹配数组中的任何一个值
	$all?: unknown[]; //  数组字段包含所有指定的元素，例： { tags: { $all: ['tech', 'health'] } }
	$size?: number; // 数组大小，例： { tags: { $size: 3 } }

	$elemMatch?: MongoDBConditionsType<T>; // 确保数据库中的数组至少有一个元素匹配提供的条件

	$regex?: RegExp; // 正则表达式
}

// 数据库 Query，相当于 SQL 中的 WHERE
export type QueryType<T> = {
	[K in keyof T]?: T[K] extends Types.DocumentArray<unknown> ? MongoDBConditionsType<T> : T[K] | MongoDBConditionsType<T>;
} & Record< string, boolean | string | number | MongoDBConditionsType<T> >

// 数据库 Update，相当于 SQL UPDATE 中的 SET
export type UpdateType<T> = {
	[K in keyof T]?: T[K];
}

// 数据库 Select 投影，相当于 SQL 中的 SELECT
export type SelectType<T> = {
	[K in keyof T]?: 1;
}

// 数据库排序，相当于 SQL 中的 ORDER BY
export type OrderByType<T> = {
	[K in keyof T]?: 1 | -1;
}
