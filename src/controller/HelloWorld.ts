// 试验场

import mongoose, { InferSchemaType } from 'mongoose'
import { generateRandomString } from '../common/RandomTool.js'
import { findOneAndUpdateData4MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, UpdateType } from '../dbPool/DbClusterPoolTypes.js'
import { BrowsingHistorySchema } from '../dbPool/schema/BrowsingHistorySchema.js'
import { DanmakuSchema } from '../dbPool/schema/DanmakuSchema.js'
import { UserAuthSchema, UserChangePasswordVerificationCodeSchema, UserInfoSchema, UserInvitationCodeSchema, UserSettingsSchema } from '../dbPool/schema/UserSchema.js'
import { RemovedVideoCommentSchema, VideoCommentDownvoteSchema, VideoCommentSchema, VideoCommentUpvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { RemovedVideoSchema, VideoSchema } from '../dbPool/schema/VideoSchema.js'
import { GlobalSingleton } from '../store/index.js'
import { koaCtx, koaNext } from '../type/koaTypes.js'

const globalSingleton = GlobalSingleton.getInstance()


export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	const something = ctx.query.something

	// const aaa = hashPasswordSync(something as string)

	// const oldTestNumber = globalSingleton.getVariable<string>('testNumber')
	// globalSingleton.setVariable<string | string[]>('testNumber', ctx.query.testNumber)
	// const newTestNumber = globalSingleton.getVariable<string>('testNumber')

	// const r2SignedUrl = await createR2SignedUrl('kirakira-file-public-apac', `The Calling-${new Date()}.mp4`, 180)

	// ctx.body = `Hello World ${r2SignedUrl}`


	// const aaa = await getNextSequenceValueEjectService('test', [-10, -208, -220, -222, -224, -223, -225, -226, -230, -232, -234, -235, -237, -238], -200, -2)

	// ctx.body = `Hello World ${something}, oldNumber: ${oldTestNumber}, newNumber: ${newTestNumber}`

	// for (let uid = 1; uid <= 488; uid++) {

	// }





	const okUser = []
	const errorUser = []

	for (let uid = 3; uid >= 1; uid--) {
		const uuid = generateRandomString(24)

		const { collectionName: userAuthCollectionName, schemaInstance: userAuthSchemaSchemaInstance } = UserAuthSchema
		type UserAuth = InferSchemaType<typeof userAuthSchemaSchemaInstance>
		const { collectionName: userInfoCollectionName, schemaInstance: userInfoSchemaSchemaInstance } = UserInfoSchema
		type UserInfo = InferSchemaType<typeof userInfoSchemaSchemaInstance>
		const { collectionName: userSettingCollectionName, schemaInstance: userSettingSchemaSchemaInstance } = UserSettingsSchema
		type UserSetting = InferSchemaType<typeof userSettingSchemaSchemaInstance>
		const { collectionName: userChangePasswordVerificationCodeCollectionName, schemaInstance: userChangePasswordVerificationCodeSchemaInstance } = UserChangePasswordVerificationCodeSchema
		type UserChangePasswordVerificationCode = InferSchemaType<typeof userChangePasswordVerificationCodeSchemaInstance>
		const { collectionName: danmakuCollectionName, schemaInstance: danmakuSchemaInstance } = DanmakuSchema
		type Danmaku = InferSchemaType<typeof danmakuSchemaInstance>
		const { collectionName: videoCommentCollectionName, schemaInstance: videoCommentSchemaInstance } = VideoCommentSchema
		type VideoComment = InferSchemaType<typeof videoCommentSchemaInstance>
		const { collectionName: removedVideoCommentCollectionName, schemaInstance: removedVideoCommentSchemaInstance } = RemovedVideoCommentSchema
		type RemovedVideoComment = InferSchemaType<typeof removedVideoCommentSchemaInstance>
		const { collectionName: videoCommentUpvoteCollectionName, schemaInstance: videoCommentUpvoteSchemaInstance } = VideoCommentUpvoteSchema
		type VideoCommentUpvote = InferSchemaType<typeof videoCommentUpvoteSchemaInstance>
		const { collectionName: videoCommentDownvoteCollectionName, schemaInstance: videoCommentDownvoteSchemaInstance } = VideoCommentDownvoteSchema
		type VideoCommentDownvote = InferSchemaType<typeof videoCommentDownvoteSchemaInstance>
		const { collectionName: browsingHistoryCollectionName, schemaInstance: browsingHistorySchemaInstance } = BrowsingHistorySchema
		type BrowsingHistory = InferSchemaType<typeof browsingHistorySchemaInstance>

		const where: (
			QueryType<UserAuth> | QueryType<UserInfo> | QueryType<UserSetting> | QueryType<UserChangePasswordVerificationCode>
			| QueryType<Danmaku> | QueryType<VideoComment> | QueryType<RemovedVideoComment> | QueryType<VideoCommentUpvote> | QueryType<VideoCommentDownvote>
			| QueryType<BrowsingHistory>
		) = {
			uid,
		}
		const updateDate: (
			UpdateType<UserAuth> | UpdateType<UserInfo> | UpdateType<UserSetting> | UpdateType<UserChangePasswordVerificationCode>
			| UpdateType<Danmaku> | UpdateType<VideoComment> | UpdateType<RemovedVideoComment> | UpdateType<VideoCommentUpvote> | UpdateType<VideoCommentDownvote>
			| UpdateType<BrowsingHistory>
		) = {
			UUID: uuid,
		}

		// 启动事务
		const session = await mongoose.startSession()
		session.startTransaction()

		try {
			const updateUserAuthResult = await findOneAndUpdateData4MongoDB(where, updateDate, userAuthSchemaSchemaInstance, userAuthCollectionName, { session })
			const updateUserInfoResult = await findOneAndUpdateData4MongoDB(where, updateDate, userInfoSchemaSchemaInstance, userInfoCollectionName, { session })
			const updateUserSettingResult = await findOneAndUpdateData4MongoDB(where, updateDate, userSettingSchemaSchemaInstance, userSettingCollectionName, { session })
			const updateUserChangePasswordVerificationCodeResult = await updateData4MongoDB(where, updateDate, userChangePasswordVerificationCodeSchemaInstance, userChangePasswordVerificationCodeCollectionName, { session })

			const { collectionName: userInvitationCodeCollectionName, schemaInstance: userInvitationCodeSchemaSchemaInstance } = UserInvitationCodeSchema
			type UserInvitationCode = InferSchemaType<typeof userInvitationCodeSchemaSchemaInstance>

			const userInvitationCodeCreatorWhere: QueryType<UserInvitationCode> = {
				creatorUid: uid,
			}
			const updateUserInvitationCodeCreatorDate: UpdateType<UserInvitationCode> = {
				creatorUUID: uuid,
			}

			const userInvitationCodeAssigneeWhere: QueryType<UserInvitationCode> = {
				assignee: uid,
			}
			const updateUserInvitationCodeAssigneeDate: UpdateType<UserInvitationCode> = {
				assigneeUUID: uuid,
			}

			const updateInvitationCodeCreatorResult = await updateData4MongoDB(userInvitationCodeCreatorWhere, updateUserInvitationCodeCreatorDate, userInvitationCodeSchemaSchemaInstance, userInvitationCodeCollectionName, { session })
			const updateInvitationCodeAssigneeResult = await updateData4MongoDB(userInvitationCodeAssigneeWhere, updateUserInvitationCodeAssigneeDate, userInvitationCodeSchemaSchemaInstance, userInvitationCodeCollectionName, { session })

			const { collectionName: videoCollectionName, schemaInstance: videoSchemaInstance } = VideoSchema
			type Video = InferSchemaType<typeof videoSchemaInstance>

			const { collectionName: removedVideoCollectionName, schemaInstance: removedVideoSchemaInstance } = RemovedVideoSchema
			type RemovedVideo = InferSchemaType<typeof removedVideoSchemaInstance>

			const videoWhere: QueryType<Video> | QueryType<RemovedVideo> = {
				uploaderId: uid,
			}
			const updateVideoDate: UpdateType<Video> | UpdateType<RemovedVideo> = {
				uploaderUUID: uuid,
			}

			const updateVideoResult = await updateData4MongoDB(videoWhere, updateVideoDate, videoSchemaInstance, videoCollectionName, { session })

			const updateRemovedVideoResult = await updateData4MongoDB(videoWhere, updateVideoDate, removedVideoSchemaInstance, removedVideoCollectionName, { session })
			const updateRemovedVideoAdminResult = await updateData4MongoDB(where, updateDate, removedVideoSchemaInstance, removedVideoCollectionName, { session })

			const updateDanmakuResult = await updateData4MongoDB(where, updateDate, danmakuSchemaInstance, danmakuCollectionName, { session })

			const updateVideoCommentResult = await updateData4MongoDB(where, updateDate, videoCommentSchemaInstance, videoCommentCollectionName, { session })

			const removedVideoCommentAdminWhere: QueryType<RemovedVideoComment> = {
				_operatorUid_: uid,
			}
			const updateRemovedVideoCommentAdminDate: UpdateType<RemovedVideoComment> = {
				_operatorUUID_: uuid,
			}

			const updateRemovedVideoCommentResult = await updateData4MongoDB(where, updateDate, removedVideoCommentSchemaInstance, removedVideoCommentCollectionName, { session })
			const updateRemovedVideoCommentAdminResult = await updateData4MongoDB(removedVideoCommentAdminWhere, updateRemovedVideoCommentAdminDate, removedVideoCommentSchemaInstance, removedVideoCommentCollectionName, { session })

			const updateVideoCommentUpvoteResult = await updateData4MongoDB(where, updateDate, videoCommentUpvoteSchemaInstance, videoCommentUpvoteCollectionName, { session })
			const updateVideoCommentDownvoteResult = await updateData4MongoDB(where, updateDate, videoCommentDownvoteSchemaInstance, videoCommentDownvoteCollectionName, { session })

			const updateBrowsingHistoryResult = await updateData4MongoDB(where, updateDate, browsingHistorySchemaInstance, browsingHistoryCollectionName, { session })

			await session.commitTransaction()
			session.endSession()
			okUser.push(uid)
			console.log('用户信息更新成功，', uid)
		} catch (error) {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
			session.endSession()
			errorUser.push(uid)
			console.log('用户信息更新失败！！！！！', uid)
		}
	}




	console.log('完成的用户', okUser.join(', '))
	console.log('未完成的用户', errorUser.join(', '))




	// console.log('uuuuuuuuid', generateRandomString(24))

	ctx.body = something ? `Hello ${something} World` : 'Hello World'

	await next()
}

