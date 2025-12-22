import mongoose, { InferSchemaType } from 'mongoose'
import { checkUserTokenByUuidService, checkUserTokenService, getUserInfoByUidService, getUserUid, getUserUuid } from './UserService.js'
import { findOneAndPlusByMongodbId, insertData2MongoDB, selectDataFromMongoDB, updateData4MongoDB } from '../dbPool/DbClusterPool.js'
import { QueryType, SelectType } from '../dbPool/DbClusterPoolTypes.js'
import { VideoDownvoteSchema, VideoUpvoteSchema } from '../dbPool/schema/VideoVoteSchema.js'

/**
 * 用户给视频点赞
 * @param videoId 视频 ID
 * @param uuid 用户 UUID
 * @param token 用户 token
 * @returns 点赞结果
 */
export const emitVideoUpvoteService = async (videoId: number, uuid: string, token: string): Promise<{ success: boolean; message: string }> => {
    // WARN // TODO 应当添加更多安全验证，防刷！
    try {
        if (!videoId || !uuid || !token) {
            console.error('ERROR', '视频点赞失败，参数异常', { videoId, uuid })
            return { success: false, message: '视频点赞失败，参数异常' }
        }
        
        if (!(await checkUserTokenByUuidService(uuid, token)).success) {
            console.error('ERROR', '视频点赞失败，用户校验未通过', { videoId, uuid })
            return { success: false, message: '视频点赞失败，用户校验未通过' }
        }

        const uid = await getUserUid(uuid)
        if (uid === undefined || uid === null || uid < 1) {
            console.error('ERROR', '视频点赞失败，获取用户 UID 失败', { uuid })
            return { success: false, message: '视频点赞失败，获取用户 UID 失败' }
        }

        const { collectionName: videoUpvoteCollectionName, schemaInstance: correctVideoUpvoteSchema } = VideoUpvoteSchema
        type VideoUpvote = InferSchemaType<typeof correctVideoUpvoteSchema>
        
        // 先查询是否存在该用户对该视频的点赞记录（无论 invalidFlag 是什么）
        const existingVoteWhere: QueryType<VideoUpvote> = {
            videoId,
            uid,
        }
        
        const existingVote = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoUpvoteSchema, videoUpvoteCollectionName)
        
        const nowDate = new Date().getTime()
        let voteResult
        
        if (existingVote.success && existingVote.result && existingVote.result.length > 0) {
            // 存在记录，检查 invalidFlag
            const existingVoteRecord = existingVote.result[0]
            if (existingVoteRecord.invalidFlag) {
                // 如果 invalidFlag 为 true，则更新为 false
                const updateVoteWhere: QueryType<VideoUpvote> = {
                    _id: existingVoteRecord._id,
                }
                const updateVoteUpdate: QueryType<VideoUpvote> = {
                    invalidFlag: false,
                    editDateTime: nowDate,
                }
                
                voteResult = await updateData4MongoDB(updateVoteWhere, updateVoteUpdate, correctVideoUpvoteSchema, videoUpvoteCollectionName)
            } else {
                // 已经是有效的点赞记录，无需操作
                console.error('ERROR', '用户点赞时出错，用户已点赞', { videoId, uid })
                return { success: false, message: '用户点赞时出错，用户已点赞' }
            }
        } else {
            // 不存在记录，创建新记录
            const videoUpvote: VideoUpvote = {
                videoId,
                UUID: uuid,
                uid,
                upvoteTime: nowDate,
                invalidFlag: false,
                editDateTime: nowDate,
            }
            
            voteResult = await insertData2MongoDB(videoUpvote, correctVideoUpvoteSchema, videoUpvoteCollectionName)
        }

        if (voteResult && voteResult.success) {
            // 处理点赞时自动取消点踩
            if (await checkUserHasDownvoted(videoId, uid)) {
                const cancelVideoDownvoteResult = await cancelVideoDownvoteService(videoId, uid, token)
                if (cancelVideoDownvoteResult.success) {
                    return { success: true, message: '视频点赞成功' }
                } else {
                    console.error('ERROR', '视频点赞成功，但未能取消点踩', { videoId, uid })
                    return { success: false, message: '视频点赞成功，但未能取消点踩' }
                }
            } else {
                return { success: true, message: '视频点赞成功' }
            }
        } else {
            console.error('ERROR', '视频点赞失败，存储数据失败', { videoId, uid })
            return { success: false, message: '视频点赞失败，存储数据失败' }
        }
    } catch (error) {
        console.error('ERROR', '视频点赞失败，未知错误：', error, { videoId, uuid })
        return { success: false, message: '视频点赞失败，未知错误' }
    }
}

