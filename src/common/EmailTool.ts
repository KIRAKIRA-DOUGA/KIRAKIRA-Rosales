export function isInvalidEmail(email: string): boolean {
	return !email.match(/^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]{2,}$/)
}
