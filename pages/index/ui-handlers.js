// 界面事件处理：模块切换、类型切换、滑块（拖动中 / 松手）、姿态轴与平移、旋转 90°、
// 重置、立体参数守卫，以及问老师 / 个人信息跳转。
// 事件名与 index.wxml 的 bind*/catch* 一一对应，禁止改名。
// 外层 IIFE：网页版 web/index.html 直接用 <script> 引入这些文件，各自独立作用域才不会互相冲突顶层 const；
// 小程序与 Node 走 CommonJS，行为不变。
(function () {


  module.exports = {
    handleModulePicker(event) {
      this.recordInteraction();
      const moduleIndex = Number(event.detail.value);
      if (!Number.isInteger(moduleIndex) || moduleIndex < 0 || moduleIndex >= this.data.moduleOptions.length) return;
      const mode = ['point', 'line', 'plane', 'solid', 'section'][moduleIndex];
      this.draggingProjection = null;
      this.draggingLineProjection = null;
      this.draggingPlaneProjection = null;
      const titles = { point: '点的三面投影', line: '直线的三面投影', plane: '平面的三面投影', section: '平面切割立体', solid: '基本立体' };
      wx.setNavigationBarTitle({ title: titles[mode] });
      const chapterChanged = mode !== this.data.mode;
      if (chapterChanged) this.trackChapterExit();
      this.setData({ mode, moduleIndex }, () => {
        // 宽屏下画布高度按模式扣减剩余空间，切模式会改变画布高度：重新测量再绘制。
        this.initializeCanvas();
        if (chapterChanged) this.trackChapterEnter();
      });
    },

    handleSolidType(event) {
      this.recordInteraction();
      const solidType = event.currentTarget.dataset.type;
      const validTypes = ['triangularPyramid', 'pentagonalPrism', 'cylinder', 'cone', 'sphere', 'torus'];
      if (!validTypes.includes(solidType)) return;
      this.setData({ 'section.solidType': solidType }, () => this.drawScene());
    },

    handleSectionSlider(event) {
      this.recordInteraction();
      this.applySectionLive(event);
      this.setData({ section: this.data.section }, () => this.scheduleCanvasDraw());
    },

    applySectionLive(event) {
      const key = event.currentTarget.dataset.key;
      const value = Number(event.detail.value);
      if (!['angle', 'offset'].includes(key) || !Number.isFinite(value)) return;
      const normalizedValue = key === 'offset' ? Math.round(value * 10) / 10 : Math.round(value);
      this.setLivePath('section.' + key, normalizedValue);
      if (key === 'angle') this.setLivePath('section.planeType', this.getSectionPlaneType(normalizedValue));
    },

    handleSectionLive(event) {
      this.recordInteraction();
      this.applySectionLive(event);
      this.scheduleCanvasDraw();
    },

    handleSectionPlaneType(event) {
      this.recordInteraction();
      const planeType = event.currentTarget.dataset.type;
      const presetAngles = { horizontal: 0, frontProjecting: 42, profile: 90 };
      if (!Object.prototype.hasOwnProperty.call(presetAngles, planeType)) return;
      this.setData({
        'section.planeType': planeType,
        'section.angle': presetAngles[planeType]
      }, () => this.drawScene());
    },

    handleSizeSliderLive(event) {
      this.recordInteraction();
      const key = event.currentTarget.dataset.key;
      const value = Number(event.detail.value);
      if (!Number.isFinite(value)) return;
      const solid = this.data.solid;
      solid[key] = Math.round(value * 10) / 10;
      solid.position = this.sanitizeSolidPosition(solid);
      this.scheduleCanvasDraw();
    },

    handleSizeSlider(event) {
      this.recordInteraction();
      const key = event.currentTarget.dataset.key;
      const value = Number(event.detail.value);
      if (!Number.isFinite(value)) return;
      const solid = Object.assign({}, this.data.solid, {
        position: Object.assign({}, this.data.solid.position),
        rotation: Object.assign({}, this.data.solid.rotation)
      });
      solid[key] = Math.round(value * 10) / 10;
      solid.position = this.sanitizeSolidPosition(solid);
      this.setData({ solid, translationValue: solid.position[this.data.translationAxis] }, () => this.drawScene());
    },

    handleRotationAxis(event) {
      this.recordInteraction();
      const index = Number(event.detail.value);
      const axis = this.data.axisKeys[index];
      if (!axis) return;
      const rotationValue = Number(this.data.solid.rotation[axis]) || 0;
      this.setData({ rotationAxisIndex: index, rotationAxis: axis, rotationValue }, () => this.drawScene());
    },

    handleRotationAngleLive(event) {
      this.recordInteraction();
      const value = Number(event.detail.value);
      if (!Number.isFinite(value)) return;
      const v = Math.round(value);
      this.data.solid.rotation[this.data.rotationAxis] = v;
      this.data.rotationValue = v;
      this.scheduleCanvasDraw();
    },

    handleRotationAngle(event) {
      this.recordInteraction();
      const value = Number(event.detail.value);
      if (!Number.isFinite(value)) return;
      this.setData({
        [`solid.rotation.${this.data.rotationAxis}`]: Math.round(value),
        rotationValue: Math.round(value)
      }, () => this.drawScene());
    },

    handleTranslationAxis(event) {
      this.recordInteraction();
      const index = Number(event.detail.value);
      const axis = this.data.axisKeys[index];
      if (!axis) return;
      const translationValue = Number(this.data.solid.position[axis]) || 0;
      this.setData({ translationAxisIndex: index, translationAxis: axis, translationValue }, () => this.drawScene());
    },

    handleTranslationLive(event) {
      this.recordInteraction();
      const value = Number(event.detail.value);
      if (!Number.isFinite(value)) return;
      const solid = this.data.solid;
      const axis = this.data.translationAxis;
      solid.position[axis] = Math.round(value * 10) / 10;
      solid.position = this.sanitizeSolidPosition(solid);
      this.scheduleCanvasDraw();
    },

    handleTranslation(event) {
      this.recordInteraction();
      const value = Number(event.detail.value);
      if (!Number.isFinite(value)) return;
      const solid = Object.assign({}, this.data.solid, {
        position: Object.assign({}, this.data.solid.position),
        rotation: Object.assign({}, this.data.solid.rotation)
      });
      const axis = this.data.translationAxis;
      solid.position[axis] = Math.round(value * 10) / 10;
      solid.position = this.sanitizeSolidPosition(solid);
      this.setData({ solid, translationValue: solid.position[axis] }, () => this.drawScene());
    },

    sanitizeSolidPosition(solid) {
      const type = solid.type;
      let r = Math.max(0.5, Number(solid.radius) || 2);
      let halfH = Math.max(0.1, Number(solid.height) / 2 || 1.5);
      if (type === 'torus') { r = (Number(solid.majorRadius) || 3) + (Number(solid.minorRadius) || 1); halfH = Number(solid.minorRadius) || 1; }
      if (type === 'sphere') { halfH = r; }
      const p = solid.position || {};
      return {
        x: this.clamp(Number(p.x) || 0, r, 8 - r),
        y: this.clamp(Number(p.y) || 0, r, 8 - r),
        z: this.clamp(Number(p.z) || 0, halfH, 8 - halfH)
      };
    },

    handleSidesStep(event) {
      this.recordInteraction();
      const delta = Number(event.currentTarget.dataset.delta);
      const next = this.clamp((Number(this.data.solid.sides) || 5) + delta, 3, 8);
      this.setData({ 'solid.sides': next }, () => this.drawScene());
    },

    handleBasicSolidType(event) {
      this.recordInteraction();
      const index = Number(event.currentTarget.dataset.type);
      const types = ['prism', 'pyramid', 'cylinder', 'cone', 'sphere', 'torus'];
      if (index < 0 || index >= types.length) return;
      this.setData({ solidTypeIndex: index, solid: this.defaultSolidParams(types[index]) }, () => this.drawScene());
    },

    handlePoseTab(event) {
      this.recordInteraction();
      const index = Number(event.currentTarget.dataset.index);
      this.setData({ poseTabIndex: index }, () => this.drawScene());
    },

    handleAxisChip(event) {
      this.recordInteraction();
      const index = Number(event.currentTarget.dataset.index);
      if (this.data.poseTabIndex === 0) this.handleRotationAxis({ detail: { value: index } });
      else this.handleTranslationAxis({ detail: { value: index } });
    },

    handleRotate90(event) {
      this.recordInteraction();
      // 「旋转90°」是独立按钮，与「旋转/平移」页签无关：任何时候都可用，
      // 每次点击都绕「当前高亮的那根轴」旋转 90°（旋转页签 = 旋转轴，平移页签 = 平移轴）。
      const axis = (this.data.poseTabIndex === 0 ? this.data.rotationAxis : this.data.translationAxis) || 'x';
      const current = Number(this.data.solid.rotation[axis]) || 0;
      const next = (current + 90) % 360;
      this.setData({
        [`solid.rotation.${axis}`]: next,
        rotationAxis: axis,
        rotationAxisIndex: this.data.axisKeys.indexOf(axis),
        rotationValue: next
      }, () => this.drawScene());
    },

    handleReset() {
      this.recordInteraction();
      const currentType = this.data.solid.type || 'prism';
      const solid = this.defaultSolidParams(currentType);
      const typeIndex = ['prism', 'pyramid', 'cylinder', 'cone', 'sphere', 'torus'].indexOf(currentType);
      this.setData({
        solid,
        solidTypeIndex: typeIndex >= 0 ? typeIndex : 0,
        poseTabIndex: 0,
        rotationAxisIndex: 0,
        translationAxisIndex: 0,
        rotationAxis: 'x',
        translationAxis: 'x',
        rotationValue: 0,
        translationValue: 4,
      }, () => this.drawScene());
    },

    handlePlaneType(event) {
      this.recordInteraction();
      const planeType = event.currentTarget.dataset.type;
      const validTypes = ['general', 'horizontal', 'frontal', 'profile', 'vertical', 'frontProjecting', 'profileProjecting'];
      if (!validTypes.includes(planeType)) return;
      const plane = this.getPlaneTypePreset(planeType);
      this.setData({ planeType, plane }, () => this.drawScene());
    },

    handleLineType(event) {
      this.recordInteraction();
      const lineType = event.currentTarget.dataset.type;
      const validTypes = ['general', 'horizontal', 'frontal', 'profile', 'vertical', 'frontProjecting', 'profileProjecting'];
      if (!validTypes.includes(lineType)) return;
      const line = this.getLineTypePreset(lineType);
      this.setData({ lineType, line }, () => this.drawScene());
    },

    handlePointType(event) {
      this.recordInteraction();
      const pointType = event.currentTarget.dataset.type;
      const validTypes = ['general', 'planeH', 'planeV', 'planeW', 'axisX', 'axisY', 'axisZ', 'origin'];
      if (!validTypes.includes(pointType)) return;
      const point = this.getPointTypePreset(pointType);
      this.setData({ pointType, point }, () => this.drawScene());
    },

    resetPoint() {
      if (this.data.mode === 'solid') {
        this.handleReset();
        return;
      }
      if (this.data.mode === 'section') {
        this.setData({
          'section.planeType': 'frontProjecting',
          'section.angle': 42,
          'section.offset': 0
        }, () => this.drawScene());
        return;
      }
      if (this.data.mode === 'plane') {
        const plane = this.getPlaneTypePreset(this.data.planeType);
        this.setData({ plane }, () => this.drawScene());
        return;
      }
      if (this.data.mode === 'line') {
        const line = this.getLineTypePreset(this.data.lineType);
        this.setData({ line }, () => this.drawScene());
        return;
      }
      const point = this.getPointTypePreset(this.data.pointType);
        this.setData({ point }, () => this.drawScene());
    },

    goToAi() {
      if (typeof wx !== 'undefined' && wx.navigateTo) {
        wx.navigateTo({ url: '/pages/ai/ai' });
      }
    },

    goProfile() {
      if (typeof wx !== 'undefined' && wx.navigateTo) {
        wx.navigateTo({ url: '/pages/register/register' });
      }
    }
  };
})();
