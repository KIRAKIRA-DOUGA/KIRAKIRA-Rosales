import { Schema } from 'mongoose'

/**
 * 用户安全认证集合
 */
class UserAuthSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的 UID - 非空 */
		uid: { type: Number, unique: true, required: true },
		/** 用户邮箱 - 非空 */
		email: { type: String, unique: true, required: true },
		/** 全小写的用户邮箱 - 非空 */
		emailLowerCase: { type: String, unique: true, required: true },
		/** 被两次 Bcrypt Hash 的密码 - 非空 */
		passwordHashHash: { type: String, required: true },
		/** 用户的身分令牌 - 非空 */
		token: { type: String, required: true },
		/** 密码提示 */
		passwordHint: String,
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
		/** 用户的 UID - 非空 - 唯一 */
		uid: { type: Number, unique: true, required: true },
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
		/** 系统专用字段-最后编辑时间 - 非空 */
		editDateTime: { type: Number, required: true },
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
		/** 用户的 UID - 非空 - 唯一 */
		uid: { type: Number, unique: true, required: true },
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
	}
	/** MongoDB 集合名 // WARN 不要使用单词的复数形式，Mongoose 会自动添加！ */
	collectionName = 'user-setting'
	/** Mongoose Schema 实例 */
	schemaInstance = new Schema(this.schema)
}
export const UserSettingsSchema = new UserSettingsSchemaFactory()

/**
 * 用户邮箱验证码
 */
class UserVerificationCodeSchemaFactory {
	/** MongoDB Schema */
	schema = {
		/** 用户的邮箱 - 非空 - 唯一 */
		emailLowerCase: { type: String, unique: true, required: true },
		/** 用户的验证码 - 非空 */
		verificationCode: { type: String, required: true },
		/** 用户的验证码过期时间 - 非空 */
		overtimeAt: { type: Number, unique: true, required: true },
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
