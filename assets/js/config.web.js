/**
 * Web 公开版全局配置
 * =====================
 * 桌面完整版依赖本地 server.py / study_ai.py 提供后端 API。
 * Web 公开版不使用本地后端 — 所有本地接口请求默认禁用。
 */
window.STUDY_TOOLS_API_BASE = window.STUDY_TOOLS_API_BASE || "/api/execute";
window.STUDY_TOOLS_WEB_PUBLIC = true;
window.STUDY_TOOLS_DISABLE_LOCAL_BACKEND = true;
