// 直角三角形法 · 纯几何计算。
//
// 输入和输出都位于教学模型空间，不读取页面、Canvas 或 wx。
// 第一角投影映射已由 pages/index/projection.js 固定：
//   V=(x,z), H=(x,-y), W=(-y,z)
// 长度使用投影点距离，角度只取 0..90°，因此不受端点交换和投影面正负方向影响。

const LENGTH_EPSILON = 1e-8;

// 所有几何入口先拒绝非有限值，防止 NaN / Infinity 进入页面派生状态。
function isFinitePoint(point) {
  return !!point
    && Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && Number.isFinite(point.z);
}

function deltaOf(a, b) {
  return {
    dx: b.x - a.x,
    dy: b.y - a.y,
    dz: b.z - a.z
  };
}

// 分类只看方向分量的零性，不依赖端点顺序或标签；零值判断统一使用
// LENGTH_EPSILON，避免浮点尾差把特殊位置直线误判成一般位置。
function lineKind(dx, dy, dz) {
  const xZero = Math.abs(dx) <= LENGTH_EPSILON;
  const yZero = Math.abs(dy) <= LENGTH_EPSILON;
  const zZero = Math.abs(dz) <= LENGTH_EPSILON;
  if (xZero && yZero && zZero) return 'point';
  if (xZero && yZero) return 'verticalH';
  if (xZero && zZero) return 'verticalV';
  if (yZero && zZero) return 'verticalW';
  if (zZero) return 'horizontal';
  if (yZero) return 'frontal';
  if (xZero) return 'profile';
  return 'general';
}

/**
 * 计算一般位置或特殊位置线段的教学度量。
 * 退化线段返回 valid=false，角度保持 0，避免 NaN 进入页面。
 */
function computeLineMetrics(a, b) {
  if (!isFinitePoint(a) || !isFinitePoint(b)) {
    return {
      valid: false,
      error: 'NON_FINITE_POINT',
      dx: 0,
      dy: 0,
      dz: 0
    };
  }

  const { dx, dy, dz } = deltaOf(a, b);
  const horizontalLength = Math.hypot(dx, dy);
  const frontLength = Math.hypot(dx, dz);
  const profileLength = Math.hypot(dy, dz);
  const trueLength = Math.hypot(dx, dy, dz);
  const valid = trueLength > LENGTH_EPSILON;
  if (!valid) {
    return {
      valid: false,
      error: 'DEGENERATE_LINE',
      dx,
      dy,
      dz,
      horizontalLength,
      frontLength,
      profileLength,
      trueLength,
      alphaRadians: 0,
      betaRadians: 0,
      gammaRadians: 0,
      alphaDegrees: 0,
      betaDegrees: 0,
      gammaDegrees: 0,
      kind: 'point'
    };
  }

  const alphaRadians = Math.atan2(Math.abs(dz), horizontalLength);
  const betaRadians = Math.atan2(Math.abs(dy), frontLength);
  const gammaRadians = Math.atan2(Math.abs(dx), profileLength);
  return {
    valid: true,
    error: '',
    dx,
    dy,
    dz,
    horizontalLength,
    frontLength,
    profileLength,
    trueLength,
    alphaRadians,
    betaRadians,
    gammaRadians,
    alphaDegrees: alphaRadians * 180 / Math.PI,
    betaDegrees: betaRadians * 180 / Math.PI,
    gammaDegrees: gammaRadians * 180 / Math.PI,
    kind: lineKind(dx, dy, dz)
  };
}

// 返回某投影面的底边、缺失坐标差和对应倾角。
// H：|Δz|；V：|Δy|；W：|Δx|。target 只保存派生结果，
// 不复制或写回 A/B 几何真值。
function getProjectionTarget(metrics, projection) {
  if (!metrics || !metrics.valid) return null;
  if (projection === 'H') {
    return {
      projection: 'H',
      projectionName: '水平投影',
      baseLength: metrics.horizontalLength,
      baseLineLabel: 'ab',
      orthogonalLength: Math.abs(metrics.dz),
      deltaAxis: 'z',
      deltaLabel: '|Δz|',
      deltaAxisLabel: 'OZ',
      differenceExpression: 'Z_B − Z_A',
      angleRadians: metrics.alphaRadians,
      angleDegrees: metrics.alphaDegrees,
      angleName: '与 H 面夹角 α',
      trueLength: metrics.trueLength
    };
  }
  if (projection === 'V') {
    return {
      projection: 'V',
      projectionName: '正面投影',
      baseLength: metrics.frontLength,
      baseLineLabel: 'a′b′',
      orthogonalLength: Math.abs(metrics.dy),
      deltaAxis: 'y',
      deltaLabel: '|Δy|',
      deltaAxisLabel: 'OY',
      differenceExpression: 'Y_B − Y_A',
      angleRadians: metrics.betaRadians,
      angleDegrees: metrics.betaDegrees,
      angleName: '与 V 面夹角 β',
      trueLength: metrics.trueLength
    };
  }
  if (projection !== 'W') return null;
  return {
    projection: 'W',
    projectionName: '侧面投影',
    baseLength: metrics.profileLength,
    baseLineLabel: 'a″b″',
    orthogonalLength: Math.abs(metrics.dx),
    deltaAxis: 'x',
    deltaLabel: '|Δx|',
    deltaAxisLabel: 'OX',
    differenceExpression: 'X_B − X_A',
    angleRadians: metrics.gammaRadians,
    angleDegrees: metrics.gammaDegrees,
    angleName: '与 W 面夹角 γ',
    trueLength: metrics.trueLength
  };
}

// 一般位置直线三个投影都短于实长，因而“无投影直接反映实长”是正确结论。
function projectionReflectsTrueLength(metrics, projection) {
  const target = getProjectionTarget(metrics, projection);
  if (!target) return false;
  return Math.abs(target.baseLength - metrics.trueLength) <= LENGTH_EPSILON;
}

function nearlyEqual(actual, expected, tolerance) {
  // 调用方显式传入容差；本函数不把显示位数或任意固定 toFixed 结果用于判定。
  return Number.isFinite(actual)
    && Number.isFinite(expected)
    && Math.abs(actual - expected) <= tolerance;
}

// 只负责显示格式；数值比较必须先完成，不能用格式化字符串参与几何判断。
function formatNumber(value, digits) {
  if (!Number.isFinite(value)) return '—';
  return Number(value).toFixed(digits);
}

module.exports = {
  LENGTH_EPSILON,
  isFinitePoint,
  computeLineMetrics,
  getProjectionTarget,
  projectionReflectsTrueLength,
  nearlyEqual,
  formatNumber
};
