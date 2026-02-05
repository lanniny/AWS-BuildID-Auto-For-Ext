/**
 * CAPTCHA 验证服务 - 移植自 grok 项目的 TurnstileService
 * 支持多个 CAPTCHA 服务商：YesCaptcha、2Captcha、CapSolver、本地 Solver
 */

/**
 * CAPTCHA 服务基础异常
 */
class CaptchaServiceError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CaptchaServiceError';
  }
}

/**
 * 延迟函数
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * CAPTCHA 服务抽象基类
 */
class CaptchaProvider {
  /**
   * 创建 CAPTCHA 任务
   * @param {string} siteUrl - 网站 URL
   * @param {string} siteKey - 网站密钥
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} 任务 ID
   */
  async createTask(siteUrl, siteKey, options = {}) {
    throw new Error('createTask() must be implemented');
  }

  /**
   * 获取 CAPTCHA 响应
   * @param {string} taskId - 任务 ID
   * @param {number} maxRetries - 最大重试次数
   * @param {number} initialDelay - 初始延迟（毫秒）
   * @param {number} retryDelay - 重试间隔（毫秒）
   * @returns {Promise<string|null>} CAPTCHA token，失败返回 null
   */
  async getResponse(taskId, maxRetries = 30, initialDelay = 5000, retryDelay = 2000) {
    throw new Error('getResponse() must be implemented');
  }

  /**
   * 一键解决 CAPTCHA（创建任务 + 获取响应）
   * @param {string} siteUrl - 网站 URL
   * @param {string} siteKey - 网站密钥
   * @param {Object} options - 额外选项
   * @returns {Promise<string|null>} CAPTCHA token
   */
  async solve(siteUrl, siteKey, options = {}) {
    const taskId = await this.createTask(siteUrl, siteKey, options);
    return await this.getResponse(taskId);
  }
}

/**
 * YesCaptcha 服务商
 */
class YesCaptchaProvider extends CaptchaProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.yescaptcha.com';
  }

  async createTask(siteUrl, siteKey, options = {}) {
    const { type = 'TurnstileTaskProxyless', action, data } = options;

    const payload = {
      clientKey: this.apiKey,
      task: {
        type,
        websiteURL: siteUrl,
        websiteKey: siteKey
      }
    };

    // 添加可选参数
    if (action) payload.task.action = action;
    if (data) payload.task.data = data;

    const response = await fetch(`${this.apiUrl}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new CaptchaServiceError(`YesCaptcha 请求失败: HTTP ${response.status}`);
    }

    const data_result = await response.json();
    if (data_result.errorId !== 0) {
      throw new CaptchaServiceError(`YesCaptcha 创建任务失败: ${data_result.errorDescription}`);
    }

    return data_result.taskId;
  }

  async getResponse(taskId, maxRetries = 30, initialDelay = 5000, retryDelay = 2000) {
    await sleep(initialDelay);

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${this.apiUrl}/getTaskResult`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientKey: this.apiKey,
            taskId
          })
        });

        if (!response.ok) {
          console.warn(`[YesCaptcha] 获取结果失败: HTTP ${response.status}`);
          await sleep(retryDelay);
          continue;
        }

        const data = await response.json();

        if (data.errorId !== 0) {
          console.error(`[YesCaptcha] 获取结果失败: ${data.errorDescription}`);
          return null;
        }

        if (data.status === 'ready') {
          const token = data.solution?.token;
          if (token) {
            return token;
          } else {
            console.error('[YesCaptcha] 返回结果中没有 token');
            return null;
          }
        } else if (data.status === 'processing') {
          await sleep(retryDelay);
        } else {
          console.warn(`[YesCaptcha] 未知状态: ${data.status}`);
          await sleep(retryDelay);
        }
      } catch (error) {
        console.error(`[YesCaptcha] 获取响应异常: ${error.message}`);
        await sleep(retryDelay);
      }
    }

    return null;
  }
}

/**
 * 2Captcha 服务商
 */
