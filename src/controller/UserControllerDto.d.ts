/**
 * 用户注册提交的参数
 * @param userName 用户名
 * @param passwordHash 在前端已经 Hash 过一次的的密码
 */
export type userRegistrationDataDto = {
	userName: string;
	passwordHash: string;
}

/**
 * 用户注册返回的参数
 * @param success 注册成果，返回 true，注册失败，返回 false
 * @param token 如果注册成功，则返回一个 token，如果注册失败，则 token 是一个假值（undefined、null 或 ''）
 */
export type userRegistrationResultDto = {
	success: boolean;
	token?: string;
	message: string;
}
