# Changelog

All notable changes to this project will be documented in this file.

## [2.0.0] - 2024-02-06

### 新增功能

#### 🎉 完全自动化支持
- **临时邮箱服务**：集成临时邮箱 API，自动创建邮箱并获取验证码
- **CAPTCHA 自动解决**：支持多个 CAPTCHA 服务商（YesCaptcha、2Captcha、CapSolver、本地 Solver）
- **双邮箱模式**：支持 Gmail 别名（半自动）和临时邮箱（完全自动）两种模式

#### 📧 邮箱服务增强
- 新增 `lib/email-service.js` 模块
  - 支持连接池管理
  - 自动重试机制（指数退避）
  - 超时控制
  - 错误分类（网络错误 vs 认证错误）
  - 自动提取验证码

#### 🔓 CAPTCHA 服务
- 新增 `lib/captcha-service.js` 模块
  - 支持 YesCaptcha API
  - 支持 2Captcha API
  - 支持 CapSolver API
  - 支持本地 Turnstile Solver
  - 统一的接口设计
  - 任务创建和结果轮询

#### 🎨 UI 改进
- 新增邮箱配置界面
  - 邮箱模式选择（Gmail 别名 / 临时邮箱）
  - Gmail 配置（保留原有功能）
  - 临时邮箱配置（Worker Domain、Email Domain、Admin Password）
- 新增 CAPTCHA 配置界面
  - CAPTCHA 开关
  - 服务商选择
  - API Key 配置
  - 本地 Solver URL 配置
- 新增配置状态提示（成功/失败）

#### 🔧 技术改进
- 更新 `service-worker.js`
  - 集成邮箱服务配置
  - 集成 CAPTCHA 服务配置
  - 支持配置持久化
  - 自动/手动验证码获取切换
- 更新 `content.js`
  - 支持自动验证码填写
  - 改进验证码获取逻辑
- 更新 `manifest.json`
  - 添加 CAPTCHA 服务 API 权限
  - 添加本地 Solver 权限
- 更新 `popup.js`
  - 新增配置管理函数
  - 新增邮箱模式切换
  - 新增 CAPTCHA 配置保存

### 文档更新
- 更新 `README.md`
  - 添加临时邮箱模式说明
  - 添加 CAPTCHA 配置指南
  - 添加完全自动化使用说明
  - 更新功能特性列表
  - 更新常见问题
- 新增 `CHANGELOG.md`

### 参考项目
- 移植自 [grok注册_temp](https://github.com/example/grok) 项目的 Python 实现
  - `EmailService` → `lib/email-service.js`
  - `TurnstileService` → `lib/captcha-service.js`

---

## [1.0.0] - 2024-02-04

### 初始版本
- AWS Builder ID 半自动注册
- Gmail 无限别名生成
- 无痕模式支持
- Token 管理和验证
- 批量注册功能
- 历史记录管理
- Kiro IDE 同步
- Token Pool 集成
