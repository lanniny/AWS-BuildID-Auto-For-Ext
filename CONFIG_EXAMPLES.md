# 配置示例

本文件提供了 AWS Auto Registration 扩展的配置示例。

## 邮箱服务配置

### 模式一：Gmail 别名（推荐新手）

```json
{
  "emailService": {
    "mode": "gmail",
    "gmailBaseAddress": "your-email@gmail.com"
  }
}
```

**优点**：
- 无需额外服务
- 配置简单
- 所有邮件收到同一个收件箱

**缺点**：
- 需要手动填写验证码
- 并发能力有限（建议设为 1）

---

### 模式二：临时邮箱（推荐高级用户）

```json
{
  "emailService": {
    "mode": "temp",
    "tempEmail": {
      "workerDomain": "mailfly.codeforge.top",
      "emailDomain": "example.com",
      "adminPassword": "your-admin-password"
    }
  }
}
```

**优点**：
- 完全自动化，无需手动输入验证码
- 支持更高并发（1-3）
- 每个账号独立邮箱

**缺点**：
- 需要自建或购买临时邮箱服务
- 配置相对复杂

**临时邮箱服务搭建**：
- 参考 [Cloudflare Email Worker](https://github.com/TBXark/cloudflare-email-worker)
- 或使用其他临时邮箱 API 服务

---

## CAPTCHA 服务配置

### 选项一：YesCaptcha（推荐）

```json
{
  "captchaService": {
    "enabled": true,
    "provider": "yescaptcha",
    "apiKey": "your-yescaptcha-api-key"
  }
}
```

**获取 API Key**：
1. 访问 [YesCaptcha](https://yescaptcha.com/)
2. 注册账号并充值
3. 在控制台获取 API Key

**价格参考**：约 $1 / 1000 次解决

---

### 选项二：2Captcha

```json
{
  "captchaService": {
    "enabled": true,
    "provider": "2captcha",
    "apiKey": "your-2captcha-api-key"
  }
}
```

**获取 API Key**：
1. 访问 [2Captcha](https://2captcha.com/)
2. 注册账号并充值
3. 在控制台获取 API Key

**价格参考**：约 $2.99 / 1000 次解决

---

### 选项三：CapSolver

```json
{
  "captchaService": {
    "enabled": true,
    "provider": "capsolver",
    "apiKey": "your-capsolver-api-key"
  }
}
```

**获取 API Key**：
1. 访问 [CapSolver](https://www.capsolver.com/)
2. 注册账号并充值
3. 在控制台获取 API Key

**价格参考**：约 $0.8 / 1000 次解决

---

### 选项四：本地 Solver（免费）

```json
{
  "captchaService": {
    "enabled": true,
    "provider": "local",
    "solverUrl": "http://127.0.0.1:5072"
  }
}
```

**搭建本地 Solver**：
1. 克隆 [Turnstile Solver](https://github.com/example/turnstile-solver)
2. 安装依赖：`npm install`
3. 启动服务：`npm start`
4. 默认监听 `http://127.0.0.1:5072`

**优点**：
- 完全免费
- 无需 API Key
- 数据隐私

**缺点**：
- 需要本地运行服务
- 解决速度可能较慢
- 成功率取决于实现质量

---

## 完整配置示例

### 完全自动化配置（临时邮箱 + CAPTCHA）

```json
{
  "emailService": {
    "mode": "temp",
    "tempEmail": {
      "workerDomain": "mailfly.codeforge.top",
      "emailDomain": "example.com",
      "adminPassword": "your-admin-password"
    }
  },
  "captchaService": {
    "enabled": true,
    "provider": "yescaptcha",
    "apiKey": "your-yescaptcha-api-key"
  },
  "registration": {
    "loopCount": 10,
    "concurrency": 3
  }
}
```

**适用场景**：
- 大规模批量注册
- 无需人工干预
- 追求效率

---

### 半自动化配置（Gmail 别名）

```json
{
  "emailService": {
    "mode": "gmail",
    "gmailBaseAddress": "your-email@gmail.com"
  },
  "captchaService": {
    "enabled": false
  },
  "registration": {
    "loopCount": 5,
    "concurrency": 1
  }
}
```

**适用场景**：
- 小规模注册
- 不想购买 CAPTCHA 服务
- 可以手动输入验证码

---

## 注意事项

### 邮箱服务
- Gmail 别名模式：确保 Gmail 地址正确，检查垃圾邮件文件夹
- 临时邮箱模式：确保邮箱服务正常运行，测试 API 连接

### CAPTCHA 服务
- 确保 API Key 有效且余额充足
- 本地 Solver 需要先启动服务
- 如果 AWS 没有 CAPTCHA，可以禁用此功能

### 并发设置
- Gmail 别名模式：建议并发设为 1
- 临时邮箱模式：可以设为 2-3
- 过高的并发可能导致 IP 被限流

### 安全建议
- 不要在公共场合分享配置文件
- 定期更换 API Key
- 使用强密码保护临时邮箱服务

---

## 故障排除

### 临时邮箱无法连接
1. 检查 Worker Domain 是否正确
2. 检查 Admin Password 是否正确
3. 测试邮箱服务是否正常运行
4. 查看浏览器控制台错误信息

### CAPTCHA 解决失败
1. 检查 API Key 是否有效
2. 检查账户余额是否充足
3. 尝试切换其他服务商
4. 如果使用本地 Solver，检查服务是否运行

### 验证码获取超时
1. 增加等待时间（默认 60 秒）
2. 检查邮箱服务是否正常
3. 检查网络连接
4. 尝试手动访问邮箱查看是否收到邮件

---

## 推荐配置组合

| 场景 | 邮箱模式 | CAPTCHA | 并发 | 成本 |
|------|---------|---------|------|------|
| **学习测试** | Gmail 别名 | 禁用 | 1 | 免费 |
| **小规模使用** | Gmail 别名 | 本地 Solver | 1 | 免费 |
| **中规模使用** | 临时邮箱 | YesCaptcha | 2 | 低成本 |
| **大规模使用** | 临时邮箱 | CapSolver | 3 | 中等成本 |

---

## 相关链接

- [YesCaptcha 官网](https://yescaptcha.com/)
- [2Captcha 官网](https://2captcha.com/)
- [CapSolver 官网](https://www.capsolver.com/)
- [Cloudflare Email Worker](https://github.com/TBXark/cloudflare-email-worker)
- [项目 GitHub](https://github.com/Specia1z/AWS-BuildID-Auto-For-Ext)
