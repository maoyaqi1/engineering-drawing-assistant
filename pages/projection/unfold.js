// 投影体系（三投影面体系 + 投影面展开）——页面 pages/projection 的功能模块。
//
// 教学目的：
//   1. 看清 V、H、W 三个投影面互相垂直，空间点 A 与它的三个投影 a、a′、a″ 的位置关系；
//   2. 按「投影展开」，看 H 面绕 OX 轴转 90°、W 面绕 OZ 轴转 90° 把三个面摊平成一个平面，
//      展开后的排布与下方「展开投影图」（第一角三视图）逐点一致。
//
// 几何口径（与 pages/index/projection.js 完全一致，不另立一套）：
//   · H 面 z=0、V 面 y=0、W 面 x=0；教学坐标 0..8，投影面与坐标轴绘制到 9（与首页坐标轴同尺度）；
//   · H 面上的点绕 x 轴转 -θ：(x, y, 0) → (x, 0, -y)，俯视图落在 OX 下方；
//   · W 面上的点绕 z 轴转 +θ：(0, y, z) → (-y, 0, z)，左视图落在 OZ 另一侧（屏幕上与首页口径一致）；
//   · θ=90° 时三个投影点全在 y=0 平面上，把它们按第一角正投影到 V 面，得到的二维坐标与首页
//     projection.js 的 worldToView(point, 'front' | 'top' | 'left') 完全相同。
//     这条不变量由 scripts/geometry-test.js「D. 投影体系」一节守着（改折叠方向会立刻失败）。
//
// 分层（AGENTS.md §6 / §28 / §29 / §30 / §31）：
//   · 布局、等轴测基底、三视图映射、绘图原语、画布生命周期全部复用 pages/index 的既有模块；
//   · 本文件只有「纯数学」（可被 Node 直接 require，无 wx 依赖）与「读 this.data / 实例状态的绘制」；
//   · 绘制层只读几何真值（this.data.point 与展开角），不回写；
//   · 动画期间只改实例上的展开角并请求重绘，setData 按 10Hz 节流同步滑块，不在每帧 setData。
//
// 外层 IIFE：与 pages/index 各模块保持一致的模块写法，避免顶层 const 泄漏到全局。
(function () {
  const api = (typeof wx !== 'undefined' && wx.cloud) ? require('../../utils/api.js') : null;
  // 复用首页的等轴测深度系数：空间视图里"朝观察者"的方向就是 (1, 1, ISOMETRIC_DEPTH_Z),
  // 与 pages/index/projection.js 的 projectIsometric 退化方向一致（见该文件注释）。
  const { ISOMETRIC_DEPTH_Z } = require('../index/constants.js');
  const VIEW_DIR = Object.freeze({ x: 1, y: 1, z: ISOMETRIC_DEPTH_Z });

  // 三个投影面向两侧延伸的范围：三面互相垂直并把空间分成八个分角（八分角体系图）。
  // 取 7：展开 90° 后投影面最低的角会到 OX 下方 1.38 倍单位长度处，再大就会顶出空间视图下边界
  // （手机竖屏空间视图可用高度约为面板高度的 0.42 倍，绘制内容不越过裁剪区）。
  const MODEL_EXTENT = 7;
  const UNFOLD_MAX = 90;              // 展开角度上限（度）
  const UNFOLD_DURATION = 700;        // 一次「投影展开」动画时长（毫秒）
  const UNFOLD_SYNC_INTERVAL = 100;   // 动画期间同步滑块的节流间隔（毫秒）
  const RAY_FADE_RANGE = 20;          // 投射线只在空间状态成立：开始折叠后 20° 内淡出（度）
  const SPACE_FADE_RANGE = 12;        // 空间点 A 与"原位置残影"：最后 12° 内淡出，展开到位只剩投影图（度）

  // 投影面配色沿用首页空间视图的既有配色（代码事实优先于 AGENTS.md §9 的建议默认色）。
  // fill 用不透明色：三块面按"实心板 + 深度遮挡"绘制，透明度只由 fillAlpha 在展开后半程统一收薄。
  const PLANE_STYLE = {
    // label 用同色系深色：面是不透明亮色，浅色字会看不清；onPlaneLabel 用于板面上的文字
    H: { fill: '#2f8f5f', stroke: '#5fd39a', label: '#0b2c1c' },
    V: { fill: '#2a6ac4', stroke: '#5aa0ff', label: '#0b2748' },
    W: { fill: '#b8912f', stroke: '#ffd76a', label: '#3a2b06' }
  };
  const MARK_COLOR = '#ff4f53';
  const SPACE_POINT_COLOR = '#f2a83b';
  // 空间视图里"空处"（第一分角内、不在投影面上）的标注色：背景是 #090a0c，用浅色
  const MARK_LABEL_COLOR = '#f2f5f9';
  // 投影面上的文字与连线：面是不透明亮色，统一用深色（与参考图的画法一致）
  const PLANE_TEXT_COLOR = '#0e1620';
  const RAY_COLOR = '#8b93a0';        // 投射线（空间里的构造线，画在空处）
  const TRACE_COLOR = '#16232f';      // 投影面上的投影连线（投射线在各投影面上的迹）
  const AXIS_COLOR = '#ffffff';       // 坐标轴（折痕）用白色
  const AXIS_LABEL_COLOR = '#ffffff'; // 轴字母同样白色，配深色描边
  const GHOST_COLOR = '#6a7078';

  // ---- 纯向量小工具（都在视图坐标系里用，不读 this）----

  function dotVector(a, b) {
    return a.x * b.x + a.y * b.y + a.z * b.z;
  }

  function crossVector(a, b) {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x
    };
  }

  function addVector(a, b) {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }

  function scaleVector(a, k) {
    return { x: a.x * k, y: a.y * k, z: a.z * k };
  }

  // 颜色明暗判断（只支持 #rgb / #rrggbb）：描边取反色——亮字配深边、深字配亮边
  function isLightColor(color) {
    const hex = String(color || '').replace('#', '');
    if (hex.length !== 3 && hex.length !== 6) return false;
    const full = hex.length === 3 ? hex.split('').map((c) => c + c).join('') : hex;
    const value = parseInt(full, 16);
    if (!Number.isFinite(value)) return false;
    const r = (value >> 16) & 255;
    const g = (value >> 8) & 255;
    const b = value & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
  }

  // 八个分角：编号 + 该分角的 (x, y, z) 符号（示例点 (4,3,5) 落在第一分角）。
  // 编号口径按《画法几何》八分角图的常见排法（2026-10-08 用户提供参考图核对）：
  //   Ⅰ（＋＋＋）在 O 附近上前左，Ⅱ 左上、Ⅲ 左下、Ⅳ 下方，Ⅴ 上前右、Ⅵ 右上、Ⅶ 右下、Ⅷ 下前右；
  // 即 x>0 的四个分角绕 OX 轴依次编号 Ⅰ–Ⅳ，x<0 的四个同样依次编号 Ⅴ–Ⅷ。
  // Ⅰ = x>0、y>0、z>0（V 面之前、H 面之上、W 面之左）就是本平台默认的第一分角。
  // 若课程教材的顺序与图不同，只需改这张表（编号与符号一一对应）。
  //   at = 标号位置：该分角内的一点，按 MODEL_EXTENT 的比例给出。等轴测把 (±1,±1,±1) 方向
  //   几乎投影到同一条竖线上，所以八个点各自取不同比例，保证标号落在各自分角内且互不重叠。
  const OCTANTS = [
    { label: 'Ⅰ', sign: [1, 1, 1], at: [0.9, 0.3, 0.6] },
    { label: 'Ⅱ', sign: [1, -1, 1], at: [0.9, -0.3, 0.6] },
    { label: 'Ⅲ', sign: [1, -1, -1], at: [0.9, -0.3, -0.6] },
    { label: 'Ⅳ', sign: [1, 1, -1], at: [0.5, 0.5, -0.9] },
    { label: 'Ⅴ', sign: [-1, 1, 1], at: [-0.9, 0.3, 0.6] },
    { label: 'Ⅵ', sign: [-1, -1, 1], at: [-0.85, -0.3, 0.75] },
    { label: 'Ⅶ', sign: [-1, -1, -1], at: [-0.9, -0.3, -0.6] },
    { label: 'Ⅷ', sign: [-1, 1, -1], at: [-0.9, 0.9, -0.9] }
  ];
  const OCTANT_LABEL_COLOR = '#0f1a24';   // 分角编号落在投影面上，用深色

  // ---- 纯数学：展开角与旋转（不读 this、不碰 wx / canvas）----

  function clampUnfoldAngle(value) {
    const angle = Number(value);
    if (!Number.isFinite(angle)) return 0;
    return Math.max(0, Math.min(UNFOLD_MAX, angle));
  }

  function toRadians(angleDeg) {
    const angle = Number(angleDeg);
    return (Number.isFinite(angle) ? angle : 0) * Math.PI / 180;
  }

  // 绕 OX 轴（x 轴）旋转：y' = y·cosθ - z·sinθ，z' = y·sinθ + z·cosθ
  function rotatePointAboutX(point, angleDeg) {
    const rad = toRadians(angleDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: point.x,
      y: point.y * cos - point.z * sin,
      z: point.y * sin + point.z * cos
    };
  }

  // 绕 OZ 轴（z 轴）旋转：x' = x·cosθ - y·sinθ，y' = x·sinθ + y·cosθ
  function rotatePointAboutZ(point, angleDeg) {
    const rad = toRadians(angleDeg);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return {
      x: point.x * cos - point.y * sin,
      y: point.x * sin + point.y * cos,
      z: point.z
    };
  }

  // H 面上的点（z=0）随 H 面折叠：绕 OX 轴转 -θ
  function unfoldHPoint(point, unfoldAngle) {
    return rotatePointAboutX(point, -Number(unfoldAngle || 0));
  }

  // W 面上的点（x=0）随 W 面折叠：绕 OZ 轴转 +θ
  function unfoldWPoint(point, unfoldAngle) {
    return rotatePointAboutZ(point, Number(unfoldAngle || 0));
  }

  // 空间点 A 的三个投影在「已展开 θ 度」时的模型坐标：
  //   front = a′（在 V 面上，不随折叠移动）；top = a（随 H 面）；left = a″（随 W 面）
  function unfoldProjections(point, unfoldAngle) {
    return {
      front: { x: point.x, y: 0, z: point.z },
      top: unfoldHPoint({ x: point.x, y: point.y, z: 0 }, unfoldAngle),
      left: unfoldWPoint({ x: 0, y: point.y, z: point.z }, unfoldAngle)
    };
  }

  // ---- 模块方法（挂到页面，由 Object.assign 注入）----

  module.exports = {
    // 供回归检查使用的纯函数（scripts/geometry-test.js「D. 投影体系」）
    clampUnfoldAngle,
    rotatePointAboutX,
    rotatePointAboutZ,
    unfoldHPoint,
    unfoldWPoint,
    unfoldProjections,

    // 展开角度：动画/拖动期间以实例属性为准（避免每帧 setData），否则读 data
    getUnfoldAngle() {
      const live = Number(this.unfoldAngle);
      if (Number.isFinite(live)) return clampUnfoldAngle(live);
      const fromData = this.data && this.data.unfold ? Number(this.data.unfold.angle) : 0;
      return clampUnfoldAngle(fromData);
    },

    syncUnfoldData(angle) {
      const value = Math.round(clampUnfoldAngle(angle));
      this.unfoldAngle = value;
      this.setData({ 'unfold.angle': value });
    },

    // 观察方位角（绕 OZ 轴，0..360）：0° 是默认等轴测方向（看向第一分角）。
    // 只影响空间视图的观察方向：几何真值、投影连线与下方展开投影图都不随之改变。
    getViewAngle() {
      const live = Number(this.viewAngle);
      if (Number.isFinite(live)) return ((live % 360) + 360) % 360;
      const fromData = Number(this.data && this.data.viewAngle);
      return Number.isFinite(fromData) ? ((fromData % 360) + 360) % 360 : 0;
    },

    rotateViewPoint(point) {
      return rotatePointAboutZ(point, this.getViewAngle());
    },

    syncViewData(angle) {
      const value = Math.round(((Number(angle) || 0) % 360 + 360) % 360);
      this.viewAngle = value;
      this.setData({ viewAngle: value });
    },

    // 在空间视图区域内左右拖动 = 绕 OZ 轴旋转观察方向（下方展开投影图不参与拖动）
    handleViewTouchStart(event) {
      const touch = event.touches && event.touches[0];
      if (!touch || !this.canvasWidth) return;
      const layout = this.getLayout();
      if (touch.x > layout.leftWidth || touch.y > layout.topHeight) return;
      this.recordInteraction();
      this._viewDrag = { lastX: touch.x, moved: false };
      this.setViewDragLock(true);
    },

    handleViewTouchMove(event) {
      const touch = event.touches && event.touches[0];
      if (!touch || !this._viewDrag) return;
      const deltaX = touch.x - this._viewDrag.lastX;
      if (!deltaX) return;
      this._viewDrag.lastX = touch.x;
      this._viewDrag.moved = true;
      // 120 逻辑像素 ≈ 90°：拖动期间只改实例值并请求重绘，松手才提交 data（AGENTS.md §30）
      this.viewAngle = this.getViewAngle() + deltaX * 0.75;
      this.scheduleCanvasDraw();
    },

    handleViewTouchEnd() {
      if (!this._viewDrag) return;
      const moved = this._viewDrag.moved;
      this._viewDrag = null;
      this.setViewDragLock(false);
      if (moved) this.syncViewData(this.getViewAngle());
    },

    setViewDragLock(locked) {
      if (this.data.canvasDragging === !!locked) return;
      this.setData({ canvasDragging: !!locked });
    },

    // 视线遮挡：从该点朝观察者方向走，若穿过某块投影面（方板）则被挡住。
    // 传入的坐标必须已经在视图坐标系里；frames 为三块投影面的正交基；
    // range = { center, half } 是这块板在自身两个方向上的范围（八分角：中心 0、半宽 E；第一分角：0..E）。
    isOccludedByPlates(viewPoint, frames, range) {
      return ['V', 'H', 'W'].some((key) => {
        const frame = frames[key];
        const normal = crossVector(frame.u1, frame.u2);
        const denominator = dotVector(normal, VIEW_DIR);
        if (Math.abs(denominator) < 1e-9) return false;
        const distance = -dotVector(normal, viewPoint) / denominator;
        if (distance <= 1e-6) return false;
        const hit = addVector(viewPoint, scaleVector(VIEW_DIR, distance));
        return Math.abs(dotVector(hit, frame.u1) - range.center) <= range.half + 1e-9
          && Math.abs(dotVector(hit, frame.u2) - range.center) <= range.half + 1e-9;
      });
    },

    // 空间视图上的点与标注：点用 drawPoint 同款画法，标注颜色按所在背景选择——
    // 投影面上的 a、a′、a″ 用深色（面是不透明亮色），空间里的 A 用浅色（背景是深色面板）。
    drawMark(context, screenPoint, color, label, labelColor) {
      context.save();
      context.beginPath();
      context.arc(screenPoint.x, screenPoint.y, 9, 0, Math.PI * 2);
      context.fillStyle = color + '26';
      context.fill();
      context.beginPath();
      context.arc(screenPoint.x, screenPoint.y, 5, 0, Math.PI * 2);
      context.fillStyle = color;
      context.fill();
      context.restore();
      this.drawOutlinedText(context, label, screenPoint.x + 10, screenPoint.y - 5,
        labelColor || MARK_LABEL_COLOR, 12, '700');
    },

    // 投影面上的文字（面名、轴字母、分角编号）：先描一圈反色再写字。
    // 空间视图里同一段文字可能压在亮色投影面上、也可能压在深色空处（如坐标轴端点在板的边缘），
    // 描边保证两种情况都读得清——这是把投影面改成实心板后必须补的一步。
    drawOutlinedText(context, text, x, y, color, size, weight) {
      if (!text) return;
      const halo = isLightColor(color) ? '#0a0f16' : '#eef3f8';
      [[-1, 0], [1, 0], [0, -1], [0, 1]].forEach((offset) => {
        this.drawText(context, text, x + offset[0], y + offset[1], halo, size, weight);
      });
      this.drawText(context, text, x, y, color, size, weight);
    },

    // 学习埋点：本页章节名固定为「投影体系」，page 标为 projection（不占用首页 index 的口径）
    trackEvent(eventType, payload) {
      if (!api || !api.recordEvent) return;
      api.recordEvent(eventType, Object.assign({
        session_id: this._sessionId || '',
        chapter_id: 'system',
        chapter_name: '投影体系',
        page: 'projection'
      }, payload || {}));
    },

    // 「投影展开」按钮：一次动画在两个状态之间切换（过半即视为已展开，按回未展开）
    handleUnfoldToggle() {
      this.recordInteraction();
      if (this._unfoldAnimating) return;
      const from = this.getUnfoldAngle();
      const unfolding = from < UNFOLD_MAX / 2;
      // 展开不改变投影面范围（2026-10-08 用户要求）：八分角展平后三块面会完全重合，
      // 想在展平状态看到"三种颜色并列"，请自行切到「第一分角」。
      this.animateUnfold(from, unfolding ? UNFOLD_MAX : 0);
    },

    // 滑块拖动中：只改实例值 + 请求重绘，松手才 setData（AGENTS.md §30）
    handleUnfoldLive(event) {
      this._unfoldAnimating = false;
      this.unfoldAngle = clampUnfoldAngle(event.detail.value);
      this.scheduleCanvasDraw();
    },

    // 投影面范围：'octants' = 三块面各向两侧延伸（八分角）；'first' = 只保留第一分角内的三块板。
    // 切换只影响空间视图画出来的板有多大，投影点、展开角与下方展开投影图都不变。
    handleScope(event) {
      const scope = event.currentTarget.dataset.scope === 'first' ? 'first' : 'octants';
      if (this.data.scope === scope) return;
      this.recordInteraction();
      this.setData({ scope }, () => this.scheduleCanvasDraw());
    },

    getScope() {
      return this.data && this.data.scope === 'first' ? 'first' : 'octants';
    },

    handleUnfoldSlider(event) {
      this.recordInteraction();
      this._unfoldAnimating = false;
      this.syncUnfoldData(event.detail.value);
      this.scheduleCanvasDraw();
    },

    handleUnfoldReset() {
      this.recordInteraction();
      this._unfoldAnimating = false;
      this.unfoldAngle = 0;
      this.viewAngle = 0;
      // 空间点固定取第一分角的一般位置（不再提供预设）：重置 = 回到未展开 + 默认视角
      this.setData({ 'unfold.angle': 0, viewAngle: 0 }, () => this.scheduleCanvasDraw());
    },

    goBack() {
      if (typeof wx !== 'undefined' && wx.navigateBack) wx.navigateBack({ delta: 1 });
    },

    // 展开动画：ease-in-out，实例值驱动绘制，滑块按 10Hz 节流同步
    animateUnfold(from, to) {
      const start = Date.now();
      this._unfoldAnimating = true;
      this._unfoldSyncAt = 0;
      const step = () => {
        if (!this._unfoldAnimating) return;
        const progress = Math.min(1, (Date.now() - start) / UNFOLD_DURATION);
        const eased = progress < 0.5
          ? 2 * progress * progress
          : -1 + (4 - 2 * progress) * progress;
        this.unfoldAngle = from + (to - from) * eased;
        this.scheduleCanvasDraw();
        if (Date.now() - this._unfoldSyncAt >= UNFOLD_SYNC_INTERVAL) {
          this._unfoldSyncAt = Date.now();
          this.setData({ 'unfold.angle': Math.round(this.unfoldAngle) });
        }
        if (progress < 1) {
          this.requestNextFrame(step);
        } else {
          this._unfoldAnimating = false;
          this.syncUnfoldData(to);
          this.scheduleCanvasDraw();
        }
      };
      step();
    },

    requestNextFrame(callback) {
      const canvasRaf = this.canvas && this.canvas.requestAnimationFrame;
      if (canvasRaf) return canvasRaf.call(this.canvas, callback);
      return setTimeout(callback, 16);
    },

    // ---- 绘制（覆盖 pages/index/render-scene.js 的三个绘制入口）----

    drawScene() {
      if (!this.context || !this.canvasWidth) return;
      const context = this.context;
      const layout = this.getLayout();
      context.clearRect(0, 0, this.canvasWidth, this.canvasHeight);
      this.drawIsometricPanel(context, layout);
      this.drawProjectionPanels(context, layout);
    },

    // 空间视图：三投影面体系（八分角）。三块投影面按"实心板"绘制——每块拆成 4 个象限方块，
    // 12 块按视图深度排序后依次绘制（画家算法），更近的板自然挡住更远的板，画面不糊。
    // 观察者可绕 OZ 轴旋转（空间旋转）：转到背面即可看到被挡住的 Ⅴ–Ⅷ 分角。
    // 旋转只改观察方向：几何真值、投影连线与下方第一角展开投影图都不随之改变。
    drawIsometricPanel(context, layout) {
      const angle = this.getUnfoldAngle();
      const point = this.data.point;
      const extended = MODEL_EXTENT;
      const projections = unfoldProjections(point, angle);
      // 空间状态的不透明系数：最后 SPACE_FADE_RANGE 度内从 1 降到 0，
      // 用于淡出"投影面原位置虚线残影"、八个分角编号与空间点 A。
      const spaceAlpha = 1 - Math.max(0, Math.min(1,
        (angle - (UNFOLD_MAX - SPACE_FADE_RANGE)) / SPACE_FADE_RANGE));
      // 实心投影面：全程不透明、颜色不变（2026-10-08 用户要求"展开后颜色不要发生变化"）。
      // 八分角模式下三块面展平后会完全重合，所以「投影展开」会把范围切到第一分角（见 handleUnfoldToggle）。
      const fillAlpha = 1;
      const viewPoint = (p) => this.rotateViewPoint(p);
      const toScreen = (p) => this.projectIsometric(viewPoint(p));
      // 投影面范围：八分角 = 三块面各向两侧延伸；第一分角 = 只画 0..MODEL_EXTENT（第一分角内的三块板）
      const firstOnly = this.getScope() === 'first';
      const plateRange = firstOnly
        ? { center: extended / 2, half: extended / 2 }
        : { center: 0, half: extended };
      const spans = firstOnly ? [[0, extended]] : [[0, extended], [-extended, 0]];

      context.save();
      context.beginPath();
      context.rect(0, 0, layout.leftWidth, layout.topHeight);
      context.fillStyle = '#090a0c';
      context.fill();
      context.clip();

      // 三块投影面的正交基（含翻折，都过原点）：u1 × u2 为法向，side 指向该面"正面"（第一分角一侧）。
      // OX 是 V 与 H 的折痕，OZ 是 V 与 W 的折痕，两者都不随翻折移动。
      const frames = {
        V: {
          key: 'V',
          style: PLANE_STYLE.V,
          u1: viewPoint({ x: 1, y: 0, z: 0 }),
          u2: viewPoint({ x: 0, y: 0, z: 1 }),
          side: viewPoint({ x: 0, y: 1, z: 0 })
        },
        H: {
          key: 'H',
          style: PLANE_STYLE.H,
          u1: viewPoint({ x: 1, y: 0, z: 0 }),
          u2: viewPoint(unfoldHPoint({ x: 0, y: 1, z: 0 }, angle)),
          side: viewPoint(unfoldHPoint({ x: 0, y: 0, z: 1 }, angle))
        },
        W: {
          key: 'W',
          style: PLANE_STYLE.W,
          u1: viewPoint({ x: 0, y: 0, z: 1 }),
          u2: viewPoint(unfoldWPoint({ x: 0, y: 1, z: 0 }, angle)),
          side: viewPoint(unfoldWPoint({ x: 1, y: 0, z: 0 }, angle))
        }
      };
      const facingViewer = (frame) => dotVector(frame.side, VIEW_DIR) > 0;

      // 每块面上的投影点、投影连线与所在象限：点与线画在所属象限块上，随该象限一起被更近的面挡住。
      // V 面有两条连线（a′→a_x、a′→a_z），H、W 面各一条。
      const marks = {
        V: {
          point: viewPoint(projections.front), label: 'a′', quad: [point.x, point.z],
          traces: [
            { from: viewPoint(projections.front), to: viewPoint({ x: point.x, y: 0, z: 0 }) },
            { from: viewPoint(projections.front), to: viewPoint({ x: 0, y: 0, z: point.z }) }
          ]
        },
        H: {
          point: viewPoint(projections.top), label: 'a', quad: [point.x, point.y],
          traces: [
            { from: viewPoint(projections.top), to: viewPoint({ x: point.x, y: 0, z: 0 }) }
          ]
        },
        W: {
          point: viewPoint(projections.left), label: 'a″', quad: [point.z, point.y],
          traces: [
            { from: viewPoint(projections.left), to: viewPoint({ x: 0, y: 0, z: point.z }) }
          ]
        }
      };
      const drawMarkOf = (key) => {
        const mark = marks[key];
        mark.traces.forEach((trace) => {
          this.drawProjectionLine(context, this.projectIsometric(trace.from),
            this.projectIsometric(trace.to), TRACE_COLOR);
        });
        this.drawMark(context, this.projectIsometric(mark.point), MARK_COLOR, mark.label, PLANE_TEXT_COLOR);
      };

      // 投影面按象限切成方块：八分角模式每块面 4 块（共 12 块），第一分角模式每块面 1 块（共 3 块）。
      // 全部按视图深度从远到近绘制（画家算法），更近的板自然挡住更远的板。
      const pieces = [];
      ['V', 'H', 'W'].forEach((key) => {
        const frame = frames[key];
        spans.forEach((spanA) => {
          spans.forEach((spanB) => {
            const u1Start = scaleVector(frame.u1, spanA[0]);
            const u1End = scaleVector(frame.u1, spanA[1]);
            const u2Start = scaleVector(frame.u2, spanB[0]);
            const u2End = scaleVector(frame.u2, spanB[1]);
            const quad = [
              addVector(u1Start, u2Start),
              addVector(u1End, u2Start),
              addVector(u1End, u2End),
              addVector(u1Start, u2End)
            ];
            const depth = quad.reduce((sum, p) => sum + this.getIsometricDepth(p), 0) / quad.length;
            pieces.push({ frame, spanA, spanB, quad, depth });
          });
        });
      });
      pieces.sort((a, b) => a.depth - b.depth);
      pieces.forEach((piece) => {
        context.save();
        context.globalAlpha = fillAlpha;
        this.drawPolygon(context, piece.quad.map((p) => this.projectIsometric(p)),
          piece.frame.style.fill, piece.frame.style.stroke, 1.4);
        context.restore();
        const mark = marks[piece.frame.key];
        if (!mark || !facingViewer(piece.frame)) return;
        const inSpan = (value, span) => value >= Math.min(span[0], span[1]) - 1e-9
          && value <= Math.max(span[0], span[1]) + 1e-9;
        if (!inSpan(mark.quad[0], piece.spanA) || !inSpan(mark.quad[1], piece.spanB)) return;
        drawMarkOf(piece.frame.key);
      });
      // 八分角模式下三块面展平后会完全重合：展开到位时把三个投影点与连线补画在最上层，
      // 保证"纯投影图"上 a、a′、a″ 都在（第一分角模式三块板不重叠，本来就都看得见）。
      if (!firstOnly && angle >= UNFOLD_MAX - 0.5) {
        ['V', 'H', 'W'].forEach((key) => drawMarkOf(key));
      }

      // 展开过程中用虚线标出 H、W 原来的位置，让学生看清"折了多少"（展开到位随之淡出）
      if (angle > 0.5 && spaceAlpha > 0.02) {
        const ghostBase = {
          H: firstOnly
            ? [
              { x: 0, y: 0, z: 0 }, { x: extended, y: 0, z: 0 },
              { x: extended, y: extended, z: 0 }, { x: 0, y: extended, z: 0 }
            ]
            : [
              { x: -extended, y: -extended, z: 0 }, { x: extended, y: -extended, z: 0 },
              { x: extended, y: extended, z: 0 }, { x: -extended, y: extended, z: 0 }
            ],
          W: firstOnly
            ? [
              { x: 0, y: 0, z: 0 }, { x: 0, y: extended, z: 0 },
              { x: 0, y: extended, z: extended }, { x: 0, y: 0, z: extended }
            ]
            : [
              { x: 0, y: -extended, z: -extended }, { x: 0, y: extended, z: -extended },
              { x: 0, y: extended, z: extended }, { x: 0, y: -extended, z: extended }
            ]
        };
        context.save();
        context.globalAlpha = 0.5 * spaceAlpha;
        Object.keys(ghostBase).forEach((key) => {
          const screen = ghostBase[key].map((vertex) => toScreen(vertex));
          for (let index = 0; index < screen.length; index += 1) {
            this.drawDashedLine(context, screen[index], screen[(index + 1) % screen.length], GHOST_COLOR);
          }
        });
        context.restore();
      }

      // 面名：只标朝向观察者的面（背面被实心板挡住）
      const planeLabel = (modelPoint, text, color, frame) => {
        if (!facingViewer(frame)) return;
        const screen = toScreen(modelPoint);
        this.drawOutlinedText(context, text, screen.x - 14, screen.y + 4, color, 10, '600');
      };
      planeLabel({ x: extended * 0.85, y: 0, z: -extended * 0.85 }, 'V 面', PLANE_STYLE.V.label, frames.V);
      planeLabel(unfoldHPoint({ x: extended * 0.9, y: -extended * 0.5, z: 0 }, angle), 'H 面', PLANE_STYLE.H.label, frames.H);
      planeLabel(unfoldWPoint({ x: 0, y: extended * 0.8, z: -extended * 0.65 }, angle), 'W 面', PLANE_STYLE.W.label, frames.W);

      // 八个分角编号：被投影面挡住的编号不画（旋转视角即可看到，例如 Ⅴ–Ⅷ 转到背面）
      if (spaceAlpha > 0.02) {
        context.save();
        context.globalAlpha = spaceAlpha;
        // 第一分角模式只画 Ⅰ（另外七个分角不在当前所画的三块板范围内）
        const visibleOctants = firstOnly
          ? OCTANTS.filter((octant) => octant.sign.every((sign) => sign > 0))
          : OCTANTS;
        visibleOctants.forEach((octant) => {
          const probe = viewPoint({
            x: octant.at[0] * extended,
            y: octant.at[1] * extended,
            z: octant.at[2] * extended
          });
          if (this.isOccludedByPlates(probe, frames, plateRange)) return;
          const screen = this.projectIsometric(probe);
          this.drawOutlinedText(context, octant.label, screen.x - 5, screen.y + 4, OCTANT_LABEL_COLOR, 12, '700');
        });
        context.restore();
      }

      // 坐标轴：向两侧画全（正方向带箭头）。OX、OZ 是折痕；
      // OY 在 H 面与 W 面上各有一份，随所在投影面折叠（未展开时两份重合）。
      const o = toScreen({ x: 0, y: 0, z: 0 });
      const axisLine = (negativeModel, positiveModel, label) => {
        const negative = toScreen(negativeModel);
        const positive = toScreen(positiveModel);
        context.save();
        context.strokeStyle = AXIS_COLOR;
        context.lineWidth = 1.8;
        // 第一分角模式：坐标轴只保留第一分角内的长度（只画 O 到正方向那一段）
        if (!firstOnly) this.drawLine(context, negative, o);
        context.restore();
        this.drawArrow(context, o, positive, AXIS_COLOR);
        this.drawOutlinedText(context, label, positive.x + 4, positive.y - 5, AXIS_LABEL_COLOR, 10, '600');
      };
      axisLine({ x: -extended, y: 0, z: 0 }, { x: extended, y: 0, z: 0 }, 'X');
      axisLine({ x: 0, y: 0, z: -extended }, { x: 0, y: 0, z: extended }, 'Z');
      axisLine(unfoldHPoint({ x: 0, y: -extended, z: 0 }, angle),
        unfoldHPoint({ x: 0, y: extended, z: 0 }, angle), 'Y');
      axisLine(unfoldWPoint({ x: 0, y: -extended, z: 0 }, angle),
        unfoldWPoint({ x: 0, y: extended, z: 0 }, angle), angle > 0.5 ? 'Y' : '');
      this.drawOutlinedText(context, 'O', o.x + 5, o.y + 13, AXIS_LABEL_COLOR, 10, '600');

      // 投射线（A 到三个投影面的垂线）：只在"没有翻折"的空间状态里成立，端点固定在原来的垂足；
      // 空间点 A 被投影面挡住时不画（旋转视角即可看到）。
      const aSpace = toScreen(point);
      const spaceVisible = !this.isOccludedByPlates(viewPoint(point), frames, plateRange);
      const rayAlpha = Math.max(0, 1 - angle / RAY_FADE_RANGE);
      if (rayAlpha > 0.02 && spaceVisible) {
        context.save();
        context.globalAlpha = rayAlpha;
        // 只有对应投影面朝向观察者（投影点看得见）时才画那条投射线
        if (facingViewer(frames.H)) {
          this.drawProjectionLine(context, aSpace, toScreen({ x: point.x, y: point.y, z: 0 }), RAY_COLOR);
        }
        if (facingViewer(frames.W)) {
          this.drawProjectionLine(context, aSpace, toScreen({ x: 0, y: point.y, z: point.z }), RAY_COLOR);
        }
        if (facingViewer(frames.V)) {
          this.drawProjectionLine(context, aSpace, toScreen({ x: point.x, y: 0, z: point.z }), RAY_COLOR);
        }
        context.restore();
      }
      if (spaceAlpha > 0.02 && spaceVisible) {
        context.save();
        context.globalAlpha = spaceAlpha;
        this.drawMark(context, aSpace, SPACE_POINT_COLOR, 'A');
        context.restore();
      }

      const viewAngle = this.getViewAngle();
      const title = angle >= UNFOLD_MAX - 0.5
        ? '展开后的三个投影面（与下方展开投影图一致）'
        : (angle <= 0.5 ? '空间投影面体系（互相垂直）' : '展开中 · ' + Math.round(angle) + '°');
      this.drawText(context, title, 12, 22, '#d9dde4', 11, '600');
      // 旋转过视角时给出方位读数（左右拖动空间视图可继续旋转）
      if (viewAngle > 0.5) {
        this.drawText(context, '视角 ' + Math.round(viewAngle) + '°', layout.leftWidth - 68, 22, '#8f99a6', 11, '600');
      }
      context.restore();
    },

    // 下方展开投影图：第一角三视图（长对正 / 高平齐 / 宽相等）
    drawProjectionPanels(context, layout) {
      const origin = layout.projectionOrigin;
      const metrics = this.getProjectionMetrics();
      const unit = metrics.unit;
      const top = layout.projectionTop;
      const left = layout.projectionLeft;
      const width = layout.projectionWidth;
      const height = layout.projectionHeight;

      context.save();
      context.fillStyle = '#ffffff';
      context.fillRect(left, top, width, height);
      context.strokeStyle = '#31343a';
      context.lineWidth = 1.5;
      if (layout.split) {
        this.drawLine(context, { x: layout.leftWidth, y: 0 }, { x: layout.leftWidth, y: layout.topHeight });
      } else {
        this.drawLine(context, { x: 0, y: layout.dividerY }, { x: this.canvasWidth, y: layout.dividerY });
      }
      context.strokeStyle = '#777d85';
      context.lineWidth = 1;
      this.drawLine(context, { x: left + 10, y: origin.y }, { x: left + width - 10, y: origin.y });
      this.drawLine(context, { x: origin.x, y: top + 34 }, { x: origin.x, y: top + height - 18 });
      this.drawText(context, 'Z', origin.x + 5, top + 34, '#525861', 10, '600');
      this.drawText(context, 'X', left + 8, origin.y - 5, '#525861', 10, '600');
      this.drawText(context, 'Y', origin.x + 5, top + height - 10, '#525861', 10, '600');
      this.drawText(context, '展开投影图 · 第一角', left + 12, top + 23, '#3b4654', 11, '600');

      const views = this.getProjectionScreenPoints();
      this.drawProjectionCorrespondence(context, views, this.data.point.y, origin, unit, '#c8cdd3');
      this.drawPoint(context, views.front, MARK_COLOR, 5, 'a′');
      this.drawPoint(context, views.top, MARK_COLOR, 5, 'a');
      this.drawPoint(context, views.left, MARK_COLOR, 5, 'a″');

      // 长对正 / 高平齐 / 宽相等：三条对应关系在展开完成时给出确认
      const angle = this.getUnfoldAngle();
      const confirm = angle >= UNFOLD_MAX - 0.5 ? '✓ 与上方展开结果一致' : '把上方投影面展开到 90° 后即与本图一致';
      this.drawText(context, confirm, left + 12, top + height - 10, '#6a7688', 10, '500');
      context.restore();
    }
  };
})();
