import { koaCtx, koaNext } from '../type/index'

export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	await next()
	ctx.body = 'Hello World'
}

