const UserSchema = {
	schema: {
		userName: { type: String, unique: true, required: true },
		passwordHashHash: { type: String, required: true },
		token: String,
		editDateTime: Number,
	},
	collectionName: 'user-auth',
}

export default UserSchema