/**
 * 用户取消视频点赞
 * @param videoId 视频 ID
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 取消点赞结果
 */
export const cancelVideoUpvoteService = async (videoId: number, uid: number, token: string): Promise<{ success: boolean; message: string }> => {
    try {
        if (!videoId || !uid || !token) {
            console.error('ERROR', '用户取消视频点赞失败，参数异常', { videoId, uid })
            return { success: false, message: '用户取消视频点赞失败，参数异常' }
        }

        if (!(await checkUserTokenService(uid, token)).success) {
            console.error('ERROR', '用户取消视频点赞失败，用户校验未通过', { videoId, uid })
            return { success: false, message: '用户取消视频点赞失败，用户校验未通过' }
        }

        const { collectionName: videoUpvoteCollectionName, schemaInstance: correctVideoUpvoteSchema } = VideoUpvoteSchema
        type VideoUpvote = InferSchemaType<typeof correctVideoUpvoteSchema>
        const cancelVideoUpvoteWhere: QueryType<VideoUpvote> = {
            videoId,
            uid,
            invalidFlag: false,
        }
        const cancelVideoUpvoteUpdate: QueryType<VideoUpvote> = {
            invalidFlag: true,
            editDateTime: new Date().getTime(),
        }

        try {
            const updateResult = await updateData4MongoDB(cancelVideoUpvoteWhere, cancelVideoUpvoteUpdate, correctVideoUpvoteSchema, videoUpvoteCollectionName)
            if (updateResult && updateResult.success && updateResult.result) {
                if (updateResult.result.matchedCount > 0 && updateResult.result.modifiedCount > 0) {
                    return { success: true, message: '用户取消视频点赞成功' }
                } else {
                    console.error('ERROR', '用户取消视频点赞时出错，更新数量为 0', { videoId, uid })
                    return { success: false, message: '用户取消视频点赞时出错，更新数量为 0' }
                }
            } else {
                console.error('ERROR', '用户取消视频点赞时出错，更新失败', { videoId, uid })
                return { success: false, message: '用户取消视频点赞时出错，更新失败' }
            }
        } catch (error) {
            console.error('ERROR', '用户取消视频点赞时出错，更新数据时出错', error, { videoId, uid })
            return { success: false, message: '用户取消视频点赞时出错，更新数据时出错' }
        }
    } catch (error) {
        console.error('ERROR', '用户取消视频点赞时出错，未知错误', error, { videoId, uid })
        return { success: false, message: '用户取消视频点赞时出错，未知错误' }
    }
}

/**
 * 用户给视频点踩
 * @param videoId 视频 ID
 * @param uuid 用户 UUID
 * @param token 用户 token
 * @returns 点踩结果
 */
