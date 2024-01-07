export const isEmptyObject = (obj: object) => typeof obj === 'object' && !(Array.isArray(obj)) && Object.keys(obj).length === 0
