// 首页画布的教学常量（数值与拆分前 pages/index/index.js 顶部完全一致）。
// 教学坐标范围：模型坐标统一在 0～8 的第一分角内（见 README「当前功能」）。
const DEFAULT_POINT = Object.freeze({ x: 4, y: 3, z: 5 });
const MODEL_MIN = 0;
const MODEL_LIMIT = 8;
// 等轴测示意中 z 方向的视觉压缩比例（不是可旋转相机的透视参数）
const ISOMETRIC_DEPTH_Z = 0.76;

module.exports = {
  DEFAULT_POINT,
  MODEL_MIN,
  MODEL_LIMIT,
  ISOMETRIC_DEPTH_Z
};
