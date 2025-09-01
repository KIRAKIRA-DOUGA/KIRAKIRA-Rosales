import Router from '@koa/router'
import { createOrUpdateUserBrowsingHistoryController, getUserBrowsingHistoryWithFilterController } from '../controller/BrowsingHistoryController.js'
import { emitDanmakuController, getDanmakuListByKvidController } from '../controller/DanmakuController.js'
import { createFavoritesController, getFavoritesController } from '../controller/FavoritesController.js'
import { helloWorld } from '../controller/HelloWorld.js'
import {
	adminClearUserInfoController,
	adminGetUserInfoController,
	approveUserInfoController,
	checkInvitationCodeController,
	checkUsernameController,
	checkUserTokenController,
	createInvitationCodeController,
	getBlockedUserController,
	getMyInvitationCodeController,
	getSelfUserInfoController,
	getUserAvatarUploadSignedUrlController,
	getUserInfoByUidController,
	getUserSettingsController,
	requestSendChangeEmailVerificationCodeController,
	requestSendChangePasswordVerificationCodeController,
	requestSendVerificationCodeController,
	updateOrCreateUserInfoController,
	updateOrCreateUserSettingsController,
	updateUserEmailController,
	updateUserPasswordController,
	userEmailExistsCheckController,
	userLoginController,
	userLogoutController,
	userRegistrationController,
	createUserTotpAuthenticatorController,
	checkUserHave2FAByEmailController,
	deleteTotpAuthenticatorByTotpVerificationCodeController,
	confirmUserTotpAuthenticatorController,
	checkUserHave2FAByUUIDController,
	createUserEmailAuthenticatorController,
	sendUserEmailAuthenticatorController,
	deleteUserEmailAuthenticatorController,
	sendDeleteUserEmailAuthenticatorController,
	userExistsCheckByUIDController,
	adminEditUserInfoController,
	adminGetUserByInvitationCodeController,
	forgotPasswordController,
	requestSendForgotPasswordVerificationCodeController,
} from '../controller/UserController.js'
import { adminDeleteVideoCommentController, cancelVideoCommentDownvoteController, cancelVideoCommentUpvoteController, deleteSelfVideoCommentController, emitVideoCommentController, emitVideoCommentDownvoteController, emitVideoCommentUpvoteController, getVideoCommentListByKvidController } from '../controller/VideoCommentController.js'
import { approvePendingReviewVideoController, checkVideoExistController, deleteVideoByKvidController, getPendingReviewVideoController, getThumbVideoController, getVideoByKvidController, getVideoByUidController, getVideoCoverUploadSignedUrlController, getVideoFileTusEndpointController, searchVideoByKeywordController, searchVideoByVideoTagIdController, updateVideoController } from '../controller/VideoController.js'
import { createVideoTagController, getVideoTagByTagIdController, searchVideoTagController } from '../controller/VideoTagController.js'
import { adminGetUserRolesByUidController, adminUpdateUserRoleController, createRbacApiPathController, createRbacRoleController, deleteRbacApiPathController, deleteRbacRoleController, getRbacApiPathController, getRbacRoleController, updateApiPathPermissionsForRoleController } from '../controller/RbacController.js'
import { getStgEnvBackEndSecretController } from '../controller/ConsoleSecretController.js'
import { addNewUid2FeedGroupController, administratorApproveFeedGroupInfoChangeController, administratorDeleteFeedGroupController, createFeedGroupController, createOrEditFeedGroupInfoController, deleteFeedGroupController, followingUploaderController, getFeedContentController, getFeedGroupCoverUploadSignedUrlController, getFeedGroupListController, removeUidFromFeedGroupController, unfollowingUploaderController } from '../controller/FeedController.js'
import { addRegexController, blockKeywordController, blockTagController, blockUserByUidController, getBlockListController, hideUserByUidController, removeRegexController, showUserByUidController, unblockKeywordController, unblockTagController, unblockUserByUidController } from '../controller/BlockController.js'

const router = new Router()

// router-begin

router.get('/', helloWorld) // 测试 // DELETE ME
router.get('/02/koa/hello', helloWorld) // 测试 // DELETE ME






