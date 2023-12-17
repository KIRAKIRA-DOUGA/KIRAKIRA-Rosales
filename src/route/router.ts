import Router from 'koa-router'
import { emitDanmakuController, getDanmakuListByKvidController } from '../controller/DanmakuController.js'
import { helloWorld } from '../controller/HelloWorld.js'
import { checkUserTokenController, getSelfUserInfoController, getUserAvatarUploadSignedUrlController, getUserInfoByUidController, updateOrCreateUserInfoController, updateUserEmailController, userExistsCheckController, userLoginController, userLogoutController, userRegistrationController } from '../controller/UserController.js'
import { getThumbVideoController, getVideoByKvidController, getVideoByUidController, updateVideoController } from '../controller/VideoController.js'

const router = new Router()

// router-begin

router.get('/', helloWorld) // 测试 // DELETE
router.get('/02/koa/hello', helloWorld) // 测试 // DELETE
// router.get('/02/koa/serverInfo', activeHeartBeatMongoDBShardInfo) // 返回 MongoDB 心跳数据库中存储的心跳数据的连接信息，前提是环境变量中已有心跳数据库连接信息 // DELETE
// https://localhost:9999/02/koa/serverInfo






router.post('/user/registering', userRegistrationController) // 用户注册
// https://localhost:9999/user/registering
// {
// 	"email": "aaa@aaa.aaa",
// 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
//  "passwordHint": "YYYYYYYYYYYYYYY"
// }

router.post('/user/login', userLoginController) // 用户登录
// https://localhost:9999/user/login
// {
// 	"email": "aaa@aaa.aaa",
// 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
// }

router.get('/user/existsCheck', userExistsCheckController) // 注册用户时检查用户是否存在
// https://localhost:9999/user/existsCheck?email=xxxxxxx

router.post('/user/update/email', updateUserEmailController) // 更新用户邮箱
// https://localhost:9999/user/update/email
// {
// 	"uid": "XXXXXXXXX",
// 	"oldEmail": "aaa@aaa.aaa",
// 	"newEmail": "bbb@bbb.bbb",
// 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
// }

router.post('/user/update/info', updateOrCreateUserInfoController) // 更新或创建用户信息
// https://localhost:9999/user/update/info
// cookie: uid, token
// {
// 	"username": "XXXXXXXXX",
// 	"avatar": "https://xxx.xxx.xxx/xxx.png",
// 	"userBannerImage": "https://yyy.yyy.yyy/yyy.png",
// 	"signature": "aaaaaaaaaaaaaaa",
// 	"gender": "AH-64",
// 	"label": [
// 		{
// 			"id": "0",
// 			"labelName": "bbbbbb",
// 		}
// 	]
// }


router.get('/user/self', getSelfUserInfoController) // 获取当前登录的用户信息
// https://localhost:9999/user/self
// cookie: uid, token

router.get('/user/info', getUserInfoByUidController) // 根据 uid 获取用户信息
// https://localhost:9999/user/info?uid=10

router.get('/user/check', checkUserTokenController) // 根据 uid, token 校验用户
// https://localhost:9999/user/check
// cookie: uid, token


router.get('/user/logout', userLogoutController) // 清除浏览器中的 cookie（用户登出）
// https://localhost:9999/user/logout

router.get('/user/avatar/preUpload', getUserAvatarUploadSignedUrlController) // 获取用于上传头像的预签名 URL, 上传限时 60 秒
// https://localhost:9999/user/avatar/preUpload
// cookie: uid, token




router.post('/video/upload', updateVideoController) // 上传视频
// https://localhost:9999/video/upload
// {
// 	"videoPart": [
// 		{
// 			"id": "0",
// 			"videoPartTitle": "2953-day1",
// 			"link": "https://xxx.xxx.xxx/xxx.mp4"
// 		}
// 	],
// 	"title": "[博物馆奇妙夜] 2953 公民控 VRC 虚拟观赏会（第一天）",
// 	"image": "https://xxx.xxx.xxx/xxx.png",
// 	"uploader": "cfdxkk@kirakira.moe",
// 	"uploaderId": "123",
// 	"duration": "19573",
// 	"description": "和群里的朋友一起熬夜从凌晨两点看到早上八点。不得不说今年的公民控是真的很精彩。"
// }

router.get('/video/home', getThumbVideoController) // 获取首页视频
// https://localhost:9999/video/home

router.get('/video', getVideoByKvidController) // 根据视频 ID (KVID) 获取视频的数据
// https://localhost:9999/video?videoId=1

router.get('/video/user', getVideoByUidController) // 根据 UID 获取该用户上传的视频
// https://localhost:9999/video/user?uid=2







router.post('/video/danmaku/emit', emitDanmakuController) // 发送弹幕的接口
// https://localhost:9999/video/danmaku/emit
// {
// 	"videoId": 10,
// 	"uid": 2,
// 	"time": 5,
// 	"text": "这是一条测试弹幕",
// 	"color": "#66CCFF",
// 	"fontSIze": "medium",
// 	"mode": "rtl",
// 	"enableRainbow": false
// }

router.get('/video/danmaku', getDanmakuListByKvidController) // 根据视频 ID 获取弹幕
// https://localhost:9999/video/danmaku?videoId=10












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
