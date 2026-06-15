// execution-status.js — Java/Python 执行环境状态指示器
// Round 90.0 deliverable: Show current execution mode in UI

(function() {
  'use strict';

  const STATUS = {
    UNKNOWN: 'unknown',
    LOCAL_SERVER: 'local_server',  // 本地服务器运行中
    WEB_SAFE_MODE: 'web_safe_mode',  // Web 安全模式（无本地服务器）
    UNAVAILABLE: 'unavailable'
  };

  let currentStatus = STATUS.UNKNOWN;
  let statusEl = null;

  function detectExecutionMode() {
    return fetch('/api/execute', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: 'python', code: 'print("ping")', stdin: '' }),
      signal: AbortSignal.timeout(2000)
    }).then(res => {
      if (res.ok) {
        return STATUS.LOCAL_SERVER;
      }
      return STATUS.WEB_SAFE_MODE;
    }).catch(() => {
      return STATUS.WEB_SAFE_MODE;
    });
  }

  function updateStatusUI(status) {
    currentStatus = status;
    if (!statusEl) {
      statusEl = document.getElementById('execution-status');
    }
    if (!statusEl) return;

    const labels = {
      [STATUS.LOCAL_SERVER]: '🟢 本地服务器运行中 — 可离线执行',
      [STATUS.WEB_SAFE_MODE]: '🟡 Web 安全模式 — 无法真实执行',
      [STATUS.UNAVAILABLE]: '⚫ 执行环境不可用'
    };

    statusEl.textContent = labels[status] || '⚪ 检测中...';
    statusEl.className = 'execution-status ' + status;
  }

  function init() {
    detectExecutionMode().then(updateStatusUI);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    setTimeout(init, 500);
  }

  window.ExecutionStatus = {
    getStatus: () => currentStatus,
    refresh: () => detectExecutionMode().then(updateStatusUI)
  };
})();
