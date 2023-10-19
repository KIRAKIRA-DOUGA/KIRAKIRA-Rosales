import { getNextSequenceValueEjectService } from '../service/SequenceValueService.js'
import { GlobalSingleton } from '../store/index.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'

const globalSingleton = GlobalSingleton.getInstance()


export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	await next()

	const something = ctx.query.something

	console.log('something: ', something)
	
	const oldTestNumber = globalSingleton.getVariable<string>('testNumber')
	globalSingleton.setVariable<string | string[]>('testNumber', ctx.query.testNumber)
	const newTestNumber = globalSingleton.getVariable<string>('testNumber')

	// const aaa = await getNextSequenceValueEjectService('test', [-10, -208, -220, -222, -224, -223, -225, -226, -230, -232, -234, -235, -237, -238], -200, -2)
	// console.log('aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', aaa)

	ctx.body = `Hello World ${something}, oldNumber: ${oldTestNumber}, newNumber: ${newTestNumber}`
}

