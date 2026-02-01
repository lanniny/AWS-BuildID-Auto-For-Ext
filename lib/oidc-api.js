/**
 * AWS OIDC 设备认证 - 直接调用 AWS API
 */

import { generateUUID } from './utils.js';

const OIDC_BASE_URL = 'https://oidc.us-east-1.amazonaws.com';

/**
 * 获取 OIDC 请求头（模拟 AWS SDK）
 * @returns {Object} 请求头对象
 */
function getOidcHeaders() {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'aws-sdk-rust/1.3.9 os/windows lang/rust/1.87.0',
    'x-amz-user-agent': 'aws-sdk-rust/1.3.9 ua/2.1 api/ssooidc/1.88.0 os/windows lang/rust/1.87.0 m/E app/AmazonQ-For-CLI',
    'amz-sdk-request': 'attempt=1; max=3',
    'amz-sdk-invocation-id': generateUUID()
  };
}

/**
 * AWS OIDC 设备认证客户端
 */
class AWSDeviceAuth {
  constructor() {
    // 认证信息
    this.clientId = '';
    this.clientSecret = '';
    this.deviceCode = '';
    this.userCode = '';
    this.verificationUri = '';
    this.verificationUriComplete = '';
    this.expiresIn = 0;
    this.interval = 1;
  }

  /**
   * 步骤 1: 注册客户端
   * @returns {Promise<Object>} 包含 clientId, clientSecret 的对象
   */
  async registerClient() {
    const payload = {
      clientName: 'Amazon Q Developer for command line',
      clientType: 'public',
      scopes: [
        'codewhisperer:completions',
        'codewhisperer:analysis',
        'codewhisperer:conversations'
      ],
      grantTypes: [
        'urn:ietf:params:oauth:grant-type:device_code',
        'refresh_token'
      ],
      issuerUrl: 'https://identitycenter.amazonaws.com/ssoins-722374e5d5e7e3e0'
    };

    const response = await fetch(`${OIDC_BASE_URL}/client/register`, {
      method: 'POST',
      headers: getOidcHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`注册客户端失败: ${error}`);
    }

    const data = await response.json();
    this.clientId = data.clientId;
    this.clientSecret = data.clientSecret;
    return data;
  }

  /**
   * 步骤 2: 设备授权
   * @returns {Promise<Object>} 包含 deviceCode, userCode, verificationUri 等的对象
   */
  async deviceAuthorize() {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('请先调用 registerClient()');
    }

    const payload = {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      startUrl: 'https://view.awsapps.com/start'
    };

    const response = await fetch(`${OIDC_BASE_URL}/device_authorization`, {
      method: 'POST',
      headers: getOidcHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`设备授权失败: ${error}`);
    }

