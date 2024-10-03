import { Schema } from 'mongoose'

/**
 * 用户安全认证集合
 */
class UserAuthSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID，关联用户安全集合的 UUID - 非空 - 唯一 */
		UUID: { type: String, required: true, unique: true },
		/** 用户的 UID - 非空 */
		uid: { type: Number, required: true, unique: true },
		/** 用户邮箱 - 非空 */
		email: { type: String, required: true, unique: true },
		/** 全小写的用户邮箱 - 非空 */
		emailLowerCase: { type: String, required: true, unique: true },
		/** 被两次 Bcrypt Hash 的密码 - 非空 */
		passwordHashHash: { type: String, required: true },
		/** 用户的身分令牌 - 非空 */
		token: { type: String, required: true },
		/** 密码提示 */
		passwordHint: String, // TODO: 如何确保密码提示的安全性？
		/** 用户的角色 */
		role: { type: String, required: true },
		/** 用户开启的 2FA 类型 - 非空 */ /* 可以为 email, totp 或 none（表示未开启） */
		authenticatorType: { type: String, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		userCreateDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-auth'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserAuthSchema = new UserAuthSchemaFactory()

/**
 * 用户的个人标签
 */
const UserLabelSchema = {
	/** 标签 ID - 非空 */
	id: { type: Number, required: true },
	/** 标签名 - 非空 */
	labelName: { type: String, required: true },
}

/**
 * 用户的关联账户
 */
const UserLinkAccountsSchema = {
	/** 关联账户类型 - 非空 - 例："X" */
	accountType: { type: String, required: true },
	/** 关联账户唯一标识 - 非空 */
	accountUniqueId: { type: String, required: true },
}

/**
 * 用户的关联网站
 */
const UserWebsiteSchema = {
	/** 关联网站名 - 非空 - 例："我的个人主页" */
	websiteName: { type: String, required: true },
	/** 关联网站 URL - 非空 */
	websiteUrl: { type: String, required: true },
}

/**
 * 用户信息集合
 */
class UserInfoSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID，关联用户安全集合的 UUID - 非空 - 唯一 */
		UUID: { type: String, required: true, unique: true },
		/** 用户的 UID - 非空 - 唯一 */
		uid: { type: Number, required: true, unique: true },
		/** 用户名 - 唯一 */
		username: { type: String, unique: true },
		/** 用户昵称 */
		userNickname: { type: String },
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
		/** 是否在上一次审核通过后修改了用户信息，当第一次创建和用户信息发生更新时需要设为 ture，当管理员通过审核时时将其改为 false */
		isUpdatedAfterReview: { type: Boolean, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-info'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserInfoSchema = new UserInfoSchemaFactory()

/**
 * 用户关联账户的隐私设置
 */
const UserLinkAccountsPrivacySettingSchema = {
	/** 关联账户类型 - 非空 - 例："X" */
	accountType: { type: String, required: true },
	/** 显示方式 - 非空 - 允许的值有：{public: 公开, following: 仅关注, private: 隐藏} */
	privacyType: { type: String, required: true },
}

/**
 * 用户个性设定集合
 */
class UserSettingsSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID，关联用户安全集合的 UUID - 非空 - 唯一 */
		UUID: { type: String, required: true, unique: true },
		/** 用户的 UID - 非空 - 唯一 */
		uid: { type: Number, required: true, unique: true },
		/** 是否启用 Cookie - 布尔 */
		enableCookie: { type: Boolean },
		/** 主题外观设置（主题类型） - 可选的值：{light: 浅色, dark: 深色, system: 跟随系统} */
		themeType: { type: String },
		/** 主题颜色 - 字符串，颜色字符串 */
		themeColor: { type: String },
		/** 用户自定义主题颜色 - 字符串，HAX 颜色字符串，不包含井号 */
		themeColorCustom: { type: String },
		/** 壁纸（背景图 URL） - 字符串 */
		wallpaper: { type: String },
		/** 是否启用彩色导航栏 - 布尔 */
		coloredSideBar: { type: Boolean },
		/** 节流模式 - 字符串，{standard: 标准, limit: 节流模式, preview: 超前加载} */
		dataSaverMode: { type: String },
		/** 禁用搜索推荐 - 布尔 */
		noSearchRecommendations: { type: Boolean },
		/** 禁用相关视频推荐 - 布尔 */
		noRelatedVideos: { type: Boolean },
		/** 禁用搜索历史 - 布尔 */
		noRecentSearch: { type: Boolean },
		/** 禁用视频历史 - 布尔 */
		noViewHistory: { type: Boolean },
		/** 是否在新窗口打开视频 - 布尔 */
		openInNewWindow: { type: Boolean },
		/** 显示语言 - 字符串 */
		currentLocale: { type: String },
		/** 用户时区 - 字符串 */
		timezone: { type: String },
		/** 用户单位制度 - 字符串，刻度制或分度值，英制或美制等内容 */
		unitSystemType: { type: String },
		/** 是否进入了开发者模式 - 布尔 */
		devMode: { type: Boolean },
		/** 实验性：启用动态背景 - 布尔 */
		showCssDoodle: { type: Boolean },
		/** 实验性：启用直角模式 - 布尔 */
		sharpAppearanceMode: { type: Boolean },
		/** 实验性：启用扁平模式 - 布尔 */
		flatAppearanceMode: { type: Boolean },
		/** 用户关联网站的隐私设置 */
		userWebsitePrivacySetting: { type: String },
		/** 用户关联账户的隐私设置 */
		userLinkAccountsPrivacySetting: { type: [UserLinkAccountsPrivacySettingSchema] },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 // WARN 不要使用单词的复数形式，Mongoose 会自动添加！ */
	collectionName = 'user-setting'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserSettingsSchema = new UserSettingsSchemaFactory()

/**
 * 用户注册邮箱验证码
 */
class UserVerificationCodeSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的邮箱 - 非空 - 唯一 */
		emailLowerCase: { type: String, required: true, unique: true },
		/** 用户的验证码 - 非空 */
		verificationCode: { type: String, required: true },
		/** 用户的验证码过期时间 - 非空 */
		overtimeAt: { type: Number, required: true, unique: true },
		/** 用户今日请求的次数，用于防止滥用 - 非空 */
		attemptsTimes: { type: Number, required: true },
		/** 用户上一次请求验证码的时间，用于防止滥用 - 非空 */
		lastRequestDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-verification-code'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserVerificationCodeSchema = new UserVerificationCodeSchemaFactory()

/**
 * 用户邀请码
 */
class UserInvitationCodeSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 生成邀请码的用户 UUID，关联用户安全集合的 UUID - 非空 */
		creatorUUID: { type: String, required: true },
		/** 生成邀请码的用户 - 非空 */
		creatorUid: { type: Number, required: true },
		/** 邀请码 - 非空 - 唯一 */
		invitationCode: { type: String, required: true, unique: true },
		/** 生成邀请码的时间 - 非空 */
		generationDateTime: { type: Number, required: true },
		/** 邀请码被标记为等待使用中 - 非空 */
		isPending: { type: Boolean, required: true },
		/** 邀请码被标记为无法使用 - 非空 */
		disabled: { type: Boolean, required: true },
		/** 使用这个邀请码的用户 UUID */
		assigneeUUID: { type: String },
		/** 使用这个邀请码的用户 */
		assignee: { type: Number },
		/** 邀请码被使用的时间 */
		usedDateTime: { type: Number },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-invitation-code'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserInvitationCodeSchema = new UserInvitationCodeSchemaFactory()

/**
 * 用户更改邮箱的邮箱验证码
 */
class UserChangeEmailVerificationCodeSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的邮箱 - 非空 - 唯一 */
		emailLowerCase: { type: String, required: true, unique: true },
		/** 用户的验证码 - 非空 */
		verificationCode: { type: String, required: true },
		/** 用户的验证码过期时间 - 非空 */
		overtimeAt: { type: Number, required: true, unique: true },
		/** 用户今日请求的次数，用于防止滥用 - 非空 */
		attemptsTimes: { type: Number, required: true },
		/** 用户上一次请求验证码的时间，用于防止滥用 - 非空 */
		lastRequestDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-change-email-verification-code'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserChangeEmailVerificationCodeSchema = new UserChangeEmailVerificationCodeSchemaFactory()

/**
 * 用户更改密码的邮箱验证码
 */
class UserChangePasswordVerificationCodeSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID，关联用户安全集合的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 用户 ID - 非空 */
		uid: { type: Number, required: true },
		/** 用户的邮箱 - 非空 - 唯一 */
		emailLowerCase: { type: String, required: true, unique: true },
		/** 用户的验证码 - 非空 */
		verificationCode: { type: String, required: true },
		/** 用户的验证码过期时间 - 非空 */
		overtimeAt: { type: Number, required: true, unique: true },
		/** 用户今日请求的次数，用于防止滥用 - 非空 */
		attemptsTimes: { type: Number, required: true },
		/** 用户上一次请求验证码的时间，用于防止滥用 - 非空 */
		lastRequestDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-change-password-verification-code'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserChangePasswordVerificationCodeSchema = new UserChangePasswordVerificationCodeSchemaFactory()

/**
 * 用户身份验证器
 */
class UserTotpAuthenticatorSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID，关联用户安全集合的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 是否启用身份验证器 - 非空 - 默认值：false */
		enabled: { type: Boolean, required: true, default: false },
		/** 验证器密钥 */
		secret: { type: String },
		/** 恢复码 */
		recoveryCodeHash: { type: String },
		/** 备份码 */
		backupCodeHash: { type: [String] },
		/** QRcode */
		otpAuth: { type: String, unique: true },
		/** 尝试次数 */
		attempts: { type: Number },
		/** 上次尝试登录时间 */
		lastAttemptTime: { type: Number },
		/** 系统专用字段-创建时间 - 非空 */
		createDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-totp-authenticator'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)

	// 构造器
	constructor() {
		// 添加 UUID 和 secret 组合的唯一索引
		this.schemaInstance.index({ UUID: 1, secret: 1 }, { unique: true });
	}
}
export const UserTotpAuthenticatorSchema = new UserTotpAuthenticatorSchemaFactory()

/**
 * 用户删除 2FA 的邮箱验证码
 */
class UserDeleteTotpAuthenticatorVerificationCodeSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID，关联用户安全集合的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 用户 ID - 非空 */
		uid: { type: Number, required: true },
		/** 用户的邮箱 - 非空 - 唯一 */
		emailLowerCase: { type: String, required: true, unique: true },
		/** 用户的验证码 - 非空 */
		verificationCode: { type: String, required: true },
		/** 用户的验证码过期时间 - 非空 */
		overtimeAt: { type: Number, required: true, unique: true },
		/** 用户今日请求的次数，用于防止滥用 - 非空 */
		attemptsTimes: { type: Number, required: true },
		/** 用户上一次请求验证码的时间，用于防止滥用 - 非空 */
		lastRequestDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-delete-totp-authenticator-verification-code'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserDeleteTotpAuthenticatorVerificationCodeSchema = new UserDeleteTotpAuthenticatorVerificationCodeSchemaFactory()

/**
 * 用户删除 2FA 的邮箱验证码
 */
class UserEmailAuthenticatorVerificationCodeSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UUID，关联用户安全集合的 UUID - 非空 */
		UUID: { type: String, required: true },
		/** 用户 ID - 非空 */
		uid: { type: Number, required: true },
		/** 用户的邮箱 - 非空 - 唯一 */
		emailLowerCase: { type: String, required: true, unique: true },
		/** 用户的验证码 - 非空 */
		verificationCode: { type: String, required: true },
		/** 用户的验证码过期时间 - 非空 */
		overtimeAt: { type: Number, required: true, unique: true },
		/** 用户今日请求的次数，用于防止滥用 - 非空 */
		attemptsTimes: { type: Number, required: true },
		/** 用户上一次请求验证码的时间，用于防止滥用 - 非空 */
		lastRequestDateTime: { type: Number, required: true },
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
	}
	/** MongoDB 集合名 */
	collectionName = 'user-email-authenticator-verification-code'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserEmailAuthenticatorVerificationCodeSchema = new UserEmailAuthenticatorVerificationCodeSchemaFactory()