router.post('/user/registering', userRegistrationController) // 用户注册
// https://localhost:9999/user/registering
// {
// 	"email": "aaa@aaa.aaa",
// 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// 	"passwordHint": "YYYYYYYYYYYYYYY",
// 	"verificationCode": "ZZZZZZ",
// 	"invitationCode": "KIRA-XXXX-XXXX"
// }

router.post('/user/login', userLoginController) // 用户登录
// https://localhost:9999/user/login
// {
// 	"email": "aaa@aaa.aaa",
// 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
// 	"clientOtp": "XXXXXX" //非必须
//  "verificationCode": "XXXXXX" //非必须
// }

router.post('/user/createTotpAuthenticator', createUserTotpAuthenticatorController) // 用户创建 TOTP 身份验证器
// https://localhost:9999/user/createTotpAuthenticator
// cookie: uuid, token

router.post('/user/confirmUserTotpAuthenticator', confirmUserTotpAuthenticatorController) // 用户确认绑定 TOTP 设备
// https://localhost:9999/user/confirmUserTotpAuthenticator
// {
// 	"clientOtp": "XXXXXX",
// 	"otpAuth": "YYYYYYYYYYYYYYYYYYYYYYYYYY"
// }

router.delete('/user/deleteTotpAuthenticatorByTotpVerificationCodeController', deleteTotpAuthenticatorByTotpVerificationCodeController) // 已登录用户通过密码和 TOTP 验证码删除身份验证器
// cookie: uuid, token
// {
// 	 "clientOtp": "XXXXXX",
// 	 "passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
// }

router.post('/user/createEmailAuthenticator', createUserEmailAuthenticatorController) // 用户创建 Email 身份验证器
// https://localhost:9999/user/createEmailAuthenticator
// cookie: uuid, token

router.post('/user/sendUserEmailAuthenticator', sendUserEmailAuthenticatorController) // 用户发送 Email 身份验证器验证码
// https://localhost:9999/user/sendUserEmailAuthenticator
// {
// 	 "email": "aaa@aaa.aaa",
// 	 "passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
//   "clientLanguage": "zh-Hans-CN",
// }

router.post('/user/sendDeleteUserEmailAuthenticator', sendDeleteUserEmailAuthenticatorController) // 用户发送删除 Email 身份验证器验证码
// https://localhost:9999/user/sendDeleteUserEmailAuthenticator
// cookie: uuid, token
// {
//   "clientLanguage": "zh-Hans-CN",
// }

router.delete('/user/deleteUserEmailAuthenticator', deleteUserEmailAuthenticatorController) // 用户删除 Email 2FA
// https://localhost:9999/user/deleteUserEmailAuthenticator
// cookie: uuid, token
// {
// 	 "passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXX",
// 	 "verificationCode": "YYYYYY"
// }

router.get('/user/checkUserHave2FAByEmail', checkUserHave2FAByEmailController) // 通过 Email 检查用户是否已开启 2FA 身份验证器
// https://localhost:9999/user/checkUserHave2FAByEmail?email=xxxxxxx

router.get('/user/checkUserHave2FAByUUID', checkUserHave2FAByUUIDController) // 通过 UUID 检查用户是否已开启 2FA 身份验证器
// https://localhost:9999/user/checkUserHave2FAByUUID
// cookie: uuid, token

router.get('/user/existsCheck', userEmailExistsCheckController) // 注册用户时检查用户邮箱是否存在
// https://localhost:9999/user/existsCheck?email=xxxxxxx

router.post('/user/update/email', updateUserEmailController) // 更新用户邮箱
// https://localhost:9999/user/update/email
// cookie: uid, token
// {
// 	"uid": "XXXXXXXXX",
// 	"oldEmail": "aaa@aaa.aaa",
// 	"newEmail": "bbb@bbb.bbb",
// 	"passwordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// 	"verificationCode": "XXXXXX"
// }

router.post('/user/update/info', updateOrCreateUserInfoController) // 更新或创建用户信息
// https://localhost:9999/user/update/info
// cookie: uuid, token
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
// 	"userBirthday": "",
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
// optional: cookie: uuid, token

router.get('/user/exists', userExistsCheckByUIDController) // 检查用户是否存在
// https://localhost:9999/user/exists?uid=10

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

