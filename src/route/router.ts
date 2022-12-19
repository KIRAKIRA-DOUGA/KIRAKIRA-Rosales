import Router from 'koa-router'
import helloWorld from '../controller/HelloWorld'

const route = new Router()

// router-begin
route.get('/', helloWorld)
route.get('/hello', helloWorld)
// router-end

export default route
