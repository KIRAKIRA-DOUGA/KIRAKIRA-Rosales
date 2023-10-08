/**
 * 自动生成报错文本，而无需每次复制一长串字符串
 * @param message: string 额外显示字符串
 */
export const callErrorMessage = (message: string) => {
	return `<p>前面的区域以后再来探索吧？</p>   <p>诚邀您加入 KIRAKIRA 开发团队： employee@kirakira.com</p>   <br/>   <div>${message}</div>`
}