router.post('/user/requestSendVerificationCode', requestSendVerificationCodeController) // 请求发送验证码，用于注册时验证用户邮箱
// https://localhost:9999/user/requestSendVerificationCode
// {
// 	"email": "aaa@bbb.com",
// 	"clientLanguage": "zh-Hans-CN"
// }

router.post('/user/createInvitationCode', createInvitationCodeController) // 生成邀请码
// https://localhost:9999/user/createInvitationCode
// cookie: uid, token

router.get('/user/myInvitationCode', getMyInvitationCodeController) // 获取某位用户的所有的邀请码
// https://localhost:9999/user/myInvitationCode
// cookie: uid, token

router.post('/user/checkInvitationCode', checkInvitationCodeController) // 检查一个邀请码是否可用
// https://localhost:9999/user/checkInvitationCode
// {
// 	"invitationCode": "KIRA-XXXX-XXXX"
// }

router.get('/user/getUserByInvitationCode', adminGetUserByInvitationCodeController) // 管理员根据邀请码查询用户 // WARN: 仅限管理员
// https://localhost:9999/user/getUserByInvitationCode?invitationCode=KIRA-XXXX-XXXX
// cookie: uuid, token

router.post('/user/requestSendChangeEmailVerificationCode', requestSendChangeEmailVerificationCodeController) // 请求发送验证码，用于修改邮箱
// https://localhost:9999/user/requestSendChangeEmailVerificationCode
// cookie: uid, token
// {
// 	"clientLanguage": "zh-Hans-CN"
// }

router.post('/user/requestSendChangePasswordVerificationCode', requestSendChangePasswordVerificationCodeController) // 请求发送验证码，用于修改密码
// https://localhost:9999/user/requestSendChangePasswordVerificationCode
// cookie: uid, token
// {
// 	"clientLanguage": "zh-Hans-CN"
// }

router.post('/user/update/password', updateUserPasswordController) // 更新用户密码
// https://localhost:9999/user/update/password
// cookie: uid, token
// {
// 	"oldPasswordHash": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// 	"newPasswordHash": "YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",
// 	"verificationCode": "XXXXXX"
// }

router.post('/user/requestSendForgotPasswordVerificationCode', requestSendForgotPasswordVerificationCodeController) // 请求发送忘记密码的邮箱验证码
// https://localhost:9999/user/requestSendForgotPasswordVerificationCode
// {
// 	"clientLanguage": "zh-Hans-CN",
// 	"email": "your-email@website.com"
// }

router.post('/user/forgot/password', forgotPasswordController) // 找回密码（更新密码）
// https://localhost:9999/user/forgot/password
// {
// 	"email": "your-email@website.com",
// 	"newPasswordHash": "YYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYYY",
// 	"verificationCode": "XXXXXX"
// }

router.get('/user/checkUsername', checkUsernameController) // 检查用户名是否可用
// https://localhost:9999/user/checkUsername?username=xxxxxxxx

router.get('/user/blocked/info', getBlockedUserController) // 获取所有被封禁用户的信息 // WARN: 仅限管理员
// https://localhost:9999/user/blocked/info
// cookie: uid, token

router.get('/user/adminGetUserInfo', adminGetUserInfoController) // 管理员获取用户信息 // WARN: 仅限管理员
// https://localhost:9999/user/adminGetUserInfo?isOnlyShowUserInfoUpdatedAfterReview=true&page=1&pageSize=20
// cookie: UUID, token

router.post('/user/adminEditUserInfo', adminEditUserInfoController) // 管理员强制更新用户信息 // WARN: 仅限管理员
// https://localhost:9999/user/adminEditUserInfo
// cookie: UUID, token
// {
// 	"UUID": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXXX",
// 	"userInfo" :{
// 		"username": "XXXXXXXXX",
// 		"signature": "aaaaaaaaaaaaaaa",
// 		...
// 	}
// }

router.post('/user/approveUserInfo', approveUserInfoController) // 管理员通过用户信息审核 // WARN: 仅限管理员
// https://localhost:9999/user/approveUserInfo
// cookie: UUID, token
// {
// 	"UUID": "XXXXXXXXXXXXXXXXXXXXXXXXXXXXX"
// }