class TwoCaptchaProvider extends CaptchaProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = 'https://2captcha.com';
  }

  async createTask(siteUrl, siteKey, options = {}) {
    const { method = 'turnstile', action, data } = options;

    const params = new URLSearchParams({
      key: this.apiKey,
      method,
      sitekey: siteKey,
      pageurl: siteUrl,
      json: 1
    });

    if (action) params.append('action', action);
    if (data) params.append('data', data);

    const response = await fetch(`${this.apiUrl}/in.php?${params.toString()}`);

    if (!response.ok) {
      throw new CaptchaServiceError(`2Captcha 请求失败: HTTP ${response.status}`);
    }

    const data_result = await response.json();
    if (data_result.status !== 1) {
      throw new CaptchaServiceError(`2Captcha 创建任务失败: ${data_result.request}`);
    }

    return data_result.request; // 任务 ID
  }

  async getResponse(taskId, maxRetries = 30, initialDelay = 5000, retryDelay = 2000) {
    await sleep(initialDelay);

    for (let i = 0; i < maxRetries; i++) {
      try {
        const params = new URLSearchParams({
          key: this.apiKey,
          action: 'get',
          id: taskId,
          json: 1
        });

        const response = await fetch(`${this.apiUrl}/res.php?${params.toString()}`);

        if (!response.ok) {
          console.warn(`[2Captcha] 获取结果失败: HTTP ${response.status}`);
          await sleep(retryDelay);
          continue;
        }

        const data = await response.json();

        if (data.status === 1) {
          return data.request; // CAPTCHA token
        } else if (data.request === 'CAPCHA_NOT_READY') {
          await sleep(retryDelay);
        } else {
          console.error(`[2Captcha] 获取结果失败: ${data.request}`);
          return null;
        }
      } catch (error) {
        console.error(`[2Captcha] 获取响应异常: ${error.message}`);
        await sleep(retryDelay);
      }
    }

    return null;
  }
}

/**
 * CapSolver 服务商
 */
class CapSolverProvider extends CaptchaProvider {
  constructor(apiKey) {
    super();
    this.apiKey = apiKey;
    this.apiUrl = 'https://api.capsolver.com';
  }

  async createTask(siteUrl, siteKey, options = {}) {
    const { type = 'AntiTurnstileTaskProxyLess', metadata } = options;

    const payload = {
      clientKey: this.apiKey,
      task: {
        type,
        websiteURL: siteUrl,
        websiteKey: siteKey
      }
    };

    if (metadata) payload.task.metadata = metadata;

    const response = await fetch(`${this.apiUrl}/createTask`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new CaptchaServiceError(`CapSolver 请求失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    if (data.errorId !== 0) {
      throw new CaptchaServiceError(`CapSolver 创建任务失败: ${data.errorDescription}`);
    }

    return data.taskId;
  }

  async getResponse(taskId, maxRetries = 30, initialDelay = 5000, retryDelay = 2000) {
    await sleep(initialDelay);

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${this.apiUrl}/getTaskResult`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientKey: this.apiKey,
            taskId
          })
        });

        if (!response.ok) {
          console.warn(`[CapSolver] 获取结果失败: HTTP ${response.status}`);
          await sleep(retryDelay);
          continue;
        }

        const data = await response.json();

        if (data.errorId !== 0) {
          console.error(`[CapSolver] 获取结果失败: ${data.errorDescription}`);
          return null;
        }

        if (data.status === 'ready') {
          const token = data.solution?.token;
          if (token) {
            return token;
          } else {
            console.error('[CapSolver] 返回结果中没有 token');
            return null;
          }
        } else if (data.status === 'processing') {
          await sleep(retryDelay);
        } else {
          console.warn(`[CapSolver] 未知状态: ${data.status}`);
          await sleep(retryDelay);
        }
      } catch (error) {
        console.error(`[CapSolver] 获取响应异常: ${error.message}`);
        await sleep(retryDelay);
      }
    }

    return null;
  }
}

/**
 * 本地 Turnstile Solver
 */
class LocalSolverProvider extends CaptchaProvider {
  constructor(solverUrl = 'http://127.0.0.1:5072') {
    super();
    this.solverUrl = solverUrl;
  }

  async createTask(siteUrl, siteKey, options = {}) {
    const url = `${this.solverUrl}/turnstile?url=${encodeURIComponent(siteUrl)}&sitekey=${encodeURIComponent(siteKey)}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new CaptchaServiceError(`本地 Solver 请求失败: HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.taskId;
  }

