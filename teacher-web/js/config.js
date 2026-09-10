// 教师端 Web 配置
window.TEACHER_CONFIG = {
  // 教师云函数网关地址（腾讯云 CloudBase「HTTP 网关」中的路由）
  // 配置位置：CloudBase 控制台 → HTTP 网关 → 域名及路由 → 路由 /teacher → 云函数 teacher
  // 同时需在「HTTP 网关 → 跨域设置」授权页面来源域名，否则浏览器会拦截跨域请求。
  gatewayUrl: 'https://cloud1-d4gwsysje82cf604a-1476352837.ap-shanghai.app.tcloudbase.com/teacher',

  // token 存储键名
  tokenKey: 'hfjh_teacher_token',
  teacherKey: 'hfjh_teacher_info'
};