    const data = await response.json();
    this.deviceCode = data.deviceCode;
    this.userCode = data.userCode;
    this.verificationUri = data.verificationUri;
    this.verificationUriComplete = data.verificationUriComplete;
    this.expiresIn = data.expiresIn || 600;
    this.interval = data.interval || 1;
    return data;
  }

  /**
   * 一键授权：注册客户端 + 设备授权
   * @returns {Promise<Object>} 完整的认证信息
   */
  async quickAuth() {
    await this.registerClient();
    await this.deviceAuthorize();
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      deviceCode: this.deviceCode,
      userCode: this.userCode,
      verificationUri: this.verificationUri,
      verificationUriComplete: this.verificationUriComplete,
      expiresIn: this.expiresIn,
      interval: this.interval
    };
  }

  /**
   * 步骤 3: 获取 Token（单次尝试）
   * @returns {Promise<Object|null>} Token 信息或 null（待授权）
   */
  async getToken() {
    if (!this.deviceCode) {
      throw new Error('请先调用 deviceAuthorize()');
    }

    const payload = {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      deviceCode: this.deviceCode,
      grantType: 'urn:ietf:params:oauth:grant-type:device_code'
    };

    const response = await fetch(`${OIDC_BASE_URL}/token`, {
      method: 'POST',
      headers: getOidcHeaders(),
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.ok) {
      return {
        accessToken: data.accessToken,
        refreshToken: data.refreshToken,
        expiresIn: data.expiresIn,
        tokenType: data.tokenType
      };
    }

    // 检查是否是待授权状态
    const error = data.error || '';
    if (error === 'authorization_pending') {
      return null; // 继续轮询
    }

    // 其他错误
    throw new Error(`获取 Token 失败: ${error} - ${data.error_description || ''}`);
  }

  /**
   * 轮询获取 Token
   * @param {number} timeout - 超时时间（毫秒），默认600000
   * @param {number} interval - 轮询间隔（毫秒），可选
   * @returns {Promise<Object>} Token 信息
   */
  async pollToken(timeout = 600000, interval = null) {
    const pollInterval = interval || Math.max(this.interval * 1000, 1000);
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      const result = await this.getToken();
      if (result) {
        return result;
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    throw new Error(`获取 Token 超时（${timeout / 1000}s）`);
  }

  /**
   * 刷新 Token
   * @param {string} refreshToken - 刷新令牌
   * @returns {Promise<Object>} 新的 Token 信息
   */
  async refreshToken(refreshToken) {
    const payload = {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      refreshToken: refreshToken,
      grantType: 'refresh_token'
    };

    const response = await fetch(`${OIDC_BASE_URL}/token`, {
      method: 'POST',
      headers: getOidcHeaders(),
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`刷新 Token 失败: ${error}`);
    }

    const data = await response.json();
    return {
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
      tokenType: data.tokenType
    };
  }

  /**
   * 获取当前认证信息
   * @returns {Object} 认证信息
   */
  getAuthInfo() {
    return {
      clientId: this.clientId,
      clientSecret: this.clientSecret,
      deviceCode: this.deviceCode,
      userCode: this.userCode,
      verificationUri: this.verificationUri,
      verificationUriComplete: this.verificationUriComplete,
      expiresIn: this.expiresIn,
      interval: this.interval
    };
  }

  /**
   * 从保存的数据恢复状态
   * @param {Object} data - 保存的认证信息
   */
  restore(data) {
    this.clientId = data.clientId || '';
    this.clientSecret = data.clientSecret || '';
    this.deviceCode = data.deviceCode || '';
    this.userCode = data.userCode || '';
    this.verificationUri = data.verificationUri || '';
    this.verificationUriComplete = data.verificationUriComplete || '';
    this.expiresIn = data.expiresIn || 0;
    this.interval = data.interval || 1;
  }
}

/**
 * 验证 Token 是否有效（检测封禁状态）
 * @param {string} accessToken - Access Token
 * @returns {Promise<Object>} { status: string, error?: string, usage?: Object }
 * status: 'valid' | 'suspended' | 'expired' | 'invalid' | 'error'
 */
async function validateToken(accessToken) {
  const Q_BASE_URL = 'https://q.us-east-1.amazonaws.com';

  try {
    const response = await fetch(`${Q_BASE_URL}/getUsageLimits?origin=AI_EDITOR&resourceType=AGENTIC_REQUEST`, {
      method: 'GET',
      headers: {
        'content-type': 'application/x-amz-json-1.0',
        'x-amz-target': 'AmazonCodeWhispererStreamingService.GenerateAssistantResponse',
        'user-agent': 'aws-sdk-rust/1.3.9 ua/2.1 api/codewhispererstreaming/0.1.11582 os/windows lang/rust/1.87.0 md/appVersion-1.19.4 app/AmazonQ-For-CLI',
        'x-amz-user-agent': 'aws-sdk-rust/1.3.9 ua/2.1 api/codewhispererstreaming/0.1.11582 os/windows lang/rust/1.87.0 m/F app/AmazonQ-For-CLI',
        'x-amzn-codewhisperer-optout': 'false',
        'authorization': `Bearer ${accessToken}`,
        'amz-sdk-request': 'attempt=1; max=3',
        'amz-sdk-invocation-id': generateUUID()
      }
    });

    const text = await response.text();

    // 检查是否被临时封禁
    if (text.includes('TEMPORARILY_SUSPENDED')) {
      return {
        status: 'suspended',
        error: 'Account temporarily suspended'
      };
    }

    // 检查 Token 过期
    if (response.status === 401 ||
        text.includes('ExpiredToken') ||
        text.includes('expired') ||
        text.includes('UnauthorizedException')) {
      return {
        status: 'expired',
        error: 'Token expired or unauthorized'
      };
    }

    // 检查账号被禁用/删除
    if (text.includes('AccessDeniedException') ||
        text.includes('ValidationException') ||
        text.includes('ResourceNotFoundException')) {
      return {
        status: 'invalid',
        error: `Account error: ${text.substring(0, 100)}`
      };
    }

    // 成功
    if (response.ok) {
      try {
        const data = JSON.parse(text);
        return {
          status: 'valid',
          usage: data
        };
      } catch {
        return {
          status: 'valid'
        };
      }
    }

    // 其他 HTTP 错误
    if (response.status === 403) {
      return {
        status: 'invalid',
        error: 'Access forbidden'
      };
    }

    if (response.status >= 500) {
      return {
        status: 'error',
        error: `Server error: ${response.status}`
      };
    }

    // 其他未知错误
    return {
      status: 'invalid',
      error: `HTTP ${response.status}: ${text.substring(0, 100)}`
    };

  } catch (error) {
    return {
      status: 'error',
      error: `Network error: ${error.message}`
    };
  }
}

/**
 * 刷新 Token 并验证（推荐使用）
 * @param {Object} tokenData - Token 数据 { clientId, clientSecret, refreshToken }
 * @returns {Promise<Object>} { status: string, newAccessToken?: string, newRefreshToken?: string, error?: string }
 */
async function refreshAndValidateToken(tokenData) {
  const { clientId, clientSecret, refreshToken } = tokenData;

  if (!clientId || !clientSecret || !refreshToken) {
    return {
      status: 'invalid',
      error: 'Missing required fields: clientId, clientSecret, or refreshToken'
    };
  }

  try {
    // 步骤 1: 刷新 Token
    const payload = {
      clientId,
      clientSecret,
      refreshToken,
      grantType: 'refresh_token'
    };

    const refreshResponse = await fetch(`${OIDC_BASE_URL}/token`, {
      method: 'POST',
      headers: getOidcHeaders(),
      body: JSON.stringify(payload)
    });

    if (!refreshResponse.ok) {
      const errorText = await refreshResponse.text();
      
      // 检查是否是 refresh token 过期或无效
      if (errorText.includes('invalid_grant') || errorText.includes('InvalidGrantException')) {
        return {
          status: 'expired',
          error: 'Refresh token expired or invalid'
        };
      }

      return {
        status: 'error',
        error: `Refresh failed: ${errorText.substring(0, 100)}`
      };
    }

    const refreshData = await refreshResponse.json();
    const newAccessToken = refreshData.accessToken;
    const newRefreshToken = refreshData.refreshToken;

    // 步骤 2: 验证新的 Access Token
    const validateResult = await validateToken(newAccessToken);

    return {
      ...validateResult,
      newAccessToken,
      newRefreshToken
    };

  } catch (error) {
    return {
      status: 'error',
      error: `Refresh and validate error: ${error.message}`
    };
  }
}

export { AWSDeviceAuth, OIDC_BASE_URL, getOidcHeaders, validateToken, refreshAndValidateToken };
