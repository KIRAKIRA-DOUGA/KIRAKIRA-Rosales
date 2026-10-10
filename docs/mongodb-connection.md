# MongoDB 连接配置

使用 `MONGODB_URI` 配置完整 MongoDB 连接字符串。支持单节点、副本集、分片集群入口和 DNS SRV；连接参数放入 URI。自定义证书仅使用 Base64 编码的 PEM 内容，启动时在内存中解码，不读取证书文件。

## 环境变量

| 变量 | 用途 |
| --- | --- |
| `MONGODB_URI` | 必填，包含数据库名称的完整连接字符串，支持 `mongodb://` 和 `mongodb+srv://` |
| `MONGODB_USERNAME` | URI 未包含认证资料时使用的用户名 |
| `MONGODB_PASSWORD` | URI 未包含认证资料时使用的原始密码，不进行百分号编码 |
| `MONGODB_TLS_CA_BASE64` | Base64 编码的完整 CA PEM 文本，可包含 CA 链，可单独使用 |
| `MONGODB_TLS_CERT_BASE64` | Base64 编码的完整客户端证书 PEM 文本 |
| `MONGODB_TLS_KEY_BASE64` | Base64 编码的完整、未加密客户端私钥 PEM 文本，与客户端证书同时提供 |

URI 自带的认证资料优先于独立凭据。只要 URI 包含认证资料，`MONGODB_USERNAME` 和 `MONGODB_PASSWORD` 就会一起被忽略，不混用两个来源，也不会在认证失败后回退到独立凭据。URI 中的空密码不会被独立密码补全。

例如 URI 为 `mongodb://uri-user:uri-pass@db.example.com/appdb?authSource=admin`，即使独立变量配置为 `env-user` 和 `env-pass`，实际使用的仍是 `uri-user` 和 `uri-pass`。

URI 未包含认证资料时，使用独立用户名密码；普通密码认证需同时提供两项。没有配置任何认证资料时，由驱动使用 URI 指定的认证机制或无认证连接。

URI 中的用户名密码需要按 MongoDB 规则进行百分号编码。使用独立用户名密码变量时直接传给驱动，支持密码中的 `@`、`:`、`/`、`?` 等字符，不需要手工编码。凭据放入 Secret，不写入 ConfigMap 或提交到仓库。

读偏好默认保持 `secondaryPreferred`；可在 URI 中通过 `readPreference` 覆盖。副本集可填写 `replicaSet`，并保持 `directConnection` 为默认的 `false`，以便驱动发现成员与新主节点。

## 集群内 SRV 无 TLS

```dotenv
MONGODB_URI="mongodb+srv://db-svc.demo-database.svc.cluster.local/appdb?replicaSet=db&authSource=admin&tls=false"
MONGODB_USERNAME="app-client"
MONGODB_PASSWORD="replace-with-secret"
```

Kubernetes Headless Service 的 TCP 端口命名为 `mongodb` 时，会生成 `_mongodb._tcp` SRV 记录。URI 中不填写端口或成员列表。此示例只适用于能解析并访问集群内部地址的客户端。

`mongodb+srv` 默认启用 TLS，无 TLS 必须显式写入 `tls=false`。关闭 TLS 时不配置 MongoDB 证书变量。

## 普通副本集无 TLS

```dotenv
MONGODB_URI="mongodb://db-0.example.com:27017,db-1.example.com:27017,db-2.example.com:27017/appdb?replicaSet=db&authSource=admin&tls=false"
MONGODB_USERNAME="app-client"
MONGODB_PASSWORD="replace-with-secret"
```

列表是驱动建立连接的初始入口；驱动连接成功后发现完整副本集。扩容通常不需要更新入口列表，移除成员时仍应保留至少一个有效入口供应用重启使用。

## TLS 与自签 CA

```dotenv
MONGODB_URI="mongodb+srv://db.example.com/appdb?authSource=admin&tls=true"
MONGODB_USERNAME="app-client"
MONGODB_PASSWORD="replace-with-secret"
MONGODB_TLS_CA_BASE64="<完整 CA PEM 文本的 Base64>"
```

