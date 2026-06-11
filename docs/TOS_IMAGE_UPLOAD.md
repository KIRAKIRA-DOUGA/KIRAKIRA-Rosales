# 火山引擎 TOS 图片上传

项目中的用户头像、视频封面和动态分组封面统一使用 TOS POST Policy 直传。

## 上传流程

1. 客户端请求对应的预上传接口，并通过 `contentType` 查询参数声明图片类型。
2. 后端返回上传 URL、对象名、公开 URL、POST 表单字段、上传方法、最大大小和已签名的 Content-Type。
3. 客户端创建 `FormData`，先追加所有表单字段，最后以字段名 `file` 追加图片文件。
4. 客户端向上传 URL 发起 `POST` 请求，不要手动设置请求头里的 multipart `Content-Type`。
5. 上传成功后，头像和动态分组封面调用确认接口；视频封面把公开 URL 放进上传视频接口的 `image` 字段。
6. 业务接口会通过 TOS `HEAD` 再次校验对象归属、文件大小和 Content-Type，校验通过后才写入数据库。

预上传接口：

- `GET /user/avatar/preUpload?contentType=image/webp`
- `GET /video/cover/preUpload?contentType=image/png`
- `GET /feed/getFeedGroupCoverUploadSignedUrl?contentType=image/avif`

以上接口均通过 Cookie 中的 `uuid` 和 `token` 鉴权。

允许的 Content-Type：`image/jpeg`、`image/jpg`、`image/png`、`image/webp`、`image/gif`、`image/avif`。`contentType` 为必填查询参数，出于安全原因不允许 SVG。

视频封面和动态分组封面返回结构在 `result` 中：

```ts
{
	signedUrl: string
	uploadUrl: string
	fileName: string
	url: string
	publicUrl: string
	fields: Record<string, string>
	uploadFields: Record<string, string>
	uploadMethod: 'POST'
	maxSize: number
	contentType: string
}
```

用户头像为了兼容既有接口，返回字段在响应顶层：

- `userAvatarUploadSignedUrl`
- `userAvatarUploadMethod`
- `userAvatarFilename`
- `userAvatarUrl`
- `userAvatarUploadFields`
- `userAvatarMaxSize`
- `userAvatarContentType`

客户端上传示例：

```js
const ticket = preUploadResponse.result ?? {
	uploadUrl: preUploadResponse.userAvatarUploadSignedUrl,
	uploadMethod: preUploadResponse.userAvatarUploadMethod,
	fileName: preUploadResponse.userAvatarFilename,
	publicUrl: preUploadResponse.userAvatarUrl,
	uploadFields: preUploadResponse.userAvatarUploadFields,
	maxSize: preUploadResponse.userAvatarMaxSize,
	contentType: preUploadResponse.userAvatarContentType,
}
const formData = new FormData()

for (const [key, value] of Object.entries(ticket.uploadFields)) {
	formData.append(key, value)
}
formData.append('file', imageFile)

const uploadResponse = await fetch(ticket.uploadUrl, {
	method: ticket.uploadMethod ?? 'POST',
	body: formData,
})

if (!uploadResponse.ok) {
	throw new Error('图片上传失败')
}

// 头像：POST /user/avatar/confirmUpload，body: { fileName: ticket.fileName }
// 动态分组封面：POST /feed/confirmFeedGroupCoverUpload，body: { feedGroupUuid, fileName: ticket.fileName }
// 视频封面：将 ticket.publicUrl 提交到上传视频接口的 image 字段。
```

## TOS 配置

`TOS_ENDPOINT` 必须是不带 `https://` 的 TOS 服务 Endpoint，并且与 `TOS_REGION` 属于同一区域。

```env
TOS_ACCESS_KEY="..."
TOS_SECRET_KEY="..."
TOS_ENDPOINT="tos-cn-beijing.volces.com"
TOS_REGION="cn-beijing"
TOS_IMAGE_BUCKET="kirakira-images"
TOS_IMAGE_PUBLIC_BASE_URL="https://images.example.com"
```

`TOS_IMAGE_PUBLIC_BASE_URL` 应指向允许公开读取图片的 Bucket 域名或 CDN 域名。若不配置，后端会生成 `https://<TOS_IMAGE_BUCKET>.<TOS_ENDPOINT>/<object-key>`。

## Bucket CORS

浏览器直传需要在 TOS Bucket 配置 CORS：

- Allowed Origins：生产前端域名和开发前端域名
- Allowed Methods：`POST`、`GET`、`HEAD`
- Allowed Headers：`*`
- Expose Headers：`ETag`、`x-tos-request-id`
- Max Age Seconds：`3600`

AK/SK 仅保存在后端。建议使用仅拥有目标图片 Bucket `PutObject` 和 `HeadObject/GetObject` 所需权限的 IAM 子用户，并为未被业务使用的上传对象配置定期清理策略。
