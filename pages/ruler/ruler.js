const geo = require('../../utils/geo.js');

const HIT_PX = 26;
const GRID = 1;
const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const TWO_PI = Math.PI * 2;

function snap(v) { return Math.round(v * 2) / 2; }

Page({
  data: {
    tool: 'pan',
    status: '',
    count: 0,
    playing: false,
    playIndexText: '',
    playStepDesc: ''
  },

  onReady() {
    this.canvas = null;
    this.context = null;
    this.cw = 0;
    this.ch = 0;
    this.center = { x: 0, y: 0 };
    this.scale = 46;
    this.objs = [];
    this.idSeq = 1;
    this.labelIndex = 0;
    this.pending = [];
    this.circleKit = null;      // 圆规三步状态
    this.reference = null;      // 圆规张开的虚线参考圆
    this.previewArc = null;     // 正在拖出的弧
    this.undoStack = [];
    this.redoStack = [];
    this.baseDist = 0;
    this.steps = [];          // 构造步骤回放：[{ desc, state }]
    this.playing = false;     // 是否处于回放模式
    this.playIndex = 0;       // 当前回放到第几步，0=空白
    this.initializeCanvas();
  },

  initializeCanvas() {
    const init = (retry) => {
      const query = this.createSelectorQuery();
      query.select('#rulerCanvas').fields({ node: true, size: true }).exec((results) => {
        const info = results && results[0];
        if (!info || !info.node || info.width < 50 || info.height < 50) {
          if (retry > 0) setTimeout(() => init(retry - 1), 250);
          return;
        }
        const pr = Math.min(wx.getWindowInfo().pixelRatio || 1, 3);
        this.canvas = info.node;
        this.context = this.canvas.getContext('2d');
        this.cw = info.width;
        this.ch = info.height;
        this.canvas.width = info.width * pr;
        this.canvas.height = info.height * pr;
        this.context.scale(pr, pr);
        this.redraw();
      });
    };
    init(6);
  },

  worldToScreen(w) { return { x: this.cw / 2 + (w.x - this.center.x) * this.scale, y: this.ch / 2 - (w.y - this.center.y) * this.scale }; },
  screenToWorld(s) { return { x: this.center.x + (s.x - this.cw / 2) / this.scale, y: this.center.y - (s.y - this.ch / 2) / this.scale }; },

  setStatus(t) { this.setData({ status: t }); },

  getPoint(id) { return this.objs.find((o) => o.id === id && o.type === 'point') || null; },
  getObj(id) { return this.objs.find((o) => o.id === id) || null; },

  nextLabel() {
    const i = this.labelIndex; this.labelIndex += 1;
    if (i < LABELS.length) return LABELS[i];
    const n = Math.floor(i / LABELS.length);
    return LABELS[i % LABELS.length] + String(n + 1);
  },

  // ---- 构造步骤回放（参考 RAC / geometry-editor 的“构造序列”思路） ----
  deepState() {
    return JSON.parse(JSON.stringify({
      objs: this.objs,
      center: this.center,
      scale: this.scale,
      labelIndex: this.labelIndex
    }));
  },

  // 当前应显示的对象集合：回放时用快照，否则用编辑中的真实对象
  displayObjs() {
    if (!this.playing) return this.objs;
    if (this.playIndex < 1) return [];
    const s = this.steps[this.playIndex - 1];
    return s ? s.state.objs : [];
  },

  // 用户完成一次有效构造后记录一步（手动放点 / 作线 / 作弧）
  recordStep(desc) {
    if (this.playing) return;
    this.steps.push({ desc, state: this.deepState() });
    if (this.steps.length > 200) this.steps.shift();
    this.playIndex = this.steps.length;
  },

  enterPlayback() {
    if (this.steps.length === 0) { this.setStatus('还没有可回放的构造步骤'); return; }
    this.playing = true;
    this.playIndex = 0;
    this.pending = [];
    this.circleKit = null;
    this.reference = null;
    this.previewArc = null;
    this.setData({ playing: true, playIndexText: `0 / ${this.steps.length}`, playStepDesc: '（空白）' });
    this.setStatus('回放中：点 ▶ 逐步查看构造过程（画布可用拖动/缩放）');
    this.redraw();
  },

  playPrev() {
    if (!this.playing) return;
    this.playIndex = Math.max(0, this.playIndex - 1);
    this.setData({ playIndexText: `${this.playIndex} / ${this.steps.length}`, playStepDesc: this.playbackStepDesc() });
    this.redraw();
  },

  playNext() {
    if (!this.playing) return;
    this.playIndex = Math.min(this.steps.length, this.playIndex + 1);
    this.setData({ playIndexText: `${this.playIndex} / ${this.steps.length}`, playStepDesc: this.playbackStepDesc() });
    this.redraw();
  },

  playbackStepDesc() {
    if (!this.playing || this.playIndex < 1) return '（空白）';
    const s = this.steps[this.playIndex - 1];
    return s ? s.desc : '';
  },

  exitPlayback() {
    if (!this.playing) return;
    this.playing = false;
    this.setData({ playing: false, playIndexText: '', playStepDesc: '', count: this.objs.length });
    this.setStatus('已退出回放');
    this.redraw();
  },

  findPointAtScreen(s) {
    let best = null, bestD = HIT_PX;
    this.objs.forEach((o) => {
      if (o.type !== 'point') return;
      const ss = this.worldToScreen(o);
      const d = Math.hypot(ss.x - s.x, ss.y - s.y);
      if (d <= bestD) { bestD = d; best = o; }
    });
    return best;
  },

  findObjAtScreen(s) {
    let best = null, bestD = HIT_PX;
    this.objs.forEach((o) => {
      if (o.type === 'point') return;
      let d;
      if (o.type === 'arc') {
        const c = this.worldToScreen(o.c);
        d = Math.abs(Math.hypot(s.x - c.x, s.y - c.y) - o.r * this.scale);
      } else {
        const a = this.worldToScreen(o.a); const b = this.worldToScreen(o.b);
        const vx = b.x - a.x, vy = b.y - a.y, L = Math.hypot(vx, vy) || 1;
        d = Math.abs((s.x - a.x) * vy - (s.y - a.y) * vx) / L;
      }
      if (d <= bestD) { bestD = d; best = o; }
    });
    return best;
  },

  // ---- 撤销/重做/清空 ----
  pushSnapshot() {
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.undoStack.push(JSON.parse(JSON.stringify({ objs: this.objs, center: this.center, scale: this.scale, labelIndex: this.labelIndex })));
    this.redoStack = [];
  },
  restoreSnap(s) { this.objs = s.objs; this.center = s.center; this.scale = s.scale; this.labelIndex = s.labelIndex; this.pending = []; this.circleKit = null; this.reference = null; this.previewArc = null; this.setData({ count: this.objs.length }); },
  undo() {
    if (this.playing) return;
    if (!this.undoStack.length) return;
    this.redoStack.push(JSON.parse(JSON.stringify({ objs: this.objs, center: this.center, scale: this.scale, labelIndex: this.labelIndex })));
    this.restoreSnap(this.undoStack.pop()); this.redraw(); this.setStatus('');
  },
  redo() {
    if (this.playing) return;
    if (!this.redoStack.length) return;
    const s = this.redoStack.pop();
    this.undoStack.push(JSON.parse(JSON.stringify({ objs: this.objs, center: this.center, scale: this.scale, labelIndex: this.labelIndex })));
    this.restoreSnap(s); this.redraw(); this.setStatus('');
  },

  addPoint(w, auto) {
    const p = { id: this.idSeq++, type: 'point', x: w.x, y: w.y, auto: !!auto, label: this.nextLabel() };
    this.objs.push(p); this.setData({ count: this.objs.length });
    return p;
  },
  pointExists(x, y) {
    const tol = 0.06;
    return this.objs.some((o) => o.type === 'point' && Math.abs(o.x - x) <= tol && Math.abs(o.y - y) <= tol);
  },

  addLine(a, b, centerline) {
    const aP = this.getPoint(a); const bP = this.getPoint(b);
    if (!aP || !bP) return;
    if (a === b) {
      this.pending = [];
      this.setStatus('请再点一个不同的点');
      this.redraw();
      return;
    }
    this.pushSnapshot();
    this.objs.push({ id: this.idSeq++, type: 'line', a: { x: aP.x, y: aP.y }, b: { x: bP.x, y: bP.y }, centerline: !!centerline, deps: [a, b], color: centerline ? '#7a5bbf' : '#1d63d6' });
    this.pending = [];
    this.generateIntersections(this.objs[this.objs.length - 1]);
    this.recordStep(centerline ? '作中心线 ' + aP.label + bP.label : '作直线 ' + aP.label + bP.label);
    this.setData({ count: this.objs.length, status: '' });
  },

  addArc(cId, r, a0, span) {
    const cP = this.getPoint(cId);
    if (!cP || Math.abs(span) < 0.02) return;
    this.objs.push({ id: this.idSeq++, type: 'arc', c: { x: cP.x, y: cP.y }, r, a0, span, deps: [cId], color: '#1a8f4b' });
    this.generateIntersections(this.objs[this.objs.length - 1]);
    const full = Math.abs(span) >= TWO_PI - 1e-3;
    this.recordStep('以 ' + cP.label + ' 为圆心、半径 ' + r.toFixed(1) + (full ? ' 作整圆' : ' 作弧'));
    this.setData({ count: this.objs.length });
  },

  // ---- 求交：新对象与已有对象，生成交点 ----
  generateIntersections(nw) {
    const cands = [];
    this.objs.forEach((o) => {
      if (o.id === nw.id || o.type === 'point') return;
      let pts = [];
      if (nw.type === 'line' && o.type === 'line') {
        const p = geo.lineLineIntersect(nw.a, nw.b, o.a, o.b); if (p) pts.push(p);
      } else if (nw.type === 'line' && o.type === 'arc') {
        pts = geo.lineCircleIntersect(nw.a, nw.b, o.c, o.r).filter((p) => this.angOnArc(o, p));
      } else if (nw.type === 'arc' && o.type === 'line') {
        pts = geo.lineCircleIntersect(o.a, o.b, nw.c, nw.r).filter((p) => this.angOnArc(nw, p));
      } else if (nw.type === 'arc' && o.type === 'arc') {
        pts = geo.circleCircleIntersect(nw.c, nw.r, o.c, o.r).filter((p) => this.angOnArc(nw, p) && this.angOnArc(o, p));
      }
      pts.forEach((p) => cands.push(p));
    });
    cands.forEach((p) => { if (!this.pointExists(p.x, p.y)) this.addPoint(p, true); });
  },

  // 判断世界点 p 是否落在弧的角度范围内（弧角度为屏幕角）
  angOnArc(arc, p) {
    const c = this.arcCenterScreen(arc);
    const ang = Math.atan2(this.worldToScreen(p).y - c.y, this.worldToScreen(p).x - c.x);
    let rel = ang - arc.a0;
    if (arc.span >= 0) {
      if (Math.abs(arc.span) >= TWO_PI - 1e-3) return true;
      if (rel < 0) rel += TWO_PI;
      return rel <= arc.span + 1e-4;
    }
    if (Math.abs(arc.span) >= TWO_PI - 1e-3) return true;
    if (rel > 0) rel -= TWO_PI;
    return rel >= arc.span - 1e-4;
  },
  arcCenterScreen(arc) { return this.worldToScreen(arc.c); },

  deleteObj(id) {
    const obj = this.getObj(id); if (!obj) return;
    this.pushSnapshot();
    const toDelete = new Set([id]);
    let changed = true;
    while (changed) {
      changed = false;
      this.objs.forEach((o) => {
        if (toDelete.has(o.id) || o.type === 'point') return;
        if ((o.deps || []).some((d) => toDelete.has(d))) { toDelete.add(o.id); changed = true; }
      });
    }
    this.objs = this.objs.filter((o) => !toDelete.has(o.id));
    const used = new Set();
    this.objs.forEach((o) => (o.deps || []).forEach((d) => used.add(d)));
    this.objs = this.objs.filter((o) => o.type !== 'point' || !o.auto || used.has(o.id));
    this.pending = []; this.circleKit = null; this.reference = null; this.previewArc = null;
    this.setData({ count: this.objs.length });
  },

  clearAll() {
    if (this.objs.length === 0) return;
    this.pushSnapshot();
    this.objs = []; this.pending = []; this.circleKit = null; this.reference = null; this.previewArc = null; this.labelIndex = 0;
    this.steps = []; this.playing = false; this.playIndex = 0;
    this.setData({ count: 0, status: '', playing: false, playIndexText: '', playStepDesc: '' });
    this.redraw();
  },

  onTool(e) {
    const t = e.currentTarget.dataset.t;
    this.pending = []; this.circleKit = null; this.reference = null; this.previewArc = null;
    this.setData({ tool: t });
    this.setStatus(t === 'pan' ? '拖动空白平移，双指缩放' :
      t === 'point' ? '点空白处放置一个点（吸附网格）' :
      t === 'line' ? '依次点两点，画一条直线' :
      t === 'centerline' ? '依次点两点，画一条点划线（中心线）' :
      t === 'circle' ? '①点圆心 ②点半径点 ③按住圆周拖动画弧' :
      t === 'select' ? '点击对象可删除' : '');
    this.redraw();
  },

  ensurePoint(pt) {
    const hit = this.findPointAtScreen(pt);
    if (hit) return hit;
    const w = this.screenToWorld(pt);
    this.pushSnapshot();
    return this.addPoint({ x: snap(w.x), y: snap(w.y) }, false);
  },

  handleTouchStart(e) {
    if (!this.cw || !this.ch || !this.context) return;
    const touches = e.touches || [];
    if (touches.length >= 2) {
      this.baseDist = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
      this.panning = false;
      return;
    }
    const t = touches[0];
    const pt = { x: t.x, y: t.y };

    // 回放模式：只允许拖动/缩放，不参与作图
    if (this.playing) {
      this.panning = true;
      this.lastPt = pt;
      return;
    }

    const tool = this.data.tool;

    if (tool === 'pan') {
      this.panning = true; this.lastPt = pt;
      return;
    }
    if (tool === 'select') { const o = this.findObjAtScreen(pt); if (o) { this.deleteObj(o.id); this.redraw(); } return; }
    if (tool === 'point') {
      const w = this.screenToWorld(pt);
      this.pushSnapshot();
      const p = this.addPoint({ x: snap(w.x), y: snap(w.y) }, false);
      this.recordStep('作点 ' + p.label);
      this.redraw();
      return;
    }
    if (tool === 'circle') {
      this.circleTouchStart(pt);
      return;
    }
    if (tool === 'line' || tool === 'centerline') {
      const p = this.ensurePoint(pt);
      this.pending.push(p.id);
      if (this.pending.length === 2) {
        this.addLine(this.pending[0], this.pending[1], tool === 'centerline');
        this.redraw();
      } else {
        this.setStatus('再点一个点（已选 1 个）');
      }
      return;
    }
  },

  circleTouchStart(pt) {
    if (!this.circleKit) {
      const c = this.ensurePoint(pt);
      this.circleKit = { cId: c.id, step: 1 };
      this.setStatus('再点一个点（半径点）');
      this.redraw();
      return;
    }
    if (this.circleKit.step === 1) {
      const rp = this.ensurePoint(pt);
      const cP = this.getPoint(this.circleKit.cId);
      const r = geo.dist(cP, rp);
      if (r < 1e-6) { this.circleKit = null; this.setStatus('半径不能为 0，请重选'); this.redraw(); return; }
      this.circleKit.r = r;
      this.circleKit.step = 2;
      this.reference = { c: { x: cP.x, y: cP.y }, r };
      this.setStatus('按住圆周（虚线参考圆）拖动，画圆弧/圆');
      this.redraw();
      return;
    }
    // step 2：按住圆周拖动画弧
    const cS = this.arcCenterScreen(this.reference);
    const d = Math.hypot(pt.x - cS.x, pt.y - cS.y);
    if (Math.abs(d - this.reference.r * this.scale) > 30) {
      this.setStatus('请按住虚线参考圆上拖动');
      return;
    }
    const ang = Math.atan2(pt.y - cS.y, pt.x - cS.x);
    this.circleKit.drawing = true;
    this.circleKit.a0 = ang;
    this.circleKit.end = ang;
    this.circleKit.last = ang;
    this.previewArc = { c: this.reference.c, r: this.reference.r, a0: ang, end: ang, color: '#1a8f4b' };
    this.setStatus('沿圆周拖动画弧（半径 ' + this.reference.r.toFixed(1) + '）');
    this.redraw();
  },

  handleTouchMove(e) {
    const touches = e.touches || [];
    if (touches.length >= 2) {
      const d = Math.hypot(touches[0].x - touches[1].x, touches[0].y - touches[1].y);
      if (this.baseDist > 0) {
        this.scale = Math.min(240, Math.max(8, this.scale * (d / this.baseDist)));
        this.baseDist = d;
        this.redraw();
      }
      return;
    }
    if (this.panning && touches.length === 1) {
      const dx = touches[0].x - this.lastPt.x, dy = touches[0].y - this.lastPt.y;
      this.center.x -= dx / this.scale; this.center.y += dy / this.scale;
      this.lastPt = { x: touches[0].x, y: touches[0].y };
      this.redraw();
      return;
    }
    if (this.data.tool === 'circle' && this.circleKit && this.circleKit.drawing) {
      const t = touches[0];
      const cS = this.arcCenterScreen(this.previewArc);
      const ang = Math.atan2(t.y - cS.y, t.x - cS.x);
      let delta = ang - this.circleKit.last;
      if (delta > Math.PI) delta -= TWO_PI; else if (delta < -Math.PI) delta += TWO_PI;
      this.circleKit.end += delta;
      this.circleKit.last = ang;
      this.previewArc.end = this.circleKit.end;
      const span = this.circleKit.end - this.circleKit.a0;
      const deg = Math.round(Math.abs(span) * 180 / Math.PI);
      const full = Math.abs(span) >= TWO_PI - 1e-3;
      this.setStatus(full ? '已形成整圆，松手完成' : '扫过 ' + deg + '°，松手完成');
      this.redraw();
    }
  },

  handleTouchEnd() {
    if (this.data.tool === 'circle' && this.circleKit && this.circleKit.drawing) {
      const span = this.circleKit.end - this.circleKit.a0;
      if (Math.abs(span) > 0.02) this.addArc(this.circleKit.cId, this.circleKit.r, this.circleKit.a0, span);
      this.circleKit = null; this.reference = null; this.previewArc = null;
      this.setStatus('');
      this.redraw();
    }
    this.panning = false; this.baseDist = 0;
  },

  undoBtn() { this.undo(); },
  redoBtn() { this.redo(); },
  clearBtn() { this.clearAll(); },
  togglePlayback() { if (this.playing) this.exitPlayback(); else this.enterPlayback(); },

  // ---- 绘制 ----
  redraw() {
    if (!this.context || !this.cw) return;
    const ctx = this.context;
    const objs = this.displayObjs();
    ctx.clearRect(0, 0, this.cw, this.ch);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, this.cw, this.ch);
    this.drawGrid(ctx);
    objs.forEach((o) => {
      if (o.type === 'arc') this.drawArc(ctx, o, 1);
      else if (o.type === 'line') this.drawLine(ctx, o);
    });
    if (this.previewArc) this.drawArc(ctx, this.previewArc, 0.85);
    if (this.reference) this.drawRefCircle(ctx);
    objs.forEach((o) => { if (o.type === 'point') this.drawPoint(ctx, o); });
    if (this.pending.length === 1) {
      const p = this.getPoint(this.pending[0]);
      if (p) this.drawSelectRing(ctx, p);
    }
  },

  drawSelectRing(ctx, p) {
    const s = this.worldToScreen(p);
    ctx.strokeStyle = 'rgba(29,99,214,0.85)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.x, s.y, 10, 0, TWO_PI);
    ctx.stroke();
  },

  drawGrid(ctx) {
    const tl = this.screenToWorld({ x: 0, y: 0 });
    const br = this.screenToWorld({ x: this.cw, y: this.ch });
    const x0 = Math.floor(tl.x / GRID) * GRID, x1 = Math.ceil(br.x / GRID) * GRID;
    const y0 = Math.floor(br.y / GRID) * GRID, y1 = Math.ceil(tl.y / GRID) * GRID;
    ctx.lineWidth = 0.5; ctx.strokeStyle = '#e3e8ee';
    if (this.scale > 20) {
      ctx.beginPath();
      for (let x = x0; x <= x1; x += GRID) { const s = this.worldToScreen({ x, y: 0 }); ctx.moveTo(s.x, 0); ctx.lineTo(s.x, this.ch); }
      for (let y = y0; y <= y1; y += GRID) { const s = this.worldToScreen({ x: 0, y }); ctx.moveTo(0, s.y); ctx.lineTo(this.cw, s.y); }
      ctx.stroke();
    }
    const oy = this.worldToScreen({ x: 0, y: 0 });
    ctx.strokeStyle = '#9aa6b8'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, oy.y); ctx.lineTo(this.cw, oy.y); ctx.moveTo(oy.x, 0); ctx.lineTo(oy.x, this.ch); ctx.stroke();
  },

  drawLine(ctx, o) {
    const a = this.worldToScreen({ x: o.a.x, y: o.a.y });
    const b = this.worldToScreen({ x: o.b.x, y: o.b.y });
    const vx = b.x - a.x, vy = b.y - a.y, L = Math.hypot(vx, vy) || 1;
    const ux = vx / L, uy = vy / L, ext = this.cw + this.ch;
    ctx.strokeStyle = o.color; ctx.lineWidth = 2;
    if (o.centerline) {
      // 点划线：长-空-短-空
      ctx.setLineDash([18, 7, 4, 7]);
      ctx.beginPath();
      ctx.moveTo(a.x - ux * ext, a.y - uy * ext);
      ctx.lineTo(b.x + ux * ext, b.y + uy * ext);
      ctx.stroke();
      ctx.setLineDash([]);
    } else {
      ctx.beginPath();
      ctx.moveTo(a.x - ux * ext, a.y - uy * ext);
      ctx.lineTo(b.x + ux * ext, b.y + uy * ext);
      ctx.stroke();
    }
  },

  drawArc(ctx, o, alpha) {
    const c = this.worldToScreen({ x: o.c.x, y: o.c.y });
    const R = o.r * this.scale;
    const span = o.end != null ? o.end - o.a0 : o.span;
    ctx.strokeStyle = o.color;
    ctx.globalAlpha = alpha != null ? alpha : 1;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(c.x, c.y, R, o.a0, o.a0 + span, span >= 0 ? false : true);
    ctx.stroke();
    ctx.globalAlpha = 1;
  },

  drawRefCircle(ctx) {
    const c = this.worldToScreen({ x: this.reference.c.x, y: this.reference.c.y });
    ctx.strokeStyle = 'rgba(26,143,75,0.6)';
    ctx.lineWidth = 2.2;
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.arc(c.x, c.y, this.reference.r * this.scale, 0, TWO_PI);
    ctx.stroke();
    ctx.setLineDash([]);
    // 圆心处的小十字提示
    ctx.strokeStyle = 'rgba(26,143,75,0.7)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(c.x - 6, c.y); ctx.lineTo(c.x + 6, c.y);
    ctx.moveTo(c.x, c.y - 6); ctx.lineTo(c.x, c.y + 6);
    ctx.stroke();
  },

  drawPoint(ctx, p) {
    const s = this.worldToScreen(p);
    ctx.fillStyle = p.auto ? '#c0392b' : '#16223a';
    ctx.beginPath();
    ctx.arc(s.x, s.y, p.auto ? 3 : 4, 0, TWO_PI);
    ctx.fill();
    if (p.label) {
      ctx.fillStyle = '#3b4a60';
      ctx.font = '13px sans-serif';
      ctx.fillText(p.label, s.x + 6, s.y - 6);
    }
  }
});
