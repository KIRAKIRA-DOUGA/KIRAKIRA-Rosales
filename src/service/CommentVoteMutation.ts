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
const maxRecount = 200
const recountInterval = 30_000

async function recountWhenIdle(commentId: string, activity: CommentVoteActivity) {
	if (activity.writingVotes || activity.batch) {
		return
	}
	activityByComment.delete(commentId)
	const { comment, recountUpvotes, recountDownvotes } = activity
	const now = Date.now()
	if ((!recountUpvotes && !recountDownvotes) || now - (comment.voteRecountAt ?? 0) < recountInterval) {
		return
	}
	try {
		await reconcileCounts(commentId, comment, recountUpvotes, recountDownvotes)
	} catch (error) {
		logging('ERROR', '校准评论赞踩计数失败', error, { commentId })
	}
}

async function reconcileCounts(commentId: string, comment: Comment, recountUpvotes: boolean, recountDownvotes: boolean) {
	// 数据库时钟决定校准间隔，各实例的时钟偏差不会导致重复统计。
	const revision = comment.voteRevision ?? null
	const serverTime = { $toLong: '$$NOW' }
	const claim = await findOneAndUpdateWithOperators4MongoDB(
		{ _id: commentId, voteRevision: revision, $expr: { $lte: [{ $ifNull: ['$voteRecountAt', 0] }, { $subtract: [serverTime, recountInterval] }] } },
		[{ $set: { voteRecountAt: serverTime } }], comments.schemaInstance, comments.collectionName,
	)
	if (!claim.result) {
		return
	}

	const correction: Partial<Counts> = {}
	for (const direction of ['upvote', 'downvote'] as const) {
		if (direction === 'upvote' ? !recountUpvotes : !recountDownvotes) {
			continue
		}
		const count = await countDataFromMongoDB({ commentId, direction }, votes.schemaInstance, votes.collectionName, { readPreference: 'primary', limit: maxRecount + 1 })
		const field = direction === 'upvote' ? 'upvoteCount' : 'downvoteCount'
		if (count.result !== undefined && count.result !== comment[field]) {
			correction[field] = count.result
		}
	}
	// 统计期间发生的增减优先。版本也能识别数字先升后降、碰巧回到原值的情况。
	if (Object.keys(correction).length && !activityByComment.has(commentId)) {
		await findOneAndUpdateWithOperators4MongoDB(
			{ _id: commentId, voteRevision: revision, voteRecountAt: claim.result.voteRecountAt }, { $set: correction }, comments.schemaInstance, comments.collectionName,
		)
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
		try {
			const { upvoteDelta: up, downvoteDelta: down } = batch
			if (up === 0 && down === 0) {
				return
			}
			const updated = await findOneAndUpdateWithOperators4MongoDB(
				{ _id: commentId }, { $inc: { upvoteCount: up, downvoteCount: down, voteRevision: 1 } }, comments.schemaInstance, comments.collectionName,
			)
			if (updated.result) {
				const comment = updated.result
				activity.comment = comment
				activity.recountUpvotes = comment.upvoteCount <= maxRecount && (activity.recountUpvotes || up !== 0)
				activity.recountDownvotes = comment.downvoteCount <= maxRecount && (activity.recountDownvotes || down !== 0)
			}
		} catch (error) {
			// 用户的记录已保存。重复应用增减量可能多算，后续操作可在限频间隔后按记录校准。
			logging('ERROR', '更新评论赞踩计数失败', error, { commentId })
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
		{ _id: commentId, videoId }, { upvoteCount: 1, downvoteCount: 1, voteRevision: 1, voteRecountAt: 1 },
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
			// 上次可能只写成功了个人记录。重复请求也可校准低计数，仍使用同一频率上限。
			activity.recountUpvotes ||= direction === 'upvote' && activity.comment.upvoteCount <= maxRecount
			activity.recountDownvotes ||= direction === 'downvote' && activity.comment.downvoteCount <= maxRecount
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
