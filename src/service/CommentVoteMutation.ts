import { abortAndEndSession, commitAndEndSession, createAndStartSession } from '../common/MongoDBSessionTool.js'
import { logging } from './loggingService.js'
import { countDataFromMongoDB, findOneAndUpdateData4MongoDB, findOneAndUpdateWithOperators4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { VideoCommentSchema, VideoCommentUpvoteSchema, VideoCommentDownvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'

/**
 * 在同一事务内更新评论的点赞或点踩记录及计数，并清理历史重复记录
 * @param videoId 视频 ID
 * @param commentId 评论 ID
 * @param uid 用户 UID
 * @param UUID 用户 UUID
 * @param direction 投票方向
 * @param active 是否启用该方向的投票
 * @returns 本次操作是否改变用户的投票状态
 */
export const mutateCommentVote = async (videoId: number, commentId: string, uid: number, UUID: string, direction: 'upvote' | 'downvote', active: boolean): Promise<boolean> => {
	if (!/^[a-f\d]{24}$/i.test(commentId)) { throw new Error('视频评论 ID 无效') }
	commentId = commentId.toLowerCase()
	// 历史记录中的评论 ID 大小写不统一。查询时兼容两种写法，新记录统一用小写。
	const storedCommentId = new RegExp(`^${commentId}$`, 'i')
	const session = await createAndStartSession({
		readPreference: 'primary',
		readConcern: { level: 'snapshot' },
		writeConcern: { w: 'majority' },
	})
	let changed: boolean
	try {
		const options = { session, preserveError: true }
		// 先更新评论版本，让同时修改同一条评论的事务能检测到写入冲突。
		const comment = await findOneAndUpdateWithOperators4MongoDB(
			{ _id: commentId, videoId }, { $inc: { voteRevision: 1 } }, VideoCommentSchema.schemaInstance, VideoCommentSchema.collectionName, options,
		)
		if (!comment.success || !comment.result) { throw new Error('视频评论不存在') }

		const target = direction === 'upvote' ? VideoCommentUpvoteSchema : VideoCommentDownvoteSchema
		const opposite = direction === 'upvote' ? VideoCommentDownvoteSchema : VideoCommentUpvoteSchema
		const userWhere = { videoId, commentId: { $regex: storedCommentId }, uid }
		const activeWhere = { ...userWhere, invalidFlag: false, deleteFlag: false }
		const selected = await selectDataFromMongoDB(activeWhere, {}, target.schemaInstance, target.collectionName, options, undefined, { page: 1, pageSize: 1 })
		if (!selected.success || !selected.result) { throw new Error('无法查询评论投票记录') }
		const previous = selected.result[0]
		const now = Date.now()
		const retired = await updateData4MongoDB(activeWhere, { invalidFlag: true, editDateTime: now }, target.schemaInstance, target.collectionName, options)
		// 首次操作可能匹配不到已有记录，仍需确认数据库已处理这次更新。
		if (!retired.result?.acknowledged) { throw new Error('无法取消评论投票') }
		if (active) {
			const retiredOpposite = await updateData4MongoDB(activeWhere, { invalidFlag: true, editDateTime: now }, opposite.schemaInstance, opposite.collectionName, options)
			if (!retiredOpposite.result?.acknowledged) { throw new Error('无法取消反向评论投票') }
			if (previous) {
				// 同一用户可能有多条历史重复记录，只恢复其中一条。
				const reused = await findOneAndUpdateData4MongoDB({ _id: previous._id }, { commentId, invalidFlag: false, editDateTime: now }, target.schemaInstance, target.collectionName, options, false)
				if (!reused.success || !reused.result) { throw new Error('无法恢复评论投票') }
			} else {
				const inserted = await insertData2MongoDB({ videoId, commentId, uid, UUID, invalidFlag: false, deleteFlag: false, editDateTime: now }, target.schemaInstance, target.collectionName, options)
				if (!inserted.success) { throw new Error('无法创建评论投票') }
			}
		}

		const validVotes = { videoId, commentId: { $regex: storedCommentId }, invalidFlag: false, deleteFlag: false }
		// 取消时可能一次停用多条历史重复记录，按有效记录重新计算赞数和踩数。
		const upvotes = await countDataFromMongoDB(validVotes, VideoCommentUpvoteSchema.schemaInstance, VideoCommentUpvoteSchema.collectionName, options)
		const downvotes = await countDataFromMongoDB(validVotes, VideoCommentDownvoteSchema.schemaInstance, VideoCommentDownvoteSchema.collectionName, options)
		if (!upvotes.success || !downvotes.success || upvotes.result === undefined || downvotes.result === undefined) { throw new Error('无法统计评论投票') }
		const updated = await findOneAndUpdateData4MongoDB({ _id: commentId }, { upvoteCount: upvotes.result, downvoteCount: downvotes.result }, VideoCommentSchema.schemaInstance, VideoCommentSchema.collectionName, options, false)
		if (!updated.success || !updated.result) { throw new Error('无法更新评论投票计数') }
		changed = active ? !previous : !!previous
	} catch (error) {
		await abortAndEndSession(session).catch(abortError => logging('ERROR', '回滚评论点赞或点踩操作失败', abortError, undefined, { recordingLogs: false }))
		throw error
	}

	await commitAndEndSession(session)
	return changed
}
