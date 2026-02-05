/**
 * Content Script - 页面自动化
 * 持续检测页面类型并自动填写表单
 * 包含右上角实时进度 Toast
 */

(function() {
  'use strict';

  console.log('[Content Script] 已加载，当前 URL:', window.location.href);

  // ============== Toast 通知系统 ==============
  let toastContainer = null;
  let toastContent = null;
  let toastVisible = false;
  let hideTimeout = null;

  /**
   * 创建 Toast 容器
   */
  function createToast() {
    if (toastContainer) return;

    // 创建样式
    const style = document.createElement('style');
    style.textContent = `
      #aws-reg-toast {
        position: fixed;
        top: 16px;
        right: 16px;
        z-index: 2147483647;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 13px;
        pointer-events: none;
        transition: opacity 0.3s, transform 0.3s;
        opacity: 0;
        transform: translateX(100%);
      }
      #aws-reg-toast.visible {
        opacity: 1;
        transform: translateX(0);
      }
      #aws-reg-toast-inner {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 12px 16px;
        background: linear-gradient(135deg, #232f3e 0%, #1a242f 100%);
        color: #fff;
        border-radius: 10px;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 153, 0, 0.3);
        min-width: 200px;
        max-width: 350px;
      }
      #aws-reg-toast-icon {
        width: 24px;
        height: 24px;
        flex-shrink: 0;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      #aws-reg-toast-icon svg {
        width: 100%;
        height: 100%;
      }
      #aws-reg-toast-icon.spinning svg {
        animation: aws-toast-spin 1.2s linear infinite;
      }
      @keyframes aws-toast-spin {
        from { transform: rotate(0deg); }
        to { transform: rotate(360deg); }
      }
      #aws-reg-toast-text {
        flex: 1;
        line-height: 1.4;
      }
      #aws-reg-toast-title {
        font-weight: 600;
        font-size: 12px;
        color: #ff9900;
        margin-bottom: 2px;
      }
      #aws-reg-toast-step {
        color: rgba(255, 255, 255, 0.9);
        font-size: 12px;
        word-break: break-word;
      }
      #aws-reg-toast-counter {
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
        margin-top: 4px;
      }
      #aws-reg-toast.success #aws-reg-toast-inner {
        background: linear-gradient(135deg, #1d4e2c 0%, #143d22 100%);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(82, 196, 26, 0.3);
      }
      #aws-reg-toast.success #aws-reg-toast-title {
        color: #52c41a;
      }
      #aws-reg-toast.error #aws-reg-toast-inner {
        background: linear-gradient(135deg, #4e1d1d 0%, #3d1414 100%);
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(245, 34, 45, 0.3);
      }
      #aws-reg-toast.error #aws-reg-toast-title {
        color: #f5222d;
      }
    `;
    document.head.appendChild(style);

    // 创建 Toast 容器
    toastContainer = document.createElement('div');
    toastContainer.id = 'aws-reg-toast';
    toastContainer.innerHTML = `
      <div id="aws-reg-toast-inner">
        <div id="aws-reg-toast-icon" class="spinning">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ff9900" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.3"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="#ff9900"/>
          </svg>
        </div>
        <div id="aws-reg-toast-text">
          <div id="aws-reg-toast-title">AWS 自动注册</div>
          <div id="aws-reg-toast-step">准备中...</div>
          <div id="aws-reg-toast-counter" style="display: none;"></div>
        </div>
      </div>
    `;
    document.body.appendChild(toastContainer);
    toastContent = {
      title: document.getElementById('aws-reg-toast-title'),
      step: document.getElementById('aws-reg-toast-step'),
      counter: document.getElementById('aws-reg-toast-counter'),
      icon: document.getElementById('aws-reg-toast-icon')
    };
  }

  /**
   * 显示 Toast
   */
  function showToast(state) {
    if (!toastContainer) createToast();
    if (!state) return;

    // 清除隐藏定时器
    if (hideTimeout) {
      clearTimeout(hideTimeout);
      hideTimeout = null;
    }

    // 更新内容
    const step = state.step || state.status || '处理中...';
    toastContent.step.textContent = step;

    // 更新计数器 - 支持新的状态格式
    if (state.totalTarget > 1) {
      toastContent.counter.style.display = 'block';
      toastContent.counter.textContent = `进度: ${state.totalRegistered}/${state.totalTarget}`;
    } else if (state.loopMode && state.loopCount > 0) {
      // 兼容旧格式
      toastContent.counter.style.display = 'block';
      toastContent.counter.textContent = `已注册: ${state.totalRegistered} / 第 ${state.loopCount} 次`;
    } else {
      toastContent.counter.style.display = 'none';
    }

    // 更新状态样式
    toastContainer.classList.remove('success', 'error');
    toastContent.icon.classList.remove('spinning');

    if (state.status === 'completed') {
      toastContainer.classList.add('success');
      toastContent.title.textContent = '注册成功';
      toastContent.icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#52c41a" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M8 12l3 3 5-6"/>
        </svg>
      `;
      // 成功后 5 秒自动隐藏
      hideTimeout = setTimeout(() => hideToast(), 5000);
    } else if (state.status === 'error') {
      toastContainer.classList.add('error');
      toastContent.title.textContent = '注册失败';
      toastContent.step.textContent = state.error || '未知错误';
      toastContent.icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#f5222d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M15 9l-6 6M9 9l6 6"/>
        </svg>
      `;
      // 错误后 8 秒自动隐藏
      hideTimeout = setTimeout(() => hideToast(), 8000);
    } else if (state.status === 'idle') {
      // idle 状态不显示 toast
      hideToast();
      return;
    } else {
      // 进行中状态 (running, polling_token, initializing 等)
      const isMultiWindow = state.totalTarget > 1 || (state.sessions && state.sessions.length > 1);
      toastContent.title.textContent = isMultiWindow ? '批量注册中' : 'AWS 自动注册';
      toastContent.icon.classList.add('spinning');
      toastContent.icon.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="#ff9900" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <circle cx="12" cy="12" r="10" stroke-opacity="0.3"/>
          <path d="M12 2a10 10 0 0 1 10 10"/>
        </svg>
      `;
    }

    // 显示
    toastContainer.classList.add('visible');
    toastVisible = true;
  }

  /**
   * 隐藏 Toast
   */
  function hideToast() {
    if (toastContainer) {
      toastContainer.classList.remove('visible');
      toastVisible = false;
    }
  }

  /**
   * 监听状态更新
   */
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'STATE_UPDATE') {
      console.log('[Content Script] 收到状态更新:', message.state);
      showToast(message.state);
    }
  });

  // 初始化时获取当前状态并显示 Toast
  async function initToast() {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
      if (response?.state && response.state.status !== 'idle') {
        showToast(response.state);
      }
    } catch (e) {
      // 忽略错误
    }
  }

  // ============== 页面自动化逻辑 ==============

  // 页面类型
  const PAGE_TYPES = {
    LOGIN: 'login',
    NAME: 'name',
    VERIFY: 'verify',
    PASSWORD: 'password',
    DEVICE_CONFIRM: 'device_confirm',
    ALLOW_ACCESS: 'allow_access',
    COMPLETE: 'complete',
    UNKNOWN: 'unknown'
  };

  // 状态
  let isProcessing = false;
  let accountInfo = null;
  let verificationCode = null;
  let processedPages = new Set(); // 已处理的页面标识
  let pollInterval = null;

  /**
   * 延迟函数
   */
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 查找元素（支持多个选择器）
   */
  function $(selectors) {
    const list = selectors.split(',').map(s => s.trim());
    for (const sel of list) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  /**
   * 等待元素出现
   */
  async function waitFor(selectors, timeout = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      const el = $(selectors);
      if (el) return el;
      await sleep(100);
    }
    throw new Error(`等待元素超时: ${selectors}`);
  }

  /**
   * 更新步骤到 Service Worker 和本地 Toast
   */
  function updateStep(step) {
    console.log('[Content Script]', step);
    chrome.runtime.sendMessage({ type: 'UPDATE_STEP', step }).catch(() => {});
    // 同时更新本地 Toast
    showToast({ step, status: 'initializing' });
  }

  /**
   * 报告错误
   */
  function reportError(error) {
    console.error('[Content Script] 错误:', error);
    chrome.runtime.sendMessage({ type: 'REPORT_ERROR', error }).catch(() => {});
  }

  /**
   * 获取账号信息（带重试和详细日志）
   */
  async function getAccountInfo() {
    if (accountInfo && accountInfo.email) {
      return accountInfo;
    }

    console.log('[Content Script] 开始获取账号信息...');

    for (let i = 0; i < 10; i++) {
      try {
        const response = await chrome.runtime.sendMessage({ type: 'GET_ACCOUNT_INFO' });
        if (response && response.email) {
          accountInfo = response;
          console.log('[Content Script] 获取到账号信息:', accountInfo.email);
          return accountInfo;
        } else {
          console.log(`[Content Script] 第 ${i + 1} 次尝试: 未获取到账号信息`);
        }
      } catch (e) {
        console.log(`[Content Script] 第 ${i + 1} 次尝试失败:`, e.message);
      }
      await sleep(300);
    }

    console.warn('[Content Script] 多次尝试后仍未获取到账号信息');
    return null;
  }

  /**
   * 获取验证码（自动或手动）
   */
  async function getVerificationCode() {
    if (verificationCode) {
      return verificationCode;
    }

    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_VERIFICATION_CODE' });
      if (response && response.success) {
        verificationCode = response.code;
        console.log('[Content Script] 获取到验证码:', verificationCode);
        updateStep('验证码已自动获取');
        return verificationCode;
      }

      // Gmail 别名模式，需要用户手动输入
      if (response && response.needManualInput) {
        console.log('[Content Script] Gmail 别名模式，等待用户手动输��验证码');
        updateStep('请手动填写验证码（从 Gmail 收件箱获取）');
        return null; // 返回 null 表示需要手动输入
      }

      // 临时邮箱模式，自动获取失败
      if (response && !response.success) {
        console.error('[Content Script] 自动获取验证码失败:', response.error);
        updateStep(`验证码获取失败: ${response.error}`);
        return null;
      }
    } catch (e) {
      console.error('[Content Script] 获取验证码失败:', e);
    }
    return null;
  }

  /**
   * 快速填充输入框（最高效方案）
   */
  function fastFill(el, text) {
    // 聚焦
    el.focus();
    
    // 直接设置值
    const nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    nativeInputValueSetter.call(el, text);
    
    // 触发所有必要的事件
    const events = [
      new Event('input', { bubbles: true, cancelable: true }),
      new Event('change', { bubbles: true, cancelable: true }),
      new Event('blur', { bubbles: true, cancelable: true })
    ];
    
    events.forEach(event => el.dispatchEvent(event));
  }

  /**
   * 快速点击按钮
   */
  function fastClick(btn) {
    if (!btn) return false;
    
    // 确保按钮可见且可点击
    if (btn.offsetParent === null || btn.disabled) {
      return false;
    }
    
    // 触发点击
    btn.click();
    return true;
  }

  /**
   * 检测当前页面类型
   */
  function detectPageType() {
    const url = window.location.href;
    const host = window.location.hostname;
    const text = document.body?.innerText || '';

    console.log('[Content Script] 检测页面 - URL:', url, 'Host:', host);

    // 完成页面
    if (text.includes('successfully authorized') || text.includes('Authorization complete') || text.includes('You have been successfully authorized')) {
      return PAGE_TYPES.COMPLETE;
    }

    // 授权页 - Allow access 按钮（优先检测，因为可能在 awsapps.com 域名下）
    const allowBtn = $('button#cli_login_button, button[data-testid="allow-access-button"], input[type="submit"][value*="Allow"]');
    if (allowBtn && allowBtn.offsetParent !== null) {
      return PAGE_TYPES.ALLOW_ACCESS;
    }
    // 也检查页面文本
    if ((text.includes('Allow access') || text.includes('allow access')) && host.includes('awsapps.com')) {
      return PAGE_TYPES.ALLOW_ACCESS;
    }

    // 设备确认页 - 检查按钮
    const confirmBtn = $('button#cli_verification_btn, button[data-testid="confirm-device-button"]');
    if (confirmBtn && confirmBtn.offsetParent !== null) {
      return PAGE_TYPES.DEVICE_CONFIRM;
    }
    // 也检查页面文本
    if (text.includes('Confirm and continue') || text.includes('confirm this code')) {
      return PAGE_TYPES.DEVICE_CONFIRM;
    }

    // 验证码页
    if (url.includes('verify-otp') || url.includes('verification') || url.includes('verifyEmail')) {
      return PAGE_TYPES.VERIFY;
    }

    // 姓名页
    if (url.includes('enter-email') || url.includes('signup/enter') || url.includes('createAccount')) {
      return PAGE_TYPES.NAME;
    }

    // 密码页
    const pwdInput = $('input[placeholder="Enter password"], input[name="password"], input[type="password"][autocomplete="new-password"]');
    const confirmPwdInput = $('input[placeholder="Re-enter password"], input[name="confirmPassword"], input[type="password"][autocomplete="new-password"]:nth-of-type(2)');
    if (pwdInput && confirmPwdInput) {
      return PAGE_TYPES.PASSWORD;
    }

    // 登录页 - 支持多种选择器
    const emailInput = $('input[placeholder="username@example.com"], input[name="email"], input[type="email"], input[autocomplete="username"]');
    if (emailInput) {
      return PAGE_TYPES.LOGIN;
    }

    return PAGE_TYPES.UNKNOWN;
  }

  /**
   * 生成页面标识（用于避免重复处理）
   */
  function getPageId() {
    const type = detectPageType();
    // 包含 hash，因为 AWS 用 SPA 路由
    const url = window.location.href.split('?')[0] + window.location.hash;
    return `${type}:${url}`;
  }

  /**
   * 处理 Cookie 弹窗
   */
  function handleCookiePopup() {
    const btn = $('button[data-id="awsccc-cb-btn-accept"]');
    if (btn) {
      btn.click();
      console.log('[Content Script] 已关闭 Cookie 弹窗');
    }
  }

  /**
   * 处理登录页
   */
  async function handleLoginPage() {
    updateStep('填写邮箱...');

    const info = await getAccountInfo();
    if (!info?.email) {
      reportError('无法获取邮箱信息');
      return false;
    }

    const emailInput = $('input[placeholder="username@example.com"], input[name="email"], input[type="email"], input[autocomplete="username"]');
    if (!emailInput) {
      console.log('[Content Script] 找不到邮箱输入框');
      return false;
    }

    fastFill(emailInput, info.email);
    await sleep(200);

    updateStep('点击继续...');
    const btn = $('button[data-testid="test-primary-button"], button[type="submit"], button.awsui-button-variant-primary');
    if (btn) fastClick(btn);

    return true;
  }

  /**
   * 处理姓名页
   */
  async function handleNamePage() {
    updateStep('填写姓名...');

    const info = await getAccountInfo();
    if (!info?.fullName) {
      reportError('无法获取姓名信息');
      return false;
    }

    const nameInput = $('input[placeholder="Maria José Silva"], input[placeholder*="name" i], input[name="name"], input[name="fullName"]');
    if (!nameInput) {
      console.log('[Content Script] 找不到姓名输入框');
      return false;
    }

    fastFill(nameInput, info.fullName);
    await sleep(200);

    updateStep('点击继续...');
    const btn = $('button[data-testid="signup-next-button"], button[type="submit"], button.awsui-button-variant-primary');
    if (btn) fastClick(btn);

    return true;
  }

  /**
   * 处理验证码页（Gmail 别名模式 - 用户手动输入）
   */
  async function handleVerifyPage() {
    updateStep('请手动填写验证码');

    const code = await getVerificationCode();
    
    // Gmail 别名模式下，code 为 null，需要用户手动输入
    if (!code) {
      // 显示提示，等待用户手动输入
      updateStep('📧 请从 Gmail 收件箱获取验证码并手动填写');
      
      // 不自动填写，让用户手动输入
      // 但仍然标记这个页面已经被处理过（避免重复提示）
      console.log('[Content Script] Gmail 别名模式，等待用户手动输入验证码');
      
      // 返回 true 表示已处理（提示用户），避免重复处理
      // 用户手动填写后会自动点击按钮或按 Enter
      return true;
    }

    // 如果有验证码（从其他来源获取），则自动填写
    updateStep(`填写验证码: ${code}`);
    const codeInput = $('input[placeholder*="位数"], input[placeholder*="digit" i], input[type="text"][maxlength="6"], input[name="code"], input[name="otp"]');
    if (!codeInput) {
      console.log('[Content Script] 找不到验证码输入框');
      return false;
    }

    fastFill(codeInput, code);
    await sleep(200);

    updateStep('点击验证...');
    const btn = $('button[data-testid="email-verification-verify-button"], button[type="submit"], button.awsui-button-variant-primary');
    if (btn) fastClick(btn);

    return true;
  }

  /**
   * 处理密码页
   */
  async function handlePasswordPage() {
    updateStep('填写密码...');

    const info = await getAccountInfo();
    if (!info?.password) {
      reportError('无法获取密码信息');
      return false;
    }

    const pwdInput = $('input[placeholder="Enter password"], input[name="password"], input[type="password"]:not([name="confirmPassword"])');
    const confirmInput = $('input[placeholder="Re-enter password"], input[name="confirmPassword"]');

    if (!pwdInput) {
      console.log('[Content Script] 找不到密码输入框');
      return false;
    }

    fastFill(pwdInput, info.password);
    
    if (confirmInput) {
      await sleep(100);
      fastFill(confirmInput, info.password);
    }
    
    await sleep(200);

    updateStep('点击继续...');
    const btn = $('button[data-testid="test-primary-button"], button[type="submit"], button.awsui-button-variant-primary');
    if (btn) fastClick(btn);

    return true;
  }

  /**
   * 处理设备确认页
   */
  async function handleDeviceConfirmPage() {
    updateStep('点击确认设备...');
    await sleep(300);

    // 尝试多种选择器
    const btn = $('button#cli_verification_btn, button[data-testid="confirm-device-button"], button[type="submit"]');
    if (btn && fastClick(btn)) {
      updateStep('已确认设备，等待授权页...');
      return true;
    }

    // 如果找不到按钮，尝试查找所有包含 "Confirm" 文字的按钮
    const buttons = document.querySelectorAll('button');
    for (const b of buttons) {
      if (b.textContent.includes('Confirm') && fastClick(b)) {
        updateStep('已确认设备，等待授权页...');
        return true;
      }
    }

    console.log('[Content Script] 找不到确认按钮');
    return false;
  }

  /**
   * 处理授权页
   */
  async function handleAllowAccessPage() {
    updateStep('点击允许访问...');
    await sleep(300);

    // 尝试多种选择器
    const btn = $('button#cli_login_button, button[data-testid="allow-access-button"], input[type="submit"][value*="Allow"]');
    if (btn && fastClick(btn)) {
      updateStep('已允许访问，等待完成...');
      chrome.runtime.sendMessage({ type: 'AUTH_COMPLETED' }).catch(() => {});
      return true;
    }

    // 如果找不到按钮，尝试查找所有包含 "Allow" 文字的按钮
    const buttons = document.querySelectorAll('button, input[type="submit"]');
    for (const b of buttons) {
      const text = b.textContent || b.value || '';
      if (text.includes('Allow') && fastClick(b)) {
        updateStep('已允许访问，等待完成...');
        chrome.runtime.sendMessage({ type: 'AUTH_COMPLETED' }).catch(() => {});
        return true;
      }
    }

    console.log('[Content Script] 找不到允许按钮');
    return false;
  }

  /**
   * 处理完成页
   */
  function handleCompletePage() {
    updateStep('授权完成！');
    chrome.runtime.sendMessage({ type: 'AUTH_COMPLETED' }).catch(() => {});
    return true;
  }

  /**
   * 主处理函数
   */
  async function processPage() {
    if (isProcessing) return;

    // 检查是否有正在进行的注册
    const info = await getAccountInfo();
    if (!info?.email) {
      console.log('[Content Script] 没有注册任务，跳过');
      return;
    }

    const pageId = getPageId();
    if (processedPages.has(pageId)) {
      return; // 已处理过
    }

    isProcessing = true;
    handleCookiePopup();

    const pageType = detectPageType();
    console.log('[Content Script] 页面类型:', pageType, '页面ID:', pageId);

    let success = false;
    try {
      switch (pageType) {
        case PAGE_TYPES.LOGIN:
          success = await handleLoginPage();
          break;
        case PAGE_TYPES.NAME:
          success = await handleNamePage();
          break;
        case PAGE_TYPES.VERIFY:
          success = await handleVerifyPage();
          break;
        case PAGE_TYPES.PASSWORD:
          success = await handlePasswordPage();
          break;
        case PAGE_TYPES.DEVICE_CONFIRM:
          success = await handleDeviceConfirmPage();
          break;
        case PAGE_TYPES.ALLOW_ACCESS:
          success = await handleAllowAccessPage();
          break;
        case PAGE_TYPES.COMPLETE:
          success = handleCompletePage();
          break;
        default:
          console.log('[Content Script] 未知页面，继续等待...');
      }

      if (success) {
        processedPages.add(pageId);
      }
    } catch (error) {
      console.error('[Content Script] 处理错误:', error);
      reportError(error.message);
    } finally {
      isProcessing = false;
    }
  }

  /**
   * 开始持续轮询检测
   */
  function startPolling() {
    if (pollInterval) return;

    console.log('[Content Script] 开始轮询检测页面...');

    // 立即执行一次
    processPage();

    // 每 500ms 检测一次（加快响应速度）
    pollInterval = setInterval(() => {
      processPage();
    }, 500);
  }

  /**
   * 停止轮询
   */
  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // 页面卸载时停止轮询
  window.addEventListener('beforeunload', stopPolling);

  // 初始化
  async function init() {
    console.log('[Content Script] 初始化...');

    // 等待 DOM 完全加载
    if (document.readyState !== 'complete') {
      await new Promise(resolve => window.addEventListener('load', resolve));
    }

    await sleep(200);

    // 初始化 Toast（获取当前状态）
    initToast();

    await sleep(200);
    startPolling();
  }

  init();
})();