router.post('/user/adminClearUserInfo', adminClearUserInfoController) // 管理员清空某个用户的信息 // WARN: 仅限管理员
// https://localhost:9999/user/adminClearUserInfo
// cookie: UUID, token
// {
// 	"uid": XXXX
// }






router.post('/block/user', blockUserByUidController) // 用户屏蔽用户
// https://localhost:9999/block/user
// cookie: UUID, token
// {
// 	"blockUid": XXXX
// }

router.post('/block/hideuser', hideUserByUidController) // 用户隐藏用户
// https://localhost:9999/block/hideuser
// cookie: UUID, token
// {
//	"hideUid": XXXX
// }

router.post('/block/tag', blockTagController) // 用户屏蔽标签
// https://localhost:9999/block/tag
// cookie: UUID, token
// {
//	"tagId": XXXX
// }

router.post('/block/keyword', blockKeywordController) // 用户屏蔽关键词
// https://localhost:9999/block/keyword
// cookie: UUID, token
// {
// 	"blockKeyword": "XXXXXX"
// }

router.post('/block/regex', addRegexController) // 用户添加正则表达式
// https://localhost:9999/block/regex
// cookie: UUID, token
// {
//	"blockRegex": "XXXXXX"
// }

router.delete('/block/delete/user', unblockUserByUidController) // 用户解封用户
// https://localhost:9999/block/delete/user
// cookie: UUID, token
// {
//	"blockUid": XXXX
// }

router.delete('/block/delete/hideuser', showUserByUidController) // 用户取消隐藏用户
// https://localhost:9999/block/delete/hideuser
// {
//	"hideUid": XXXX
// }

router.delete('/block/delete/tag', unblockTagController) // 用户解封标签
// https://localhost:9999/block/delete/tag
// cookie: UUID, token
// {
//	"blockTag": XXXX
// }

router.delete('/block/delete/keyword', unblockKeywordController) // 用户解封关键词
// https://localhost:9999/block/delete/keyword
// cookie: UUID, token
// {
//	"blockKeyword": "XXXXXX"
// }

router.delete('/block/delete/regex', removeRegexController) // 用户解封正则表达式
// https://localhost:9999/block/delete/regex
// cookie: UUID, token
// {
//	"blockRegex": "XXXXXX"
// }

router.get('/block/list', getBlockListController) // 获取用户的黑名单列表
// https://localhost:9999/block/list?type=block&page=0&pageSize=10
// cookie: UUID, token










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

router.get('/video/exists', checkVideoExistController) // 根据视频 ID (KVID) 检查视频是否存在
// https://localhost:9999/video/exists?videoId=1

router.get('/video', getVideoByKvidController) // 根据视频 ID (KVID) 获取视频的数据
// https://localhost:9999/video?videoId=1
// cookie: uid, token (optional, if have it will try to record the video browsing history)

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

router.delete('/video/delete', deleteVideoByKvidController) // 根据视频 ID 删除视频 // WARN: 仅限管理员
// https://localhost:9999/video/delete
// cookie: uid, token
// {
// 	"videoId": XXX
// }

router.get('/video/pending', getPendingReviewVideoController) // 获取待审核视频列表 // WARN: 仅限管理员
// https://localhost:9999/video/pending
// cookie: uid, token

router.post('/video/pending/approved', approvePendingReviewVideoController) // 通过一个待审核视频 // WARN: 仅限管理员
// https://localhost:9999/video/pending/approved
// cookie: uid, token









router.post('/video/danmaku/emit', emitDanmakuController) // 发送弹幕的接口
// https://localhost:9999/video/danmaku/emit
// cookie: uid, token, uuid
// {
// 	"videoId": 10,
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

router.delete('/video/comment/deleteSelfComment', deleteSelfVideoCommentController) // 删除一条自己发布的视频评论
// https://localhost:9999/video/comment/deleteSelfComment
// cookie: uid, token
// {
// 	"videoId": 13,
// 	"commentRoute": "13.10"
// }

router.delete('/video/comment/adminDeleteComment', adminDeleteVideoCommentController) // 管理员删除一条视频评论 // WARN: 仅限管理员
// https://localhost:9999/video/comment/adminDeleteComment
// cookie: uid, token
// {
// 	"videoId": 13,
// 	"commentRoute": "13.10"
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








