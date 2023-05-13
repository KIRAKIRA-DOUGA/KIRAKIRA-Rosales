import Router from 'koa-router'
import { helloWorld } from '../controller/HelloWorld'
import { activeHeartBeatMongoDBShardInfo, initKirakiraCluster, heartBeatTest } from '../controller/AdminController'

const router = new Router()

// router-begin

router.get('/02/koa', helloWorld) // 主页，测试 // DELETE
router.get('/02/koa/hello', helloWorld) // 测试 // DELETE
router.get('/02/koa/serverInfo', activeHeartBeatMongoDBShardInfo) // 返回 MongoDB 心跳数据库中存储的心跳数据的连接信息
// http://localhost:9999/02/koa/serverInfo

router.get('/02/koa/admin/cluster/init', initKirakiraCluster) // TODO 参数：oneTimeSecretKey，用于初始化集群
// http://localhost:9999/02/koa/admin/cluster/init?oneTimeSecretKey=100001&systemAdminUserName=kadminu&adminPassword=kadminp&localhostServicePublicIPAddress=52.199.162.17&localhostServicePrivateIPAddress=10.0.1.215&localhostServicePort=8888&heartbeatDatabaseShardData=52.199.162.17::20001:admin:123456:1:master&heartbeatDatabaseShardData=52.199.162.17::20002:admin:123456:1:servant

router.get('/02/koa/admin/heartbeat/test', heartBeatTest) // 存活探针
// http://localhost:9999/02/koa/admin/heartbeat/test

// router-end

export default router
