# KIRAKIRA-Rosales 开发文档

## 一、前言

KIRAKIRA-Rosales（下文简称：“Rosales” 或 “后端”）是一个基于 Koa 框架的、RESTful 的后端 API.

本文档主要内容如下：
1. 如何针对现有代码进行二次开发。
2. 与后端相关的基础设施的知识，例如数据库、搜索引擎和集群部署等。

在编写本文档时，我假设您已经具有一定的编程知识，包括：掌握 [JavaScript](https://developer.mozilla.org/docs/Web/JavaScript) & [TypeScript](https://www.typescriptlang.org/) 的基础语法、理解 [HTTP](https://developer.mozilla.org/docs/Web/HTTP/Overview) 工作原理，并且了解 [数据库](https://zh.wikipedia.org/wiki/%E6%95%B0%E6%8D%AE%E5%BA%93) 和 [NoSQL](https://zh.wikipedia.org/wiki/NoSQL) 概念。



### 技术栈
在开始前，了解 KIRAKIRA-Rosales 及其相关基础设施的技术架构是非常有必要的。

KIRAKIRA-Rosales 由 TypeScript 编写。因为 TypeScript 的类型检查能够很好地提高代码质量。
具体来说，后端使用了 Koa.js 框架，Koa.js 是一个 Node.js 框架，提供了更好的异步和 HTTP 支持。
后端的生产环境部署在 AWS 的 EKS 集群中。
后端依赖于一个 MongoDB 数据库集群和一个 Elasticsearch 搜索引擎集群，它们同样部署在 AWS EKS 中。

对于存储，MongoDB 和 Elasticsearch 产生的数据被存储在挂载在 AWS EKS 上的 AWS EBS(Elastic Block Store) 块存储中，图片和视频文件则由 Cloudflare 的 R2、Images 和 Stream 存储。

[![](https://img.shields.io/badge/-JavaScript-F7DF1E?style=flat-square&logo=javascript&logoColor=black)](https://tc39.es)
[![](https://img.shields.io/badge/-TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![](https://img.shields.io/badge/-Node.js-417e38?style=flat-square&logo=Node.js&logoColor=white)](https://nodejs.org)
[![](https://img.shields.io/badge/-Koa-EEEEEE?style=flat-square&logo=Koa&logoColor=black)](https://koajs.com)
[![](https://img.shields.io/badge/-MongoDB-EEEEEE?style=flat-square&logo=MongoDB&logoColor=00ed64)](https://www.mongodb.com)
[![](https://img.shields.io/badge/-Elasticsearch-07a0d7?style=flat-square&logo=Elasticsearch&logoColor=333333)](https://www.elastic.co/elasticsearch)
[![](https://img.shields.io/badge/-Kubernetes-0075e4?style=flat-square&logo=Kubernetes&logoColor=white)](https://kubernetes.io/)
[![](https://img.shields.io/badge/-Cloudflare-f6821f?style=flat-square&logo=Cloudflare&logoColor=white)](https://www.cloudflare.com)

## 二、安装和启动
### 1. 克隆存储库。
确保你安装了 [Git](https://git-scm.com/)，并且有权访问本存储库。

使用以下命令克隆本存储库
``` shell
# 请将 <some-dir> 替换为你计算机上的一个目录。
cd <some-dir>

# 克隆
git clone https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales.git
```
或者，你也可以使用具有图形化界面的 GitHub Desktop 或其他 Git 兼容工具来完成这一步骤。

### 2. 设置环境变量
> [!IMPORTANT]
> 下方的示例代码中并不包含全部环境变量，在实际使用时必须为每一个环境变量赋值。
> 全部环境变量及其作用请参阅：[.env.template](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/blob/develop/.env.template)。
``` powershell
# 对于不同操作系统，设置环境变量的方式也不同。以下为 Windows PowerShell 的示例
$env:SERVER_PORT="30000"
$env:SERVER_ENV="dev"
$env:SERVER_ROOT_URL="kirakira.moe"
...
```
在设置环境变量时有任何问题，请在 [议题](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 或 [讨论区](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/discussions) 中查找解答或提问。

### 3. 启动后端开发服务器
> [!IMPORTANT]
> 默认情况下，以开发模式启动服务会将代码打包至项目根目录的 `.kirakira` 目录内。
```sh
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 或者，您可以启动开发服务器，并启用自动重载
npm run dev-hot
```
如果您需要修改开发服务器的默认打包位置，需要修改 package.json 文件里的 `scripts.start` 和 `scripts.copy-assets-dev` 配置。您需要将这些命令中所有 `.kirakira` 替换为您的自定义目录。


### 4. 检查
成功执行以上命令后，您应该会获得一个监听 30000（或您在环境变量中自定义的）端口的 KIRAKIRA-Rosales 开发服务器。🎉
在您的浏览器中输入 https://localhost:30000 即可测试运行状态。如果已经正常启动完毕，应当可以看到 “Hello World” 或类似字样。

在此基础上，您可以编写、贡献代码，参与 KIRAKIRA 项目开发。

## 三、开发
本章将会循序渐进地、介绍如何对 KIRAKIRA-Rosales 进行二次开发，改进功能。
### 熟悉目录结构
以下为项目目录结构简介
```
◌
├ .github - GitHub 相关配置
│  └ workflows - 存放 Github 工作流
├ .vscode - VSCode 相关配置
├ docs - 存放说明文档（本文档就存放于该目录下）
├ src - 存放源代码
│  ├ assets - 存放静态资源，打包时该文件夹下的文件会原封不动复制到打包目标文件夹下
│  ├ cloudflare - 存放了 Cloudflare 相关代码
│  ├ common - 存放了通用函数
│  ├ controller - controller 层，处理请求载荷/响应，鉴权。也存放了接口数据类型定义文件
│  ├ dbPool - 存放了 MongoDB 相关的共通代码
│     └ schema - 存放了 MongoDB Schema
│  ├ elasticsearchPool - 存放了 Elasticsearch 相关的共通代码
│  ├ locales - 存放了国际化文本
│  ├ middleware - 存放了服务器中间件相关代码
│  ├ route - 存放了路由代码
│  ├ service - service 层，用于处理业务逻辑
│  ├ ssl - SSL 相关配置
│  ├ type - 存放了共通的类型定义代码
│  └ app.ts - 该文件为程序入口
├ .dockerignore - 该文件用于配置执行 docker build 命令时忽略的文件
├ .editorconfig - 该文件定义了编码风格
├ .env.template - 该文件是完整环境变量模板及说明文档
├ .gitattributes - 该文件定义了 Git 相关配置
├ .gitignore - 该文件定义了 Git 忽略的文件
├ ℩ɘvoↄ.svg - 该文件为封面图（图片内容是前端 cover.svg 文件的镜像，因此文件名反写。只是为了好玩。）
├ crowdin.yml - 该文件定义了在线国际化翻译工具 Crowdin 的相关配置
├ Dockerfile - 该文件描述了构建 Docker 容器镜像的过程
├ eslint.config.js - 该文件定义了 ESLint 配置
├ LICENSE - 许可证
├ package-lock.json - 该文件固定了 npm install 是安装的依赖包的版本
├ package.json - 该文件定义了元数据、脚本和依赖包列表
├ pr_body.txt - 该文件定义了 Crowdin 相关 GitHub PR 模板
├ README.md - 该文件为自述文件
└ tsconfig.json - 该文件为 TypeScript 配置文件

```
### 从 Hello World 开始
第一个程序总是从 Hello World 开始，KIRAKIRA-Rosales 也不例外。

在 `/src/controller` 目录中有一个名为 `HelloWorld.ts` 的特殊文件。
该文件中有以下代码：
``` TypeScript
import { koaCtx, koaNext } from '../type/koaTypes.js'

export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	const something = ctx.query.something
	ctx.body = something === 'Beautiful' ? `Hello Beautiful World` : 'Hello World'
	await next()
}
```
让我们一行一行的分析这段代码：
首先，第一行
``` TypeScript
import { koaCtx, koaNext } from '../type/koaTypes.js'
```
它从 koaTypes.js（koaTypes.ts）文件中导入了两个类型，koaCtx 和 koaNext
```TypeScript
export type koaCtx = Koa.ParameterizedContext<Koa.DefaultState, Koa.DefaultContext, unknown> & {elasticsearchClient?: Client}
export type koaNext = Koa.Next
```
这两个类型扩展自 Koa 提供的类型，koaCtx 是网络请求的上下文，koaNext 是一个可以被调用的异步函数。
koaCtx 类型为一个对象。该对象内应当包含请求头、请求体、响应头、响应体以及中间件为其添加的其他参数。
koaNext 类型为一个异步函数。该函数用于执行下一中间件，如果是最后一个，则完成请求并将响应返回给客户端。
在通过 koa-router 编写路由时，会自动为传入的 Controller 函数添加上述两个变量。

目前，您不需要完全了解这两个类型，让我们接着往下看。
``` TypeScript
export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {...}
```
在这一行，我们导出了一个名为 `helloWorld` 的异步箭头函数，该函数接收两个参数：`ctx: koaCtx` 和 `next: koaNext`, 并返回一个空的 Promise.
ctx 是 context 的缩写，代表上下文。

接下来的两行代码：
``` TypeScript
const something = ctx.query.something
ctx.body = something === 'Beautiful' ? `Hello Beautiful World` : 'Hello World'
```
这一部分用来存取网络请求上下文中的标头或 body（正文）。

首先，从 `ctx` 上下文对象中匹配网络请求中名为 `something` 的“查询”参数，并赋值给 `something` 常量。
紧接着是一个三元表达式，您可以将这个运算部分理解为“业务逻辑代码”。如果 `something` 的值是字符串 "Beautiful"，则将 "Hello Beautiful World" 赋值到 `ctx` 请求上下文对象的响应体中，否则将 "Hello World" 赋值到 `ctx` 请求上下文对象的响应体中。

在后端开发模式中，我们通常将整理请求载荷、整理请求响应的代码逻辑放置于 Controller 层，而将复杂的业务逻辑放置于 Service 层。

接下来，看最后一行代码：
``` TypeScript
await next()
```
这一行代码的作用是等待下一个中间件执行完成，如果没有下一个，则完成请求并将响应返回给客户端。

以上便是 KIRAKIRA-Rosales 通过 Koa 响应一个网络请求的最简单的流程。
打开您的浏览器，在地址栏输入`https://localhost:30000?something=Beautiful` 后回车，您将会在页面中看到 `Hello Beautiful World` 字样。🎉


### 路由
与前端的路由类似，后端也存在“路由”的概念。
前端通过路由匹配到正确的组件并渲染，而后端通过路由将网络请求发送（映射）到正确的 Controller 层并执行。
我们在文件 `src\route\router.ts`  中集中编写、管理从 URL 到 Controller 函数的映射。

一个典型的接收 GET 请求的接口路由看起来像：
``` typescript
//      请求的 URL
//          ↓
router.get(URL, controller)
//                   ↑
//      这个 URL 对应的 Controller 函数
```
如果是接收 POST 请求的接口，则需要将 `router.get` 改为 `router.post`
``` typescript
//      请求的 URL
//          ↓
router.post(URL, controller)
//                   ↑
//      这个 URL 对应的 Controller 函数
```
以此类推，我们可以编写其他类型的请求，例如 PUT 请求或 DELETE 请求
``` typescript
router.put(URL, controller)
router.delete(URL, controller)
...
```
> [!IMPORTANT]
> 传入的 controller 应为 Controller 函数本身，而非函数的调用（结果）。
> 触发一个请求时，koa-router 会自动将 (ctx: koaCtx, next: koaNext) 传入到 Controller 函数中。
``` typescript
router.get(URL, controller) // 正确用法

router.get(URL, controller()) // ❌ 错误用法
```

### 请求参数（载荷）和返回结果
在发送请求时，有时我们需要携带数据（被称为“请求参数”或“请求载荷”）给后端。当后端的程序执行结束后，应当将执行结果返回给请求者。
例如，用户登录时需要将用户输入的邮箱和密码发送给后端执行验证，如果验证通过，则将用户 Token 返回给客户端。

在传递数据时，可以选择“显式”的传递，也可以“隐式”的传递。

#### “显式”传递请求参数（载荷）
HTTP 请求的 URL 中可以传递数据。
使用 URL 传递数据时，本项目倾向于使用 [Parameters (参数)](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_URL#parameters) 而不是 [Path (路径)](https://developer.mozilla.org/en-US/docs/Learn/Common_questions/Web_mechanics/What_is_a_URL#path_to_resource)，因为 Path 需要动态路由匹配。
``` shell
# 使用 curl 命令向一个带有 Parameters 的 URL 发送 GET 请求
curl https://localhost:30000?something=Beautiful
```

> [!IMPORTANT]
> URL 不宜过长，传递的数据长度有限，一般用于请求某些数据时传递简单的查询参数。

在后端 Controller 函数中，你可以从 ctx 对象中获取 something 所对应的值
``` typescript
const something = ctx.query.something
```
> [!IMPORTANT]
> something 的类型为 string | string[], 因为 URL Parameters 会将重名的多个参数合并为一个数组。
> 在继续之前，你需要判断是否是数组（推荐）或根据您的需求将其断言，然后执行进一步的数据校验。


除了 URL 的 Parameters 之外，还可以在 HTTP 请求的请求体中传递数据。
> [!IMPORTANT]
> 某些 HTTP 协议的实现不支持某些请求方法（例如 GET 请求）包含请求体，详情请参考 [MDN 上的 HTTP 参考文档](https://developer.mozilla.org/en-US/docs/Web/HTTP/Methods)
> 请求体中可以携带较多数据，但也并非无限制，上限取决于不同的 HTTP 实现。

``` shell
# 使用 curl 命令向一个 URL 发送带有请求体的 POST 请求
curl -d "param1=value1&param2=value2" -X POST https://localhost:30000/xxxxx
```
在后端 Controller 函数中，你可以从 ctx 对象中获取请求体数据
``` typescript
const data = ctx.request.body as { param1: string; param2: string }
```
> [!IMPORTANT]
> 在继续之前，您需要将其断言为与发送请求时传递的数据类型一致的类型，然后执行进一步的数据校验。

#### “隐式”传递数据

您可以使用 [HTTP Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies) “隐式”的传递数据。每次发送请求时，Cookie 也会被发送给后端。
KIRAKIRA 项目大量使用 Cookie 来存储用户 Token, 用户设置和用户样式等数据。在设置及发送 Cookie 时需要掌握其限制及技巧，本文档内不详细介绍，请自行参阅 [MDN HTTP Cookie](https://developer.mozilla.org/en-US/docs/Web/HTTP/Cookies) 文档，但有几点有必要说明：
* Cookie 可以被限制仅限 HTTPS
* HttpOnly 的 Cookie 只能通过请求的 set-cookie 设置/删除，不能通过 JavaScript 访问
* 目前很多浏览器仅支持第一方（同站点） Cookie，即 `SameSite=Strict`。
* fetch 函数使用 { credentials: "include" } 选项可以允许在发送跨源请求时包含 Cookie

在后端 Controller 函数中，你可以从 ctx 对象中获取 Cookie 数据
``` typescript
ctx.cookies.get(cookieKey) // 获取名字为 cookieKey 的 Cookie 对应的值。
```
> [!IMPORTANT]
> 在继续之前，不要忘了执行进一步的数据校验。

#### 从服务端返回结果到客户端
在后端逻辑执行完成之后，我们需要将结果返回给客户端。

将结果赋值给 ctx 对象的 body 属性，然后执行下一步中间件，如果是最后一个中间件，则将 body 中的值返回给客户端。
``` typescript
ctx.body = results
await next() // 假设已经是最后一个中间件
```

### 访问 MongoDB 数据库和 Elasticsearch 搜索引擎
用户产生的数据通常会存储到 MongoDB 中，但需要被搜索的数据会存储到 Elasticsearch 搜索引擎中。
对数据库和搜索引擎的增删改查是后端代码的主要功能。

#### MongoDB
后端使用 Mongoose 连接 MongoDB 数据库。

在程序初始化时，会立即执行 `src\dbPool\DbClusterPool.ts` 文件中的 `connectMongoDBCluster` 函数，该函数首先会读取环境变量中的连接字符串和数据库账号密码等数据，然后创建数据库连接池。创建的连接池是在 Mongoose 内部维护的，Mongoose 暴露一个 `mongoose` 实例用来执行数据库增删改查操作，用户无需关心连接池的具体实现及负载均衡问题。

> [!IMPORTANT]
> 对于副本集，写操作总是向主分片提交，随后再由主分片同步至副本分片。
> 而读操作偏好则由用户设置，本程序默认的数据库读偏好为优先从副本中读取，但在某些情况下会覆盖这个设置，比如说使用事务时会优先从主读取。

使用 Mongoose 暴露的 `mongoose` 实例，用户可以直接执行增删改查操作，本项目在 `src\dbPool\DbClusterPool.ts` 文件中也封装了带有类型约束的便捷函数来执行这些操作。

以下是一个简单实例
``` typescript
import mongoose, { InferSchemaType } from 'mongoose'

/**
 * 用户数据
 */
class UserSchemaFactory {
	schema = {
		uid: { type: Number, unique: true, required: true }, // 用户的 UID
		username: { type: String }, // 用户名
		editDateTime: { type: Number, required: true }, // 系统专用字段-最后编辑时间
	}
	collectionName = 'user' // MongoDB 集合名
	schemaInstance = new Schema(this.schema) // Mongoose Schema 实例
}

const UserSchema =  new UserSchemaFactory() // 实例化
const { collectionName, schemaInstance } = UserSchema // 解构出集合名和集合 Schema 实例

type User = InferSchemaType<typeof schemaInstance> // 使用 InferSchemaType 推到出用户数据的 TypeScript 类型

const user: User = { // 构建用户数据
	uid: 1,
	username: 'foo',
	editDateTime: new Date().getTime(),
}

try {
	await insertData2MongoDB<User>(user, schemaInstance, collectionName) // 插入数据
} catch(error) {
	logging('ERROR', "插入数据出错：", error)
}


const userWhere: QueryType<User> = { uid: 1 } // 查询 UID 为 1 的用户数据
const userSelect: SelectType<User> = { username: 1 } // 只查询 username 字段
try {
	const userResult = await selectDataFromMongoDB<User>(userWhere, userSelect, schemaInstance, collectionName) // 查询数据
	console.log('Result is: ', useResult)
} catch (error) {
	logging('ERROR', "查询数据出错：", error)
}
```
> [!IMPORTANT]
> UserSchemaFactory 和 UserSchema 通常是单独存放在一个文件中，然后将 UserSchema 导出并在其他文件中使用。


#### Elasticsearch
Elasticsearch 是一个搜索引擎，部署在 Elasticsearch 集群需要通过 HTTP 请求来操作。
官方提供了 SDK 来方便 Node.js 程序操作 Elasticsearch。
无需手动构建 HTTP 请求。

同样的，程序在初始化时会执行 `src\elasticsearchPool\elasticsearchClusterPool.ts` 文件中的 `connectElasticSearchCluster` 函数，该函数会读取环境变量，然后创建与 Elasticsearch 集群的连接。在创建连接后，连接客户端实例会被添加至 Koa 的请求上下文 ctx 中。在 Controller 中，我们可以通过 `ctx.elasticsearchClient` 获取客户端连接，然后执行”增删改查“操作，本项目在 `src\elasticsearchPool\elasticsearchClusterPool.ts` 文件中也封装了带有类型约束的便捷函数来执行这些操作。

以下是一个简单的示例。
``` typescript
import { EsSchema2TsType } from '../elasticsearchPool/ElasticsearchClusterPoolTypes.js'


const esClient = ctx.elasticsearchClient // 假设已经正确创建了连接

/**
 * 视频数据
 */
const VideoDocument = {
	schema: {
		title: { type: String, required: true as const }, // 视频标题
		kvid: { type: Number, required: true as const }, // KVID 视频 ID
	},
	indexName: 'search-kirakira-video-elasticsearch', // Elasticsearch 索引名
}

const { indexName: esIndexName, schema: videoEsSchema } = VideoDocument // 解构

const videoEsData: EsSchema2TsType<typeof videoEsSchema> = { // 构造视频数据
	title: "foo bar baz",
	kvid: 1,
}
try {
	const refreshFlag = true // 是否立即刷新索引（刷新后该数据方能搜索，如果刷新过于频繁，可能会影响性能）
	await insertData2ElasticsearchCluster(esClient, esIndexName, videoEsSchema, videoEsData, refreshFlag) // 插入数据
} catch (error) {
	logging("ERROR", "索引数据出错："，error)
}

const esQuery = { // 构造搜索条件
	query_string: {
		query: 'foo',
	},
}

try {
	const esSearchResult = await searchDataFromElasticsearchCluster(esClient, esIndexName, videoEsSchema, esQuery) // 开始搜索数据
	console.log('Result is: ', esSearchResult)
} catch (error) {
	logging("ERROR", "搜索数据出错："，error)
}
```

## 四、API 文档
请参考路由文件 `src\route\router.ts`

## 五、构建与部署
您可以在本地测试运行本项目，或者简单的将其构建并部署在一个服务器实例中。
您可也可将其打包为容器镜像，然后在 Docker 或其他 Docker 兼容程序上运行。

#### 构建，然后运行
1.设置环境变量

设置方法与 [上文描述](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop?tab=readme-ov-file#%E5%BC%80%E5%8F%91) 相同。

2.构建并预览
> [!IMPORTANT]
> 默认会将代码打包至 `./dist` 路径，你可以在 tsconfig.json 中修改打包目标路径。  
> 请注意，其他依赖于默认打包路径的业务也要更改配置，因此并不建议修改打包路径。

```sh
# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 运行
node ./dist/app.js
```

#### 打包为容器镜像（最佳实践）
部署 KIRAKIRA-Rosales 的最佳实践是将其运行在 K8s 集群中。您正在使用的 KIRAKIRA-Rosales 服务便是如此。

首先确保你安装并运行了 Docker，执行以下命令，您应该可以看到 Docker 的版本号
``` shell
docker --version
```
使用 Docker 打包多平台容器镜像（以下示例为 AMD 架构的 Windows 平台，MacOS 与 Linux 平台可能不同）

``` shell
# 创建并启用新的 builder 实例（如果以前创建过，则跳过这步）
docker buildx create --name mybuilder --use

# 启动并检查 builder 实例
docker buildx inspect --bootstrap

# 构建并推送多平台镜像到 Docker Hub
# 请确保安装 docekr 并且 docker 已经登录/连接了远程容器镜像存储库，这里使用 cfdxkk01/kirakira
# 请替换 <tag> 为正确的版本号，例如：3.21.1
#                                                                              注意这里有个点「.」，复制时别落下
#                                                                                             ↓
docker buildx build --platform linux/amd64,linux/arm64 -t <username>/<repo-name>:<tag> --push .
```
然后就可以部署该容器镜像到 K8s 或其他容器/集群环境中。

> [!IMPORTANT]
> 生产环境及容器镜像环境也不要忘记配置环境变量！

## 六、开源与安全
* 本项目遵守 BSD-3-Clause license 开源协议。
* 一般问题请创建 Issue，涉及隐私或报告安全问题请前往 [Discord 频道](https://discord.gg/maveEWn6VP)。