export const emitVideoDownvoteService = async (videoId: number, uuid: string, token: string): Promise<{ success: boolean; message: string }> => {
    // WARN // TODO 应当添加更多安全验证，防刷！
    try {
        if (!videoId || !uuid || !token) {
            console.error('ERROR', '视频点踩失败，参数异常', { videoId, uuid })
            return { success: false, message: '视频点踩失败，参数异常' }
        }
        
        if (!(await checkUserTokenByUuidService(uuid, token)).success) {
            console.error('ERROR', '视频点踩失败，用户校验未通过', { videoId, uuid })
            return { success: false, message: '视频点踩失败，用户校验未通过' }
        }

        const uid = await getUserUid(uuid)
        if (uid === undefined || uid === null || uid < 1) {
            console.error('ERROR', '视频点踩失败，获取用户 UID 失败', { uuid })
            return { success: false, message: '视频点踩失败，获取用户 UID 失败' }
        }

        const { collectionName: videoDownvoteCollectionName, schemaInstance: correctVideoDownvoteSchema } = VideoDownvoteSchema
        type VideoDownvote = InferSchemaType<typeof correctVideoDownvoteSchema>
        
        // 先查询是否存在该用户对该视频的点踩记录（无论 invalidFlag 是什么）
        const existingVoteWhere: QueryType<VideoDownvote> = {
            videoId,
            uid,
        }
        
        const existingVote = await selectDataFromMongoDB(existingVoteWhere, {}, correctVideoDownvoteSchema, videoDownvoteCollectionName)
        
        const nowDate = new Date().getTime()
        let voteResult
        
        if (existingVote.success && existingVote.result && existingVote.result.length > 0) {
            // 存在记录，检查 invalidFlag
            const existingVoteRecord = existingVote.result[0]
            if (existingVoteRecord.invalidFlag) {
                // 如果 invalidFlag 为 true，则更新为 false
                const updateVoteWhere: QueryType<VideoDownvote> = {
                    _id: existingVoteRecord._id,
                }
                const updateVoteUpdate: QueryType<VideoDownvote> = {
                    invalidFlag: false,
                    editDateTime: nowDate,
                }
                
                voteResult = await updateData4MongoDB(updateVoteWhere, updateVoteUpdate, correctVideoDownvoteSchema, videoDownvoteCollectionName)
            } else {
                // 已经是有效的点踩记录，无需操作
                console.error('ERROR', '用户点踩时出错，用户已点踩', { videoId, uid })
                return { success: false, message: '用户点踩时出错，用户已点踩' }
            }
        } else {
            // 不存在记录，创建新记录
            const videoDownvote: VideoDownvote = {
                videoId,
                UUID: uuid,
                uid,
                downvoteTime: nowDate,
                invalidFlag: false,
                editDateTime: nowDate,
            }
            
            voteResult = await insertData2MongoDB(videoDownvote, correctVideoDownvoteSchema, videoDownvoteCollectionName)
        }

        if (voteResult && voteResult.success) {
            // 处理点踩时自动取消点赞
            if (await checkUserHasUpvoted(videoId, uid)) {
                const cancelVideoUpvoteResult = await cancelVideoUpvoteService(videoId, uid, token)
                if (cancelVideoUpvoteResult.success) {
                    return { success: true, message: '视频点踩成功' }
                } else {
                    console.error('ERROR', '视频点踩成功，但未能取消点赞', { videoId, uid })
                    return { success: false, message: '视频点踩成功，但未能取消点赞' }
                }
            } else {
                return { success: true, message: '视频点踩成功' }
            }
        } else {
            console.error('ERROR', '视频点踩失败，存储数据失败', { videoId, uid })
            return { success: false, message: '视频点踩失败，存储数据失败' }
        }
    } catch (error) {
        console.error('ERROR', '视频点踩失败，未知错误：', error, { videoId, uuid })
        return { success: false, message: '视频点踩失败，未知错误' }
    }
}

/**
 * 用户取消视频点踩
 * @param videoId 视频 ID
 * @param uid 用户 UID
 * @param token 用户 token
 * @returns 取消点踩结果
 */
export const cancelVideoDownvoteService = async (videoId: number, uid: number, token: string): Promise<{ success: boolean; message: string }> => {
    try {
        if (!videoId || !uid || !token) {
            console.error('ERROR', '用户取消视频点踩失败，参数异常', { videoId, uid })
            return { success: false, message: '用户取消视频点踩失败，参数异常' }
        }

        if (!(await checkUserTokenService(uid, token)).success) {
            console.error('ERROR', '用户取消视频点踩失败，用户校验未通过', { videoId, uid })
            return { success: false, message: '用户取消视频点踩失败，用户校验未通过' }
        }

        const { collectionName: videoDownvoteCollectionName, schemaInstance: correctVideoDownvoteSchema } = VideoDownvoteSchema
        type VideoDownvote = InferSchemaType<typeof correctVideoDownvoteSchema>
        const cancelVideoDownvoteWhere: QueryType<VideoDownvote> = {
            videoId,
            uid,
            invalidFlag: false,
        }
        const cancelVideoDownvoteUpdate: QueryType<VideoDownvote> = {
            invalidFlag: true,
            editDateTime: new Date().getTime(),
        }

        try {
            const updateResult = await updateData4MongoDB(cancelVideoDownvoteWhere, cancelVideoDownvoteUpdate, correctVideoDownvoteSchema, videoDownvoteCollectionName)
            if (updateResult && updateResult.success && updateResult.result) {
                if (updateResult.result.matchedCount > 0 && updateResult.result.modifiedCount > 0) {
                    return { success: true, message: '用户取消视频点踩成功' }
                } else {
                    console.error('ERROR', '用户取消视频点踩时出错，更新数量为 0', { videoId, uid })
                    return { success: false, message: '用户取消视频点踩时出错，更新数量为 0' }
                }
            } else {
                console.error('ERROR', '用户取消视频点踩时出错，更新失败', { videoId, uid })
                return { success: false, message: '用户取消视频点踩时出错，更新失败' }
            }
        } catch (error) {
            console.error('ERROR', '用户取消视频点踩时出错，更新数据时出错', error, { videoId, uid })
            return { success: false, message: '用户取消视频点踩时出错，更新数据时出错' }
        }
    } catch (error) {
        console.error('ERROR', '用户取消视频点踩时出错，未知错误', error, { videoId, uid })
        return { success: false, message: '用户取消视频点踩时出错，未知错误' }
    }
}

