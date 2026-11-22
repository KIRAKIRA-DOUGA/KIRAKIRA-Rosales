import { InferSchemaType } from 'mongoose'
import { countDataFromMongoDB, deleteOneDataFromMongoDB, findOneAndUpdateData4MongoDB, findOneAndUpdateWithOperators4MongoDB, selectDataFromMongoDB } from '../dbPool/DbClusterPool.js'
import { VideoCommentSchema, VideoCommentVoteSchema } from '../dbPool/schema/VideoCommentSchema.js'
import { logging } from './loggingService.js'

type Direction = 'upvote' | 'downvote'
type Counts = { upvoteCount: number; downvoteCount: number }
type Comment = InferSchemaType<typeof VideoCommentSchema.schemaInstance>
type CountBatch = { upvoteDelta: number; downvoteDelta: number; started: boolean; done: Promise<void> }
type CommentVoteActivity = { writingVotes: number; batch?: CountBatch; comment: Comment; recountUpvotes: boolean; recountDownvotes: boolean }

const comments = VideoCommentSchema
const votes = VideoCommentVoteSchema
const activityByComment = new Map<string, CommentVoteActivity>()

function crossedFibonacciThreshold(total: number, delta: number) {
	if (delta === 0) {
		return false
	}
	if (total <= 0) {
		return true
	}
	// 只看本次经过的数，排除起点。从 4 到 6、从 6 到 4 都要核对经过的 5。
	const before = total - delta
	const lowest = delta > 0 ? before + 1 : total
	const highest = delta > 0 ? total : before - 1
	let current = 1
	let next = 2
	while (current < lowest) {
		const following = current + next
		current = next
		next = following
	}
	return current <= highest
}

async function recountWhenIdle(commentId: string, activity: CommentVoteActivity) {
	if (activity.writingVotes || activity.batch) {
		return
	}
	activityByComment.delete(commentId)
	const { comment, recountUpvotes, recountDownvotes } = activity
	if (!recountUpvotes && !recountDownvotes) {
		return
	}
	try {
		const correction: Partial<Counts> = {}
		for (const direction of ['upvote', 'downvote'] as const) {
			if (direction === 'upvote' ? !recountUpvotes : !recountDownvotes) {
				continue
			}
			const count = await countDataFromMongoDB({ commentId, direction }, votes.schemaInstance, votes.collectionName, { readPreference: 'primary' })
			const field = direction === 'upvote' ? 'upvoteCount' : 'downvoteCount'
			if (count.result !== undefined && count.result !== comment[field]) {
				correction[field] = count.result
			}
		}
		// 只修正统计前的版本，防止旧结果覆盖其他实例刚写入的增减或校准。
		if (Object.keys(correction).length && !activityByComment.has(commentId)) {
			await findOneAndUpdateWithOperators4MongoDB(
				{ _id: commentId, voteRevision: comment.voteRevision ?? null }, { $set: correction, $inc: { voteRevision: 1 } },
				comments.schemaInstance, comments.collectionName,
			)
		}
	} catch (error) {
		logging('ERROR', '校准评论赞踩计数失败', error, { commentId })
	}
}

function queueCountUpdate(commentId: string, activity: CommentVoteActivity, upvoteDelta: number, downvoteDelta: number) {
	const previous = activity.batch
	if (previous && !previous.started) {
		previous.upvoteDelta += upvoteDelta
		previous.downvoteDelta += downvoteDelta
		return previous.done
	}

	// 正在写入时到达的增减共用下一次写入和完成通知。每批独立完成，持续有流量也能及时响应。
	const batch: CountBatch = { upvoteDelta, downvoteDelta, started: false, done: Promise.resolve() }
	activity.batch = batch
	batch.done = (previous?.done ?? Promise.resolve()).then(async () => {
		batch.started = true
		const { upvoteDelta: up, downvoteDelta: down } = batch
		try {
			if (up === 0 && down === 0) {
				return
			}
			const updated = await findOneAndUpdateWithOperators4MongoDB(
				{ _id: commentId }, { $inc: { upvoteCount: up, downvoteCount: down, voteRevision: 1 } }, comments.schemaInstance, comments.collectionName,
			)
			if (updated.result) {
				const comment = updated.result
				activity.comment = comment
				activity.recountUpvotes ||= crossedFibonacciThreshold(comment.upvoteCount, up)
				activity.recountDownvotes ||= crossedFibonacciThreshold(comment.downvoteCount, down)
			}
		} catch (error) {
			// 用户记录已经保存，回复丢失时增减也可能已写入。按明细核对可避免重复加减。
			logging('ERROR', '更新评论赞踩计数失败', error, { commentId })
			activity.recountUpvotes ||= up !== 0
			activity.recountDownvotes ||= down !== 0
		} finally {
			if (activity.batch === batch) {
				activity.batch = undefined
				await recountWhenIdle(commentId, activity)
			}
		}
	})
	return batch.done
}

/**
 * 原子设置一个用户对一条评论的点赞或点踩状态，并更新评论上缓存的数量。
 * @param videoId 视频 ID
 * @param commentId 评论 ID
 * @param uid 用户 UID
 * @param UUID 用户 UUID
 * @param direction 点赞或点踩
 * @param active 是否设置该状态，取消只移除指定方向
 * @returns 用户的状态是否发生了变化
 */
export const mutateCommentVote = async (videoId: number, commentId: string, uid: number, UUID: string, direction: Direction, active: boolean): Promise<boolean> => {
	if (!/^[a-f\d]{24}$/i.test(commentId)) {
		throw new Error('视频评论 ID 无效')
	}
	commentId = commentId.toLowerCase()
	const selected = await selectDataFromMongoDB(
		{ _id: commentId, videoId }, { upvoteCount: 1, downvoteCount: 1, voteRevision: 1 },
		comments.schemaInstance, comments.collectionName, { readPreference: 'primary' },
	)
	const comment = selected.result?.[0]
	if (!comment) {
		throw new Error('视频评论不存在')
	}

	const activity: CommentVoteActivity = activityByComment.get(commentId) ?? { writingVotes: 0, recountUpvotes: false, recountDownvotes: false, comment }
	activityByComment.set(commentId, activity)
	activity.writingVotes++
	let updatedCounts: Promise<void>
	try {
		let before: string | undefined
		if (active) {
			// 用唯一键定位记录，同时取得修改前的方向。并发切换时，每次只计算自己实际造成的变化。
			const previous = await findOneAndUpdateData4MongoDB(
				{ commentId, uid }, { direction, UUID }, votes.schemaInstance, votes.collectionName, { returnDocument: 'before' },
			)
			before = previous.result?.direction
		} else {
			const deleted = await deleteOneDataFromMongoDB({ commentId, uid, direction }, votes.schemaInstance, votes.collectionName)
			before = deleted.result?.deletedCount ? direction : undefined
		}
		const after = active ? direction : undefined
		if (before === after) {
			return false
		}
		updatedCounts = queueCountUpdate(commentId, activity,
			Number(after === 'upvote') - Number(before === 'upvote'),
			Number(after === 'downvote') - Number(before === 'downvote'))
	} finally {
		activity.writingVotes--
		await recountWhenIdle(commentId, activity)
	}
	await updatedCounts
	return true
}
