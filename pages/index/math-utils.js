// 纯计算小工具：数值钳制、屏幕距离换算、重心坐标、截交环相邻点去重。
// 不读取页面状态，也不访问 context。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const { MODEL_MIN, MODEL_LIMIT } = require('./constants.js');

  module.exports = {
    clamp(value, min, max) {
      return Math.max(min, Math.min(max, value));
    },

    screenToModel(screenDistance, unit) {
      return this.clamp(Math.round(screenDistance / unit), MODEL_MIN, MODEL_LIMIT);
    },

    getBarycentricCoordinates(point, triangle) {
      const denominator = (triangle[1].y - triangle[2].y) * (triangle[0].x - triangle[2].x)
        + (triangle[2].x - triangle[1].x) * (triangle[0].y - triangle[2].y);
      if (Math.abs(denominator) <= 1e-8) return null;
      const first = ((triangle[1].y - triangle[2].y) * (point.x - triangle[2].x)
        + (triangle[2].x - triangle[1].x) * (point.y - triangle[2].y)) / denominator;
      const second = ((triangle[2].y - triangle[0].y) * (point.x - triangle[2].x)
        + (triangle[0].x - triangle[2].x) * (point.y - triangle[2].y)) / denominator;
      const third = 1 - first - second;
      const tolerance = -1e-5;
      if (first < tolerance || second < tolerance || third < tolerance) return null;
      return [first, second, third];
    },

    simplifyLoopVertices(loop) {
      const count = loop.length;
      if (count <= 2) return loop.slice();
      const result = [];
      for (let index = 0; index < count; index += 1) {
        const prev = loop[(index - 1 + count) % count];
        const cur = loop[index];
        const next = loop[(index + 1) % count];
        const e1 = { x: cur.x - prev.x, y: cur.y - prev.y, z: cur.z - prev.z };
        const e2 = { x: next.x - cur.x, y: next.y - cur.y, z: next.z - cur.z };
        const cross = {
          x: e1.y * e2.z - e1.z * e2.y,
          y: e1.z * e2.x - e1.x * e2.z,
          z: e1.x * e2.y - e1.y * e2.x
        };
        if (Math.hypot(cross.x, cross.y, cross.z) > 1e-8) result.push(cur);
      }
      return result.length ? result : loop.slice();
    }
  };
})();
