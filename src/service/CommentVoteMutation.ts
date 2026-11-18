import mongoose from 'mongoose'
import { logging } from './loggingService.js'
import { countDataFromMongoDB, findOneAndUpdateData4MongoDB, findOneAndUpdateWithOperators4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { VideoCommentSchema, VideoCommentUpvoteSchema, VideoCommentDownvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'

/**
 * 在同一事务内更新评论投票及计数，并清理历史重复票据
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
	// 历史票据使用字符串保存 ID，匹配旧有大小写形式并统一写入小写 ID。
	const storedCommentId = new RegExp(`^${commentId}$`, 'i')
	const session = await mongoose.startSession()
	let transactionFailed = false
	try {
		// 手动执行和提交各一次，保留读写一致性设置，不重试冲突或不确定的提交。
		session.startTransaction({
			readPreference: 'primary',
			readConcern: { level: 'snapshot' },
			writeConcern: { w: 'majority' },
		})
		const options = { session, preserveError: true }
		// 先写评论版本以串行化同一评论的投票；竞争事务的写冲突直接向上抛出。
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
		// 没有匹配的票据属于正常情况，但写入必须得到确认。
		if (!retired.result?.acknowledged) { throw new Error('无法取消评论投票') }
		if (active) {
			const retiredOpposite = await updateData4MongoDB(activeWhere, { invalidFlag: true, editDateTime: now }, opposite.schemaInstance, opposite.collectionName, options)
			if (!retiredOpposite.result?.acknowledged) { throw new Error('无法取消反向评论投票') }
			if (previous) {
				// 复用一条票据并停用历史重复票据，无需迁移索引。
				const reused = await findOneAndUpdateData4MongoDB({ _id: previous._id }, { commentId, invalidFlag: false, editDateTime: now }, target.schemaInstance, target.collectionName, options, false)
				if (!reused.success || !reused.result) { throw new Error('无法恢复评论投票') }
			} else {
				const inserted = await insertData2MongoDB({ videoId, commentId, uid, UUID, invalidFlag: false, deleteFlag: false, editDateTime: now }, target.schemaInstance, target.collectionName, options)
				if (!inserted.success) { throw new Error('无法创建评论投票') }
			}
		}

		const validVotes = { videoId, commentId: { $regex: storedCommentId }, invalidFlag: false, deleteFlag: false }
		// 取消操作可能停用多条历史重复票据，重新计数也可修复旧有的不一致。
		const upvotes = await countDataFromMongoDB(validVotes, VideoCommentUpvoteSchema.schemaInstance, VideoCommentUpvoteSchema.collectionName, options)
		const downvotes = await countDataFromMongoDB(validVotes, VideoCommentDownvoteSchema.schemaInstance, VideoCommentDownvoteSchema.collectionName, options)
		if (!upvotes.success || !downvotes.success || upvotes.result === undefined || downvotes.result === undefined) { throw new Error('无法统计评论投票') }
		const updated = await findOneAndUpdateData4MongoDB({ _id: commentId }, { upvoteCount: upvotes.result, downvoteCount: downvotes.result }, VideoCommentSchema.schemaInstance, VideoCommentSchema.collectionName, options, false)
		if (!updated.success || !updated.result) { throw new Error('无法更新评论投票计数') }
		await session.commitTransaction()
		return active ? !previous : !!previous
	} catch (error) {
		transactionFailed = true
		try {
			if (session.inTransaction()) {
				await session.abortTransaction()
			}
		} catch (abortError) {
			// 回滚失败不能覆盖业务或提交错误，仍须继续关闭 session。
			logging('ERROR', '评论投票事务回滚失败', undefined, { abortError }, { recordingLogs: false })
		}
		throw error
	} finally {
		try {
			await session.endSession()
		} catch (endError) {
			if (!transactionFailed) {
				throw endError
			}
			logging('ERROR', '评论投票 session 关闭失败', undefined, { endError }, { recordingLogs: false })
		}
	}
}
