#!/usr/bin/env node
// 两平面相交求交线：16 种组合、积聚性路径、三步作图与 Canvas 检查。

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = require('../pages/line-plane-relation/line-plane-model.js');
const model = require('../pages/plane-plane-relation/plane-plane-model.js');

const ROOT = path.resolve(__dirname, '..');
const PLANE_KINDS = [
  'general',
  'vertical',
  'frontProjecting',
  'profileProjecting'
];
let checks = 0;

function check(condition, message) {
  checks += 1;
  assert.ok(condition, message);
}

function close(actual, expected, tolerance, message) {
  checks += 1;
  assert.ok(Math.abs(actual - expected) <= tolerance,
    `${message}: actual=${actual}, expected=${expected}`);
}

function setPath(target, dottedPath, value) {
  const parts = dottedPath.split('.');
  let current = target;
  for (let index = 0; index < parts.length - 1; index += 1) {
    if (!current[parts[index]]) current[parts[index]] = {};
    current = current[parts[index]];
  }
  current[parts[parts.length - 1]] = value;
}

function makePageInstance(definition) {
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    canvasWidth: 375,
    canvasHeight: 460,
    _interactionCount: 0,
    setData(patch, callback) {
      Object.keys(patch || {}).forEach((key) => {
        setPath(this.data, key, patch[key]);
      });
      if (typeof callback === 'function') callback();
    },
    scheduleCanvasDraw() {},
    recordInteraction() {
      this._interactionCount += 1;
    }
  });
}

function makeCanvasContext(drawnText, strokeCalls, textCalls) {
  const noop = () => {};
  return {
    lineDash: [],
    lineWidth: 1,
    save: noop,
    restore: noop,
    clearRect: noop,
    beginPath: noop,
    rect: noop,
    clip: noop,
    fillRect: noop,
    moveTo: noop,
    lineTo: noop,
    translate: noop,
    rotate: noop,
    closePath: noop,
    fill: noop,
    arc: noop,
    fillText(text, x, y) {
      if (drawnText) drawnText.push(String(text));
      if (textCalls) {
        textCalls.push({
          text: String(text),
          x,
          y,
          align: this.textAlign || 'left'
        });
      }
    },
    stroke() {
      if (strokeCalls) {
        strokeCalls.push({
          color: this.strokeStyle,
          lineWidth: this.lineWidth,
          dash: this.lineDash.slice()
        });
      }
    },
    setLineDash(pattern) {
      this.lineDash = (pattern || []).slice();
    }
  };
}

function buildCombination(planePKind, planeQKind) {
  return model.buildPlanePairGeometry(planePKind, planeQKind);
}

function checkLineInsidePlaneDisplay(geometry, planeGeometry, prefix) {
  const line = geometry.intersectionLine;
  const display = Object.assign({}, planeGeometry, {
    plane: {
      a: planeGeometry.patch[0],
      b: planeGeometry.patch[1],
      c: planeGeometry.patch[2]
    }
  });
  const clipped = base.clipLineToTriangle(
    display,
    line.origin,
    line.direction
  );
  check(!!clipped, `${prefix} 交线可被平面显示边界裁剪`);
  if (clipped) {
    check(line.minimum >= clipped.minimum - 1e-8
      && line.maximum <= clipped.maximum + 1e-8,
    `${prefix} 可视交线落在两个平面的显示面内`);
  }
}

function checkPointOnSegment(point, line, prefix) {
  const lineLength = base.length(base.subtract(line.end, line.start));
  const pathLength = base.length(base.subtract(point, line.start))
    + base.length(base.subtract(line.end, point));
  close(pathLength, lineLength, 1e-8, prefix);
}

function triangleArea(plane) {
  return base.length(base.cross(
    base.subtract(plane.b, plane.a),
    base.subtract(plane.c, plane.a)
  )) / 2;
}

function pointCoordinateKey(point) {
  return ['x', 'y', 'z'].map(
    (axis) => point[axis].toFixed(8)
  ).join(',');
}

function planeTriangleCoordinates(planeGeometry) {
  return planeGeometry.vertices.map(pointCoordinateKey).sort().join('|');
}

function intersectionPointSet(geometry) {
  return [geometry.intersectionLine.start, geometry.intersectionLine.end]
    .map(pointCoordinateKey)
    .sort()
    .join('|');
}

function projectPoint2D(point, viewType) {
  if (viewType === 'front') return { x: point.x, y: point.z };
  if (viewType === 'top') return { x: point.x, y: point.y };
  return { x: point.y, y: point.z };
}

function distanceToSegment2D(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const denominator = dx * dx + dy * dy;
  const parameter = denominator > 1e-12
    ? Math.max(0, Math.min(1,
      ((point.x - start.x) * dx + (point.y - start.y) * dy)
        / denominator
    ))
    : 0;
  return Math.hypot(
    point.x - (start.x + dx * parameter),
    point.y - (start.y + dy * parameter)
  );
}

function distanceToSegment3D(point, start, end) {
  const edge = base.subtract(end, start);
  const denominator = base.dot(edge, edge);
  const parameter = denominator > 1e-12
    ? Math.max(0, Math.min(1,
      base.dot(base.subtract(point, start), edge) / denominator
    ))
    : 0;
  return base.length(base.subtract(
    point,
    base.add(start, base.scale(edge, parameter))
  ));
}

