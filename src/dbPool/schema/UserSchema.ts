const UserSchema = {
	schema: {
		username: { type: String, unique: true, required: true },
		passwordHashHash: { type: String, required: true },
		salt: { type: String, required: true },
		token: { type: String, required: true },
		passwordHint: String,
		editDateTime: Number,
	},
	collectionName: 'user-auth',
}

export default UserSchema
