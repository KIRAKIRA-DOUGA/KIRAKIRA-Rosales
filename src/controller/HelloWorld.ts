// 试验场

import { GlobalSingleton } from '../store/index.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'

const globalSingleton = GlobalSingleton.getInstance()


export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	const something = ctx.query.something

	// const aaa = hashPasswordSync(something as string)

	// const oldTestNumber = globalSingleton.getVariable<string>('testNumber')
	// globalSingleton.setVariable<string | string[]>('testNumber', ctx.query.testNumber)
	// const newTestNumber = globalSingleton.getVariable<string>('testNumber')

	// const r2SignedUrl = await createR2SignedUrl('kirakira-file-public-apac', `The Calling-${new Date()}.mp4`, 180)

	// ctx.body = `Hello World ${r2SignedUrl}`


	// const aaa = await getNextSequenceValueEjectService('test', [-10, -208, -220, -222, -224, -223, -225, -226, -230, -232, -234, -235, -237, -238], -200, -2)

	// ctx.body = `Hello World ${something}, oldNumber: ${oldTestNumber}, newNumber: ${newTestNumber}`

	ctx.body = something ? `Hello ${something} World` : 'Hello World'

	await next()
}

