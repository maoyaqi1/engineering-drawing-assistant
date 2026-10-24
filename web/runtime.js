(function () {
  'use strict';

  // 浏览器版适配层：pages/index 下的业务模块按微信 Page() 的生命周期编写，
  // 这里只把它们接到普通 DOM 与 Canvas 上，不复制、也不另写任何几何算法。
  //
  // 数据流保持单向：
  //   DOM 事件 -> 调用 Page 实例方法 -> 方法内部 setData / scheduleCanvasDraw
  //   -> renderInterface 同步表单状态；画布由 pages/index 的 render-scene 绘制。
  //
  // 页面脚本通过 web/index.html 的轻量 CommonJS 垫片按顺序加载；因此本文件必须最后执行，
  // 此时 window.geometryPage 已经由 pages/index/index.js 的 Page() 调用注册完成。
  var app = window.geometryPage;
  if (!app) throw new Error('画法几何页面逻辑加载失败。');

  // 页面外观元素只在这里查询一次。Canvas 尺寸由 Page 模块自己的
  // createSelectorQuery() 适配得到，避免适配层和业务层分别维护两套尺寸来源。
  var canvas = document.getElementById('geometryCanvas');
  var moduleSelect = document.getElementById('moduleSelect');
  var resetButton = document.getElementById('resetButton');
  var angleSlider = document.getElementById('angleSlider');
  var offsetSlider = document.getElementById('offsetSlider');
  var resizeTimer = null;

  // 浏览器页面不显示“基本立体”模块，所以不能把 <option> 的直接值当作
  // 小程序 Page 的五模式索引。这里显式维护两层映射，避免未来增删模块时串位。
  var WEB_MODE_TO_PAGE_INDEX = {
    point: 0,
    line: 1,
    plane: 2,
    section: 4
  };
  var PAGE_MODE_TO_WEB_MODE = {
    point: 'point',
    line: 'line',
    plane: 'plane',
    section: 'section'
  };

  // 教学文案属于静态资源而非业务状态：切换模块时只替换说明文字与图例，
  // 空间对象仍由 pages/index 的 data 与几何模块持有。
  // 其中 legend 是仓库内固定 HTML；用户输入不得进入这条 innerHTML 渲染路径。
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

  // 复刻小程序 setData 对 'section.angle' 这类点路径的写法。
  // 浏览器版对象直接挂在普通 JS 对象上，因此必须手动创建缺失的中间层。
  function setNestedValue(target, path, value) {
    var keys = path.split('.');
    var current = target;
    for (var index = 0; index < keys.length - 1; index += 1) {
      if (!current[keys[index]] || typeof current[keys[index]] !== 'object') current[keys[index]] = {};
      current = current[keys[index]];
    }
    current[keys[keys.length - 1]] = value;
  }

  // setData 是页面模块与浏览器 UI 之间唯一的普通数据同步入口。
  // 微信端会做差量更新；这里直接改内存后整体刷新表单，保持行为一致即可。
  app.setData = function (updates, callback) {
    Object.keys(updates).forEach(function (path) {
      setNestedValue(app.data, path, updates[path]);
    });
    renderInterface();
    if (typeof callback === 'function') callback();
  };

  // 最小 createSelectorQuery 适配：只实现页面模块实际使用到的
  // select().fields().exec() 链，返回 Canvas 节点和 CSS 逻辑像素尺寸。
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

  // 所有文本都通过 textContent 写入，避免教学数据被解释成 HTML。
  function setText(id, value) {
    document.getElementById(id).textContent = value;
  }

  // 将 Page.data 投影到 DOM：先同步模块可见性和按钮选中态，
  // 再同步滑块、讲解卡片与图例。这里是纯渲染，不修改 app.data。
  function renderInterface() {
    var data = app.data;
    var content = modeContent[data.mode];
    // 未知模式不应让整个页面在某一个文案字段访问时崩溃。
    if (!content) {
      console.error('[浏览器版] 不支持的教学模式：' + data.mode);
      return;
    }
    var webMode = PAGE_MODE_TO_WEB_MODE[data.mode];
    if (webMode) moduleSelect.value = webMode;
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

  // 类型按钮共用一个点击入口，按 data-action 分派到对应 Page 方法；
  // event.currentTarget 的形状与小程序事件一致，业务模块无需区分运行平台。
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
    var moduleIndex = WEB_MODE_TO_PAGE_INDEX[moduleSelect.value];
    if (typeof moduleIndex !== 'number') return;
    app.handleModulePicker({ detail: { value: moduleIndex } });
  });
  resetButton.addEventListener('click', function () { app.resetPoint(); });
  // 滑块使用 input 事件以便拖动过程中实时预览，而不是只在松手时触发 change。
  [angleSlider, offsetSlider].forEach(function (slider) {
    slider.addEventListener('input', function () {
      app.handleSectionSlider({ currentTarget: slider, detail: { value: slider.value } });
    });
  });

  // 浏览器 Pointer Events 统一鼠标、触控笔和触摸输入。
  // Page 模块只认识“逻辑像素坐标 + touches 数组”，因此这里做一次事件形状转换。
  function pointerAsTouch(event) {
    var bounds = canvas.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  }

  // pointer capture 保证指针移出 Canvas 后仍能收到 move/up；
  // 否则拖动教学对象时容易出现“松手未结束”的悬挂交互状态。
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

  // 窗口尺寸连续变化时只保留最后一次初始化，避免每个 resize 事件都重建画布。
  window.addEventListener('resize', function () {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(function () { app.initializeCanvas(); }, 120);
  });
  // 页面离开时让业务模块停掉动画和会话计时，完成它自己的资源释放路径。
  window.addEventListener('beforeunload', function () { if (app.onUnload) app.onUnload(); });

  // 先渲染一次静态 UI，再触发 Page.onReady() 初始化 Canvas。
  // 这个顺序保证 onReady 读取到的 DOM 元素和布局尺寸已经可用。
  renderInterface();
  app.onReady();
}());
