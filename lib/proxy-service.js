/**
 * 代理服务 - 支持代理池轮换
 * 用于降低 AWS 封禁风险
 */

/**
 * 代理服务类
 */
class ProxyService {
  constructor() {
    this.enabled = false;
    this.proxyList = [];
    this.currentIndex = 0;
    this.rotateMode = 'sequential'; // sequential | random
    this.originalSettings = null;
  }

  /**
   * 初始化代理服务
   * @param {Object} config - 配置对象
   * @param {boolean} config.enabled - 是否启用代理
   * @param {string} config.proxyList - 代理列表（每行一个）
   * @param {string} config.rotateMode - 轮换模式: sequential | random
   */
  init(config) {
    this.enabled = config.enabled || false;
    this.rotateMode = config.rotateMode || 'sequential';
    this.currentIndex = 0;

    // 解析代理列表
    if (config.proxyList) {
      this.proxyList = this._parseProxyList(config.proxyList);
      console.log(`[ProxyService] 加载 ${this.proxyList.length} 个代理`);
    }
  }

  /**
   * 解析代理列表
   * 支持格式:
   *   - host:port
   *   - host:port:username:password
   *   - http://host:port
   *   - http://username:password@host:port
   *   - socks5://host:port
   */
  _parseProxyList(text) {
    const lines = text.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
    const proxies = [];

    for (const line of lines) {
      const proxy = this._parseProxyLine(line);
      if (proxy) {
        proxies.push(proxy);
      }
    }

    return proxies;
  }

  /**
   * 解析单行代理配置
   */
  _parseProxyLine(line) {
    try {
      let scheme = 'http';
      let host, port, username, password;

      // 检查协议前缀
      if (line.startsWith('socks5://')) {
        scheme = 'socks5';
        line = line.substring(9);
      } else if (line.startsWith('socks4://')) {
        scheme = 'socks4';
        line = line.substring(9);
      } else if (line.startsWith('http://')) {
        scheme = 'http';
        line = line.substring(7);
      } else if (line.startsWith('https://')) {
        scheme = 'https';
        line = line.substring(8);
      }

      // 检查认证信息
      if (line.includes('@')) {
        const [auth, hostPart] = line.split('@');
        [username, password] = auth.split(':');
        line = hostPart;
      }

      // 解析 host:port 或 host:port:username:password
      const parts = line.split(':');
      if (parts.length >= 2) {
        host = parts[0];
        port = parseInt(parts[1]);

        if (parts.length >= 4 && !username) {
          username = parts[2];
          password = parts[3];
        }
      }

      if (host && port) {
        return { scheme, host, port, username, password };
      }
    } catch (e) {
      console.warn(`[ProxyService] 无法解析代理: ${line}`, e);
    }

    return null;
  }

  /**
   * 获取下一个代理
   */
  getNextProxy() {
    if (!this.enabled || this.proxyList.length === 0) {
      return null;
    }

    let proxy;
    if (this.rotateMode === 'random') {
      const index = Math.floor(Math.random() * this.proxyList.length);
      proxy = this.proxyList[index];
    } else {
      proxy = this.proxyList[this.currentIndex];
      this.currentIndex = (this.currentIndex + 1) % this.proxyList.length;
    }

    console.log(`[ProxyService] 使用代理: ${proxy.host}:${proxy.port}`);
    return proxy;
  }

  /**
   * 应用代理设置
   * @param {Object} proxy - 代理配置
   */
  async applyProxy(proxy) {
    if (!proxy) {
      await this.clearProxy();
      return;
    }

    // 保存原始设置
    if (!this.originalSettings) {
      this.originalSettings = await this._getCurrentSettings();
    }

    const config = {
      mode: 'fixed_servers',
      rules: {
        singleProxy: {
          scheme: proxy.scheme === 'socks5' ? 'socks5' : 'http',
          host: proxy.host,
          port: proxy.port
        },
        bypassList: ['localhost', '127.0.0.1']
      }
    };

    try {
      await chrome.proxy.settings.set({
        value: config,
        scope: 'regular'
      });

      console.log(`[ProxyService] 代理已应用: ${proxy.scheme}://${proxy.host}:${proxy.port}`);

      // 如果有认证信息，设置认证处理
      if (proxy.username && proxy.password) {
        this._setupAuthHandler(proxy);
      }

      return true;
    } catch (e) {
      console.error('[ProxyService] 设置代理失败:', e);
      return false;
    }
  }

  /**
   * 设置代理认证处理
   */
  _setupAuthHandler(proxy) {
    // 移除旧的监听器
    if (this._authHandler) {
      chrome.webRequest.onAuthRequired.removeListener(this._authHandler);
    }

    this._authHandler = (details, callback) => {
      if (details.isProxy) {
        callback({
          authCredentials: {
            username: proxy.username,
            password: proxy.password
          }
        });
      } else {
        callback({});
      }
    };

    // 注意: Manifest V3 中 webRequest 需要额外权限
    // 如果不可用，代理认证可能不工作
    try {
      chrome.webRequest.onAuthRequired.addListener(
        this._authHandler,
        { urls: ['<all_urls>'] },
        ['asyncBlocking']
      );
    } catch (e) {
      console.warn('[ProxyService] 无法设置代理认证监听器:', e);
    }
  }

  /**
   * 清除代理设置
   */
  async clearProxy() {
    try {
      if (this.originalSettings) {
        await chrome.proxy.settings.set({
          value: this.originalSettings,
          scope: 'regular'
        });
        this.originalSettings = null;
      } else {
        await chrome.proxy.settings.clear({ scope: 'regular' });
      }

      if (this._authHandler) {
        try {
          chrome.webRequest.onAuthRequired.removeListener(this._authHandler);
        } catch (e) {}
        this._authHandler = null;
      }

      console.log('[ProxyService] 代理已清除');
      return true;
    } catch (e) {
      console.error('[ProxyService] 清除代理失败:', e);
      return false;
    }
  }

  /**
   * 获取当前代理设置
   */
  async _getCurrentSettings() {
    return new Promise((resolve) => {
      chrome.proxy.settings.get({ incognito: false }, (details) => {
        resolve(details.value);
      });
    });
  }

  /**
   * 获取代理统计信息
   */
  getStats() {
    return {
      enabled: this.enabled,
      totalProxies: this.proxyList.length,
      currentIndex: this.currentIndex,
      rotateMode: this.rotateMode
    };
  }
}

// 导出单例
const proxyService = new ProxyService();

export { ProxyService, proxyService };
