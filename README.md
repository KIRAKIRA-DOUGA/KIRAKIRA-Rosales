# KIRAKIRA-Rosales
KIRAKIRA-Rosales, The RESTful Back-end API Created by koa.  
在完善以下内容后本存储库将开源  
- [ ] 开发文档
- [x] 修复每个请求都创建一个 mongoose schema 的问题
- [x] 优化用户注册/登录流程

<br/>

## 开发
```sh
# 先设置环境变量，需要设置的环境变量参见：/.env.powershell.temp

# 启动服务
npm install
npm run dev

# 然后它就会监听 9999 端口的网络请求（可以通过设置环境变量修改，参见：src/app.ts ）
```

## 构建
```sh
npm install
npm run build
```