function minProjectedVertexEdgeDistance(first, second) {
  const pointsOf = (plane) => [plane.a, plane.b, plane.c];
  let minimum = Infinity;
  ['front', 'top', 'left'].forEach((viewType) => {
    const firstPoints = pointsOf(first).map(
      (point) => projectPoint2D(point, viewType)
    );
    const secondPoints = pointsOf(second).map(
      (point) => projectPoint2D(point, viewType)
    );
    [firstPoints, secondPoints].forEach((points, direction) => {
      const targets = direction === 0 ? secondPoints : firstPoints;
      points.forEach((point) => {
        for (let index = 0; index < 3; index += 1) {
          minimum = Math.min(minimum, distanceToSegment2D(
            point,
            targets[index],
            targets[(index + 1) % 3]
          ));
        }
      });
    });
  });
  return minimum;
}

function minParallelProjectedEdgeClearance(first, second) {
  let minimum = Infinity;
  ['front', 'top', 'left'].forEach((viewType) => {
    const firstPoints = first.vertices.map(
      (point) => projectPoint2D(point, viewType)
    );
    const secondPoints = second.vertices.map(
      (point) => projectPoint2D(point, viewType)
    );
    for (let firstIndex = 0; firstIndex < 3; firstIndex += 1) {
      const firstStart = firstPoints[firstIndex];
      const firstEnd = firstPoints[(firstIndex + 1) % 3];
      const firstDirection = {
        x: firstEnd.x - firstStart.x,
        y: firstEnd.y - firstStart.y
      };
      const firstLength = Math.hypot(firstDirection.x, firstDirection.y);
      for (let secondIndex = 0; secondIndex < 3; secondIndex += 1) {
        const secondStart = secondPoints[secondIndex];
        const secondEnd = secondPoints[(secondIndex + 1) % 3];
        const secondDirection = {
          x: secondEnd.x - secondStart.x,
          y: secondEnd.y - secondStart.y
        };
        const secondLength = Math.hypot(
          secondDirection.x,
          secondDirection.y
        );
        if (firstLength <= 1e-8 || secondLength <= 1e-8) continue;
        const sine = Math.abs(
          firstDirection.x * secondDirection.y
            - firstDirection.y * secondDirection.x
        ) / (firstLength * secondLength);
        if (sine > 0.15) continue;
        minimum = Math.min(
          minimum,
          distanceToSegment2D(secondStart, firstStart, firstEnd),
          distanceToSegment2D(secondEnd, firstStart, firstEnd),
          distanceToSegment2D(firstStart, secondStart, secondEnd),
          distanceToSegment2D(firstEnd, secondStart, secondEnd)
        );
      }
    }
  });
  return minimum;
}

function minProjectedPointClearance(first, second) {
  let minimum = Infinity;
  ['front', 'top', 'left'].forEach((viewType) => {
    const firstPoints = first.vertices.map(
      (point) => projectPoint2D(point, viewType)
    );
    const secondPoints = second.vertices.map(
      (point) => projectPoint2D(point, viewType)
    );
    firstPoints.forEach((firstPoint) => {
      secondPoints.forEach((secondPoint) => {
        minimum = Math.min(minimum, Math.hypot(
          firstPoint.x - secondPoint.x,
          firstPoint.y - secondPoint.y
        ));
      });
      for (let index = 0; index < 3; index += 1) {
        minimum = Math.min(
          minimum,
          distanceToSegment2D(
            firstPoint,
            secondPoints[index],
            secondPoints[(index + 1) % 3]
          )
        );
      }
    });
    secondPoints.forEach((secondPoint) => {
      for (let index = 0; index < 3; index += 1) {
        minimum = Math.min(
          minimum,
          distanceToSegment2D(
            secondPoint,
            firstPoints[index],
            firstPoints[(index + 1) % 3]
          )
        );
      }
    });
  });
  return minimum;
}

function hasNoAxisParallelEdge(planeGeometry) {
  return planeGeometry.vertices.every((point, index) => {
    const next = planeGeometry.vertices[(index + 1) % 3];
    const edge = base.subtract(next, point);
    return ['x', 'y', 'z'].filter(
      (axis) => Math.abs(edge[axis]) > 1e-8
    ).length >= 2;
  });
}

