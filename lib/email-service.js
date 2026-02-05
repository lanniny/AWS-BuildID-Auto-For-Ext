/**
 * 临时邮箱服务 - 移植自 grok 项目的 EmailService
 * 支持连接池、自动重试、超时控制
 */

/**
 * 邮箱服务基础异常
 */
class EmailServiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'EmailServiceError';
  }
}

/**
 * 网络相关错误，可重试
 */
class EmailNetworkError extends EmailServiceError {
  constructor(message) {
    super(message);
    this.name = 'EmailNetworkError';
  }
}

/**
 * 认证错误，不可重试
 */
class EmailAuthError extends EmailServiceError {
  constructor(message) {
    super(message);
    this.name = 'EmailAuthError';
  }
}

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 重试装饰器（高阶函数）
 * @param {Function} fn - 要重试的函数
 * @param {number} maxRetries - 最大重试次数
 * @param {number} delay - 重试间隔（毫秒）
 * @returns {Function} 包装后的函数
 */
function withRetry(fn, maxRetries = 3, delay = 1000) {
  return async function(...args) {
    let lastError = null;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn.apply(this, args);
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries && error instanceof EmailNetworkError) {
          // 指数退避
          await sleep(delay * (attempt + 1));
          continue;
        }
        throw error;
      }
    }
    throw new EmailNetworkError(`重试 ${maxRetries} 次后仍失败: ${lastError.message}`);
  };
}

/**
 * 临时邮箱服务类
 *
 * 支持连接池管理、自动重试、超时控制
 *
 * Usage:
 *   const service = new EmailService({ workerDomain, emailDomain, adminPassword });
 *   const { jwt, email } = await service.createEmail();
 *   const content = await service.waitForEmail(jwt, 30000);
 */
class EmailService {
  /**
   * 初始化邮箱服务
   * @param {Object} config - 配置对象
   * @param {string} config.workerDomain - Worker 域名
   * @param {string} config.emailDomain - 邮箱域名
   * @param {string} config.adminPassword - 管理员密码
   * @param {number} config.timeout - 请求超时时间（毫秒），默认 10000
   * @param {number} config.maxRetries - 最大重试次数，默认 3
   */
  constructor(config) {
    const { workerDomain, emailDomain, adminPassword, timeout = 10000, maxRetries = 3 } = config;

    if (!workerDomain || !emailDomain || !adminPassword) {
      throw new Error('Missing required config: workerDomain, emailDomain, adminPassword');
    }

    this.workerDomain = workerDomain;
    this.emailDomain = emailDomain;
    this.adminPassword = adminPassword;
    this.timeout = timeout;
    this.maxRetries = maxRetries;

    // 绑定重试方法
    this.createEmail = withRetry(this._createEmail.bind(this), maxRetries, 1000);
    this.fetchFirstEmail = withRetry(this._fetchFirstEmail.bind(this), maxRetries, 1000);
  }

