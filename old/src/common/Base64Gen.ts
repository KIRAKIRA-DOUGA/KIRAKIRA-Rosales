import { Base64 } from 'js-base64'

export const strToBase64 = (str: string): string => {
	return Base64.encode(str)
}

export const base64ToStr = (base64: string): string => {
	return Base64.decode(base64)
}
