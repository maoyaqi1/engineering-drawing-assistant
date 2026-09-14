// 立体可见性与平面裁剪计算：棱线朝向、等轴测深度判定、三角形 / 多边形按截平面裁剪。
// 属 F2/F3 的几何判定层，只做判定与裁剪，不绘制。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const { ISOMETRIC_DEPTH_Z } = require('./constants.js');

  module.exports = {
    isSpatialFeatureEdgeVisible(originalEdge, clippedEdge, solid, surfaceTriangles) {
      if (solid.type === 'triangularPyramid' || solid.type === 'pentagonalPrism') {
        const facings = this.getPolyhedronEdgeFacings(solid, originalEdge);
        if (facings.length) return facings.some((facing) => facing >= -1e-8);
      }
      return this.isIsometricEdgeVisible(clippedEdge, surfaceTriangles);
    },

    getPolyhedronEdgeFacings(solid, edge) {
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
      // 取模型上方测试点所在半空间为切除侧，保证“上部切除”语义不随角度翻转。
      const topDistance = 4 * plane.normal.x + 8 * plane.normal.z - plane.constant;
      const removedSign = topDistance >= 0 ? 1 : -1;
      return { removedSign, retainedSign: -removedSign };
    },

    createClippedTriangles(triangles, plane, keepSign) {
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
