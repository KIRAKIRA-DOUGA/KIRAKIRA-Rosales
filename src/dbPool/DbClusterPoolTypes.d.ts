export type DbPoolResultType<T> = {
	success: boolean;
	message: string;
	error?: unknown;
	result?: T[];
}

export type QueryType<T> = {
	[K in keyof T]?: T[K];
}

export type SelectType<T> = {
	[K in keyof T]?: 1;
}
