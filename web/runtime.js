(function () {
  'use strict';

  var app = window.geometryPage;
  if (!app) throw new Error('画法几何页面逻辑加载失败。');

  var canvas = document.getElementById('geometryCanvas');
  var moduleSelect = document.getElementById('moduleSelect');
  var resetButton = document.getElementById('resetButton');
  var angleSlider = document.getElementById('angleSlider');
  var offsetSlider = document.getElementById('offsetSlider');
  var resizeTimer = null;

  var modeContent = {
    point: {
      introTitle: '点的三面投影',
      introCopy: '拖动下方 a、a′、a″，观察空间点同步变化',
      cardTitle: '空间与展开投影',
      cardCaption: '下方三个投影点均可拖动',
      lessonIndex: '观察 · 01',
      lessonTitle: '一个空间点，三个二维信息',
      lessonBody: '类型按钮用于快速显示典型投影位置，不会锁定坐标。拖动 a′ 可改变 X、Z，拖动 a 可改变 X、Y，拖动 a″ 可改变 Y、Z。',
      formulas: ['正视 A′ = (X, Z)', '俯视 A = (X, Y)', '左视 A″ = (Y, Z)'],
      legend: '<span class="legend-item"><i class="legend-dot dot-space"></i>空间点 A</span><span class="legend-item"><i class="legend-dot dot-projection"></i>a、a′、a″</span><span class="legend-item"><i class="legend-line"></i>投射线</span>'
    },
    line: {
      introTitle: '直线的三面投影',
      introCopy: '拖动下方 A、B 的投影点，观察空间直线同步变化',
      cardTitle: '空间直线与三面投影',
      cardCaption: '下方六个端点投影均可拖动',
      lessonIndex: '观察 · 02',
      lessonTitle: '一条空间直线，三条投影线段',
      lessonBody: '直线由 A、B 两点确定。拖动任一端点的正视、俯视或左视投影，可改变对应的两个空间坐标，并实时更新空间直线。',
      formulas: ['正视：a′b′', '俯视：ab', '左视：a″b″'],
      legend: '<span class="legend-item"><i class="legend-dot dot-a"></i>端点 A</span><span class="legend-item"><i class="legend-dot dot-b"></i>端点 B</span><span class="legend-item"><i class="legend-solid"></i>空间直线 AB</span><span class="legend-item"><i class="legend-line"></i>投射线</span>'
    },
    plane: {
      introTitle: '平面的三面投影',
      introCopy: '拖动下方 A、B、C 的投影点，观察空间平面同步变化',
      cardTitle: '空间平面与三面投影',
      cardCaption: '下方九个顶点投影均可拖动',
      lessonIndex: '观察 · 03',
      lessonTitle: '三个不共线点确定一个平面',
      lessonBody: '空间平面 ABC 在三个投影面上分别形成投影三角形。特殊位置平面的某个投影可能积聚为直线。',
      formulas: ['正视：a′b′c′', '俯视：abc', '左视：a″b″c″'],
      legend: '<span class="legend-item"><i class="legend-dot dot-a"></i>A</span><span class="legend-item"><i class="legend-dot dot-b"></i>B</span><span class="legend-item"><i class="legend-dot dot-c"></i>C</span><span class="legend-item"><i class="legend-plane"></i>空间平面 ABC</span>'
    },
    section: {
      introTitle: '平面切割立体',
      introCopy: '选择截平面类型并调整角度和位置，观察截交线变化',
      cardTitle: '截平面切割与截交线',
      cardCaption: '红色轮廓为实时截交线',
      lessonIndex: '观察 · 04',
      lessonTitle: '截平面的方向和位置决定截交线形状',
      lessonBody: '立体保持不动，可快速选择水平面、侧平面或连续调整正垂面角度。空间截交线及其三个投影同步更新。',
      formulas: ['红色粗线：截交线', '红色细线：截平面积聚投影'],
      legend: '<span class="legend-item"><i class="legend-solid solid-edge"></i>立体轮廓</span><span class="legend-item"><i class="legend-plane cut-plane"></i>截平面</span><span class="legend-item"><i class="legend-solid section-line"></i>截交线</span>'
    }
  };

  function setNestedValue(target, path, value) {
    var keys = path.split('.');
    var current = target;
    for (var index = 0; index < keys.length - 1; index += 1) {
      if (!current[keys[index]] || typeof current[keys[index]] !== 'object') current[keys[index]] = {};
      current = current[keys[index]];
    }
    current[keys[keys.length - 1]] = value;
  }

  app.setData = function (updates, callback) {
    Object.keys(updates).forEach(function (path) {
      setNestedValue(app.data, path, updates[path]);
    });
    renderInterface();
    if (typeof callback === 'function') callback();
  };

  app.createSelectorQuery = function () {
    return {
      select: function () { return this; },
      fields: function () { return this; },
      exec: function (callback) {
        var bounds = canvas.getBoundingClientRect();
        callback([{ node: canvas, width: bounds.width, height: bounds.height }]);
      }
    };
  };

  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  function renderInterface() {
    var data = app.data;
    var content = modeContent[data.mode];
    moduleSelect.value = String(data.moduleIndex);
    document.querySelectorAll('[data-mode-panel]').forEach(function (panel) {
      panel.hidden = panel.dataset.modePanel !== data.mode;
    });
    document.querySelectorAll('[data-action][data-type]').forEach(function (button) {
      var selected = false;
      if (button.dataset.action === 'point') selected = data.pointType === button.dataset.type;
      if (button.dataset.action === 'line') selected = data.lineType === button.dataset.type;
      if (button.dataset.action === 'plane') selected = data.planeType === button.dataset.type;
      if (button.dataset.action === 'solid') selected = data.section.solidType === button.dataset.type;
      if (button.dataset.action === 'sectionPlane') selected = data.section.planeType === button.dataset.type;
      button.classList.toggle('active', selected);
      button.setAttribute('aria-pressed', selected ? 'true' : 'false');
    });
    angleSlider.value = String(data.section.angle);
    offsetSlider.value = String(data.section.offset);
    setText('angleValue', data.section.angle + '°');
    setText('offsetValue', String(data.section.offset));
    ['introTitle', 'introCopy', 'cardTitle', 'cardCaption', 'lessonIndex', 'lessonTitle', 'lessonBody'].forEach(function (key) {
      setText(key, content[key]);
    });
    var formulaRow = document.getElementById('formulaRow');
    formulaRow.replaceChildren();
    content.formulas.forEach(function (formula) {
      var chip = document.createElement('span');
      chip.className = 'formula-chip';
      chip.textContent = formula;
      formulaRow.appendChild(chip);
    });
    document.getElementById('legendRow').innerHTML = content.legend;
  }

  function invokeTypeHandler(action, button) {
    var event = { currentTarget: button };
    if (action === 'point') app.handlePointType(event);
    if (action === 'line') app.handleLineType(event);
    if (action === 'plane') app.handlePlaneType(event);
    if (action === 'solid') app.handleSolidType(event);
    if (action === 'sectionPlane') app.handleSectionPlaneType(event);
  }

  document.querySelectorAll('[data-action][data-type]').forEach(function (button) {
    button.addEventListener('click', function () { invokeTypeHandler(button.dataset.action, button); });
  });

  moduleSelect.addEventListener('change', function () {
    app.handleModulePicker({ detail: { value: Number(moduleSelect.value) } });
  });
  resetButton.addEventListener('click', function () { app.resetPoint(); });
  [angleSlider, offsetSlider].forEach(function (slider) {
    slider.addEventListener('input', function () {
      app.handleSectionSlider({ currentTarget: slider, detail: { value: slider.value } });
    });
  });

  function pointerAsTouch(event) {
    var bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  canvas.addEventListener('pointerdown', function (event) {
    canvas.setPointerCapture(event.pointerId);
    app.handleTouchStart({ touches: [pointerAsTouch(event)] });
  });
  canvas.addEventListener('pointermove', function (event) {
    if (!canvas.hasPointerCapture(event.pointerId)) return;
    event.preventDefault();
    app.handleTouchMove({ touches: [pointerAsTouch(event)] });
  });
  canvas.addEventListener('pointerup', function (event) {
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    app.handleTouchEnd();
  });
  canvas.addEventListener('pointercancel', function () { app.handleTouchEnd(); });

  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { app.initializeCanvas(); }, 120);
  });
  window.addEventListener('beforeunload', function () { if (app.onUnload) app.onUnload(); });

  renderInterface();
  app.onReady();
}());
