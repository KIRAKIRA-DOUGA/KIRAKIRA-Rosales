import { koaCtx, koaNext } from '../type/index'

export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	await next()

	const something = ctx.query.something

	ctx.body = `Hello World ${something}`
}

