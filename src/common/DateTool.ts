/**
 * 判断一个时间戳是否是“今天” （支持时区偏移）
 * @param timestamp - 毫秒级时间戳
 * @returns 如果时间戳是“今天”则返回 true，否则返回 false
 */
export function isToday(timestamp: number): boolean {
	const todayStart = new Date();
	todayStart.setHours(0, 0, 0, 0);

	const tomorrowStart = new Date(todayStart);
	tomorrowStart.setDate(todayStart.getDate() + 1);

	return timestamp >= todayStart.getTime() && timestamp < tomorrowStart.getTime();
}