  /**
   * 生成随机邮箱名称
   * @returns {string} 随机名称
   */
  _generateRandomName() {
    const letters1 = Array.from({ length: Math.floor(Math.random() * 3) + 4 }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26))
    ).join('');

    const numbers = Array.from({ length: Math.floor(Math.random() * 3) + 1 }, () =>
      Math.floor(Math.random() * 10)
    ).join('');

    const letters2 = Array.from({ length: Math.floor(Math.random() * 6) }, () =>
      String.fromCharCode(97 + Math.floor(Math.random() * 26))
    ).join('');

    return letters1 + numbers + letters2;
  }

  /**
   * 创建临时邮箱（内部方法，不带重试）
   * @returns {Promise<{jwt: string, email: string}>} JWT 和邮箱地址
   * @throws {EmailAuthError} 认证失败 (401)
   * @throws {EmailNetworkError} 网络错误
   */
  async _createEmail() {
    const url = `https://${this.workerDomain}/admin/new_address`;
    const randomName = this._generateRandomName();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-admin-auth': this.adminPassword,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          enablePrefix: true,
          name: randomName,
          domain: this.emailDomain
        }),
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 200) {
        const data = await response.json();
        return {
          jwt: data.jwt,
          email: data.address
        };
      } else if (response.status === 401) {
        const text = await response.text();
        throw new EmailAuthError(`认证失败: ${text}`);
      } else {
        const text = await response.text();
        console.error(`[-] 创建邮箱接口返回错误: ${response.status} - ${text}`);
        throw new EmailNetworkError(`创建邮箱失败: HTTP ${response.status}`);
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new EmailNetworkError(`创建邮箱超时 (${this.timeout}ms)`);
      }
      if (error instanceof EmailServiceError) {
        throw error;
      }
      throw new EmailNetworkError(`创建邮箱连接失败: ${error.message}`);
    }
  }

  /**
   * 获取第一封邮件内容（内部方法，不带重试）
   * @param {string} jwt - 邮箱认证令牌
   * @returns {Promise<string|null>} 邮件原始内容，无邮件返回 null
   * @throws {EmailAuthError} JWT 无效 (401)
   * @throws {EmailNetworkError} 网络错误
   */
  async _fetchFirstEmail(jwt) {
    const url = `https://${this.workerDomain}/api/mails?limit=10&offset=0`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeout);

      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${jwt}`,
          'Content-Type': 'application/json'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (response.status === 200) {
        const data = await response.json();
        if (data.results && data.results.length > 0) {
          return data.results[0].raw;
        }
        return null;
      } else if (response.status === 401) {
        const text = await response.text();
        throw new EmailAuthError(`JWT 无效或已过期: ${text}`);
      } else {
        const text = await response.text();
        console.error(`[-] 获取邮件接口返回错误: ${response.status} - ${text}`);
        throw new EmailNetworkError(`获取邮件失败: HTTP ${response.status}`);
      }

    } catch (error) {
      if (error.name === 'AbortError') {
        throw new EmailNetworkError(`获取邮件超时 (${this.timeout}ms)`);
      }
      if (error instanceof EmailServiceError) {
        throw error;
      }
      throw new EmailNetworkError(`获取邮件连接失败: ${error.message}`);
    }
  }

  /**
   * 轮询等待邮件到达
   * @param {string} jwt - 邮箱认证令牌
   * @param {number} timeout - 最大等待时间（毫秒），默认 30000
   * @param {number} interval - 轮询间隔（毫秒），默认 1000
   * @returns {Promise<string|null>} 邮件原始内容，超时返回 null
   */
  async waitForEmail(jwt, timeout = 30000, interval = 1000) {
    const startTime = Date.now();
    let retryCount = 0;

    while (Date.now() - startTime < timeout) {
      try {
        const content = await this.fetchFirstEmail(jwt);
        if (content) {
          return content;
        }
        retryCount = 0; // 成功请求后重置重试计数
      } catch (error) {
        if (error instanceof EmailNetworkError) {
          retryCount++;
          if (retryCount >= this.maxRetries) {
            console.error(`[-] 网络错误达到重试上限: ${error.message}`);
            return null;
          }
          // 网络错误时使用指数退避
          await sleep(Math.min(interval * Math.pow(2, retryCount), 10000));
          continue;
        } else if (error instanceof EmailAuthError) {
          // 认证错误不重试
          throw error;
        }
      }

      await sleep(interval);
    }

    return null;
  }

  /**
   * 从邮件内容中提取验证码
   * @param {string} emailContent - 邮件原始内容
   * @param {RegExp} pattern - 验证码匹配正则，默认匹配 6 位数字
   * @returns {string|null} 验证码，未找到返回 null
   */
  extractVerificationCode(emailContent, pattern = /\b\d{6}\b/) {
    if (!emailContent) return null;

    const match = emailContent.match(pattern);
    return match ? match[0] : null;
  }

  /**
   * 一键获取验证码（创建邮箱 + 等待邮件 + 提取验证码）
   * @param {number} timeout - 等待邮件超时时间（毫秒），默认 30000
   * @param {RegExp} pattern - 验证码匹配正则
   * @returns {Promise<{email: string, code: string, jwt: string}>} 邮箱、验证码和 JWT
   * @throws {Error} 创建邮箱失败或超时未收到邮件
   */
  async getVerificationCode(timeout = 30000, pattern = /\b\d{6}\b/) {
    // 步骤 1: 创建邮箱
    const { jwt, email } = await this.createEmail();
    console.log(`[EmailService] 创建邮箱成功: ${email}`);

    // 步骤 2: 等待邮件
    const content = await this.waitForEmail(jwt, timeout);
    if (!content) {
      throw new Error(`等待邮件超时 (${timeout}ms)`);
    }

    // 步骤 3: 提取验证码
    const code = this.extractVerificationCode(content, pattern);
    if (!code) {
      throw new Error('邮件中未找到验证码');
    }

    console.log(`[EmailService] 验证码获取成功: ${code}`);
    return { email, code, jwt };
  }
}

export { EmailService, EmailServiceError, EmailNetworkError, EmailAuthError };
