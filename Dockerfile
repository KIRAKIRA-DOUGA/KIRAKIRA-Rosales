# BY: ChatGPT-4
# 使用官方的 node 基础镜像
FROM node:14

# 设置工作目录
WORKDIR /usr/src/app

# 将源代码文件复制到工作目录
COPY . .

# 安装依赖
RUN npm install

# 设置环境变量，默认暴露的端口为3000
ENV SERVER_PORT 3000
EXPOSE $SERVER_PORT

# build
RUN npm run build

# 运行命令
CMD [ "node", "./dist/app.js" ]