/**
 * 判断一个时间戳是否是“今天”
 * @param timestamp - 毫秒级时间戳
 * @returns 如果时间戳是“今天”则返回 true，否则返回 false
 */
export function isToday(timestamp: number): boolean {
	const todayStart = new Date()
	todayStart.setHours(0, 0, 0, 0)

	const tomorrowStart = new Date(todayStart)
	tomorrowStart.setDate(todayStart.getDate() + 1)

	return timestamp >= todayStart.getTime() && timestamp < tomorrowStart.getTime()
}

/**
 * 获取“今天”的开始和结束时间戳（毫秒级时间戳）
 * @returns 包含今天开始和结束时间戳的对象
 */
export function getTodayBeginTimestampAndEndTimestamp(): { todayBeginTimestamp: number; todayEndTimestamp: number } {
	const todayStart = new Date()
	todayStart.setHours(0, 0, 0, 0)

	const tomorrowStart = new Date(todayStart)
	tomorrowStart.setDate(todayStart.getDate() + 1)

	return {
		todayBeginTimestamp: todayStart.getTime(),
		todayEndTimestamp: tomorrowStart.getTime(),
	}
}

/**
 * 获取今天的日期字符串（格式：YYYY-MM-DD）
 * @param date 用于计算本地日期的时间，默认取当前时间
 * @returns 今天的日期字符串
 */
export const getTodayDateString = (date = new Date()): string => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

