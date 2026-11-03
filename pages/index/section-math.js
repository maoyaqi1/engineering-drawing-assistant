// 立体可见性与平面裁剪计算：棱线朝向、等轴测深度判定、三角形 / 多边形按截平面裁剪。
// 属 F2/F3 的几何判定层，只做判定与裁剪，不绘制；所有点和距离都在教学模型空间，
// 只有调用 projectIsometric 后的中点、宽度与深度属于固定等轴测视图空间。
//
// 本模块中的容差服务于不同语义，不能合并为一个常量：
//   · 1e-8：模型空间中的点/边退化判定；
//   · 1e-4：等轴测深度遮挡的显示容差；
//   · edgeLength * 1e-5：投影边界判定的相对容差，随棱长缩放。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const { ISOMETRIC_DEPTH_Z } = require('./constants.js');

  module.exports = {
    isSpatialFeatureEdgeVisible(originalEdge, clippedEdge, solid, surfaceTriangles) {
      // 多面体有离散面法向，可用原棱关联面的朝向判断，裁短后不会因端点丢失而误判。
      // 曲面体的候选母线没有稳定的两面关系，退回等轴测中点遮挡测试。
      if (solid.type === 'triangularPyramid' || solid.type === 'pentagonalPrism') {
        const facings = this.getPolyhedronEdgeFacings(solid, originalEdge);
        if (facings.length) return facings.some((facing) => facing >= -1e-8);
      }
      return this.isIsometricEdgeVisible(clippedEdge, surfaceTriangles);
    },

    getPolyhedronEdgeFacings(solid, edge) {
      // 首次调用时把每条网格边关联的面朝向缓存到 solid 上；顶点键量化到 1e-6，
      // 用于抵消同一顶点经不同三角形计算时的微小浮点差异。
      if (!solid.polyhedronEdgeFacings) {
        const edgeMap = new Map();
        const vertexKey = (vertex) => `${Math.round(vertex.x * 1e6)}:${Math.round(vertex.y * 1e6)}:${Math.round(vertex.z * 1e6)}`;
        solid.triangles.forEach((triangle) => {
          const ab = {
            x: triangle[1].x - triangle[0].x,
            y: triangle[1].y - triangle[0].y,
            z: triangle[1].z - triangle[0].z
          };
          const ac = {
            x: triangle[2].x - triangle[0].x,
            y: triangle[2].y - triangle[0].y,
            z: triangle[2].z - triangle[0].z
          };
          const normal = {
            x: ab.y * ac.z - ab.z * ac.y,
            y: ab.z * ac.x - ab.x * ac.z,
            z: ab.x * ac.y - ab.y * ac.x
          };
          const facing = normal.x + normal.y + normal.z * ISOMETRIC_DEPTH_Z;
          for (let index = 0; index < 3; index += 1) {
            const next = (index + 1) % 3;
            const keys = [vertexKey(triangle[index]), vertexKey(triangle[next])].sort();
            const key = `${keys[0]}|${keys[1]}`;
            if (!edgeMap.has(key)) edgeMap.set(key, []);
            edgeMap.get(key).push(facing);
          }
        });
        solid.polyhedronEdgeFacings = edgeMap;
      }
      const vertexKey = (vertex) => `${Math.round(vertex.x * 1e6)}:${Math.round(vertex.y * 1e6)}:${Math.round(vertex.z * 1e6)}`;
      const keys = [vertexKey(edge[0]), vertexKey(edge[1])].sort();
      return solid.polyhedronEdgeFacings.get(`${keys[0]}|${keys[1]}`) || [];
    },

    isIsometricEdgeVisible(edge, triangles) {
      // 取投影后棱中点为采样点，用重心坐标插值遮挡三角形的深度。
      // 1e-4 是显示判定容差，用来避免共边/相切轮廓在相邻帧之间闪烁。
      const projectedStart = this.projectIsometric(edge[0]);
      const projectedEnd = this.projectIsometric(edge[1]);
      const midpoint = {
        x: (projectedStart.x + projectedEnd.x) / 2,
        y: (projectedStart.y + projectedEnd.y) / 2
      };
      const edgeDepth = (this.getIsometricDepth(edge[0]) + this.getIsometricDepth(edge[1])) / 2;
      let nearestDepth = -Infinity;
      triangles.forEach((triangle) => {
        const projected = triangle.map((vertex) => this.projectIsometric(vertex));
        const barycentric = this.getBarycentricCoordinates(midpoint, projected);
        if (!barycentric) return;
        const depth = barycentric[0] * this.getIsometricDepth(triangle[0])
          + barycentric[1] * this.getIsometricDepth(triangle[1])
          + barycentric[2] * this.getIsometricDepth(triangle[2]);
        nearestDepth = Math.max(nearestDepth, depth);
      });
      return nearestDepth <= edgeDepth + 1e-4;
    },

    getSpatialFeatureEdges(solid) {
      // 球和圆环的轮廓由绘制层按投影边界生成，不输出固定母线。
      // 圆柱、圆锥保留底圆和端盖棱；轴向母线只保留投影边界，避免画成密集网格。
      if (solid.type === 'sphere' || solid.type === 'torus') return [];
      if (solid.type === 'cylinder' || solid.type === 'cone') {
        if (!solid.spatialSilhouetteEdges) {
          solid.spatialSilhouetteEdges = solid.edges.filter((edge) => {
            const isGenerator = Math.abs(edge[0].z - edge[1].z) > 1e-8;
            return !isGenerator || this.isProjectedBoundaryEdge(edge, solid.triangles);
          });
        }
        return solid.spatialSilhouetteEdges;
      }
      return solid.edges;
    },

    isProjectedBoundaryEdge(edge, triangles) {
      // 若所有表面顶点在投影平面内都落在这条棱的同一侧，该棱就是投影外轮廓的一部分。
      // 容差按当前投影边长缩放，因此长短棱在屏幕空间具有一致的相对判定尺度。
      const start = this.projectIsometric(edge[0]);
      const end = this.projectIsometric(edge[1]);
      const edgeX = end.x - start.x;
      const edgeY = end.y - start.y;
      const edgeLength = Math.hypot(edgeX, edgeY);
      if (edgeLength <= 1e-8) return false;
      let hasPositive = false;
      let hasNegative = false;
      const tolerance = edgeLength * 1e-5;
      triangles.forEach((triangle) => {
        triangle.forEach((vertex) => {
          const projected = this.projectIsometric(vertex);
          const side = edgeX * (projected.y - start.y) - edgeY * (projected.x - start.x);
          if (side > tolerance) hasPositive = true;
          if (side < -tolerance) hasNegative = true;
        });
      });
      return !(hasPositive && hasNegative);
    },

    clipSegmentByPlane(edge, plane, keepSign) {
      // 将带符号距离乘以 keepSign 后，“保留侧”统一变为 >= 0。
      // 返回 null 表示整条线段被裁掉；返回原数组表示完全保留；
      // 返回 [保留端点, 交点] 顺序的短线段表示只保留一端。
      const distances = edge.map((vertex) => keepSign * (
        vertex.x * plane.normal.x + vertex.y * plane.normal.y + vertex.z * plane.normal.z - plane.constant
      ));
      const insideFirst = distances[0] >= -1e-8;
      const insideSecond = distances[1] >= -1e-8;
      if (!insideFirst && !insideSecond) return null;
      if (insideFirst && insideSecond) return edge;
      const t = distances[0] / (distances[0] - distances[1]);
      const intersection = {
        x: edge[0].x + (edge[1].x - edge[0].x) * t,
        y: edge[0].y + (edge[1].y - edge[0].y) * t,
        z: edge[0].z + (edge[1].z - edge[0].z) * t
      };
      return insideFirst ? [edge[0], intersection] : [intersection, edge[1]];
    },

    getSectionSideSigns(plane) {
      // 取模型上方测试点 (4,8,?) 的 X/Z 分量所在半空间为切除侧，
      // 保证“上部切除”语义不随正垂面角度翻转。
      // retainedSign 与 removedSign 始终相反，供裁剪和封盖共同使用。
      const topDistance = 4 * plane.normal.x + 8 * plane.normal.z - plane.constant;
      const removedSign = topDistance >= 0 ? 1 : -1;
      return { removedSign, retainedSign: -removedSign };
    },

    createClippedTriangles(triangles, plane, keepSign) {
      // 三角形被平面裁剪后是凸多边形，因此可安全地以首顶点做扇形三角化。
      const clippedTriangles = [];
      triangles.forEach((triangle) => {
        const polygon = this.clipPolygonByPlane(triangle, plane, keepSign);
        for (let index = 1; index < polygon.length - 1; index += 1) {
          clippedTriangles.push([polygon[0], polygon[index], polygon[index + 1]]);
        }
      });
      return clippedTriangles;
    },

    clipPolygonByPlane(vertices, plane, keepSign) {
      // Sutherland-Hodgman 半空间裁剪：逐边保留内侧端点，并在跨越平面时插入交点。
      // 输入/输出均为世界模型坐标；keepSign 仅改变“哪一侧算内侧”，不修改原点和平面。
      const clipped = [];
      for (let index = 0; index < vertices.length; index += 1) {
        const current = vertices[index];
        const next = vertices[(index + 1) % vertices.length];
        const currentDistance = keepSign * (
          current.x * plane.normal.x + current.y * plane.normal.y + current.z * plane.normal.z - plane.constant
        );
        const nextDistance = keepSign * (
          next.x * plane.normal.x + next.y * plane.normal.y + next.z * plane.normal.z - plane.constant
        );
        const currentInside = currentDistance >= -1e-8;
        const nextInside = nextDistance >= -1e-8;
        if (currentInside) clipped.push(current);
        if (currentInside !== nextInside) {
          const t = currentDistance / (currentDistance - nextDistance);
          clipped.push({
            x: current.x + (next.x - current.x) * t,
            y: current.y + (next.y - current.y) * t,
            z: current.z + (next.z - current.z) * t
          });
        }
      }
      return clipped;
    }
  };
})();
