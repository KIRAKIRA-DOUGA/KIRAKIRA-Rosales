/**
 * 用户安全认证集合
 */
export const UserAuthSchema = {
	/** MongoDB Schema */
	schema: {
		/** 用户的 UID - 非空 */
		uid: { type: Number, unique: true, required: true },
		/** 用户邮箱 - 非空 */
		email: { type: String, unique: true, required: true },
		/** 被两次 Hash 的密码 - 非空 */
		passwordHashHash: { type: String, required: true },
		/** 盐 - 非空 */
		salt: { type: String, required: true },
		/** 用户的身分令牌 - 非空 */
		token: { type: String, required: true },
		/** 密码提示 */
		passwordHint: String,
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	},
	/** MongoDB 集合名 */
	collectionName: 'user-auth',
}

/**
 * 用户的个人标签
 */
const userLabelSchema = {
	/** 标签 ID */
	id: { type: Number, required: true },
	/** 标签名 */
	labelName: { type: String, required: true },
}

/**
 * 用户信息集合
 */
export const UserInfoSchema = {
	/** MongoDB Schema */
	schema: {
		/** 用户的 UID - 非空 - 唯一 */
		uid: { type: Number, unique: true, required: true },
		/** 用户名 - 唯一 */
		username: { type: String, unique: true },
		/** 用户头像的链接 */
		avatar: { type: String },
		/** 用户背景图片的链接 */
		userBannerImage: { type: String },
		/** 用户的个性签名 */
		signature: { type: String },
		/** 用户的性别，男、女和自定义（字符串）v */
		gender: { type: String },
		/** 用户的个人标签 */
		label: { type: [userLabelSchema], required: false },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	},
	/** MongoDB 集合名 */
	collectionName: 'user-info',
}
