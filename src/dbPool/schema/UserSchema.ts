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

		// // TODO 用户创建日期
		// /** 用户创建时间 */
		// userCreateDate: { type: Number, required: true },

		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	},
	/** MongoDB 集合名 */
	collectionName: 'user-auth',
}


/**
 * 用户的个人标签
 */
const UserLabelSchema = {
	/** 标签 ID */
	id: { type: Number, required: true },
	/** 标签名 */
	labelName: { type: String, required: true },
}

/**
 * 用户的关联账户
 */
const UserLinkAccountsSchema = {
	/** 关联账户类型 - 例："X" */
	accountType: { type: String, required: true },
	/** 关联账户唯一标识 */
	accountUniqueId: { type: String, required: true },
}

/**
 * 用户的关联网站
 */
const UserWebsiteSchema = {
	/** 关联网站名 - 例："我的个人主页" */
	websiteName: { type: String, required: true },
	/** 关联网站 URL */
	websiteUrl: { type: String, required: true },
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
		label: { type: [UserLabelSchema], required: false },
		/** 用户生日 */
		userBirthday: { type: Number },
		/** 用户主页 Markdown */
		userProfileMarkdown: { type: String },
		/** 用户的关联账户 */
		userLinkAccounts: { type: [UserLinkAccountsSchema], required: false },
		/** 用户关联网站 */
		userWebsite: { type: UserWebsiteSchema },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	},
	/** MongoDB 集合名 */
	collectionName: 'user-info',
}
