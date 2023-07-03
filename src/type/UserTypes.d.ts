/**
 * 用户设置
 * 
 * @param uuid 用户ID
 * @param systemStyle 用户的样式
 * @param systemColor 用户系统颜色
 * @param backgroundAnimation 是否启动背景动画
 * @param settingPageLastEnter 最后浏览的设置页
 * 
 */
export type userSettingsType = {
	uuid: string;
	systemStyle: string;
	systemColor: string;
	backgroundAnimation: boolean;
	settingPageLastEnter: string;
}

/**
 * 用户登录时必要的参数
 * 
 * @param userName 用户名
 * @param passwordHash 在前端已经 Hash 过一次的的密码
 */
export type userLoginDataType = {
	userName: string;
	passwordHash: string;
}


/**
 * 用户安全数据库
 * 
 * @param userName 用户名
 * @param passwordHash 在前端已经 Hash 过一次的的密码
 * @param token 令牌
 * @param editDateTime 最后编辑日期
 */
export type userAuthDataType = {
	userName: string;
	passwordHashHash: string;
	token: string;
	editDateTime: number;
}
