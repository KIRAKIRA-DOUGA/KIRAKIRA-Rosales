import Router from 'koa-router'
import { helloWorld } from '../controller/HelloWorld'
import { initKirakiraCluster } from '../controller/AdminController'

const route = new Router()

// router-begin
route.get('/', helloWorld) // 主页，测试
route.get('/hello', helloWorld) // 测试
route.get('/admin/cluster/init', initKirakiraCluster) // TODO 参数：oneTimeSecretKey，用于初始化集群
// router-end

export default route
