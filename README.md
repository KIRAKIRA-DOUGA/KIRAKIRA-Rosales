![Cover](ɹəʌoɔ.svg)

# KIRAKIRA-Rosales
KIRAKIRA-Rosales, 一个由 koa 编写的、RESTful 的后端 API.

## 贡献
想要参与贡献？请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)

## 开发
KIRAKIRA-Rosales 提供了用于本地运行的开发服务器。  
以下步骤将启动一个开发服务器，并监听 9999 端口。

1.设置环境变量
> [!IMPORTANT]    
> 下方的示例中并没有包含全部环境变量，全部环境变量及其作用请参阅：[.env.powershell.temp](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/blob/develop/.env.powershell.temp)，该文件中列出的大多数环境变量都是必需的。  
```powershell
# 根据操作系统的不同，设置环境变量的方式也不同，以下为 Windows PowerShell 示例
$env:SERVER_PORT="9999"
$env:SERVER_ENV="dev"
$env:SERVER_ROOT_URL="kirakira.moe"
...
```
2.启动后端服务
> [!IMPORTANT]    
> 以开发模式启动的服务会将代码打包至项目根目录中的 .kirakira 文件夹内。  
> 如有必要，您可以在 package.json 中修改打包路径。请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。
```sh
# 安装依赖
npm install

# 启动服务
npm run dev

# 或者,您可以以热重载方式启动开发服务器
npm run dev-hot
```
成功执行以上命令后，您应该获得一个监听 9999 端口的 KIRAKIRA-Rosales 开发服务器。🎉  
在此基础上您可以编写、贡献代码，参与 KIRAKIRA 项目开发。  

如何开发？请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

遇到问题？您可以在 [此处](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 查找可能的解决方案或创建一个议题。

## 构建 / 自托管
您可以构建 KIRAKIRA-Rosales 并在任何支持 Node.js ≥  的 AMD64 或 ARM64 平台中运行。

### 构建，然后在本地预览
1.设置环境变量  
设置方法与上文的开发模式相同，请参阅：[设置环境变量](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Cerasus?tab=readme-ov-file#开发)。  

2.构建并启动预览
> [!IMPORTANT]  
> 构建时会将代码打包至 `dist` 目录下  
> 如有必要，您可以在 tsconfig.json 中修改打包路径。相应地，你也应该修改下方第三步启动服务命令中的路径。
```sh
# 1. 安装依赖
npm install

# 2. 构建
npm run build

# 3. 启动服务
node ./dist/app.js
```

### 最佳实践
部署 KIRAKIRA-Rosales 的最佳实践是将其运行在 K8s 集群中。您正在使用的 KIRAKIRA-Rosales 服务便是如此。  
关于如何在容器中部署，请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。