router.post('/history/merge', createOrUpdateUserBrowsingHistoryController) // 更新或创建用户浏览历史 // DELETE: 该接口没必要暴露
// https://localhost:9999/history/merge
// cookie: uid, token
// {
// 	"uid": 2,
// 	"category": "video",
// 	"id": "32"
// }

router.get('/history/filter', getUserBrowsingHistoryWithFilterController) // 获取全部或过滤后的用户浏览历史，按对某一内容的最后访问时间降序排序
// https://localhost:9999/history/filter?videoTitle=foo
// cookie: uid, token
// > 或者你可以不包含 URL 查询以获取当前用户全部浏览历史 -> https://localhost:9999/history/filter









router.post('/favorites/create', createFavoritesController) // 创建收藏夹
// https://localhost:9999/favorites/create
// cookie: uid, token
// {
// 	"favoritesTitle": "好康的视频",
// 	"favoritesBio": "这里都是好康的视频捏",
// 	"favoritesCover": "f907a7bd-3247-4415-1f5e-a67a5d3ea100",
// 	"favoritesVisibility": 1
// }

router.get('/favorites', getFavoritesController) // 获取当前登录用户的收藏夹列表
// https://localhost:9999/favorites
// cookie: uid, token











router.post('/feed/following', followingUploaderController) // 关注一个用户
// https://localhost:9999/feed/following
// cookie: uuid, token
// {
// 	"followingUid": 999
// }

router.post('/feed/unfollowing', unfollowingUploaderController) // 取消关注一个用户
// https://localhost:9999/feed/unfollowing
// cookie: uuid, token
// {
// 	"unfollowingUid": 999
// }

router.post('/feed/createFeedGroup', createFeedGroupController) // 创建动态分组
// https://localhost:9999/feed/createFeedGroup
// cookie: uuid, token
// {
// 	"feedGroupName": "test",
// 	"withUidList": [1, 2],
// 	"withCustomCoverUrl": "xxxxxxxxxxxxxxxxxxxxxxxxxx"
// }

router.post('/feed/addNewUid2FeedGroup', addNewUid2FeedGroupController) // 向一个动态分组中添加新的 UID
// https://localhost:9999/feed/addNewUid2FeedGroup
// cookie: uuid, token
// {
// 	"feedGroupUuid": "xxxxxxxxxxxxxxxxxxxxx",
// 	"uidList": [1, 2]
// }

router.post('/feed/removeUidFromFeedGroup', removeUidFromFeedGroupController) // 从一个动态分组中移除 UID
// https://localhost:9999/feed/removeUidFromFeedGroup
// cookie: uuid, token
// {
// 	"feedGroupUuid": "xxxxxxxxxxxxxxxxxxxxx",
// 	"uidList": [1, 2]
// }

router.delete('/feed/deleteFeedGroup', deleteFeedGroupController) // 删除动态分组
// https://localhost:9999/feed/deleteFeedGroup
// cookie: uuid, token
// {
// 	"feedGroupUuid": "xxxxxxxxxxxxxxxxxxxxx"
// }

router.get('/feed/getFeedGroupCoverUploadSignedUrl', getFeedGroupCoverUploadSignedUrlController) // 获取用于用户上传头像的预签名 URL, 上传限时 60 秒
// https://localhost:9999/feed/getFeedGroupCoverUploadSignedUrl
// cookie: uuid, token

router.post('/feed/createOrEditFeedGroupInfo', createOrEditFeedGroupInfoController) // 创建或更新动态分组信息
// https://localhost:9999/feed/createOrEditFeedGroupInfo
// cookie: uuid, token
// {
// 	"feedGroupUuid": "xxxxxxxxxxxxxxxxxxxxx",
// 	"feedGroupName": "xxxxx",
// 	"feedGroupCustomCoverUrl": "xxxxxxxxxxxxxxxxxxxxxxxxxxx",
// }

router.post('/feed/administratorApproveFeedGroupInfoChange', administratorApproveFeedGroupInfoChangeController) // 管理员通过动态分组信息更新审核
// https://localhost:9999/feed/administratorApproveFeedGroupInfoChange
// cookie: uuid, token
// {
// 	"feedGroupUuid": "xxxxxxxxxxxxxxxxxxxxx"
// }

