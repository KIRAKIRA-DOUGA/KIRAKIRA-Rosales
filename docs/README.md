# KIRAKIRA-Rosales 开发文档

## 一、前言

KIRAKIRA-Rosales（下文简称：“Rosales” 或 “后端”）是一个由 Koa 编写的、RESTful 的后端 API.

本文档主要内容如下：
1. 如何针对现有代码进行二次开发。
2. 与后端相关的基础设施的知识，例如数据库、搜索引擎和集群部署等。

在正式开始向您介绍前，我假设您已经具有一定的编程知识，包括：理解 [JavaScript](https://developer.mozilla.org/docs/Web/JavaScript) & [TypeScript](https://www.typescriptlang.org/) 的基础语法、[网络请求（HTTP）](https://developer.mozilla.org/docs/Web/HTTP/Overview)工作原理，以及了解 [数据库](https://zh.wikipedia.org/wiki/%E6%95%B0%E6%8D%AE%E5%BA%93) 和 [NoSQL](https://zh.wikipedia.org/wiki/NoSQL) 概念。



### 技术栈
在开始前，了解 KIRAKIRA-Rosales 及其相关基础设施的技术架构是非常有必要的。

KIRAKIRA-Rosales 由 Koa 编写。Koa 是一种 Node.js 框架，提供了更好的异步和 HTTP 支持。  
具体来说，后端使用的语言是 TypeScript, TypeScript 的类型检查能够很好地提高代码质量。  
后端的生产环境部署在 AWS 的 EKS 集群中。  
后端依赖于一个 MongoDB 数据库集群和一个 Elasticsearch 集群，他们同样部署在 AWS EKS 中。

对于存储，MongoDB 和 Elasticsearch 产生的数据库被存储在 AWS EBS 磁盘中，图片和视频文件由 Cloudflare 的 Images 和 Stream 存储。

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
或者，你也可以使用具有图形化界面的 Github Desktop 或其他 Git 兼容工具来完成这一步骤。

### 2. 设置环境变量
> [!IMPORTANT]    
> 下方的示例中并没有包含全部环境变量。  
> 全部环境变量及其作用请参阅：[.env.powershell.temp](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/blob/develop/.env.powershell.temp)，该文件中列出的大多数环境变量都是必需的。  
```powershell
# 根据操作系统的不同，设置环境变量的方式也不同，以下为 Windows PowerShell 的示例
$env:SERVER_PORT="9999"
$env:SERVER_ENV="dev"
$env:SERVER_ROOT_URL="kirakira.moe"
...
```
在设置环境变量时有任何问题，请在 [议题](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 或 [讨论区](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/discussions) 中查找解答或提问。

### 3.启动后端开发服务器
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


