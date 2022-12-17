import Koa from "koa";

const helloWorld = async (ctx: Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, any>, next: Koa.Next): Promise<void> => {
	await next();
  ctx.body = "Hello World";
}

export default helloWorld;