由系统信任的 CA 签发证书时可省略自定义 CA。自签证书通过指定 CA 建立信任，同时验证服务端证书的有效期与主机名。仅进行服务端 TLS 认证时无需客户端证书。

需要双向 TLS 时增加：

```dotenv
MONGODB_TLS_CERT_BASE64="<完整客户端证书 PEM 文本的 Base64>"
MONGODB_TLS_KEY_BASE64="<完整未加密客户端私钥 PEM 文本的 Base64>"
```

Base64 编码的输入包含 PEM 的 BEGIN/END 行及换行。客户端证书和私钥必须成对提供；不支持私钥口令配置。通过 Secret 注入上述环境变量，更新 Secret 后滚动重启 Rosales。

Kubernetes Secret 使用 `stringData` 时，直接填写环境变量的值：证书项是 PEM 的一层 Base64，用户名密码是原始文本。若使用 `data`，所有环境变量值都需再进行一层 Base64 编码；Kubernetes 会解开外层编码，应用解开证书内容的编码。

## X.509 认证

```dotenv
MONGODB_URI="mongodb://db.example.com:27017/appdb?tls=true&authMechanism=MONGODB-X509&authSource=%24external"
MONGODB_TLS_CA_BASE64="<完整 CA PEM 文本的 Base64>"
MONGODB_TLS_CERT_BASE64="<完整客户端证书 PEM 文本的 Base64>"
MONGODB_TLS_KEY_BASE64="<完整未加密客户端私钥 PEM 文本的 Base64>"
```

数据库需预先配置相应证书身份及权限。此模式不设置密码，用户名通常可以由客户端证书推导。

## 旧配置迁移

`MONGODB_PROTOCOL`、`MONGODB_CLUSTER_HOST`、`MONGODB_NAME` 已删除。将协议、主机或 SRV 名称、数据库名称合并到 `MONGODB_URI`，并显式填写需要的 `authSource` 和连接选项。没有 URI 时启动报错，不再拼接旧变量。

三项 Base64 证书变量继续使用。提供 CA 或客户端证书时启用 TLS；CA 可以单独提供，无需同时提供客户端证书和私钥。

独立用户名密码变量现在使用原始值。如果旧部署曾手工对这些变量进行 URI 百分号编码，迁移时恢复为原始用户名密码；写在完整 URI 内的凭据仍需编码。

无需新增 `MONGODB_TLS_ENABLED`：在 URI 中使用驱动原生的 `tls=true` 或 `tls=false`。

以下配置会明确报错：

- 缺少 `MONGODB_URI`。
- URI 中包含 `tlsCAFile`、`tlsCertificateKeyFile`、`tlsCertificateKeyFilePassword` 或 `tlsCRLFile`，包括大小写或百分号编码的写法。
- 证书内容不是有效的 Base64。
- 客户端证书与私钥只提供其中一个。
- `tls=false` 同时配置 TLS 证书。
- URI 中 `tls` 和 `ssl` 相互冲突，或取值不是 `true`、`false`。

原实现会在 SRV 缺少 CA 时自动跳过证书校验；新实现取消此行为。使用有效公有证书的连接继续使用系统信任库。旧自签 TLS 部署需提供 CA；内网无 TLS 使用 `tls=false`。不会自动降级到明文连接。

连接失败时记录配置问题或通用连接失败信息，不记录原始 URI、密码、证书或驱动错误对象。

## 验证

```sh
npm ci
npm run test:mongodb
npm run build
```

部署后验证数据库认证、业务读写及副本集选主恢复。使用 TLS 的部署同时验证受信任 CA 能连接，错误 CA 不能连接。

参考：[MongoDB URI](https://www.mongodb.com/docs/manual/reference/connection-string-formats/)、[Node.js TLS 配置](https://www.mongodb.com/docs/drivers/node/current/security/tls/)、[Kubernetes SRV 记录](https://kubernetes.io/docs/concepts/services-networking/dns-pod-service/#srv-records)。
