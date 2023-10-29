/**
 * 用户安全认证
 * @param uid 必填-用户的 UID
 * @param email 必填-用户邮箱
 * @param passwordHashHash 必填-被两次 Hash 的密码
 * @param salt 必填-盐
 * @param token 必填-用户的身分令牌
 * @param passwordHint 密码提示
 * @param editDateTime 必填-系统专用字段-最后编辑时间
 */
export const UserAuthSchema = {
	schema: {
		uid: { type: Number, unique: true, required: true },
		email: { type: String, unique: true, required: true },
		passwordHashHash: { type: String, required: true },
		salt: { type: String, required: true },
		token: { type: String, required: true },
		passwordHint: String,
		editDateTime: { type: Number, required: true },
	},
	collectionName: 'user-auth',
}


/**
 * 用户信息
 * @param uid 必填-用户的 UID
 * @param username 必填-用户名（通常是邮箱）
 * @param avatar 用户头像的连接
 * @param userBannerImage 用户背景图片的
 */
export const UserInfoSchema = {
	schema: {
		uid: { type: Number, unique: true, required: true },
		username: { type: String, unique: true, required: true },
		avatar: { type: String },
		userBannerImage: { type: String },
		signature: { type: String },
		gender: { type: String },
		Label: { type: String },
	},
	collectionName: 'user-info',
}
