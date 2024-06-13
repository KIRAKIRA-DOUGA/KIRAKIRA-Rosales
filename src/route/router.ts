import Router from 'koa-router'
import { createOrUpdateUserBrowsingHistoryController, getUserBrowsingHistoryWithFilterController } from '../controller/BrowsingHistoryController.js'
import { emitDanmakuController, getDanmakuListByKvidController } from '../controller/DanmakuController.js'
import { helloWorld } from '../controller/HelloWorld.js'
import { checkUserTokenController, getSelfUserInfoController, getUserAvatarUploadSignedUrlController, getUserInfoByUidController, getUserSettingsController, updateOrCreateUserInfoController, updateOrCreateUserSettingsController, updateUserEmailController, userExistsCheckController, userLoginController, userLogoutController, userRegistrationController } from '../controller/UserController.js'
import { cancelVideoCommentDownvoteController, cancelVideoCommentUpvoteController, emitVideoCommentController, emitVideoCommentDownvoteController, emitVideoCommentUpvoteController, getVideoCommentListByKvidController } from '../controller/VideoCommentController.js'
import { getThumbVideoController, getVideoByKvidController, getVideoByUidController, getVideoCoverUploadSignedUrlController, getVideoFileTusEndpointController, searchVideoByKeywordController, searchVideoByVideoTagIdController, updateVideoController } from '../controller/VideoController.js'
import { createVideoTagController, getVideoTagByTagIdController, searchVideoTagController } from '../controller/VideoTagController.js'

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
// 	"passwordHint": "YYYYYYYYYYYYYYY"
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
// cookie: uid, token
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
// 			{
// 					"id": "0",
// 					"labelName": "bbbbbb"
// 			}
// 	],
// 	"userBirthday": 1705327908351,
// 	"userProfileMarkdown": "### 小作文时间！",
// 	"userLinkAccounts": [
// 			{
// 					"accountType": "X",
// 					"accountUniqueId": "xxx"
// 			},
// 			{
// 					"accountType": "bili",
// 					"accountUniqueId": "xxxx"
// 			}
// 	],
// 	"userWebsite": {
// 			"websiteName": "XXXXXXXX",
// 			"websiteUrl": "https://xxxx.xxx/xxxxx"
// 	}
// }


router.post('/user/self', getSelfUserInfoController) // 获取当前登录的用户信息，可以通过 cookie 传递，也可以通过请求体
// https://localhost:9999/user/self
// cookie: uid, token
// or
// {
// 	"uid": "XXXXXXXXX",
// 	"token": "XXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// }

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

router.post('/user/settings', getUserSettingsController) // 在服务端或客户端获取用户设置信息用以正确渲染页面
// https://localhost:9999/user/settings
// cookie: uid, token
// or
// {
// 	"uid": "XXXXXXXXX",
// 	"token": "XXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// }

router.post('/user/settings/update', updateOrCreateUserSettingsController) // 更新或创建用户设置
// https://localhost:9999/user/settings/update
// cookie: uid, token
// {
// 	"coloredSideBar": "true"
// }




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

router.get('/video/search', searchVideoByKeywordController) // 根据关键字搜索视频
// https://localhost:9999/video/search?keyword=fate

router.post('/video/search/tag', searchVideoByVideoTagIdController) // 根据 TAG ID 来搜索视频
// https://localhost:9999/video/search/tag
// {
// 	"tagId": [1, 2]
// }


router.post('/video/tus', getVideoFileTusEndpointController) // 获取 TUS 上传 Endpoint
// https://localhost:9999/video/tus
// cookie: uid, token

router.get('/video/cover/preUpload', getVideoCoverUploadSignedUrlController) // 获取用于上传视频封面图的预签名 URL
// https://localhost:9999/video/cover/preUpload
// cookie: uid, token




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






router.post('/video/comment/emit', emitVideoCommentController) // 发送视频评论的接口
// https://localhost:9999/video/comment/emit
// cookie: uid, token
// {
// 	"videoId": 13,
// 	"text": "这是一条测试评论"
// }

router.get('/video/comment', getVideoCommentListByKvidController) // 根据 KVID 获取视频评论列表，并检查当前用户是否对获取到的评论有点赞/点踩，如果有，相应的值会变为 true
// https://localhost:9999/video/comment?videoId=13
// 可选：cookie: uid, token

router.post('/video/comment/upvote', emitVideoCommentUpvoteController) // 用户为视频评论点赞
// https://localhost:9999/video/comment/upvote
// cookie: uid, token
// {
// 	"videoId": 13,
// 	"id": "65859fbfae7bd341a408fe42"
// }

router.post('/video/comment/downvote', emitVideoCommentDownvoteController) // 用户为视频评论点踩
// https://localhost:9999/video/comment/downvote
// cookie: uid, token
// {
// 	"videoId": 13,
// 	"id": "65859fbfae7bd341a408fe42"
// }

router.delete('/video/comment/upvote/cancel', cancelVideoCommentUpvoteController) // 用户取消一个视频评论的点赞
// https://localhost:9999/video/comment/upvote/cancel
// cookie: uid, token
// {
// 	"videoId": 13,
// 	"id": "65859fbfae7bd341a408fe42"
// }

router.delete('/video/comment/downvote/cancel', cancelVideoCommentDownvoteController) // 用户取消一个视频评论的点踩
// https://localhost:9999/video/comment/downvote/cancel
// cookie: uid, token
// {
// 	"videoId": 13,
// 	"id": "65859fbfae7bd341a408fe42"
// }





router.post('/video/tag/create', createVideoTagController) // 用户创建视频 TAG
// https://localhost:9999/video/tag/create
// cookie: uid, token
// {
// 	"tagNameList": [
// 		{
// 			"lang": "en",
// 			"tagName": [
// 				{
// 					"name": "StarCitizen",
// 					"isDefault": true,
// 					"isOriginalTagName": false
// 				}, {
// 					"name": "SC",
// 					"isDefault": false,
// 					"isOriginalTagName": false
// 				}
// 			]
// 		}, {
// 			"lang": "zhs",
// 			"tagName": [
// 				{
// 					"name": "星际公民",
// 					"isDefault": false,
// 					"isOriginalTagName": false
// 				}
// 			]
// 		}
// 	]
// }

router.get('/video/tag/search', searchVideoTagController) // 根据关键词搜索视频 TAG
// https://localhost:9999/video/tag/search?tagName=hello

router.post('/video/tag/get', getVideoTagByTagIdController) // 根据 TAG ID 在数据库中匹配视频 TAG // WARN: 注意本接口为 POST 方法
// https://localhost:9999/video/tag/get
// {
// 	"tagId": [1, 2]
// }



router.post('/history/merge', createOrUpdateUserBrowsingHistoryController) // 更新或创建用户浏览历史
// https://localhost:9999/history/merge
// cookie: uid, token
// {
// 	"uid": 2,
// 	"type": "video",
// 	"id": "32"
// }

router.get('/history/filter', getUserBrowsingHistoryWithFilterController) // 获取全部或过滤后的用户浏览历史，按对某一内容的最后访问时间降序排序
// https://localhost:9999/history/filter?videoTitle=foo
// cookie: uid, token
// > 或者你可以不包含 URL 查询以获取当前用户全部浏览历史 -> https://localhost:9999/history/filter







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
