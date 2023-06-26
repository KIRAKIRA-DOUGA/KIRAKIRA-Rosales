import Router from 'koa-router'
import { helloWorld } from '../controller/HelloWorld.js'
import { activeHeartBeatMongoDBShardInfo, initKirakiraCluster, heartBeatTest, testHeartBeat, registerService2Cluster, lazySleepApi } from '../controller/AdminController.js'
import { getUserSettingsByUUID, saveUserSettingsByUUID, updateUserSettingsByUUID } from '../controller/UserController.js'

const router = new Router()

// router-begin

// router.get('/02/koa', helloWorld) // 主页，测试 // DELETE
// router.get('/02/koa/hello', helloWorld) // 测试 // DELETE
// router.get('/02/koa/serverInfo', activeHeartBeatMongoDBShardInfo) // 返回 MongoDB 心跳数据库中存储的心跳数据的连接信息，前提是环境变量中已有心跳数据库连接信息 // DELETE
// http://localhost:9999/02/koa/serverInfo

router.get('/02/koa/admin/sleep', lazySleepApi) // 用于模拟一个慢速的请求，休眠的时间最大 20000，超过 20000 自动改为 5000 （单位：毫秒）
// http://localhost:9999/02/koa/admin/sleep?sleep=10000

router.get('/02/koa/admin/cluster/init', initKirakiraCluster) // TODO 参数：oneTimeSecretKey，用于初始化集群
// http://localhost:9999/02/koa/admin/cluster/init?oneTimeSecretKey=100001&systemAdminUserName=kadminu&adminPassword=kadminp&localhostServicePublicIPAddress=52.199.162.17&localhostServicePrivateIPAddress=10.0.1.215&localhostServicePort=9999&heartbeatDatabaseShardData=52.199.162.17::20001:admin:123456:1:master&heartbeatDatabaseShardData=52.199.162.17::20002:admin:123456:1:servant

// http://localhost:9999/02/koa/admin/cluster/init?oneTimeSecretKey=100001&systemAdminUserName=kadminu&adminPassword=kadminp&localhostServicePublicIPAddress=127.0.0.1&localhostServicePrivateIPAddress=127.0.0.1&localhostServicePort=9999&heartbeatDatabaseShardData=52.199.162.17::20001:admin:123456:1:master&heartbeatDatabaseShardData=52.199.162.17::20002:admin:123456:1:servant

router.get('/02/koa/admin/heartbeat/test', heartBeatTest) // 存活探针
// http://localhost:9999/02/koa/admin/heartbeat/test

router.get('/02/koa/admin/heartbeat/testHeartBeat', testHeartBeat) // 测试心跳服务是否正常
// http://localhost:9999/02/koa/admin/heartbeat/testHeartBeat

router.post('/02/koa/admin/cluster/register', registerService2Cluster) // 向集群中注册一个服务
// http://localhost:9999/02/koa/admin/cluster/register
//
// {
// 	"publicIPAddress": "52.199.162.17",
// 	"port": "20003",
// 	"adminAccountName": "admin",
// 	"adminPassword": "123456",
// 	"serviceType": "mongo",
// 	"shardGroup": "1",
// 	"identity": "master",
// 	"state": "up"
// }




router.post('/02/koa/user/settings/userSettings/save', saveUserSettingsByUUID)
// http://localhost:9999/02/koa/user/settings/userSettings/save
//
// {
// 	"uuid": "u00001",
// 	"systemStyle": "s1",
// 	"systemColor": "#66CCFF",
// 	"backgroundAnimation": "true",
// 	"settingPageLastEnter": "PornHub"
// }

router.put('/02/koa/user/settings/userSettings/update', updateUserSettingsByUUID)
// http://localhost:9999/02/koa/user/settings/userSettings/update
//
// {
// 	"uuid": "u00001",
// 	"systemStyle": "s1",
// 	"systemColor": "#66CCFF",
// 	"backgroundAnimation": "true",
// 	"settingPageLastEnter": "PornHub"
// }

router.get('/02/koa/user/settings/userSettings/get', getUserSettingsByUUID)
// http://localhost:9999/02/koa/user/settings/userSettings/get?uuid=u00001


// router-end

export default router
