/**
 * 判断一个对象是否为空
 */
export const isEmptyObject = (obj: object) => typeof obj === 'object' && !(Array.isArray(obj)) && Object.keys(obj).length === 0

/**
 * 删除一个对象中值为 undefined 的元素，返回一个新对象
 * 底层原理是（浅）拷贝所有不为 undefined 的元素到新对象
 * @param obj 需要被清理的存在元素的值为 undefined 的对象
 * @returns 清理了值为 undefined 的元素的对象
 */
export const clearUndefinedItemInObject = <T extends Record<string, unknown> >(obj: T): Partial<T> => {
	const newObj: Partial<T> = {};
	(Object.keys(obj) as (keyof T)[]).forEach(key => {
		if (obj[key] !== undefined) {
			newObj[key] = obj[key]
		}
	})
	return newObj
}
