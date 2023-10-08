import Router from 'koa-router'
import { helloWorld } from '../controller/HelloWorld.js'
import { userRegistrationController } from '../controller/UserController.js'

const router = new Router()

// router-begin

router.get('/', helloWorld) // 主页，测试 // DELETE
router.get('/02/koa/hello', helloWorld) // 测试 // DELETE
// router.get('/02/koa/serverInfo', activeHeartBeatMongoDBShardInfo) // 返回 MongoDB 心跳数据库中存储的心跳数据的连接信息，前提是环境变量中已有心跳数据库连接信息 // DELETE
// http://localhost:9999/02/koa/serverInfo

router.post('/user/registering', userRegistrationController)
// // http://localhost:9999/user/registering
// // {
// // 	"userName": "u00001",
// // 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// // }





// router.post('/02/koa/user/settings/userSettings/save', saveUserSettingsByUUID)
// // http://localhost:9999/02/koa/user/settings/userSettings/save
// //
// // {
// // 	"uuid": "u00001",
// // 	"systemStyle": "s1",
// // 	"systemColor": "#66CCFF",
// // 	"backgroundAnimation": "true",
// // 	"settingPageLastEnter": "PornHub"
// // }

// router.put('/02/koa/user/settings/userSettings/update', updateUserSettingsByUUID)
// // http://localhost:9999/02/koa/user/settings/userSettings/update
// //
// // {
// // 	"uuid": "u00001",
// // 	"systemStyle": "s1",
// // 	"systemColor": "#66CCFF",
// // 	"backgroundAnimation": "true",
// // 	"settingPageLastEnter": "PornHub"
// // }

// router.get('/02/koa/user/settings/userSettings/get', getUserSettingsByUUID)
// // http://localhost:9999/02/koa/user/settings/userSettings/get?uuid=u00001



// router.post('/02/koa/user/register', userRegistrationController)
// // http://localhost:9999/02/koa/user/register
// // {
// // 	"userName": "u00001",
// // 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// // }



// router-end

export default router
