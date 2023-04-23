import { koaCtx, koaNext } from '../type/index'
import { GlobalSingleton } from '../store/index'

const globalSingleton = GlobalSingleton.getInstance()


export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	await next()

	const something = ctx.query.something
	
	const oldTestNumber = globalSingleton.getVariable<string>('testNumber')
	globalSingleton.setVariable<string | string[]>('testNumber', ctx.query.testNumber)
	const newTestNumber = globalSingleton.getVariable<string>('testNumber')

	ctx.body = `Hello World ${something}, oldNumber: ${oldTestNumber}, newNumber: ${newTestNumber}`
}

