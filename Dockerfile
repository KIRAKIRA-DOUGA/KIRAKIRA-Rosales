# BY: ChatGPT-4, 02
# 尽可能为 AMD64 与 ARM64 平台提供兼容性

# 使用官方的 node 基础镜像
FROM node:alpine

# 设置工作目录
WORKDIR /usr/src/app

# 将 package.json 和 package-lock.json 复制到工作目录
COPY package*.json ./

# 安装依赖
RUN npm install

# 将其他源代码文件复制到工作目录
COPY . .

# build
RUN npm run build

# 运行命令
CMD [ "node", "./dist/app.js" ]