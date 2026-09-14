// 类型预设与立体默认参数：点 8 种（一般点 / 原点 / 三投影面 / 三坐标轴）、线 7 种、面 7 种，
// 以及截平面类型判定与基本立体默认参数。本文件由 pages/index/index.js 原样拆出（只搬运，未改数值与分支）。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const { DEFAULT_POINT } = require('./constants.js');

  module.exports = {
    getPointTypePreset(pointType) {
      const presets = {
        general: { ...DEFAULT_POINT },
        planeH: { x: 4, y: 3, z: 0 },
        planeV: { x: 4, y: 0, z: 5 },
        planeW: { x: 0, y: 3, z: 5 },
        axisX: { x: 4, y: 0, z: 0 },
        axisY: { x: 0, y: 4, z: 0 },
        axisZ: { x: 0, y: 0, z: 5 },
        origin: { x: 0, y: 0, z: 0 }
      };
      return { ...presets[pointType] };
    },

    getLineTypePreset(lineType) {
      // 当前课程统一限定在第一分角，两个端点的坐标均不小于零。
      const a = { x: 2, y: 2, z: 6 };
      const endpoints = {
        general: { x: 6, y: 5, z: 2 },
        horizontal: { x: 6, y: 5, z: 6 },
        frontal: { x: 6, y: 2, z: 2 },
        profile: { x: 2, y: 6, z: 2 },
        vertical: { x: 2, y: 2, z: 1 },
        frontProjecting: { x: 2, y: 6, z: 6 },
        profileProjecting: { x: 6, y: 2, z: 6 }
      };
      return { a: { ...a }, b: { ...endpoints[lineType] } };
    },

    getPlaneTypePreset(planeType) {
      const presets = {
        general: {
          a: { x: 2, y: 2, z: 6 }, b: { x: 7, y: 4, z: 2 }, c: { x: 4, y: 7, z: 5 }
        },
        horizontal: {
          a: { x: 2, y: 2, z: 4 }, b: { x: 6, y: 3, z: 4 }, c: { x: 4, y: 7, z: 4 }
        },
        frontal: {
          a: { x: 2, y: 3, z: 6 }, b: { x: 6, y: 3, z: 2 }, c: { x: 3, y: 3, z: 2 }
        },
        profile: {
          a: { x: 3, y: 2, z: 6 }, b: { x: 3, y: 6, z: 2 }, c: { x: 3, y: 7, z: 5 }
        },
        vertical: {
          a: { x: 2, y: 2, z: 6 }, b: { x: 6, y: 6, z: 2 }, c: { x: 4, y: 4, z: 3 }
        },
        frontProjecting: {
          a: { x: 2, y: 2, z: 6 }, b: { x: 6, y: 6, z: 2 }, c: { x: 4, y: 7, z: 4 }
        },
        profileProjecting: {
          a: { x: 2, y: 2, z: 6 }, b: { x: 6, y: 6, z: 2 }, c: { x: 7, y: 4, z: 4 }
        }
      };
      const preset = presets[planeType];
      return { a: { ...preset.a }, b: { ...preset.b }, c: { ...preset.c } };
    },

    getSectionPlaneType(angle) {
      const normalizedAngle = ((angle % 180) + 180) % 180;
      if (normalizedAngle === 0) return 'horizontal';
      if (normalizedAngle === 90) return 'profile';
      return 'frontProjecting';
    },

    defaultSolidParams(type) {
      return {
        type,
        sides: 5,
        radius: 2,
        height: 3,
        majorRadius: type === 'torus' ? 2 : 3,
        minorRadius: type === 'torus' ? 0.8 : 1,
        position: type === 'torus' ? { x: 4, y: 4, z: 3 } : { x: 4, y: 3, z: 3 },
        rotation: { x: 0, y: 0, z: 0 }
      };
    }
  };
})();
