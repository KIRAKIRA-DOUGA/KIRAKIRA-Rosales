import { koaCtx, koaNext } from '../type/koaTypes.js'

export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	const something = ctx.query.something
	ctx.body = something === 'Beautiful' ? `Hello Beautiful World` : 'Hello World'
	await next()
}
