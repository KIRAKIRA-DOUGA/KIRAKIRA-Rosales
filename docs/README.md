# KIRAKIRA-Rosales 开发文档

## 一、前言

KIRAKIRA-Rosales（下文简称：“Rosales” 或 “后端”）是一个基于 Koa 框架的、RESTful 的后端 API.

本文档主要内容如下：
1. 如何针对现有代码进行二次开发。
2. 与后端相关的基础设施的知识，例如数据库、搜索引擎和集群部署等。

在正式开始向您介绍前，我假设您已经具有一定的编程知识，包括：掌握 [JavaScript](https://developer.mozilla.org/docs/Web/JavaScript) & [TypeScript](https://www.typescriptlang.org/) 的基础语法、理解 [HTTP](https://developer.mozilla.org/docs/Web/HTTP/Overview) 工作原理，并且了解 [数据库](https://zh.wikipedia.org/wiki/%E6%95%B0%E6%8D%AE%E5%BA%93) 和 [NoSQL](https://zh.wikipedia.org/wiki/NoSQL) 概念。



### 技术栈
在开始前，了解 KIRAKIRA-Rosales 及其相关基础设施的技术架构是非常有必要的。

KIRAKIRA-Rosales 由 Koa 编写。Koa 是一种 Node.js 框架，提供了更好的异步和 HTTP 支持。  
具体来说，后端使用的语言是 TypeScript, TypeScript 的类型检查能够很好地提高代码质量。  
后端的生产环境部署在 AWS 的 EKS 集群中。  
后端依赖于一个 MongoDB 数据库集群和一个 Elasticsearch 搜索引擎集群，它们同样部署在 AWS EKS 中。

对于存储，MongoDB 和 Elasticsearch 产生的数据被存储在 AWS EBS(Elastic Block Store) 块存储中，图片和视频文件则由 Cloudflare 的 R2、Images 和 Stream 存储。

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
在开始前，确保你安装了 [Git](https://git-scm.com/)，并且有权访问本存储库。

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
> 下方的示例代码中并没有包含全部环境变量。  
> 全部环境变量及其作用请参阅：[.env.powershell.temp](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/blob/develop/.env.powershell.temp)，该文件中列出的大多数环境变量都是必需的。  
```powershell
# 对于不同操作系统，设置环境变量的方式也不同。以下为 Windows PowerShell 的示例
$env:SERVER_PORT="9999"
$env:SERVER_ENV="dev"
$env:SERVER_ROOT_URL="kirakira.moe"
...
```
在设置环境变量时有任何问题，请在 [议题](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 或 [讨论区](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/discussions) 中查找解答或提问。

### 3. 启动后端开发服务器
> [!IMPORTANT]    
> 以开发模式启动服务会将代码打包至项目根目录的 `.kirakira` 目录内。  
```sh
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 或者,您可以以热重载方式启动开发服务器
npm run dev-hot
```
如果您需要修改开发服务器的默认打包位置，需要修改 package.json 文件里 `scripts.start` 的值。  
`scripts.start` 的值是一句启动命令，您需要将该命令中所有 `.kirakira` 替换为您的自定义目录。  
例如 `tsc --noEmitOnError --sourceMap --outDir .foo && node ./.foo/app.js` 将会导致开发服务器的打包目录改为 `.foo`

### 4. 检查
成功执行以上命令后，您应该会获得一个监听 9999（或您在环境变量中自定义的）端口的 KIRAKIRA-Rosales 开发服务器。🎉  
在您的浏览器中输入 https://localhost:9999 即可测试运行状态。如果已经正常启动完毕，应当可以看到 “Hello World” 或类似字样。

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
├ old - 存放不舍得删除的旧代码
├ src - 存放源代码
│  ├ cloudflare - 存放了 Cloudflare 相关的共通代码
│  ├ common - 存放了共通方法
│  ├ controller - controller 层，用于处理接受的请求载荷数据和丰富请求响应数据
│  ├ dbPool - 存放了 MongoDB 相关的共通代码
│  ├ elasticsearchPool - 存放了 Elasticsearch 相关的共通代码
│  ├ middleware - 存放了服务器中间件相关代码
│  ├ route - 存放了路由代码
│  ├ service - service 层，用于处理业务逻辑
│  ├ ssl - SSL 相关配置
│  ├ store - 存放了“状态管理”或“运行时全局变量”相关代码
│  ├ type - 存放了共通的类型定义代码
│  └ app.ts - 该文件为程序入口
├ .dockerignore - 该文件用于配置执行 docker build 命令时忽略的文件
├ .editorconfig - 该文件定义了编码风格
├ .env.powershell.temp - 该文件是环境变量模板及说明文档
├ .eslintignore - 该文件定义了 Eslint 忽略的内容
├ .eslintrc.cjs - 该文件定义了 ESLint 配置
├ .gitattributes - 该文件定义了 Git 相关配置
├ .gitignore - 该文件定义了 Git 忽略的文件
├ Dockerfile - 该文件描述了构建 Docker 容器镜像的过程
├ LICENSE - 许可证
├ README.md - 该文件为自述文件
├ package-lock.json - 该文件固定了 npm install 是安装的依赖包的版本
├ package.json - 该文件定义了元数据、脚本和依赖包列表
├ tsconfig.json - 该文件为 TypeScript 配置文件
└ ɹəʌoɔ.svg - 该文件为封面图
```
### 从 Hello World 开始
第一个程序总是从 Hello World 开始，KIRAKIRA-Rosales 也不例外。

在 `/src/controller` 目录中有一个名为 `HelloWorld.ts` 的特殊文件。  
该文件中有以下代码：
``` TypeScript
import { koaCtx, koaNext } from '../type/koaTypes.js'

export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {
	const something = ctx.query.something
	ctx.body = `Hello World: ${something}`
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
这两个类型扩展自 Koa 提供的类型，koaCtx 是网络请求的上下文，koaNext 是一个可以被调用的异步方法。  
koaCtx 类型要求对象应当包含请求头、请求体、响应头、响应体以及中间件为其添加的其他参数。  
koaNext 类型要求一个异步方法，用于执行下一中间件，如果是最后一个，则完成请求并将响应返回给客户端。

目前，您不需要完全了解这两个类型，让我们接着往下看。
``` TypeScript
export const helloWorld = async (ctx: koaCtx, next: koaNext): Promise<void> => {...}
```
在这一行，我们导出了一个名为 `helloWorld` 的异步箭头函数，该函数接收两个参数：`ctx: koaCtx` 和 `next: koaNext`, 并返回一个空的 Promise.  
ctx 是 context 的缩写，代表上下文，其类型 koaCtx 说明见上文。  
next 的类型是 koaNext，说明见上文。

接下来的两行代码：
``` TypeScript
const something = ctx.query.something
ctx.body = something ? `Hello ${something} World` : 'Hello World'
```
这一部分用来存取网络请求上下文中的标头或 body（正文）。  
首先，从 `ctx` 上下文对象中匹配网络请求中名为 `something` 的“查询”参数，并赋值给 `something` 常量。  
紧接着是一个三元表达式，您可以将这个运算部分理解为“业务逻辑代码”。如果 `something` 不是假值，则将其与 "Hello World" 字符串拼接的结果作为三元表达式的运算结果，如果是假值，则直接将 'Hello World' 字符串作为三元表达式的运算结果。最后，将运算结果赋值到 `ctx` 请求上下文对象的响应体中。

最后一行代码：
``` TypeScript
await next()
```
等待下一个中间件执行完成，如果没有下一个，则完成请求并返回给客户端。

以上便是 KIRAKIRA-Rosales 通过 Koa 响应一个网络请求的最简单的流程。  
打开您的浏览器，在地址栏输入`https://localhost:9999?something=Beautiful` 后回车，您将会在页面中看到 `Hello Beautiful World` 字样。🎉


### 路由
与前端的路由类似，后端也存在一个“路由”的概念。  
前端通过路由匹配到正确的组件，而后端通过路由将网络请求导向到正确的 Controller 层并执行

TODO
