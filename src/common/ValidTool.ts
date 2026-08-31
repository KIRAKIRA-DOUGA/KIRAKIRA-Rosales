/**
 * 验证名字是否符合规范
 * @param fieldValue 验证内容
 * @returns 是否符合规范，符合规范返回true，否则返回false
 */
export const validateNameField = (fieldValue) => {
	const value = String(fieldValue ?? '')
	const pattern = /^(?![\s-_])(?!.*[\s-_]{2})[a-zA-Z0-9-\uAC00-\uD7AF\u3040-\u30FF\u4E00-\u9FAF\u00C0-\u1EF9_\s]+(?<![\s-_])$/
	const trimmedValue = value.trim()
	if (
		trimmedValue.length === 0 ||
		trimmedValue.length > 20 ||
		value !== trimmedValue ||
		trimmedValue.includes('  ')
	) {
		return false
	}
	return pattern.test(trimmedValue)
}

/**
 * 限制页面数量最大大小
 * @param pageSize 页面大小
 * @returns 限制后的页面大小
 */
export const limitPageSize = (pageSize: string): number => {
	const MAX_PAGE_SIZE = 100
	const MIN_PAGE_SIZE = 1

	const raw = pageSize as any
	let n = Number(raw)
	if (!Number.isFinite(n) || Number.isNaN(n)) {
		n = Number.parseInt(String(raw), 10)
	}
	if (!Number.isFinite(n) || Number.isNaN(n)) {
		n = Number.MAX_SAFE_INTEGER
	}
	n = Math.trunc(n)
	n = Math.min(n, MAX_PAGE_SIZE)
	n = Math.max(n, MIN_PAGE_SIZE)
	return n
}

/**
 * 安全地将任意输入解析为整数
 * - 如果提供了 fallback 并且解析失败，则返回 fallback
 * - 如果未提供 fallback 且解析失败，则返回 NaN（以保持原有代码中使用 `||` 或 `??` 的语义）
 * - 对数字类型会使用 Math.trunc 保证整数
 * - 支持以字符串开头的整数解析（会匹配前缀整数部分）
 *
 * @param raw 任意输入
 * @param fallback 可选回退值
 */
export const parseInteger = (raw: unknown, fallback?: number): number => {
	if (raw === null || raw === undefined) {
		return fallback === undefined ? NaN : fallback
	}

	if (typeof raw === 'number') {
		if (!Number.isFinite(raw) || Number.isNaN(raw)) return fallback === undefined ? NaN : fallback
		return Math.trunc(raw)
	}

	const s = String(raw).trim()
	if (s.length === 0) return fallback === undefined ? NaN : fallback

	// 匹配可能带符号的整数字串前缀（例如 "123abc" -> 123, "  -12 " -> -12）
	const m = s.match(/^([+-]?\d+)/)
	if (!m) return fallback === undefined ? NaN : fallback

	const n = Number(m[1])
	if (!Number.isFinite(n) || Number.isNaN(n)) return fallback === undefined ? NaN : fallback
	return Math.trunc(n)
}

/**
 * 校验分页页码是否合法（页码从 1 开始，小于 1 不合法）
 * @param page 页码
 * @returns 合法返回 true，否则 false
 */
export const isValidPageNumber = (page: number): boolean => {
	return Number.isFinite(page) && !Number.isNaN(page) && page >= 1
}