router.delete('/feed/administratorDeleteFeedGroup', administratorDeleteFeedGroupController) // 管理员删除动态分组
// https://localhost:9999/feed/administratorDeleteFeedGroup
// cookie: uuid, token
// {
// 	"feedGroupUuid": "xxxxxxxxxxxxxxxxxxxxx"
// }

router.get('/feed/getFeedGroupList', getFeedGroupListController) // 获取动态分组
// https://localhost:9999/feed/getFeedGroupList
// cookie: uuid, token


router.get('/feed/getFeedContent', getFeedContentController) // 获取动态分组
// https://localhost:9999/feed/getFeedContent?page=1&pageSize=30
// cookie: uuid, token
// {
// 	"feedGroupUuid": "xxxxxxxxxxxxxxxxxxxxx"
// }












router.post('/rbac/createRbacApiPath', createRbacApiPathController) // 创建 RBAC API 路径
// https://localhost:9999/rbac/createRbacApiPath
// cookie: uuid, token
// {
// 	"apiPath": "/luo/tian/yi",
// 	"apiPathType": "tian-yi",
// 	"apiPathColor": "#66CCFFFF",
// 	"apiPathDescription": "这里是简介"
// }

router.delete('/rbac/deleteRbacApiPath', deleteRbacApiPathController) // 删除 RBAC API 路径
// https://localhost:9999/rbac/deleteRbacApiPath
// cookie: uuid, token
// {
// 	"apiPath": "/luo/tian/yi"
// }

router.get('/rbac/getRbacApiPath', getRbacApiPathController) // 获取 RBAC API 路径
// https://localhost:9999/rbac/getRbacApiPath
// cookie: uuid, token
//
// Query:
// apiPath
// apiPathType
// apiPathColor
// apiPathDescription
// page
// pageSize

router.post('/rbac/createRbacRole', createRbacRoleController) // 创建 RBAC 角色
// https://localhost:9999/rbac/createRbacRole
// cookie: uuid, token
// {
// 	"roleName": "administrator",
// 	"apiPathType": "administrator",
// 	"apiPathColor": "#66CCFFFF",
// 	"apiPathDescription": "这是一个管理员角色，拥有绝大部分内容的管理权限，除了分配角色和其他 ROOT 角色专属的权限。"
// }

router.delete('/rbac/deleteRbacRole', deleteRbacRoleController) // 删除 RBAC 角色
// https://localhost:9999/rbac/deleteRbacRole
// cookie: uuid, token
// {
// 	"roleName": "administrator"
// }

router.get('/rbac/getRbacRole', getRbacRoleController) // 获取 RBAC 角色
// https://localhost:9999/rbac/getRbacRole
// cookie: uuid, token
//
// Query:
// roleName
// roleType
// roleColor
// roleDescription
// page
// pageSize

router.post('/rbac/updateApiPathPermissionsForRole', updateApiPathPermissionsForRoleController) // 为角色更新 API 路径权限
// https://localhost:9999/rbac/updateApiPathPermissionsForRole
// cookie: uuid, token
// {
// 	"roleName": "administrator",
// 	"apiPathPermissions": [
// 		"/luo/tian/yi"
// 	]
// }

router.post('/rbac/adminUpdateUserRole', adminUpdateUserRoleController) // 管理员更新用户角色 // WARN: 仅限管理员
// https://localhost:9999/rbac/adminUpdateUserRole
// cookie: uuid, token
// uuid 和 uid 二选一即可
// {
// 	"uuid": "xxxxxxxxxxxxxxxxxxxxxxxxxx",
// 	"uid": 123,
// 	"newRoles": [
// 		"administrator",
// 		"user"
// 	]
// }

router.get('/rbac/adminGetUserRolesByUid', adminGetUserRolesByUidController) // 通过 UID 获取一个用户的角色
// https://localhost:9999/rbac/adminGetUserRolesByUid
// cookie: uuid, token
//
// Query:
// uid


















router.get('/secret/getStgEnvBackEndSecret', getStgEnvBackEndSecretController) // 获取预生产环境后端环境变量机密
// https://localhost:9999/secret/getStgEnvBackEndSecret
// cookie: uuid, token






















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




// router-end

export default router
