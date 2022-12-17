import helloWorld from '../controller/HelloWorld';
import Router from 'koa-router';

const route = new Router();

// router-begin
route.get('/', helloWorld);
route.get('/hello', helloWorld);
// router-end

export default route;