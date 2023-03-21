import mongoose from 'mongoose'

export type adminCheckStates = {
	state: boolean;
	callbackMessage: string;
}

export type serviceInitState = {
	state: boolean;
	callbackMessage: string;
}

// 详见：AdminController -> initKirakiraCluster
export type initEnvType = {
	userSendSecretKey: string; // 一次性身份验证码，用于初始化集群(创建管理用户和密码)时使用
	systemAdminUserName: string; // 集群管理员用户名
	adminPassword: string; // 集群管理员密码
	localhostServicePublicIPAddress: string; // 初始化时，发送一次本机公有IP
	localhostServicePrivateIPAddress: string; // 初始化时，发送一次本机私有IP
	localhostServicePort: string; // 初始化时发送一次本机服务端口
	heartbeatDatabaseShardData: string[]; // 初始化时发送的心跳数据库信息
}

export interface serviceInfoType { // 不论是 mongo 还是 mysql 还是 api，每个分片都可用这一数据类型描述并存储至 mongoDB
	publicIPAddress: string; // 该服务的公网 ip
	privateIPAddress: string; // 该服务的私网 ip
	port: number; // 该服务的所在的端口
	adminAccountName?: string; // 该服务的账号名 (如果有)
	adminPassword?: string; // 该服务的密码 (如果有) (两次 Base64 编码)
	serviceType: 'mongo' | 'sql' | 'elastic' | 'api' | 'heartbeat'; // 服务的类型
	shardGroup: number; // 当前分片隶属于哪个分片组
	identity: 'master' | 'servant'; // 分片的身份，一个数据区块只有一个主分片，可以有多个从分片
	state: 'up' | 'down' | 'pending'; // 服务的状态
	editDateTime: number; // 最后编辑时间，时间戳格式
	remark?: object; // 其他杂项
	// 假设我要查询 mongodb 在 1 区块的主分片的地址和端口， 则： where serviceType = 'mongo' and shardGroup = 1 and identity = 'master' and state = 'up'
}


export interface mongoDBConnectType { // 存放 mongoose 的 mongodb 连接的对象
	connect: mongoose.Connection;
	connectStatus: 'ok' | 'error';
	connectInfo: serviceInfoType;
}

export interface adminUserType {
	userName: string;
	password: string;
	createDateTime?: number;
	creator?: string;
	updateDateTime?: number;
	updater?: string;
}
