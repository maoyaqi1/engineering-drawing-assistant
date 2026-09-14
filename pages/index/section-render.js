// 平面切割立体（F3）的绘制：截交结果计算、空间图截交叠加、三视图截交投影、截断立体绘制。
// 几何真值来自 section-geometry.js（F2），这里只负责表现。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {
  const SectionGeometry = require('./section-geometry.js');
  const { ISOMETRIC_DEPTH_Z } = require('./constants.js');

  module.exports = {
    getSectionResult() {
      if (!this.sectionSolidCache) this.sectionSolidCache = {};
      const solidType = this.data.section.solidType;
      const resultKey = `${solidType}:${this.data.section.angle}:${this.data.section.offset}`;
      if (this.sectionResultCache && this.sectionResultCache.key === resultKey) {
        return this.sectionResultCache.value;
      }
      if (!this.sectionSolidCache[solidType]) {
        this.sectionSolidCache[solidType] = SectionGeometry.createSolid(solidType);
        this.sectionSolidCache[solidType].type = solidType;
      }
      const solid = this.sectionSolidCache[solidType];
      const plane = SectionGeometry.createCuttingPlane(this.data.section.angle, this.data.section.offset);
      const sectionSegments = SectionGeometry.intersectSolid(solid, plane);
      const sideSigns = this.getSectionSideSigns(plane);
      const retainedTriangles = this.createClippedTriangles(solid.renderTriangles, plane, sideSigns.retainedSign);
      const removedTriangles = this.createClippedTriangles(solid.renderTriangles, plane, sideSigns.removedSign);
      const sectionCapTriangles = SectionGeometry.createSectionCaps(sectionSegments, plane, sideSigns.removedSign);
      const retainedClosedTriangles = retainedTriangles.concat(sectionCapTriangles);
      const retainedSolid = { renderTriangles: retainedClosedTriangles, projectionLineSets: {} };
      const value = {
        solid,
        plane,
        sectionSegments,
        sideSigns,
        retainedSolid,
        retainedTriangles,
        removedTriangles,
        sectionCapTriangles
      };
      this.sectionResultCache = { key: resultKey, value };
      return value;
    },

    drawSectionIsometricOverlay(context) {
      const { solid, plane, sectionSegments, sideSigns, retainedTriangles, removedTriangles } = this.getSectionResult();
      const planeBoundary = this.getCuttingPlaneBoundary(plane);
      context.save();
      this.drawRenderedSolid(context, solid, plane, sideSigns.removedSign, false);
      this.drawSpatialSolidEdges(context, solid, plane, sideSigns.removedSign, false, removedTriangles);
      this.drawRenderedSolid(context, solid, plane, sideSigns.retainedSign, true);
      this.drawSpatialSolidEdges(context, solid, plane, sideSigns.retainedSign, true, retainedTriangles);
      // 截平面是虚拟教学辅助面，不参与实体遮挡，始终作为顶层覆盖显示。
      if (planeBoundary.length === 4) {
        this.drawPolygon(
          context,
          planeBoundary.map((vertex) => this.projectIsometric(vertex)),
          'rgba(235, 55, 62, 0.22)',
          '#ff3b43',
          2
        );
      }
      context.strokeStyle = '#ff4f53';
      context.lineWidth = 3;
      sectionSegments.forEach((segment) => {
        this.drawLine(context, this.projectIsometric(segment[0]), this.projectIsometric(segment[1]));
      });
      context.restore();
    },

    drawSpatialSolidEdges(context, solid, plane, keepSign, isRetained, surfaceTriangles) {
      const featureEdges = this.getSpatialFeatureEdges(solid);
      const lineSets = { visible: [], hidden: [] };
      featureEdges.forEach((edge) => {
        const clippedEdge = this.clipSegmentByPlane(edge, plane, keepSign);
        if (!clippedEdge) return;
        if (this.isSpatialFeatureEdgeVisible(edge, clippedEdge, solid, surfaceTriangles)) lineSets.visible.push(clippedEdge);
        else lineSets.hidden.push(clippedEdge);
      });
      context.save();
      context.strokeStyle = isRetained ? 'rgba(255, 255, 255, 0.72)' : 'rgba(218, 230, 236, 0.28)';
      context.lineWidth = isRetained ? 0.65 : 0.55;
      context.setLineDash([2.5, 3]);
      lineSets.hidden.forEach((clippedEdge) => {
        this.drawLine(
          context,
          this.projectIsometric(clippedEdge[0]),
          this.projectIsometric(clippedEdge[1])
        );
      });
      context.strokeStyle = isRetained ? '#ffffff' : 'rgba(225, 238, 244, 0.52)';
      context.lineWidth = isRetained ? 1.35 : 0.75;
      context.setLineDash([]);
      lineSets.visible.forEach((clippedEdge) => {
        this.drawLine(
          context,
          this.projectIsometric(clippedEdge[0]),
          this.projectIsometric(clippedEdge[1])
        );
      });
      context.restore();
    },

    drawSectionPointCorrespondence(context) {
      const result = this.getSectionResult();
      const segments = result.sectionSegments;
      if (!segments || !segments.length) return;
      const loops = SectionGeometry.createSectionLoops(segments);
      if (!loops.length) return;
      const metrics = this.getProjectionMetrics();
      const origin = metrics.origin;
      const unit = metrics.unit;
      const color = '#c9d0d8';
      const key = (p) => `${Math.round(p.x * 1e6)}:${Math.round(p.y * 1e6)}:${Math.round(p.z * 1e6)}`;
      const reps = [];
      loops.forEach((loop) => {
        this.simplifyLoopVertices(loop).forEach((point) => {
          const k = key(point);
          if (!reps.some((existing) => key(existing) === k)) reps.push(point);
        });
      });
      const step = Math.max(1, Math.ceil(reps.length / 6));
      const selected = [];
      for (let index = 0; index < reps.length; index += step) selected.push(reps[index]);
      context.save();
      context.strokeStyle = color;
      context.lineWidth = 0.8;
      context.setLineDash([]);
      selected.forEach((point) => {
        const front = { x: origin.x - point.x * unit, y: origin.y - point.z * unit };
        const top = { x: origin.x - point.x * unit, y: origin.y + point.y * unit };
        const left = { x: origin.x + point.y * unit, y: origin.y - point.z * unit };
        const topAxis = { x: origin.x, y: top.y };
        const leftAxis = { x: left.x, y: origin.y };
        // 长对正：正视↔俯视（共 X）；高平齐：正视↔左视（共 Z）
        this.drawProjectionLine(context, front, top, color);
        this.drawProjectionLine(context, front, left, color);
        // 投影点引向对应投影轴的辅助对应线
        this.drawProjectionLine(context, top, topAxis, color);
        this.drawProjectionLine(context, leftAxis, left, color);
        // 宽相等：该点 H 宽度与 W 宽度之间的转位弧（与点/线/面一致）
        this.drawQuarterTurnForY(context, point.y, origin, unit);
        [front, top, left].forEach((projected) => this.drawDot(context, projected, color));
      });
      context.restore();
    },

    drawSectionProjectionOverlay(context) {
      const { solid, plane, sectionSegments, retainedSolid } = this.getSectionResult();
      const views = ['front', 'top', 'left'];
      context.save();
      this.drawSectionPointCorrespondence(context);
      views.forEach((viewType) => {
        this.drawProjectionCenterLines(context, retainedSolid, solid.type, viewType);
        this.drawSolidProjection(context, retainedSolid, viewType);
      });
      const frontLine = this.getCuttingPlaneXZSegment(plane);
      if (frontLine.length === 2) {
        context.strokeStyle = '#e66a6e';
        context.lineWidth = 1.5;
        this.drawLine(
          context,
          this.projectPointToView(frontLine[0], 'front'),
          this.projectPointToView(frontLine[1], 'front')
        );
        this.drawText(
          context,
          'Pv',
          this.projectPointToView(frontLine[1], 'front').x + 4,
          this.projectPointToView(frontLine[1], 'front').y - 4,
          '#c93f45',
          10,
          '600'
        );
      }
      const sectionLoops = SectionGeometry.createSectionLoops(sectionSegments);
      context.strokeStyle = '#e23840';
      context.lineWidth = 2.8;
      context.setLineDash([]);
      views.forEach((viewType) => {
        const drawLoop = (loop) => {
          const projected = loop.map((point) => this.projectPointToView(point, viewType));
          if (projected.length < 2) return;
          context.beginPath();
          context.moveTo(projected[0].x, projected[0].y);
          for (let index = 1; index < projected.length; index += 1) {
            context.lineTo(projected[index].x, projected[index].y);
          }
          context.closePath();
          context.stroke();
        };
        if (sectionLoops.length) {
          sectionLoops.forEach(drawLoop);
        } else {
          sectionSegments.forEach((segment) => {
            this.drawLine(
              context,
              this.projectPointToView(segment[0], viewType),
              this.projectPointToView(segment[1], viewType)
            );
          });
        }
      });
      context.restore();
    },

    drawRenderedSolid(context, solid, plane, keepSign, isRetained) {
      const light = { x: -0.35, y: -0.45, z: 0.82 };
      const renderTriangles = [];
      solid.renderTriangles.forEach((triangle) => {
        const clippedPolygon = this.clipPolygonByPlane(triangle, plane, keepSign);
        if (clippedPolygon.length < 3) return;
        const projected = clippedPolygon.map((vertex) => this.projectIsometric(vertex));
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
        const length = Math.hypot(normal.x, normal.y, normal.z) || 1;
        const diffuse = Math.abs((normal.x * light.x + normal.y * light.y + normal.z * light.z) / length);
        const intensity = 0.55 + diffuse * 0.45;
        const red = Math.round(35 + 55 * intensity);
        const green = Math.round(105 + 100 * intensity);
        const blue = Math.round(145 + 100 * intensity);
        renderTriangles.push({
          projected,
          depth: clippedPolygon.reduce((sum, vertex) => sum + vertex.x + vertex.y + vertex.z * ISOMETRIC_DEPTH_Z, 0) / clippedPolygon.length,
          color: isRetained ? `rgb(${red}, ${green}, ${blue})` : 'rgba(205, 220, 230, 0.18)'
        });
      });
      renderTriangles.sort((first, second) => first.depth - second.depth);
      renderTriangles.forEach((renderTriangle) => {
        for (let index = 1; index < renderTriangle.projected.length - 1; index += 1) {
          this.fillTriangle(
            context,
            [renderTriangle.projected[0], renderTriangle.projected[index], renderTriangle.projected[index + 1]],
            renderTriangle.color
          );
        }
      });
    },

    getCuttingPlaneXZSegment(plane) {
      const candidates = [];
      const addCandidate = (x, z) => {
        if (x < -1e-8 || x > 8 + 1e-8 || z < -1e-8 || z > 8 + 1e-8) return;
        if (!candidates.some((candidate) => Math.hypot(candidate.x - x, candidate.z - z) < 1e-7)) {
          candidates.push({ x, y: 0, z });
        }
      };
      const { x: normalX, z: normalZ } = plane.normal;
      if (Math.abs(normalZ) > 1e-8) {
        addCandidate(0, plane.constant / normalZ);
        addCandidate(8, (plane.constant - normalX * 8) / normalZ);
      }
      if (Math.abs(normalX) > 1e-8) {
        addCandidate(plane.constant / normalX, 0);
        addCandidate((plane.constant - normalZ * 8) / normalX, 8);
      }
      if (candidates.length <= 2) return candidates;
      let pair = [candidates[0], candidates[1]];
      let longest = 0;
      for (let first = 0; first < candidates.length; first += 1) {
        for (let second = first + 1; second < candidates.length; second += 1) {
          const distance = Math.hypot(candidates[first].x - candidates[second].x, candidates[first].z - candidates[second].z);
          if (distance > longest) {
            longest = distance;
            pair = [candidates[first], candidates[second]];
          }
        }
      }
      return pair;
    },

    getCuttingPlaneBoundary(plane) {
      const frontLine = this.getCuttingPlaneXZSegment(plane);
      if (frontLine.length !== 2) return [];
      return [
        { ...frontLine[0], y: 0 },
        { ...frontLine[1], y: 0 },
        { ...frontLine[1], y: 8 },
        { ...frontLine[0], y: 8 }
      ];
    }
  };
})();
