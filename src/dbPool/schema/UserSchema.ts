/**
 * 用户安全认证集合
 */
export const UserAuthSchema = {
	/** MongoDB Schema */
	schema: {
		/** 非空-用户的 UID */
		uid: { type: Number, unique: true, required: true },
		/** 非空-用户邮箱 */
		email: { type: String, unique: true, required: true },
		/** 非空-被两次 Hash 的密码 */
		passwordHashHash: { type: String, required: true },
		/** 非空-盐 */
		salt: { type: String, required: true },
		/** 非空-用户的身分令牌 */
		token: { type: String, required: true },
		/** 密码提示 */
		passwordHint: String,
		/** 非空-系统专用字段-最后编辑时间 */
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
		/** 非空-用户的 UID */
		uid: { type: Number, unique: true, required: true },
		/** 用户名 */
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
		/** 非空-系统专用字段-最后编辑时间 */
		editDateTime: { type: Number, required: true },
	},
	/** MongoDB 集合名 */
	collectionName: 'user-info',
}
