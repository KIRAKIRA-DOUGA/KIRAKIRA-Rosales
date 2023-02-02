import Router from 'koa-router'
import { helloWorld } from '../controller/HelloWorld'
import { initKirakiraCluster } from '../controller/AdminController'

const router = new Router()

// router-begin
router.get('/', helloWorld) // 主页，测试
router.get('/hello', helloWorld) // 测试
router.get('/admin/cluster/init', initKirakiraCluster) // TODO 参数：oneTimeSecretKey，用于初始化集群
// router-end

export default router
