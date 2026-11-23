// 小程序版本检查与更新提醒。
//
// 微信在启动时自动检查新版本；下载完成后主动提示用户重启更新。
// 版本号优先读取当前安装包信息，开发工具或早期环境缺少版本号时使用配置回退。
function getWxApi() {
  return typeof wx !== 'undefined' ? wx : null;
}

function setupMiniProgramUpdate() {
  const wxApi = getWxApi();
  if (!wxApi || typeof wxApi.getUpdateManager !== 'function') return null;

  let updateManager = null;
  try {
    updateManager = wxApi.getUpdateManager();
  } catch (error) {
    return null;
  }
  if (!updateManager) return null;

  if (typeof updateManager.onCheckForUpdate === 'function') {
    updateManager.onCheckForUpdate(() => {});
  }

  updateManager.onUpdateReady(() => {
    if (typeof wxApi.showModal !== 'function') return;
    wxApi.showModal({
      title: '发现新版本',
      content: '新版本已经准备好，是否立即重启更新？',
      confirmText: '立即更新',
      cancelText: '稍后',
      success: (result) => {
        if (result && result.confirm && typeof updateManager.applyUpdate === 'function') {
          updateManager.applyUpdate();
        }
      }
    });
  });

  updateManager.onUpdateFailed(() => {
    if (typeof wxApi.showModal !== 'function') return;
    wxApi.showModal({
      title: '更新下载失败',
      content: '请关闭小程序后重新打开，系统会再次尝试下载新版本。',
      showCancel: false
    });
  });

  return updateManager;
}

function resolveRuntimeVersion(fallbackVersion) {
  const fallback = String(fallbackVersion || '').trim();
  const wxApi = getWxApi();
  if (!wxApi || typeof wxApi.getAccountInfoSync !== 'function') return fallback;

  try {
    const accountInfo = wxApi.getAccountInfoSync();
    const miniProgram = accountInfo && accountInfo.miniProgram
      ? accountInfo.miniProgram
      : {};
    const rawVersion = String(miniProgram.version || '').trim();
    if (!rawVersion) return fallback;
    const version = rawVersion.charAt(0).toLowerCase() === 'v'
      ? rawVersion
      : `v${rawVersion}`;
    if (miniProgram.envVersion === 'trial') return `${version}（体验版）`;
    if (miniProgram.envVersion === 'develop') return `${version}（开发版）`;
    return version;
  } catch (error) {
    return fallback;
  }
}

module.exports = {
  setupMiniProgramUpdate,
  resolveRuntimeVersion
};
