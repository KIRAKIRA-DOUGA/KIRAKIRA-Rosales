![Cover](ɹəʌoɔ.svg)

# KIRAKIRA-Rosales
KIRAKIRA-Rosales, 一个基于 Koa 框架的、RESTful 的后端 API.

API 参考，请参阅 [路由](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/blob/develop/src/route/router.ts)。

## 贡献
想要参与贡献？请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

遇到问题？您可以在 [此处](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 查找可能的解决方案或创建一个议题。

## 开发
KIRAKIRA-Rosales 提供了可以在本地运行的开发服务器。  
默认情况下，以下步骤将启动一个开发服务器，并监听 9999 端口。

1.设置环境变量
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


2.启动后端服务
> [!IMPORTANT]    
> 以开发模式启动服务会将代码打包至项目根目录的 `.kirakira` 目录内。  
> 如有必要，您可以在 package.json 中修改打包路径。请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。
```sh
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 或者,您可以以热重载方式启动开发服务器
npm run dev-hot
```
成功执行以上命令后，您应该会获得一个监听 9999 端口的 KIRAKIRA-Rosales 开发服务器。🎉  
在此基础上，您可以编写、贡献代码，参与 KIRAKIRA 项目开发。  

如何开发？请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

遇到问题？您可以在 [此处](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 查找可能的解决方案或创建一个议题。

## 构建 / 自托管
您可以构建 KIRAKIRA-Rosales, 然后在任何安装了 Node.js 的 AMD64 或 ARM64 实例中运行。  
也可以使用 Docker 或 Docker 兼容工具将其打包为容器镜像。

#### 构建，然后在本地预览
1.设置环境变量

设置方法与上文的开发模式相同，请参阅：[设置环境变量](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop?tab=readme-ov-file#%E5%BC%80%E5%8F%91)。  

2.构建并预览
> [!IMPORTANT]  
> 默认会将代码打包至项目根目录的 `dist` 目录内  
> 如有必要，您可以在 tsconfig.json 中修改打包路径。相应地，也要修改下方第三步启动服务器命令中的路径。
```sh
# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 启动本地预览服务器
node ./dist/app.js
```

#### 打包为容器镜像（最佳实践）
部署 KIRAKIRA-Rosales 的最佳实践是将其运行在 K8s 集群中。您正在使用的 KIRAKIRA-Rosales 服务便是如此。  
关于如何在容器中部署，请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

## License
BSD-3-Clause license
