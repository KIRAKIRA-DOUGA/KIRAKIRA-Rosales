import type { VideoVoteRequestDto, VideoUpvoteResponseDto, VideoDownvoteResponseDto } from '../controller/VideoVoteControllerDto.js'
import { countDataFromMongoDB, deleteOneDataFromMongoDB, findOneAndUpdateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { VideoVoteSchema } from '../dbPool/schema/VideoVoteSchema.js'
import { logging } from './loggingService.js'
import { checkUserTokenByUuidService } from './UserService.js'

type Direction = 'upvote' | 'downvote'
const { schemaInstance, collectionName } = VideoVoteSchema

async function setVideoVote(request: VideoVoteRequestDto, uuid: string, token: string, direction: Direction, active: boolean): Promise<VideoUpvoteResponseDto & VideoDownvoteResponseDto> {
	const label = direction === 'upvote' ? '点赞' : '点踩'
	const action = active ? label : `取消${label}`
	try {
		if (!Number.isSafeInteger(request?.videoId) || request.videoId <= 0 || !uuid || !token) {
			return { success: false, message: `视频${action}失败，参数异常` }
		}
		if (!(await checkUserTokenByUuidService(uuid, token)).success) {
			return { success: false, message: `视频${action}失败，用户校验未通过` }
		}

		const { videoId } = request
		const where = { videoId, UUID: uuid }
		if (active) {
			const saved = await findOneAndUpdateData4MongoDB(where, { direction, editDateTime: Date.now() }, schemaInstance, collectionName, { returnDocument: 'before' })
			if (!saved.success) {
				return { success: false, message: `视频${action}失败` }
			}
			if (saved.result?.direction === direction) {
				return { success: false, message: `用户已${label}` }
			}
		} else {
			// 旧的取消请求只能清除指定方向，不能删掉后来切换的状态。
			const deleted = await deleteOneDataFromMongoDB({ ...where, direction }, schemaInstance, collectionName)
			if (!deleted.success || !deleted.result?.deletedCount) {
				return { success: false, message: `用户未${label}` }
			}
		}

		const result: VideoUpvoteResponseDto & VideoDownvoteResponseDto = { success: true, message: `视频${action}成功` }
		try {
			const count = await countDataFromMongoDB({ videoId, direction }, schemaInstance, collectionName, { readPreference: 'primary' })
			if (count.success) {
				if (direction === 'upvote') {
					result.videoUpvoteCount = count.result
				} else {
					result.videoDownvoteCount = count.result
				}
			}
		} catch (error) {
			// 状态已写入。数量读取失败时省略可选字段，避免返回错误的零。
			logging('ERROR', '读取视频赞踩数量失败', error, { videoId })
		}
		return result
	} catch (error) {
		logging('ERROR', `视频${action}失败`, error, { videoId: request?.videoId })
		return { success: false, message: `视频${action}失败` }
	}
}

/**
 * 为视频点赞。
 * @param request 包含视频 ID 的请求
 * @param uuid 用户 UUID
 * @param token 登录凭证
 * @returns 点赞结果和当前数量
 */
export const emitVideoUpvoteService = async (request: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoUpvoteResponseDto> =>
	setVideoVote(request, uuid, token, 'upvote', true)

/**
 * 为视频取消点赞。
 * @param request 包含视频 ID 的请求
 * @param uuid 用户 UUID
 * @param token 登录凭证
 * @returns 取消点赞结果和当前数量
 */
export const cancelVideoUpvoteService = async (request: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoUpvoteResponseDto> =>
	setVideoVote(request, uuid, token, 'upvote', false)

/**
 * 为视频点踩。
 * @param request 包含视频 ID 的请求
 * @param uuid 用户 UUID
 * @param token 登录凭证
 * @returns 点踩结果和当前数量
 */
export const emitVideoDownvoteService = async (request: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoDownvoteResponseDto> =>
	setVideoVote(request, uuid, token, 'downvote', true)

/**
 * 为视频取消点踩。
 * @param request 包含视频 ID 的请求
 * @param uuid 用户 UUID
 * @param token 登录凭证
 * @returns 取消点踩结果和当前数量
 */
export const cancelVideoDownvoteService = async (request: VideoVoteRequestDto, uuid: string | undefined, token: string | undefined): Promise<VideoDownvoteResponseDto> =>
	setVideoVote(request, uuid, token, 'downvote', false)
