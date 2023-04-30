
/**
 *
 * 在 js 中为一个复杂对象数组去重
 * BY: ChatGPT-4, 02
 *
 * @param array 被去重的数组
 * @returns 去重完成的数组
 */
export const removeDuplicateObjects = <T>(array: T[]): T[] => {
	if (array && array.length > 0) {
		const uniqueJSONStrings = new Set()

		return array.filter(item => {
			const jsonString: string = JSON.stringify(item)
			if (!uniqueJSONStrings.has(jsonString)) {
				uniqueJSONStrings.add(jsonString)
				return true
			}
			return false
		})
	} else {
		return [] as T[]
	}
}

type NestedArray<T> = T | NestedArray<T>[]

/**
 *
 * 去除对象数组中的重复对象，递归深度比较且提供更好的鲁棒性
 * // ? 去重时，对象的属性顺序发生变化时无法比较, {foo: 1, bar: 2} 和 {bar: 2, foo: 1} 算作不同的对象，性能更好
 * BY: ChatGPT-4, 02
 *
 * @param array 被去重的数组
 * @returns 去重完成的数组
 */
export const removeDuplicateObjectsInDeepArrayStrong = <T>(inputArray: NestedArray<T>): T[] => {
	try {
		// 将输入数组扁平化为一维数组
		const flattenArray = <T>(arr: NestedArray<T>): T[] => {
			if (!Array.isArray(arr)) {
				return [arr]
			}

			return arr.reduce<T[]>((flat, toFlatten) => {
				return flat.concat(flattenArray(toFlatten))
			}, [])
		}

		// 检查两个对象是否相等
		const isEqual = (obj1: unknown, obj2: unknown): boolean => {
			return JSON.stringify(obj1) === JSON.stringify(obj2)
		}

		// 去除重复的对象
		const removeDuplicates = <T>(arr: T[]): T[] => {
			return arr.filter((value, index, self) => {
				return self.findIndex(item => isEqual(item, value)) === index
			})
		}

		if (inputArray && Array.isArray(inputArray) && inputArray.length > 0) {
			const flattenedArray = flattenArray<T>(inputArray)
			return removeDuplicates<T>(flattenedArray)
		} else {
			console.error('something error in function removeDuplicateObjectsStrongInDeepArray, required data "inputArray" is empty')
			return []
		}
	} catch (error) {
		console.error('something error in function removeDuplicateObjectsStrongInDeepArray')
		return []
	}
}



/**
 *
 * 去除对象数组中的重复对象，递归深度比较且提供更好的鲁棒性
 * // > 去重时，对象的属性顺序发生变化时仍然可以比较，{foo: 1, bar: 2} 和 {bar: 2, foo: 1} 算作相同的对象，性能降低
 * BY: ChatGPT-4, 02
 *
 * @param array 被去重的数组
 * @returns 去重完成的数组
 */
export const removeDuplicateObjectsInDeepArrayAndDeepObjectStrong = <T>(inputArray: NestedArray<T>): T[] => {
	try {
		// 将输入数组扁平化为一维数组
		const flattenArray = <T>(arr: NestedArray<T>): T[] => {
			if (!Array.isArray(arr)) {
				return [arr]
			}

			return arr.reduce<T[]>((flat, toFlatten) => {
				return flat.concat(flattenArray(toFlatten))
			}, [])
		}

		// 对象比较函数
		const objectsAreEqual = (a: unknown, b: unknown): boolean => {
			if (a && b) {
				const keysA = Object.keys(a).sort()
				const keysB = Object.keys(b).sort()
			
				if (keysA.length !== keysB.length) {
					return false
				}
			
				for (let i = 0; i < keysA.length; i++) {
					if (keysA[i] !== keysB[i] || a[keysA[i]] !== b[keysB[i]]) {
						return false
					}
				}
			
				return true
			} else {
				console.error('something error in function objectsAreEqual, required data "a" or "b" is empty')
				return false
			}
		}

		// 去除重复的对象
		const removeDuplicates = <T>(arr: T[]): T[] => {
			return arr.filter((value, index, self) => {
				return self.findIndex(item => objectsAreEqual(item, value)) === index
			})
		}

		if (inputArray && Array.isArray(inputArray) && inputArray.length > 0) {
			const flattenedArray = flattenArray<T>(inputArray)
			return removeDuplicates<T>(flattenedArray)
		} else {
			console.error('something error in function removeDuplicateObjectsStrongInDeepArray, required data "inputArray" is empty')
			return []
		}
	} catch (error) {
		console.error('something error in function removeDuplicateObjectsStrongInDeepArray')
		return []
	}
}
