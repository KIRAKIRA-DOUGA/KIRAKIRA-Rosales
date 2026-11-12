import { withMongoDBTransaction } from '../common/MongoDBSessionTool.js'
import { countDataFromMongoDB, findOneAndUpdateData4MongoDB, findOneAndUpdateWithOperators4MongoDB, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { VideoCommentSchema, VideoCommentUpvoteSchema, VideoCommentDownvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'

/** Change a vote and its counters together, including legacy duplicate vote records. */
export const mutateCommentVote = async (videoId: number, commentId: string, uid: number, UUID: string, direction: 'upvote' | 'downvote', active: boolean): Promise<boolean> => {
	if (!/^[a-f\d]{24}$/i.test(commentId)) throw new Error('视频评论 ID 无效')
	commentId = commentId.toLowerCase()
	// MongoDB ObjectIds are case-insensitive, but historical vote records stored strings.
	// Match all old spellings while writing only the canonical lowercase representation.
	const storedCommentId = new RegExp(`^${commentId}$`, 'i')
	// Preserve MongoDB errors for driver retries of transient write conflicts and uncertain
	// commits. All retries and operations share the same bounded deadline.
	return withMongoDBTransaction(async session => {
		const options = { session, preserveError: true }
		// Every vote operation writes this document first. A competing transaction must
		// retry from a fresh snapshot before checking or inserting the user's vote.
		const comment = await findOneAndUpdateWithOperators4MongoDB(
			{ _id: commentId, videoId }, { $inc: { voteRevision: 1 } }, VideoCommentSchema.schemaInstance, VideoCommentSchema.collectionName, options,
		)
		if (!comment.success || !comment.result) throw new Error('视频评论不存在')

		const target = direction === 'upvote' ? VideoCommentUpvoteSchema : VideoCommentDownvoteSchema
		const opposite = direction === 'upvote' ? VideoCommentDownvoteSchema : VideoCommentUpvoteSchema
		const userWhere = { videoId, commentId: { $regex: storedCommentId }, uid }
		const activeWhere = { ...userWhere, invalidFlag: false, deleteFlag: false }
		const selected = await selectDataFromMongoDB(activeWhere, {}, target.schemaInstance, target.collectionName, options, undefined, { page: 1, pageSize: 1 })
		if (!selected.success || !selected.result) throw new Error('无法查询评论投票记录')
		const previous = selected.result[0]
		const now = Date.now()
		const retired = await updateData4MongoDB(activeWhere, { invalidFlag: true, editDateTime: now }, target.schemaInstance, target.collectionName, options)
		// No matching vote is normal; an unacknowledged write is not.
		if (!retired.result?.acknowledged) throw new Error('无法取消评论投票')
		if (active) {
			const retiredOpposite = await updateData4MongoDB(activeWhere, { invalidFlag: true, editDateTime: now }, opposite.schemaInstance, opposite.collectionName, options)
			if (!retiredOpposite.result?.acknowledged) throw new Error('无法取消反向评论投票')
			if (previous) {
				// Reuse one record and retire older duplicates without requiring an index migration.
				const reused = await findOneAndUpdateData4MongoDB({ _id: previous._id }, { commentId, invalidFlag: false, editDateTime: now }, target.schemaInstance, target.collectionName, options, false)
				if (!reused.success || !reused.result) throw new Error('无法恢复评论投票')
			} else {
				const inserted = await insertData2MongoDB({ videoId, commentId, uid, UUID, invalidFlag: false, deleteFlag: false, editDateTime: now }, target.schemaInstance, target.collectionName, options)
				if (!inserted.success) throw new Error('无法创建评论投票')
			}
		}

		const validVotes = { videoId, commentId: { $regex: storedCommentId }, invalidFlag: false, deleteFlag: false }
		// Cancellation can retire several old duplicates; recounting also repairs counters
		// left inconsistent by an earlier partial failure.
		const upvotes = await countDataFromMongoDB(validVotes, VideoCommentUpvoteSchema.schemaInstance, VideoCommentUpvoteSchema.collectionName, options)
		const downvotes = await countDataFromMongoDB(validVotes, VideoCommentDownvoteSchema.schemaInstance, VideoCommentDownvoteSchema.collectionName, options)
		if (!upvotes.success || !downvotes.success || upvotes.result === undefined || downvotes.result === undefined) throw new Error('无法统计评论投票')
		const updated = await findOneAndUpdateData4MongoDB({ _id: commentId }, { upvoteCount: upvotes.result, downvoteCount: downvotes.result }, VideoCommentSchema.schemaInstance, VideoCommentSchema.collectionName, options, false)
		if (!updated.success || !updated.result) throw new Error('无法更新评论投票计数')
		return active ? !previous : !!previous
	}, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, timeoutMS: 60000 })
}
