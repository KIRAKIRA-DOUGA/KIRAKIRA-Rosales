![Cover](℩ɘvoↄ.svg)

# KIRAKIRA-Rosales
KIRAKIRA-Rosales, 一个基于 Koa 框架的、RESTful 的后端 API.

API 参考，请参阅 [路由](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/blob/develop/src/route/router.ts)。
想了解更多？[阅读Wiki](https://deepwiki.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales)！

## 贡献
想要参与贡献？请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

遇到问题？你可以在 [此处](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 查找可能的解决方案，或创建一个议题。

## 开发
KIRAKIRA-Rosales 提供了可以在本地运行的开发服务器。  
默认情况下，以下步骤将启动一个开发服务器，并监听 30000 端口。

### 安装
克隆本存储库，你可以使用如下命令，或其他 Git 兼容工具。
```
git clone https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales.git
```

完成克隆后，在程序根目录执行以下命令安装依赖包。

```bash
npm install
```

### 设置环境变量
> [!IMPORTANT]
> 下方的示例代码中并没有包含全部环境变量。
> 对于不同操作系统，设置环境变量的方式也不同。
> 全部环境变量及其作用请参阅：[.env.template](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/blob/develop/.env.template)，该文件中列出的大多数环境变量都是必需的。

如果你使用的是 ```Windows``` 操作系统
```powershell
# 以下为 Windows PowerShell 的示例
$env:SERVER_PORT="30000"
$env:SERVER_ENV="dev"
$env:SERVER_ROOT_URL="kirakira.moe"
...
```

如果你使用的是 ```Linux``` 操作系统
```bash
# 以下为 Linux Shell 的示例
export SERVER_PORT="30000"
export SERVER_ENV="dev"
export SERVER_ROOT_URL="kirakira.moe"
...
```

在设置环境变量时有任何问题，请在 [议题](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 或 [讨论区](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/discussions) 中查找解答或提问。


### 启动后端服务
> [!IMPORTANT]
> 以开发模式启动服务会将代码打包至项目根目录的 `.kirakira` 路径。  
> 如有必要，你可以在 package.json 中修改打包路径。请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

#### 启动本地后端开发服务器
你可以在程序根目录中执行以下命令来启动

```bash
npm run dev
```

也可以按下键盘按键 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>，然后选择 `npm: dev`。

#### 启动本地后端开发服务器，并启用自动重载
你可以在程序根目录中执行以下命令来启动

```bash
npm run dev-hot
```

也可以按下键盘按键 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>，然后选择 `npm: dev-hot`。

成功执行以上命令后，你应该会获得一个监听 30000 端口的 KIRAKIRA-Rosales 开发服务器。🎉  
在此基础上，你可以审阅、编写或贡献代码，参与 KIRAKIRA 项目开发。

如何开发？请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

遇到问题？你可以在 [此处](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/issues) 查找可能的解决方案或创建一个议题。

## 构建 / 自托管
你可以构建 KIRAKIRA-Rosales, 然后在任何安装了 Node.js 的 AMD64 或 ARM64 实例中运行。
也可以使用 Docker 或 Docker 兼容工具将其打包为容器镜像。

### 构建

#### 设置环境变量
设置方法与上文的开发模式相同，请参阅：[设置环境变量](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop?tab=readme-ov-file#%E5%BC%80%E5%8F%91)。

#### 构建应用程序
> [!IMPORTANT]
> 默认会将代码打包至 `./dist` 路径，你可以在 tsconfig.json 中修改打包目标路径。  
> 请注意，其他依赖于默认打包路径的业务也要更改配置，因此并不建议修改打包路径。

按下键盘按键 <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>B</kbd>，然后选择 `npm: build`。

```bash
npm install
npm run build
```

### 打包为容器镜像（最佳实践）
部署 KIRAKIRA-Rosales 的最佳实践是将其运行在 K8s 集群中。你正在使用的 KIRAKIRA-Rosales 服务便是如此。
关于如何在容器中部署，请参阅 [开发文档](https://github.com/KIRAKIRA-DOUGA/KIRAKIRA-Rosales/tree/develop/docs)。

## License
BSD-3-Clause license