function main() {
  let intersectionCount = 0;
  let parallelCount = 0;
  PLANE_KINDS.forEach((planePKind) => {
    PLANE_KINDS.forEach((planeQKind) => {
      const geometry = buildCombination(planePKind, planeQKind);
      const isUnifiedSpecialReverse = planePKind === 'general'
        && (planeQKind === 'vertical'
          || planeQKind === 'frontProjecting'
          || planeQKind === 'profileProjecting');
      check(!!geometry, `${planePKind}/${planeQKind} 可生成两平面几何`);
      check(geometry.planeP.patch.length === 3
        && geometry.planeQ.patch.length === 3,
      `${planePKind}/${planeQKind} 两块平面均使用三角形`);
      check(hasNoAxisParallelEdge(geometry.planeP)
        && hasNoAxisParallelEdge(geometry.planeQ),
      `${planePKind}/${planeQKind} 三角形边均不平行于任何投影轴`);
      check(minParallelProjectedEdgeClearance(
        geometry.planeP,
        geometry.planeQ
      ) >= 0.35,
      `${planePKind}/${planeQKind} 三视图中无近重合的平面边`);
      check(minProjectedPointClearance(
        geometry.planeP,
        geometry.planeQ
      ) >= 0.15,
      `${planePKind}/${planeQKind} 三视图中无重影点或点压边`);
        const minimumVertexDistance = Math.min(
          ...geometry.planeP.vertices.flatMap((point) => (
            geometry.planeQ.vertices.map((other) => (
              base.length(base.subtract(point, other))
            ))
          ))
        );
        check(minimumVertexDistance > 0.25,
          `${planePKind}/${planeQKind} 两三角形顶点不重合`);
        if (geometry.intersectionLine && geometry.accumulationP) {
          check(geometry.planeP.vertices[1].z
            > geometry.planeP.vertices[2].z + 0.2,
          `${planePKind}/${planeQKind} 的 B 点 Z 明显大于 C 点`);
          check(geometry.planeP.vertices[2].z > 4.5,
            `${planePKind}/${planeQKind} 的 B、C 点位于较高 Z 范围`);
        }
      if (geometry.relation.kind === 'parallel') {
        parallelCount += 1;
        check(!geometry.intersectionLine,
          `${planePKind}/${planeQKind} 平行时不伪造交线`);
      } else {
        intersectionCount += 1;
        check(geometry.relation.kind === 'intersect'
          && !!geometry.intersectionLine,
        `${planePKind}/${planeQKind} 生成唯一公共交线`);
        if (!(geometry.accumulationP && !geometry.accumulationQ)
          && !isUnifiedSpecialReverse) {
          checkLineInsidePlaneDisplay(
            geometry,
            geometry.planeP,
            `${planePKind}/${planeQKind} 的 P 面`
          );
        }
        if (!isUnifiedSpecialReverse) {
          checkLineInsidePlaneDisplay(
            geometry,
            geometry.planeQ,
            `${planePKind}/${planeQKind} 的 Q 面`
          );
        }
        check(geometry.commonPoints.length === 2,
          `${planePKind}/${planeQKind} 明确生成两个共有点`);
        check(base.length(base.subtract(
          geometry.commonPoints[0],
          geometry.commonPoints[1]
        )) > 1e-6, `${planePKind}/${planeQKind} 两个共有点不重合`);
        geometry.commonPoints.forEach((point, index) => {
          close(base.signedDistance(geometry.planeP, point), 0, 1e-8,
            `${planePKind}/${planeQKind} 共有点 ${index + 1} 属于 P`);
          close(base.signedDistance(geometry.planeQ, point), 0, 1e-8,
            `${planePKind}/${planeQKind} 共有点 ${index + 1} 属于 Q`);
        });
        if (geometry.accumulationP && !geometry.accumulationQ) {
          close(distanceToSegment3D(
            geometry.commonPoints[0],
            geometry.planeQ.vertices[2],
            geometry.planeQ.vertices[0]
          ), 0, 1e-8,
          `${planePKind}/${planeQKind} 的第一个交点位于 EG`);
          close(distanceToSegment3D(
            geometry.commonPoints[1],
            geometry.planeQ.vertices[0],
            geometry.planeQ.vertices[1]
          ), 0, 1e-8,
          `${planePKind}/${planeQKind} 的第二个交点位于 EF`);
        }
        [geometry.intersectionLine.start, geometry.intersectionLine.end]
          .forEach((point, index) => {
            close(base.signedDistance(geometry.planeP, point), 0, 1e-8,
              `${planePKind}/${planeQKind} 点 ${index + 1} 属于平面 P`);
            close(base.signedDistance(geometry.planeQ, point), 0, 1e-8,
              `${planePKind}/${planeQKind} 点 ${index + 1} 属于平面 Q`);
            ['x', 'y', 'z'].forEach((axis) => {
              check(point[axis] >= base.PLANE_PATCH_MARGIN - 1e-8
                && point[axis] <= base.MODEL_MAX
                  - base.PLANE_PATCH_MARGIN + 1e-8,
              `${planePKind}/${planeQKind} 点 ${index + 1} 的 ${axis} 在范围内`);
            });
          });
      }
    });
  });
  check(intersectionCount === 13, '16 种组合中 13 种得到交线');
  check(parallelCount === 3, '3 种同向投影面垂直平面正确判定为平行');

  const generalGeneral = buildCombination('general', 'general');
  check(generalGeneral.methodKind === 'twoLinePlane',
    '两个一般位置平面使用两次线面求交');
  check(generalGeneral.planeP.patch.length === 3
    && generalGeneral.planeQ.patch.length === 3,
  '两个一般位置平面均使用三角形表示');
  const generalPlaneP = model.getPlanePreset('general', 'P');
  const generalPlaneQ = model.getPlanePreset('general', 'Q');
  const shiftedVerticalP = model.getPlanePreset('vertical', 'P');
  ['a', 'b', 'c'].forEach((key) => {
    ['x', 'y', 'z'].forEach((axis) => {
      close(
        shiftedVerticalP[key][axis],
        base.VERTICAL_PLANE[key][axis] - model.PLANE_TOWARD_ORIGIN,
        1e-8,
        `ABC 顶点 ${key.toUpperCase()} 的 ${axis} 坐标向原点移动`
      );
    });
  });
  check(triangleArea(generalPlaneP) > 19
    && triangleArea(generalPlaneQ) > 20,
  '一般位置三角形面积已扩大');
  check(minProjectedVertexEdgeDistance(
    generalPlaneP,
    generalPlaneQ
  ) > 0.4,
  '两三角形在 V/H/W 投影中均无明显端点贴边');
  ['a', 'b', 'c'].forEach((key, index) => {
    check(base.length(base.subtract(
      generalGeneral.planeP.patch[index],
      generalPlaneP[key]
    )) <= 1e-8,
    `P 三角形顶点 ${['A', 'B', 'C'][index]} 使用原始几何`);
    check(base.length(base.subtract(
      generalGeneral.planeQ.patch[index],
      generalPlaneQ[key]
    )) <= 1e-8,
    `Q 三角形顶点 ${['L', 'M', 'N'][index]} 使用原始几何`);
  });
  check(generalGeneral.lineIntersections.length === 2,
    '两个一般位置平面通过两条边线得到两个交点');
  const targetGeometries = {
    P: base.createPlaneGeometry(model.getPlanePreset('general', 'P')),
    Q: base.createPlaneGeometry(model.getPlanePreset('general', 'Q'))
  };
  generalGeneral.lineIntersections.forEach((construction, index) => {
    const target = construction.targetName === 'ABC'
      ? targetGeometries.P
      : targetGeometries.Q;
    const relation = base.classifyLinePlane(target, construction.line);
    check(!!relation && !!relation.intersection
      && relation.intersection.isOnSegment,
    `第 ${index + 1} 条边线与平面 ${construction.targetName} 有段内交点`);
    check(!!construction.auxiliaryPlane
      && construction.auxiliaryPlane.curtainCorners.length === 4
      && construction.auxiliaryPlane.projectionPlane === 'H',
    `第 ${index + 1} 条边线建立垂直于 H 面的辅助平面`);
    close(
      base.dot(
        construction.auxiliaryPlane.normal,
        construction.line.e
      ) - construction.auxiliaryPlane.constant,
      0,
      1e-8,
      `第 ${index + 1} 个辅助平面包含边线起点`
    );
    close(
      base.dot(
        construction.auxiliaryPlane.normal,
        construction.line.f
      ) - construction.auxiliaryPlane.constant,
      0,
      1e-8,
      `第 ${index + 1} 个辅助平面包含边线终点`
    );
    check(construction.auxiliaryPlane.trace
      && construction.auxiliaryPlane.trace.label
        === `R${index + 1}_H`,
    `第 ${index + 1} 个辅助平面生成投影迹线`);
    check(!!construction.sectionLine,
      `第 ${index + 1} 个辅助平面与目标平面生成构造交线`);
    checkPointOnSegment(
      construction.point,
      construction.sectionLine,
      `第 ${index + 1} 个交点位于辅助截线上`
    );
    close(
      base.length(base.subtract(
        relation.intersection.point,
        construction.point
      )),
      0,
      1e-8,
      `第 ${index + 1} 个共有点由线面求交得到`
    );
    close(base.signedDistance(
      generalGeneral.planeP,
      construction.point
    ), 0, 1e-8, `共有点 ${index + 1} 属于 P`);
    close(base.signedDistance(
      generalGeneral.planeQ,
      construction.point
    ), 0, 1e-8, `共有点 ${index + 1} 属于 Q`);
  });
  check(generalGeneral.lineIntersections[0].point.x
    < generalGeneral.lineIntersections[1].point.x,
  '交点按交线方向稳定排为 K、E');
  close(
    base.length(base.subtract(
      generalGeneral.intersectionLine.start,
      generalGeneral.commonPoints[0]
    )),
    0,
    1e-8,
    '最终交线从第一个线面交点 K 开始'
  );
  close(
    base.length(base.subtract(
      generalGeneral.intersectionLine.end,
      generalGeneral.commonPoints[1]
    )),
    0,
    1e-8,
    '最终交线结束于第二个线面交点 E'
  );
  check(generalGeneral.steps === undefined,
    '模型不直接依赖页面步骤状态');
  const generalVerticalP = buildCombination('general', 'vertical');
  check(generalVerticalP.methodKind === 'plane'
    && generalVerticalP.accumulationQ === 'H',
  '一般面 ABC × 铅垂面 EFG 时利用 Q 的 H 面积聚性');
  close(
    base.length(base.subtract(
      generalVerticalP.commonPoints[0],
      generalVerticalP.intersectionLine.start
    )),
    0,
    1e-8,
    '特殊位置交线第一个过渡点取可见线段起点'
  );
  close(
    base.length(base.subtract(
      generalVerticalP.commonPoints[1],
      generalVerticalP.intersectionLine.end
    )),
    0,
    1e-8,
    '特殊位置交线第二个过渡点取可见线段终点'
  );
  const verticalGeneral = buildCombination('vertical', 'general');
  check(
    planeTriangleCoordinates(generalVerticalP.planeP)
      === planeTriangleCoordinates(verticalGeneral.planeQ)
      && planeTriangleCoordinates(generalVerticalP.planeQ)
        === planeTriangleCoordinates(verticalGeneral.planeP),
    '一般面 × 铅垂面复用铅垂面 × 一般面的同一对三角形'
  );
  check(
    intersectionPointSet(generalVerticalP)
      === intersectionPointSet(verticalGeneral),
    '两种左右顺序复用同一条交线'
  );
  check(
    generalVerticalP.accumulationQ === verticalGeneral.accumulationP
      && generalVerticalP.accumulationP
        === verticalGeneral.accumulationQ,
    '两种左右顺序只交换 ABC、EFG 的积聚性'
  );
  const generalFrontP = buildCombination('general', 'frontProjecting');
  check(generalFrontP.methodKind === 'plane'
    && generalFrontP.accumulationQ === 'V',
  '一般面 ABC × 正垂面 EFG 时利用 Q 的 V 面积聚性');
  const frontGeneral = buildCombination('frontProjecting', 'general');
  check(
    planeTriangleCoordinates(generalFrontP.planeP)
      === planeTriangleCoordinates(frontGeneral.planeQ)
      && planeTriangleCoordinates(generalFrontP.planeQ)
        === planeTriangleCoordinates(frontGeneral.planeP),
    '一般面 × 正垂面复用正垂面 × 一般面的同一对三角形'
  );
  check(
    intersectionPointSet(generalFrontP)
      === intersectionPointSet(frontGeneral),
    '正垂面正反顺序复用同一条交线'
  );
  check(
    generalFrontP.accumulationQ === frontGeneral.accumulationP
      && generalFrontP.accumulationP
        === frontGeneral.accumulationQ,
    '正垂面正反顺序只交换 ABC、EFG 的积聚性'
  );
  const generalProfileP = buildCombination('general', 'profileProjecting');
  check(generalProfileP.methodKind === 'plane'
    && generalProfileP.accumulationQ === 'W',
  '一般面 ABC × 侧垂面 EFG 时利用 Q 的 W 面积聚性');
  const profileGeneral = buildCombination('profileProjecting', 'general');
  check(
    planeTriangleCoordinates(generalProfileP.planeP)
      === planeTriangleCoordinates(profileGeneral.planeQ)
      && planeTriangleCoordinates(generalProfileP.planeQ)
        === planeTriangleCoordinates(profileGeneral.planeP),
    '一般面 × 侧垂面复用侧垂面 × 一般面的同一对三角形'
  );
  check(
    intersectionPointSet(generalProfileP)
      === intersectionPointSet(profileGeneral),
    '侧垂面正反顺序复用同一条交线'
  );
  check(
    generalProfileP.accumulationQ === profileGeneral.accumulationP
      && generalProfileP.accumulationP
        === profileGeneral.accumulationQ,
    '侧垂面正反顺序只交换 ABC、EFG 的积聚性'
  );
  const abDirection = base.normalize(base.subtract(
    verticalGeneral.planeP.vertices[1],
    verticalGeneral.planeP.vertices[0]
  ));
  const efDirection = base.normalize(base.subtract(
    verticalGeneral.planeQ.vertices[1],
    verticalGeneral.planeQ.vertices[0]
  ));
  check(base.length(base.cross(abDirection, efDirection)) > 0.25,
    '铅垂面 ABC 的 AB 与一般面 EFG 的 EF 不重合');
  const verticalFront = buildCombination('vertical', 'frontProjecting');
  check(verticalFront.methodKind === 'both',
    '两个不同方向投影面垂直面使用双重积聚');

  const appJson = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
  check(appJson.pages.includes(
    'pages/plane-plane-relation/plane-plane-relation'
  ), '面面相交页面已注册');
  const overviewSource = fs.readFileSync(
    path.join(ROOT, 'pages/intersection-relations/intersection-relations.js'),
    'utf8'
  );
  check(overviewSource.includes(
    'url: \'/pages/plane-plane-relation/plane-plane-relation\''
  ), '相交概览页的面面按钮进入本页');

  const pageDir = path.join(ROOT, 'pages/plane-plane-relation');
  const wxml = fs.readFileSync(
    path.join(pageDir, 'plane-plane-relation.wxml'),
    'utf8'
  );
  const wxss = fs.readFileSync(
    path.join(pageDir, 'plane-plane-relation.wxss'),
    'utf8'
  );
  const renderSource = fs.readFileSync(
    path.join(pageDir, 'plane-plane-render.js'),
    'utf8'
  );
  check((wxml.match(/<picker/g) || []).length === 2,
    '顶部只保留两个平面选择器');
  check(wxml.includes('bindchange="handlePlanePPicker"')
    && wxml.includes('bindchange="handlePlaneQPicker"'),
  '两个平面选择器均有独立事件');
  check(wxml.includes('面面相交求交线')
    && wxml.includes('引导作图')
    && wxml.includes('bindtap="handleStepTap"')
    && wxml.includes('bindtap="handleReset"'),
  '页面保持线面页相同的引导与重置结构');
  check(!wxml.includes('result-banner')
    && !wxml.includes('交线结果')
    && !wxml.includes('resultPointText'),
  '底部已删除冗余交线结果栏');
  check(wxss.includes('@import "../line-plane-relation/line-plane-relation.wxss"'),
    '页面复用线面相交页的一致样式骨架');
  check(wxss.includes('width: 44px !important;')
    && wxss.includes('width: 100% !important;'),
  '修复小程序 button 默认宽度覆盖，重置紧凑且主操作铺满');
  check(!wxml.includes('auxiliary-choice')
    && !wxml.includes('selectAuxiliaryPlane'),
  '一般面×一般面不再显示辅助平面方向选择');
  check(wxml.includes('guide-kicker\">引导作图 · {{methodLabel}}')
    && wxml.includes('class="method-status"')
    && wxml.includes('{{accumulationPText}} · {{accumulationQText}}'),
  '页面显示当前求交方法和两平面是否积聚');
  check(!renderSource.includes('drawSpatialPlaneLabels')
    && !renderSource.includes('planeLabels')
    && renderSource.includes("label: 'ABC 积聚'")
    && renderSource.includes("label: 'EFG 积聚'"),
  '画布不再显示 P/Q 标签，积聚提示改用 ABC/EFG');
  check(renderSource.includes('_projectionAccumulationLabels')
    && renderSource.includes('distanceFromPoints'),
  '投影积聚标签选择远离过渡点的端点');
  check(wxml.includes('平面 ABC') && wxml.includes('平面 EFG')
    && !wxml.includes('平面 P') && !wxml.includes('平面 Q'),
  '平面选择器使用 ABC/EFG 名称而非 P/Q');
  check(renderSource.includes('reserveProjectionAxisAreas')
    && renderSource.includes('drawProjectionLabelLeader')
    && renderSource.includes("labels[index] === 'a' && viewType === 'top'"),
  '三视图顶点标注避让坐标轴并提供引导线');

  let pageDefinition = null;
  const previousPage = global.Page;
  global.Page = (definition) => { pageDefinition = definition; };
  try {
    delete require.cache[require.resolve(
      path.join(pageDir, 'plane-plane-relation.js')
    )];
    require(path.join(pageDir, 'plane-plane-relation.js'));
  } finally {
    global.Page = previousPage;
  }
  check(!!pageDefinition, '面面相交页通过 Page() 注册');
  check(pageDefinition.data.planePOptions.length === 4
    && pageDefinition.data.planeQOptions.length === 4,
  '两个平面选择器均提供四种平面类型');
  const handlers = Array.from(
    wxml.matchAll(/bind(?:tap|change|touchstart|touchmove|touchend)="([A-Za-z0-9_]+)"/g),
    (match) => match[1]
  );
  handlers.forEach((handler) => {
    check(typeof pageDefinition[handler] === 'function',
      `WXML 事件 ${handler} 有实现`);
  });

  const page = makePageInstance(pageDefinition);
  page.updateGeometry(
    page.data.planePKind,
    page.data.planeQKind,
    false
  );
  check(page.data.methodKind === 'twoLinePlane'
    && page.data.steps.length === 3,
  '默认一般平面×一般平面展示两次线面求交三步骤');
  check(page.data.currentStep === 1 && page.data.appliedStep === 0,
    '默认停留在第 1 步且未提前作图');
  check(!!page._geometry.intersectionLine,
    '默认两个一般平面生成交线');

  check(page.data.steps[0].title.startsWith('求直线 ')
    && page.data.steps[0].title.endsWith('的交点 K')
    && page.data.steps[1].title.startsWith('求直线 ')
    && page.data.steps[1].title.endsWith('的交点 E'),
  '三步引导分别求两条边线与平面的 K、E 交点');
  const correspondenceCalls = [];
  const originalDrawProjectionPointLinks =
    page.drawProjectionPointLinks;
  page.drawProjectionPointLinks = function recordCorrespondence(
    context,
    point,
    color,
    index,
    total
  ) {
    correspondenceCalls.push({ point, color, index, total });
    return originalDrawProjectionPointLinks.call(
      this,
      context,
      point,
      color,
      index,
      total
    );
  };
  page.handleStepTap({});
  check(page.data.appliedStep === 1,
    '第 1 步只显示当前构造');
  {
    const stepOneText = [];
    const stepOneStrokes = [];
    page.context = makeCanvasContext(stepOneText, stepOneStrokes);
    page.drawScene();
    check(stepOneText.includes('K')
      && stepOneText.includes('R1')
      && stepOneText.includes('R1_H')
      && !stepOneText.includes('R2'),
    '第 1 步绘制辅助面 R1、第一个线面交点 K 及其投影联系');
    check(stepOneStrokes.some((stroke) => stroke.color === '#bda7ff')
      && stepOneStrokes.some((stroke) => stroke.color === '#6d28d9')
      && stepOneStrokes.some((stroke) => stroke.color === '#a27b36'),
    '第 1 步实际绘制辅助面、迹线和 K 的投影连线');
    check(correspondenceCalls.length === 3,
      '第 1 步绘制 K 及紫色构造交线两个端点的三面投影联系');
    const firstSection = page._geometry.lineIntersections[0].sectionLine;
    check(
      base.length(base.subtract(
        correspondenceCalls[0].point,
        firstSection.start
      )) <= 1e-8
      && base.length(base.subtract(
        correspondenceCalls[1].point,
        firstSection.end
      )) <= 1e-8,
      '紫色构造交线两个端点分别生成投影联系'
    );
  }
  page.handleStepTap({});
  check(page.data.currentStep === 2 && page.data.appliedStep === 1,
    '第 2 步等待用户显示');
  page.handleStepTap({});
  check(page.data.appliedStep === 2,
    '第 2 步完成后显示两个共有点');
  {
    const stepTwoText = [];
    const stepTwoStrokes = [];
    page.context = makeCanvasContext(stepTwoText, stepTwoStrokes);
    page.drawScene();
    check(stepTwoText.includes('K') && stepTwoText.includes('E')
      && stepTwoText.includes('R1') && stepTwoText.includes('R2')
      && stepTwoText.includes('R1_H') && stepTwoText.includes('R2_H'),
    '第 2 步同时显示两个辅助面及其线面交点 K、E');
    check(stepTwoStrokes.some((stroke) => stroke.color === '#2f80ed')
      && stepTwoStrokes.some((stroke) => stroke.color === '#1769aa'),
    '第二次求交的辅助面、迹线、交线和端点使用蓝色系');
    check(stepTwoStrokes.some((stroke) => stroke.color === '#a27b36')
      && stepTwoStrokes.some((stroke) => stroke.color === '#c06b62'),
    '第 2 步 K、E 的三面投影联系线均未漏画');
    check(correspondenceCalls.length === 9,
      '第 2 步保留 K 和 R1 交线端点联系，并补齐 E 与 R2 交线端点联系');
    check(correspondenceCalls.filter((call) => (
      call.color === '#bda7ff'
    )).length === 4
      && correspondenceCalls.filter((call) => (
        call.color === '#2f80ed'
      )).length === 2,
    'R1、R2 的构造交线端点投影联系使用不同颜色');
    check(!stepTwoStrokes.some((stroke) => stroke.color === '#ff6b57'),
      '连接交线 L 前的第 2 步不提前显示最终交线');
  }
  page.handleStepTap({});
  page.handleStepTap({});
  check(page.data.isComplete,
    '第 3 步完成并绘制 K、E 定义的交线');

  const drawnText = [];
  const strokeCalls = [];
  page.context = makeCanvasContext(drawnText, strokeCalls);
  page.canvasWidth = 375;
  page.canvasHeight = 460;
  page.drawScene();
  check(!drawnText.includes('P') && !drawnText.includes('Q'),
  '画布仅使用 ABC/EFG 命名平面');
  ['A', 'B', 'C', 'E', 'F', 'G'].forEach((label) => {
    check(drawnText.includes(label),
      `空间图中的三角形顶点标注 ${label}`);
  });
  ['a′', 'b′', 'c′', 'e′', 'f′', 'g′'].forEach((label) => {
    check(drawnText.includes(label),
      `正面投影中的三角形顶点标注 ${label}`);
  });
  check(drawnText.includes('L')
    && drawnText.includes('l') && drawnText.includes('l′')
    && drawnText.includes('l″'),
  '最终状态绘制交线与三面投影');
  check(strokeCalls.some((stroke) => stroke.color === '#ff6b57'),
    '交线使用独立高亮颜色');
  check(strokeCalls.some((stroke) => stroke.color === '#d99725'),
    '两条用作求交的三角形边线被单独高亮');

  const specialPage = makePageInstance(pageDefinition);
  specialPage.data.planeQKind = 'vertical';
  specialPage.updateGeometry(
    'general',
    'vertical',
    false
  );
  specialPage.handleStepTap({});
  specialPage.handleStepTap({});
  specialPage.handleStepTap({});
  const specialCorrespondenceCalls = [];
  const originalSpecialCorrespondence =
    specialPage.drawProjectionPointLinks;
  specialPage.drawProjectionPointLinks = function recordSpecialLines(
    context,
    point,
    color,
    index,
    total
  ) {
    specialCorrespondenceCalls.push({ point, color, index, total });
    return originalSpecialCorrespondence.call(
      this,
      context,
      point,
      color,
      index,
      total
    );
  };
  const projectedLabelLeaders = [];
  const originalProjectionLabelLeader =
    specialPage.drawProjectionLabelLeader;
  specialPage.drawProjectionLabelLeader = function recordLabelLeader(
    context,
    point,
    box,
    color
  ) {
    projectedLabelLeaders.push({ point, box, color });
    return originalProjectionLabelLeader.call(
      this,
      context,
      point,
      box,
      color
    );
  };
  const specialText = [];
  const specialTextCalls = [];
  specialPage.context = makeCanvasContext(
    specialText,
    [],
    specialTextCalls
  );
  specialPage.drawScene();
  check(specialPage.data.appliedStep === 2,
    '特殊位置路径完成两个过渡点步骤');
  check(specialPage._geometry.commonPoints.every((point, index) => (
    base.length(base.subtract(
      point,
      index === 0
        ? specialPage._geometry.intersectionLine.start
        : specialPage._geometry.intersectionLine.end
    )) <= 1e-8
  )), '特殊位置路径绘制交线边界的两个过渡点');
  check(specialCorrespondenceCalls.length === 2,
    '特殊位置路径为两个过渡点各画一组三面投影联系');
  check(projectedLabelLeaders.length > 0,
    '被避让的顶点标签绘制到真实投影点的引导线');
  page.canvasWidth = 320;
  page.canvasHeight = 460;
  check(page.getLayout().split === false
    && page.getLayout().projectionWidth === 320,
  '窄屏使用上下布局且三面投影布满画布');
  page.drawScene();
  page.canvasWidth = 900;
  page.canvasHeight = 420;
  check(page.getLayout().split === true
    && page.getLayout().leftWidth === 450,
  'PAD 宽屏改为左右等分布局');
  page.drawScene();

  page.handlePlanePPicker({ detail: { value: 1 } });
  check(page.data.planePKind === 'vertical'
    && page.data.methodKind === 'plane',
  '切换铅垂面后改用平面积聚性');
  page.handlePlaneQPicker({ detail: { value: 1 } });
  check(page.data.planeQKind === 'vertical'
    && page.data.methodKind === 'none'
    && !page._geometry.intersectionLine
    && page._geometry.commonPoints.length === 0,
  '两个同向铅垂面识别为平行且不伪造交线');
  page.handleReset();
  check(page.data.currentStep === 1
    && page.data.appliedStep === 0
    && page.data.planePKind === 'vertical'
    && page.data.planeQKind === 'vertical',
  '重置只清除作图状态并保留当前两平面类型');

  const generalResetPage = makePageInstance(pageDefinition);
  generalResetPage.updateGeometry(
    generalResetPage.data.planePKind,
    generalResetPage.data.planeQKind,
    false
  );
  generalResetPage.handleStepTap({});
  generalResetPage.handleReset();
  check(generalResetPage.data.methodKind === 'twoLinePlane'
    && generalResetPage.data.appliedStep === 0
    && generalResetPage._geometry.lineIntersections.length === 2,
  '重置保留两个三角形和两条求交边线，只清除作图进度');

  const unifiedVerticalPage = makePageInstance(pageDefinition);
  unifiedVerticalPage.handlePlanePPicker({ detail: { value: 1 } });
  const unifiedGeneralPage = makePageInstance(pageDefinition);
  unifiedGeneralPage.handlePlaneQPicker({ detail: { value: 1 } });
  check(
    planeTriangleCoordinates(unifiedGeneralPage._geometry.planeP)
      === planeTriangleCoordinates(unifiedVerticalPage._geometry.planeQ)
      && planeTriangleCoordinates(unifiedGeneralPage._geometry.planeQ)
        === planeTriangleCoordinates(unifiedVerticalPage._geometry.planeP),
    '页面正反选择复用同一对 ABC、EFG 三角形'
  );
  check(
    intersectionPointSet(unifiedGeneralPage._geometry)
      === intersectionPointSet(unifiedVerticalPage._geometry),
    '页面正反选择复用同一条交线'
  );
  check(
    unifiedVerticalPage.data.planePKind === 'vertical'
      && unifiedVerticalPage.data.planeQKind === 'general'
      && unifiedGeneralPage.data.planePKind === 'general'
      && unifiedGeneralPage.data.planeQKind === 'vertical',
    '页面正反选择保持用户指定的左右角色'
  );

  const unifiedFrontPage = makePageInstance(pageDefinition);
  unifiedFrontPage.handlePlanePPicker({ detail: { value: 2 } });
  const unifiedGeneralFrontPage = makePageInstance(pageDefinition);
  unifiedGeneralFrontPage.handlePlaneQPicker({ detail: { value: 2 } });
  check(
    planeTriangleCoordinates(unifiedGeneralFrontPage._geometry.planeP)
      === planeTriangleCoordinates(unifiedFrontPage._geometry.planeQ)
      && planeTriangleCoordinates(unifiedGeneralFrontPage._geometry.planeQ)
        === planeTriangleCoordinates(unifiedFrontPage._geometry.planeP),
    '正垂面页面的正反选择复用同一对 ABC、EFG 三角形'
  );
  check(
    intersectionPointSet(unifiedGeneralFrontPage._geometry)
      === intersectionPointSet(unifiedFrontPage._geometry),
    '正垂面页面的正反选择复用同一条交线'
  );
  check(
    unifiedFrontPage.data.planePKind === 'frontProjecting'
      && unifiedFrontPage.data.planeQKind === 'general'
      && unifiedGeneralFrontPage.data.planePKind === 'general'
      && unifiedGeneralFrontPage.data.planeQKind === 'frontProjecting',
    '正垂面页面正反选择保持用户指定的左右角色'
  );

  const unifiedProfilePage = makePageInstance(pageDefinition);
  unifiedProfilePage.handlePlanePPicker({ detail: { value: 3 } });
  const unifiedGeneralProfilePage = makePageInstance(pageDefinition);
  unifiedGeneralProfilePage.handlePlaneQPicker({ detail: { value: 3 } });
  check(
    planeTriangleCoordinates(unifiedGeneralProfilePage._geometry.planeP)
      === planeTriangleCoordinates(unifiedProfilePage._geometry.planeQ)
      && planeTriangleCoordinates(unifiedGeneralProfilePage._geometry.planeQ)
        === planeTriangleCoordinates(unifiedProfilePage._geometry.planeP),
    '侧垂面页面的正反选择复用同一对 ABC、EFG 三角形'
  );
  check(
    intersectionPointSet(unifiedGeneralProfilePage._geometry)
      === intersectionPointSet(unifiedProfilePage._geometry),
    '侧垂面页面的正反选择复用同一条交线'
  );
  check(
    unifiedProfilePage.data.planePKind === 'profileProjecting'
      && unifiedProfilePage.data.planeQKind === 'general'
      && unifiedGeneralProfilePage.data.planePKind === 'general'
      && unifiedGeneralProfilePage.data.planeQKind === 'profileProjecting',
    '侧垂面页面正反选择保持用户指定的左右角色'
  );

  console.log(`plane-plane-relation-check: ${checks}/${checks} 通过`);
}

try {
  main();
} catch (error) {
  console.error('plane-plane-relation-check: FAIL');
  console.error(error && error.stack || error);
  process.exitCode = 1;
}
