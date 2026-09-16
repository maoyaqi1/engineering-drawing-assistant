// 基本立体（F4）的三视图绘制：轮廓线、不可见细虚线、曲面体中心线，以及线的可见性判定。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  // 三视图遮挡测试的投影包围盒预筛容差（逻辑像素）。
  // getBarycentricCoordinates 允许 -1e-5 的重心松弛，折算到屏幕不超过约 5e-3 逻辑像素；
  // 这里取 0.02 留足余量，既保证与逐三角形全量测试结果一致，也不会让预筛失效。
  const VIEW_TRIANGLE_BOX_TOLERANCE = 0.02;

  module.exports = {
    drawSolidProjection(context, solid, viewType) {
      const lineSets = this.getProjectionLineSets(solid, viewType);
      context.save();
      context.strokeStyle = '#9aa5b2';
      context.lineWidth = 0.75;
      context.setLineDash([3, 3]);
      lineSets.hidden.forEach((edge) => {
        this.drawLine(
          context,
          this.projectPointToView(edge[0], viewType),
          this.projectPointToView(edge[1], viewType)
        );
      });
      // 可见线后画，避免同位置的隐藏线虚线覆盖可见实线。
      context.strokeStyle = '#4d5a69';
      context.lineWidth = 1.35;
      context.setLineDash([]);
      lineSets.visible.forEach((edge) => {
        this.drawLine(
          context,
          this.projectPointToView(edge[0], viewType),
          this.projectPointToView(edge[1], viewType)
        );
      });
      context.restore();
    },

    drawProjectionCenterLines(context, solid, solidType, viewType) {
      const rotationalTypes = ['cylinder', 'cone', 'sphere', 'torus'];
      if (!rotationalTypes.includes(solidType) || !solid.renderTriangles.length) return;
      const vertices = [];
      solid.renderTriangles.forEach((triangle) => triangle.forEach((vertex) => vertices.push(vertex)));
      const bounds = vertices.reduce((result, vertex) => ({
        minX: Math.min(result.minX, vertex.x),
        maxX: Math.max(result.maxX, vertex.x),
        minY: Math.min(result.minY, vertex.y),
        maxY: Math.max(result.maxY, vertex.y),
        minZ: Math.min(result.minZ, vertex.z),
        maxZ: Math.max(result.maxZ, vertex.z)
      }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity });
      const extension = 0.35;
      const center = { x: 4, y: 4, z: 4 };
      const lines = [];
      if (viewType === 'front') {
        lines.push([
          { x: center.x, y: center.y, z: bounds.minZ - extension },
          { x: center.x, y: center.y, z: bounds.maxZ + extension }
        ]);
        if (solidType === 'sphere' || solidType === 'torus') {
          lines.push([
            { x: bounds.minX - extension, y: center.y, z: center.z },
            { x: bounds.maxX + extension, y: center.y, z: center.z }
          ]);
        }
      } else if (viewType === 'left') {
        lines.push([
          { x: center.x, y: center.y, z: bounds.minZ - extension },
          { x: center.x, y: center.y, z: bounds.maxZ + extension }
        ]);
        if (solidType === 'sphere' || solidType === 'torus') {
          lines.push([
            { x: center.x, y: bounds.minY - extension, z: center.z },
            { x: center.x, y: bounds.maxY + extension, z: center.z }
          ]);
        }
      } else {
        lines.push([
          { x: bounds.minX - extension, y: center.y, z: center.z },
          { x: bounds.maxX + extension, y: center.y, z: center.z }
        ], [
          { x: center.x, y: bounds.minY - extension, z: center.z },
          { x: center.x, y: bounds.maxY + extension, z: center.z }
        ]);
      }
      context.save();
      context.strokeStyle = '#718091';
      context.lineWidth = 0.7;
      context.setLineDash([8, 2, 1.5, 2]);
      lines.forEach((line) => this.drawLine(
        context,
        this.projectPointToView(line[0], viewType),
        this.projectPointToView(line[1], viewType)
      ));
      context.restore();
    },

    getProjectionLineSets(solid, viewType) {
      if (!solid.projectionLineSets) solid.projectionLineSets = {};
      if (solid.projectionLineSets[viewType]) return solid.projectionLineSets[viewType];
      const viewDirections = {
        front: { x: 0, y: 1, z: 0 },
        top: { x: 0, y: 0, z: 1 },
        left: { x: 1, y: 0, z: 0 }
      };
      const viewDirection = viewDirections[viewType];
      const edgeMap = new Map();
      const vertexKey = (vertex) => `${Math.round(vertex.x * 1e6)}:${Math.round(vertex.y * 1e6)}:${Math.round(vertex.z * 1e6)}`;
      solid.renderTriangles.forEach((triangle) => {
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
        if (normal.x * normal.x + normal.y * normal.y + normal.z * normal.z <= 1e-12) return;
        const facing = normal.x * viewDirection.x + normal.y * viewDirection.y + normal.z * viewDirection.z;
        for (let index = 0; index < 3; index += 1) {
          const next = (index + 1) % 3;
          const firstKey = vertexKey(triangle[index]);
          const secondKey = vertexKey(triangle[next]);
          const key = firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
          if (!edgeMap.has(key)) edgeMap.set(key, { edge: [triangle[index], triangle[next]], facings: [], normals: [] });
          const entry = edgeMap.get(key);
          entry.facings.push(facing);
          entry.normals.push(normal);
        }
      });
      const tolerance = 1e-7;
      // 高于 35° 才视为结构棱，避免把圆球、圆环的参数分段误画成网格线。
      const sharpCosine = Math.cos(35 * Math.PI / 180);
      const candidateEdges = [];
      edgeMap.forEach((entry) => {
        if (entry.facings.length === 1) {
          candidateEdges.push(entry.edge);
          return;
        }
        const hasPositive = entry.facings.some((value) => value > tolerance);
        const hasNegative = entry.facings.some((value) => value < -tolerance);
        const hasTangent = entry.facings.some((value) => Math.abs(value) <= tolerance);
        const hasFacingSurface = entry.facings.some((value) => Math.abs(value) > tolerance);
        let isSharp = false;
        if (entry.normals.length >= 2) {
          const first = entry.normals[0];
          const second = entry.normals[1];
          const firstLength = Math.hypot(first.x, first.y, first.z) || 1;
          const secondLength = Math.hypot(second.x, second.y, second.z) || 1;
          const cosine = (first.x * second.x + first.y * second.y + first.z * second.z) / (firstLength * secondLength);
          isSharp = cosine < sharpCosine;
        }
        if ((hasPositive && hasNegative) || (hasTangent && hasFacingSurface) || isSharp) candidateEdges.push(entry.edge);
      });
      const lineSets = { visible: [], hidden: [] };
      // 预筛索引按视图构建一次，供本条棱的遮挡测试复用（见 buildViewTriangleIndex）。
      const triangleIndex = this.buildViewTriangleIndex(solid.renderTriangles, viewType);
      candidateEdges.forEach((edge) => {
        if (this.isProjectionEdgeVisible(edge, solid.renderTriangles, viewType, triangleIndex)) lineSets.visible.push(edge);
        else lineSets.hidden.push(edge);
      });
      solid.projectionLineSets[viewType] = lineSets;
      return lineSets;
    },

    // 把某视图下全部三角形投影一次，并算出各自的屏幕包围盒。
    // 重心坐标要求投影中点落在三角形内，落在包围盒外的三角形不可能命中，
    // 因此这一步只是把「每条候选棱 × 全部三角形」的遮挡测试从 O(棱 × 三角形) 降到近似 O(棱)，
    // 判定公式与容差完全不变（曲面体切割时单帧三视图约 80 ms → 约 8 ms）。
    buildViewTriangleIndex(triangles, viewType) {
      const tolerance = VIEW_TRIANGLE_BOX_TOLERANCE;
      const projected = [];
      const boxes = [];
      triangles.forEach((triangle) => {
        const first = this.projectPointToView(triangle[0], viewType);
        const second = this.projectPointToView(triangle[1], viewType);
        const third = this.projectPointToView(triangle[2], viewType);
        projected.push([first, second, third]);
        boxes.push({
          minX: Math.min(first.x, second.x, third.x) - tolerance,
          maxX: Math.max(first.x, second.x, third.x) + tolerance,
          minY: Math.min(first.y, second.y, third.y) - tolerance,
          maxY: Math.max(first.y, second.y, third.y) + tolerance
        });
      });
      return { viewType, projected, boxes };
    },

    isProjectionEdgeVisible(edge, triangles, viewType, preparedIndex) {
      // 预筛索引必须与当前 triangles 一一对应，否则退回全量构建，避免错位误判。
      const triangleIndex = (preparedIndex && preparedIndex.viewType === viewType
        && preparedIndex.projected.length === triangles.length)
        ? preparedIndex
        : this.buildViewTriangleIndex(triangles, viewType);
      const projectedStart = this.projectPointToView(edge[0], viewType);
      const projectedEnd = this.projectPointToView(edge[1], viewType);
      const midpoint = {
        x: (projectedStart.x + projectedEnd.x) / 2,
        y: (projectedStart.y + projectedEnd.y) / 2
      };
      const edgeDepth = (this.getViewDepth(edge[0], viewType) + this.getViewDepth(edge[1], viewType)) / 2;
      let nearestDepth = -Infinity;
      for (let index = 0; index < triangles.length; index += 1) {
        const box = triangleIndex.boxes[index];
        if (midpoint.x < box.minX || midpoint.x > box.maxX || midpoint.y < box.minY || midpoint.y > box.maxY) continue;
        const triangle = triangles[index];
        const barycentric = this.getBarycentricCoordinates(midpoint, triangleIndex.projected[index]);
        if (!barycentric) continue;
        const depth = barycentric[0] * this.getViewDepth(triangle[0], viewType)
          + barycentric[1] * this.getViewDepth(triangle[1], viewType)
          + barycentric[2] * this.getViewDepth(triangle[2], viewType);
        if (depth > nearestDepth) nearestDepth = depth;
      }
      return nearestDepth <= edgeDepth + 1e-4;
    }
  };
})();
