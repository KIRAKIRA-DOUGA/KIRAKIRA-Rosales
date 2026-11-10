import mongoose, { InferSchemaType, Model } from 'mongoose'
import { VideoCommentSchema, VideoCommentUpvoteSchema, VideoCommentDownvoteSchema } from '../dbPool/schema/VideoCommentSchema.js'

/** Change a vote and its counters together, including legacy duplicate vote records. */
export const mutateCommentVote = async (videoId: number, commentId: string, uid: number, UUID: string, direction: 'upvote' | 'downvote', active: boolean): Promise<boolean> => {
	if (!/^[a-f\d]{24}$/i.test(commentId)) throw new Error('视频评论 ID 无效')
	commentId = commentId.toLowerCase()
	// MongoDB ObjectIds are case-insensitive, but historical vote records stored strings.
	// Match all old spellings while writing only the canonical lowercase representation.
	const storedCommentId = new RegExp(`^${commentId}$`, 'i')
	const comments: Model<InferSchemaType<typeof VideoCommentSchema.schemaInstance>> = mongoose.models[VideoCommentSchema.collectionName] ?? mongoose.model(VideoCommentSchema.collectionName, VideoCommentSchema.schemaInstance)
	const upvotes: Model<InferSchemaType<typeof VideoCommentUpvoteSchema.schemaInstance>> = mongoose.models[VideoCommentUpvoteSchema.collectionName] ?? mongoose.model(VideoCommentUpvoteSchema.collectionName, VideoCommentUpvoteSchema.schemaInstance)
	const downvotes: Model<InferSchemaType<typeof VideoCommentDownvoteSchema.schemaInstance>> = mongoose.models[VideoCommentDownvoteSchema.collectionName] ?? mongoose.model(VideoCommentDownvoteSchema.collectionName, VideoCommentDownvoteSchema.schemaInstance)
	const session = await mongoose.startSession()
	try {
		// Preserve MongoDB errors for driver retries of transient write conflicts and uncertain
		// commits. All retries and operations share the same ten-second deadline.
		return await session.withTransaction(async () => {
			// Every vote operation writes this document first. A competing transaction must
			// retry from a fresh snapshot before checking or inserting the user's vote.
			const comment = await comments.findOneAndUpdate(
				{ _id: commentId, videoId }, { $inc: { voteRevision: 1 } }, { session, new: true },
			).lean()
			if (!comment) throw new Error('视频评论不存在')

			const target = direction === 'upvote' ? upvotes : downvotes
			const opposite = direction === 'upvote' ? downvotes : upvotes
			const userWhere = { videoId, commentId: storedCommentId, uid }
			const activeWhere = { ...userWhere, invalidFlag: false, deleteFlag: false }
			const previous = await target.findOne(activeWhere).session(session).lean()
			const now = Date.now()
			await target.updateMany(activeWhere, { $set: { invalidFlag: true, editDateTime: now } }, { session })
			if (active) {
				await opposite.updateMany(activeWhere, { $set: { invalidFlag: true, editDateTime: now } }, { session })
				if (previous) {
					// Reuse one record and retire older duplicates without requiring an index migration.
					await target.updateOne({ _id: previous._id }, { $set: { commentId, invalidFlag: false, editDateTime: now } }, { session })
				} else {
					await target.create([{ videoId, commentId, uid, UUID, invalidFlag: false, deleteFlag: false, editDateTime: now }], { session })
				}
			}

			const validVotes = { videoId, commentId: storedCommentId, invalidFlag: false, deleteFlag: false }
			// Cancellation can retire several old duplicates; recounting also repairs counters
			// left inconsistent by an earlier partial failure.
			const upvoteCount = await upvotes.countDocuments(validVotes).session(session)
			const downvoteCount = await downvotes.countDocuments(validVotes).session(session)
			await comments.updateOne({ _id: commentId }, { $set: { upvoteCount, downvoteCount } }, { session })
			return active ? !previous : !!previous
		}, { readPreference: 'primary', readConcern: { level: 'snapshot' }, writeConcern: { w: 'majority' }, timeoutMS: 10000 })
	} finally {
		await session.endSession()
	}
}