/**
 * 检查用户是否已经对一个视频点赞
 * @param videoId 视频 ID
 * @param uid 用户 UID
 * @returns 校验结果，用户已点赞返回 true, 未点赞返回 false
 */
const checkUserHasUpvoted = async (videoId: number, uid: number): Promise<boolean> => {
    try {
        if (!videoId || uid === undefined || uid === null) {
            console.error('在验证用户是否已经对某视频点赞时出错：数据校验未通过', { videoId, uid })
            return false
        }
        
        const { collectionName, schemaInstance } = VideoUpvoteSchema
        type VideoUpvote = InferSchemaType<typeof schemaInstance>
        const where: QueryType<VideoUpvote> = {
            uid,
            videoId,
            invalidFlag: false,
        }

        const select: SelectType<VideoUpvote> = {
            videoId: 1,
            uid: 1,
        }

        try {
            const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
            if (result.success) {
                if (result.result && result.result.length > 0) {
                    return true // 查询到结果了，证明用户已点赞过了，所以返回 true
                } else {
                    return false // 查询成功但未查询到结果，证明用户未点赞，所以返回 false
                }
            } else {
                return false // 悲观：查询失败，不算作用户点赞
            }
        } catch (error) {
            console.error('在验证用户是否已经对某视频点赞时出错：获取用户点赞数据失败', error, { videoId, uid })
            return false
        }
    } catch (error) {
        console.error('在验证用户是否已经对某视频点赞时出错：', error, { videoId, uid })
        return false
    }
}

/**
 * 检查用户是否已经对一个视频点踩
 * @param videoId 视频 ID
 * @param uid 用户 UID
 * @returns 校验结果，用户已点踩返回 true, 未点踩返回 false
 */
const checkUserHasDownvoted = async (videoId: number, uid: number): Promise<boolean> => {
    try {
        if (!videoId || uid === undefined || uid === null) {
            console.error('在验证用户是否已经对某视频点踩时出错：数据校验未通过', { videoId, uid })
            return false
        }
        
        const { collectionName, schemaInstance } = VideoDownvoteSchema
        type VideoDownvote = InferSchemaType<typeof schemaInstance>
        const where: QueryType<VideoDownvote> = {
            uid,
            videoId,
            invalidFlag: false,
        }

        const select: SelectType<VideoDownvote> = {
            videoId: 1,
            uid: 1,
        }

        try {
            const result = await selectDataFromMongoDB(where, select, schemaInstance, collectionName)
            if (result.success) {
                if (result.result && result.result.length > 0) {
                    return true // 查询到结果了，证明用户已点踩过了，所以返回 true
                } else {
                    return false // 查询成功但未查询到结果，证明用户未点踩，所以返回 false
                }
            } else {
                return false // 悲观：查询失败，不算作用户点踩
            }
        } catch (error) {
            console.error('在验证用户是否已经对某视频点踩时出错：获取用户点踩数据失败', error, { videoId, uid })
            return false
        }
    } catch (error) {
        console.error('在验证用户是否已经对某视频点踩时出错：', error, { videoId, uid })
        return false
    }
}