  async getResponse(taskId, maxRetries = 30, initialDelay = 5000, retryDelay = 2000) {
    await sleep(initialDelay);

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(`${this.solverUrl}/result?id=${encodeURIComponent(taskId)}`);

        if (!response.ok) {
          console.warn(`[LocalSolver] 获取结果失败: HTTP ${response.status}`);
          await sleep(retryDelay);
          continue;
        }

        const data = await response.json();
        const captcha = data.solution?.token;

        if (captcha) {
          if (captcha !== 'CAPTCHA_FAIL') {
            return captcha;
          } else {
            console.error('[LocalSolver] CAPTCHA 解决失败');
            return null;
          }
        } else {
          await sleep(retryDelay);
        }
      } catch (error) {
        console.error(`[LocalSolver] 获取响应异常: ${error.message}`);
        await sleep(retryDelay);
      }
    }

    return null;
  }
}

/**
 * CAPTCHA 服务管理器
 */
class CaptchaService {
  /**
   * 初始化 CAPTCHA 服务
   * @param {Object} config - 配置对象
   * @param {string} config.provider - 服务商：'yescaptcha' | '2captcha' | 'capsolver' | 'local'
   * @param {string} config.apiKey - API 密钥（本地 Solver 不需要）
   * @param {string} config.solverUrl - 本地 Solver URL（仅本地模式需要）
   */
  constructor(config) {
    const { provider, apiKey, solverUrl } = config;

    if (!provider) {
      throw new Error('Missing required config: provider');
    }

    switch (provider.toLowerCase()) {
      case 'yescaptcha':
        if (!apiKey) throw new Error('YesCaptcha requires apiKey');
        this.provider = new YesCaptchaProvider(apiKey);
        break;

      case '2captcha':
        if (!apiKey) throw new Error('2Captcha requires apiKey');
        this.provider = new TwoCaptchaProvider(apiKey);
        break;

      case 'capsolver':
        if (!apiKey) throw new Error('CapSolver requires apiKey');
        this.provider = new CapSolverProvider(apiKey);
        break;

      case 'local':
        this.provider = new LocalSolverProvider(solverUrl);
        break;

      default:
        throw new Error(`Unknown provider: ${provider}`);
    }

    this.providerName = provider;
  }

  /**
   * 创建 CAPTCHA 任务
   * @param {string} siteUrl - 网站 URL
   * @param {string} siteKey - 网站密钥
   * @param {Object} options - 额外选项
   * @returns {Promise<string>} 任务 ID
   */
  async createTask(siteUrl, siteKey, options = {}) {
    console.log(`[CaptchaService] 使用 ${this.providerName} 创建任务: ${siteUrl}`);
    return await this.provider.createTask(siteUrl, siteKey, options);
  }

  /**
   * 获取 CAPTCHA 响应
   * @param {string} taskId - 任务 ID
   * @param {number} maxRetries - 最大重试次数
   * @param {number} initialDelay - 初始延迟（毫秒）
   * @param {number} retryDelay - 重试间隔（毫秒）
   * @returns {Promise<string|null>} CAPTCHA token
   */
  async getResponse(taskId, maxRetries = 30, initialDelay = 5000, retryDelay = 2000) {
    console.log(`[CaptchaService] 等待 ${this.providerName} 解决 CAPTCHA...`);
    return await this.provider.getResponse(taskId, maxRetries, initialDelay, retryDelay);
  }

  /**
   * 一键解决 CAPTCHA
   * @param {string} siteUrl - 网站 URL
   * @param {string} siteKey - 网站密钥
   * @param {Object} options - 额外选项
   * @returns {Promise<string|null>} CAPTCHA token
   */
  async solve(siteUrl, siteKey, options = {}) {
    console.log(`[CaptchaService] 使用 ${this.providerName} 解决 CAPTCHA`);
    return await this.provider.solve(siteUrl, siteKey, options);
  }
}

export {
  CaptchaService,
  CaptchaServiceError,
  YesCaptchaProvider,
  TwoCaptchaProvider,
  CapSolverProvider,
  LocalSolverProvider
};
