import { SMTPClient } from 'emailjs'

/**
 * 邮件正文数据， text 和 html 二者至少一个不能为空
 */
type EmailBodyType =
	| { text: string; html?: string }
	| { text?: string; html: string }
	| { text: string; html: string }

/**
 * 发送电子邮件
 * @param to 收件人
 * @param title 电子邮件的标题（subject）
 * @param body 电子邮件的正文，详见 EmailBodyType
 * @returns 发送电子邮件的结果
 */
export const sendMail = async (to: string, title: string, body: EmailBodyType) => {
	const smtpHost = process.env.SMTP_ENDPOINT
	const smtpPort = process.env.SMTP_PORT
	const smtpUsername = process.env.SMTP_USER_NAME
	const smtpPassword = process.env.SMTP_PASSWORD
	const KIRAKIRA_EMAIL_SENDER_ADDRESS = 'KIRAKIRA <no-reply@kirakira.moe>'

	if (!smtpHost) {
		console.error('ERROR', '发送邮件失败，环境变量中的 smtpHost 为空')
		throw new Error('Unable send email because the smtpHost is null')
	}

	if (smtpPort === undefined || smtpPort === null) {
		console.error('ERROR', '发送邮件失败，环境变量中的 smtpPort 为空或不是合法的端口')
		throw new Error('Unable send email because the smtpPort is null')
	}

	if (!smtpUsername) {
		console.error('ERROR', '发送邮件失败，环境变量中的 smtpUsername 为空')
		throw new Error('Unable send email because the smtpUsername is null')
	}

	if (!smtpPassword) {
		console.error('ERROR', '发送邮件失败，环境变量中的 smtpPassword 为空')
		throw new Error('Unable send email because the smtpPassword is null')
	}

	if (!to) {
		console.error('ERROR', '发送邮件失败，收件人为空')
		throw new Error('Unable to send the mail, Recipient(TO) is empty')
	}

	if (!title) {
		console.error('ERROR', '发送邮件失败，邮件标题 (subject) 为空')
		throw new Error('Unable to send the mail, email title (subject) is empty')
	}

	if (title.length > 200) {
		console.warn('WARN', 'WARNING', '警告：当前邮件标题 (subject) 长度超过 200 字，请降低长度，长度超过 1000 字的邮件无法发送。')
	}

	if (title.length > 1000) {
		console.error('ERROR', '发送邮件失败，邮件标题 (subject) 过长')
		throw new Error('Unable to send the mail, title (subject) is too long')
	}

	if (!body.text && !body.html) {
		console.error('ERROR', '发送邮件失败，邮件体 body 中的 text 和 html 为空，请至少提供一个正文数据')
		throw new Error('Unable to send the mail, text and html in body in null')
	}

	// 配置 SMTP 客户端，并指定端口
	const client = new SMTPClient({
		user: smtpUsername, // 你的 SMTP 用户名
		password: smtpPassword, // 你的 SMTP 密码
		host: smtpHost, // 根据你的区域选择合适的 SMTP 服务器地址
		port: parseInt(smtpPort, 10), // 指定端口（例如 587 或 465）
		tls: true, // 启用 TLS
		ssl: false,
	})

	// 配置邮件内容
	const message = {
		text: body.text,
		from: KIRAKIRA_EMAIL_SENDER_ADDRESS, // 发件人邮箱地址
		to, // 收件人邮箱地址
		subject: title, // 邮件主题
		attachment: [
			{
				data: body.html,
				alternative: true,
			},
		],
	}

	try {
		const result = await client.sendAsync(message)
		return { success: true, result, message: '邮件发送成功' }
	} catch (error) {
		console.error('ERROR', '发送邮件失败，发送出错', error)
		return { success: false, result: undefined, message: '邮件发送失败' }
	}
}

/**
 * 验证 Email 地址是否合法
 * @param email 被验证的 Email 地址
 * @returns 验证结果，不合法返回 true
 */
export function isInvalidEmail(email: string): boolean {
	return !email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]{2,}$/)
}
