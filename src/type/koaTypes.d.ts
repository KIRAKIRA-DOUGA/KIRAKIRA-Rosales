import Koa from 'koa'

export type koaCtx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, unknown>
export type koaNext = Koa.Next
