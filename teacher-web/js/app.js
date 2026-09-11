(function () {
  const CFG = window.TEACHER_CONFIG || {};
  const api = window.TeacherApi;

  const $ = (id) => document.getElementById(id);

  const routes = {
    dashboard: { title: '教学驾驶舱', sub: '学生如何学习点线面与 AI 教师' },
    students: { title: '学生管理', sub: '学生列表与搜索' },
    learning: { title: '学习记录', sub: '全体学生的学习行为事件流' },
    plp: { title: '点线面分析', sub: '点 / 线 / 面互动使用情况' },
    ai: { title: 'AI 教师分析', sub: '学生提问记录与高频知识点' },
    teachers: { title: '教师管理', sub: '超级管理员：教师账号管理' },
    'student-detail': { title: '学生详情', sub: '学习档案与学习轨迹' },
    settings: { title: '系统设置', sub: '个人信息与退出' }
  };

  const navItems = [
    { key: 'dashboard', label: '驾驶舱', icon: '📊' },
    { key: 'students', label: '学生', icon: '👥' },
    { key: 'learning', label: '学习记录', icon: '🕘' },
    { key: 'plp', label: '点线面', icon: '📐' },
    { key: 'ai', label: 'AI 教师', icon: '💬' },
    { key: 'teachers', label: '教师管理', icon: '🧑‍🏫', superOnly: true },
    { key: 'settings', label: '设置', icon: '⚙️' }
  ];

  let currentTeacher = null;

  function getToken() { return localStorage.getItem(CFG.tokenKey || 'hfjh_teacher_token') || ''; }
  function saveTeacher(t) { localStorage.setItem(CFG.teacherKey || 'hfjh_teacher_info', JSON.stringify(t)); currentTeacher = t; }
  function loadTeacher() {
    try { return JSON.parse(localStorage.getItem(CFG.teacherKey || 'hfjh_teacher_info') || 'null'); }
    catch (e) { return null; }
  }
  function clearSession() {
    localStorage.removeItem(CFG.tokenKey || 'hfjh_teacher_token');
    localStorage.removeItem(CFG.teacherKey || 'hfjh_teacher_info');
    currentTeacher = null;
  }

  function isSuper() {
    const t = currentTeacher || loadTeacher();
    return !!(t && t.role === 'super_admin');
  }

  async function handleLogin() {
    const u = ($('loginUsername').value || '').trim();
    const p = $('loginPassword').value;
    $('loginError').textContent = '';
    if (!u || !p) { $('loginError').textContent = '请输入账号和密码'; return; }
    $('loginBtn').disabled = true;
    $('loginBtn').textContent = '登录中…';
    try {
      const res = await api.login(u, p);
      if (res && res.ok && res.token) {
        localStorage.setItem(CFG.tokenKey || 'hfjh_teacher_token', res.token);
        saveTeacher(res.teacher);
        location.hash = '#/dashboard';
        showApp();
      } else {
        $('loginError').textContent = (res && res.msg) || '登录失败，请重试';
      }
    } catch (e) {
      showLoginError(e);
    } finally {
      $('loginBtn').disabled = false;
      $('loginBtn').textContent = '登 录';
    }
  }

  // 把错误渲染到登录页；网络类失败给出「先确认访问网关」的可点击引导
  function showLoginError(e) {
    const box = $('loginError');
    if (e && e.code === 'NETWORK' && e.gateway) {
      box.innerHTML = '登录失败：无法连接服务器。若为首次使用，请先 ' +
        '<a href="' + esc(e.gateway) + '" target="_blank" rel="noopener">点此确认访问</a>' +
        '，页面出现 JSON 提示后再回来登录。';
      return;
    }
    box.textContent = '登录失败：' + describeError(e);
  }

  async function handleLogout() {
    try { await api.logout(); } catch (e) {}
    clearSession();
    location.hash = '';
    showLogin();
  }

  function showLogin() {
    $('appView').classList.add('hidden');
    $('loginView').classList.remove('hidden');
  }

  function showApp() {
    $('loginView').classList.add('hidden');
    $('appView').classList.remove('hidden');
    renderSidebar();
    renderRoute();
  }

  function renderSidebar() {
    const nav = $('nav');
    nav.innerHTML = '';
    navItems.forEach((item) => {
      if (item.superOnly && !isSuper()) return;
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.textContent = item.icon + ' ' + item.label;
      if (item.key === currentHashKey()) btn.classList.add('active');
      btn.addEventListener('click', () => { location.hash = '#/' + item.key; });
      nav.appendChild(btn);
    });
    const t = currentTeacher || loadTeacher();
    $('teacherName').textContent = (t && t.name) || '教师';
    $('teacherRole').textContent = isSuper() ? '超级管理员' : '教师';
    $('avatarLetter').textContent = ((t && t.name) || 'T').slice(0, 1).toUpperCase();
  }

  function currentHashKey() {
    const h = location.hash.replace(/^#\//, '').split('?')[0];
    return routes[h] ? h : 'dashboard';
  }

  async function renderRoute() {
    const key = currentHashKey();
    const route = routes[key];
    $('pageTitle').textContent = route.title;
    $('pageSub').textContent = route.sub;
    if (key === 'teachers' && !isSuper()) { location.hash = '#/dashboard'; return; }

    const content = $('content');
    content.innerHTML = '';
    if (key === 'dashboard') await renderDashboard(content);
    else if (key === 'teachers') await renderTeachers(content);
    else if (key === 'students') await renderStudents(content);
    else if (key === 'learning') await renderLearning(content);
    else if (key === 'student-detail') await renderStudentDetail(content);
    else if (key === 'plp') renderPlaceholder(content, '点线面分析');
    else if (key === 'ai') await renderAi(content);
    else renderPlaceholder(content, '系统设置');
  }

  async function renderDashboard(container) {
    const dash = await api.dashboard();
    const d = (dash && dash.ok) ? dash : {};
    const mainCards = [
      { label: '学生总数', value: d.total_students || 0 },
      { label: '今日活跃', value: d.today_active_students || 0 },
      { label: '点线面今日', value: d.plp_today || 0 },
      { label: 'AI提问今日', value: d.ai_today || 0 }
    ];
    // 名册维度：反映「录入了多少人、其中多少人已注册微信」，是教师最关心的口径
    const rosterCards = [
      { label: '名册人数', value: d.roster_total || 0 },
      { label: '名册已注册', value: d.registered_count || 0 },
      { label: '名册未注册', value: d.unregistered_count || 0 },
      { label: '近7天AI提问', value: d.ai_week || 0 }
    ];
    let html = '<div class="stat-grid">';
    mainCards.forEach((c) => {
      html += '<div class="stat-card"><div class="stat-num">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>';
    });
    html += '</div>';

    html += '<div class="stat-grid">';
    rosterCards.forEach((c) => {
      html += '<div class="stat-card soft"><div class="stat-num">' + c.value + '</div><div class="stat-label">' + c.label + '</div></div>';
    });
    html += '</div>';

    // 学情提醒（按统计规则生成，不做无依据推测）
    const alerts = d.alerts || [];
    if (alerts.length) {
      html += '<div class="card"><div class="card-title">学情提醒</div><div class="alert-list">';
      alerts.forEach((a) => {
        html += '<div class="alert-item ' + esc(a.level || 'info') + '">' + esc(a.text) + '</div>';
      });
      html += '</div></div>';
    }

    // 班级概况
    const classes = d.classes || [];
    html += '<div class="card"><div class="card-title">班级概况</div>';
    if (classes.length) {
      html += '<table style="width:100%;border-collapse:collapse">' +
        '<tr style="background:var(--panel-soft);text-align:left">' +
        '<th style="padding:8px">班级</th><th>名册人数</th><th>已注册</th><th>未注册</th><th>近7天活跃</th></tr>';
      classes.forEach((c) => {
        html += '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:8px">' + esc(c.class_name) + '</td>' +
          '<td>' + (c.total || 0) + '</td>' +
          '<td class="ok">' + (c.registered || 0) + '</td>' +
          '<td>' + (c.unregistered ? '<span class="err">' + c.unregistered + '</span>' : '0') + '</td>' +
          '<td>' + (c.active7 || 0) + '</td></tr>';
      });
      html += '</table>';
    } else {
      html += '<div class="chart-empty">暂无班级数据</div>';
    }
    html += '</div>';

    // 近 7 天趋势：按当周最大值等比缩放，避免数值大时柱子溢出卡片
    const trend = d.trend || [];
    const BAR_MAX = 150;
    const peak = trend.reduce((m, t) => Math.max(m, t.plp || 0, t.active || 0), 0);
    const barHeight = (v) => {
      const n = v || 0;
      if (n <= 0) return 0;
      if (peak <= 0) return 0;
      return Math.max(3, Math.round((n / peak) * BAR_MAX));
    };
    html += '<div class="card"><div class="card-title">近 7 天学习趋势</div>';
    if (!trend.length) {
      html += '<div class="chart-empty">暂无数据</div>';
    } else {
      html += '<div class="trend">';
      trend.forEach((t) => {
        html += '<div class="trend-item">' +
          '<div class="trend-bars">' +
            '<div class="bar plp" style="height:' + barHeight(t.plp) + 'px"></div>' +
            '<div class="bar active" style="height:' + barHeight(t.active) + 'px"></div>' +
          '</div>' +
          '<div class="trend-date">' + t.date + '</div>' +
        '</div>';
      });
      html += '</div><div class="trend-legend">' +
        '<span><span class="lg plp"></span>点线面</span>' +
        '<span><span class="lg active"></span>活跃人数</span>' +
        '</div>';
    }
    html += '</div>';

    // 本周 AI 提问热点（按知识点归类）
    const hot = d.ai_hot || [];
    html += '<div class="card"><div class="card-title">本周 AI 提问热点</div>';
    if (hot.length) {
      const hotPeak = hot.reduce((m, h) => Math.max(m, h.count || 0), 0) || 1;
      html += '<div class="hot-list">';
      hot.forEach((h) => {
        const pct = Math.round(((h.count || 0) / hotPeak) * 100);
        html += '<div class="hot-row">' +
          '<div class="hot-name">' + esc(h.knowledge_point_id) + '</div>' +
          '<div class="hot-track"><div class="hot-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="hot-count">' + h.count + '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="chart-empty">本周暂无 AI 提问</div>';
    }
    html += '</div>';

    container.innerHTML = html;
    if (!dash || !dash.ok) {
      container.insertAdjacentHTML('beforeend',
        '<div class="card" style="margin-top:16px;color:#e04444">' + ((dash && dash.msg) || '统计加载失败') + '</div>');
    }
  }

  // ---- 学生管理 ----
  const studentFilter = { source: 'roster', keyword: '', school: '', class_name: '', registered: '', owner_teacher_id: '' };
  // 最近一次加载到的候选班级（名册中已出现过的班级，由服务端去重排序）
  let studentClassOptions = [];

  async function renderStudents(container) {
    const superUser = isSuper();
    container.innerHTML =
      '<div class="page-title">学生管理</div>' +
      '<div class="page-sub" id="stuSumLine">—</div>' +
      (superUser
        ? '<div class="tabs">' +
            '<button class="tab" data-src="roster">名册学生（教师录入）</button>' +
            '<button class="tab" data-src="registered">未入册学生（自主注册）</button>' +
          '</div>'
        : '') +
      '<div class="card">' +
        '<div class="tool-row">' +
          '<button class="login-btn filter-btn" id="stuAdd">+ 新增学生</button>' +
          '<button class="mini-btn" id="stuTpl">下载导入模板</button>' +
          '<button class="mini-btn" id="stuImport">批量导入</button>' +
        '</div>' +
        '<div class="filter-row">' +
          '<input id="stuKeyword" class="filter-input" placeholder="搜索姓名或学号" />' +
          '<select id="stuSchool" class="filter-select"></select>' +
          '<select id="stuClass" class="filter-select"></select>' +
          (superUser ? '<select id="stuOwner" class="filter-select"></select>' : '') +
          '<select id="stuReg" class="filter-select">' +
            '<option value="">全部状态</option>' +
            '<option value="no">未注册</option>' +
            '<option value="yes">已注册</option>' +
          '</select>' +
          '<button id="stuSearch" class="login-btn filter-btn">搜索</button>' +
        '</div>' +
        '<table id="stuTable" style="width:100%;border-collapse:collapse"></table>' +
      '</div>';

    $('stuKeyword').value = studentFilter.keyword;
    $('stuReg').value = studentFilter.registered;
    $('stuAdd').addEventListener('click', openAddStudent);
    $('stuTpl').addEventListener('click', downloadStudentTemplate);
    $('stuImport').addEventListener('click', openImportStudents);
    $('stuSearch').addEventListener('click', () => {
      studentFilter.keyword = $('stuKeyword').value.trim();
      studentFilter.school = $('stuSchool').value;
      studentFilter.class_name = $('stuClass').value;
      studentFilter.registered = $('stuReg').value;
      if (superUser && $('stuOwner')) studentFilter.owner_teacher_id = $('stuOwner').value;
      loadStudents();
    });
    $('stuKeyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('stuSearch').click(); });
    $('stuSchool').addEventListener('change', () => $('stuSearch').click());
    $('stuClass').addEventListener('change', () => $('stuSearch').click());
    $('stuReg').addEventListener('change', () => $('stuSearch').click());
    if (superUser && $('stuOwner')) $('stuOwner').addEventListener('change', () => $('stuSearch').click());

    // 来源切换（名册 / 未入册自主注册）
    container.querySelectorAll('.tab').forEach((tab) => {
      tab.classList.toggle('active', tab.dataset.src === studentFilter.source);
      tab.addEventListener('click', () => {
        studentFilter.source = tab.dataset.src;
        container.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t === tab));
        syncStudentFilterVisibility();
        loadStudents();
      });
    });
    syncStudentFilterVisibility();

    await loadStudents();
  }

  // 未入册视图下隐藏「班级 / 归属教师 / 注册状态」等不适用筛选项
  function syncStudentFilterVisibility() {
    const isReg = studentFilter.source === 'registered';
    ['stuClass', 'stuReg'].forEach((id) => {
      const el = $(id);
      if (el && el.parentNode) el.style.display = isReg ? 'none' : '';
    });
    const owner = $('stuOwner');
    if (owner && owner.parentNode) owner.style.display = isReg ? 'none' : '';
  }

  async function loadStudents() {
    const table = $('stuTable');
    if (!table) return;
    table.innerHTML = '<tr><td style="padding:16px;color:#6a7688">加载中…</td></tr>';

    const res = await api.listStudents(studentFilter);
    if (!res || !res.ok) {
      table.innerHTML = '<tr><td style="padding:16px;color:#e04444">' + ((res && res.msg) || '加载失败') + '</td></tr>';
      return;
    }

    const isReg = (res.source || studentFilter.source) === 'registered';
    const superUser = isSuper();

    fillSelect($('stuSchool'), res.schools || [], '全部学校', studentFilter.school);
    fillSelect($('stuClass'), res.classes || [], '全部班级', studentFilter.class_name);
    studentClassOptions = (res.classes || []).slice();
    if (superUser && $('stuOwner')) {
      let ownHtml = '<option value="">全部录入教师</option>';
      (res.owners || []).forEach((o) => {
        ownHtml += '<option value="' + esc(o.id) + '">' + esc(o.name) + '</option>';
      });
      $('stuOwner').innerHTML = ownHtml;
      $('stuOwner').value = studentFilter.owner_teacher_id || '';
    }

    const sum = res.summary || { total: 0, registered: 0, unregistered: 0 };
    $('stuSumLine').innerHTML = isReg
      ? '未入册（自主注册）<b>' + sum.total + '</b> 人　·　这些学生不在教师名册中（不能使用 AI 教师提问），其学习数据仍可用于分析'
      : '名册 <b>' + sum.total + '</b> 人　·　已注册 <b class="ok">' + sum.registered +
        '</b> 人　·　未注册 <b class="err">' + sum.unregistered + '</b> 人';

    const items = res.items || [];
    const showOwner = superUser && !isReg;
    let html = '<tr style="background:var(--panel-soft);text-align:left">' +
      '<th style="padding:10px">姓名</th><th>学号</th><th>学校</th><th>班级</th>' +
      (showOwner ? '<th>录入教师</th>' : '') +
      '<th>注册状态</th><th>最近登录</th><th style="text-align:right">操作</th></tr>';

    items.forEach((s) => {
      const cls = s.class_name
        ? esc(s.class_name)
        : '<span style="color:#9aa5b2">未分班</span>';
      const reg = s.registered
        ? '<span class="ok">已注册</span>'
        : '<span class="pending">未注册</span>';
      const ops = isReg
        ? '<button class="mini-btn" data-adopt="' + esc(s.id) + '" data-name="' + esc(s.name) +
          '">设置班级</button>'
        : '<button class="mini-btn" data-edit="' + esc(s.id) + '"' +
            ' data-school="' + esc(s.school) + '" data-class="' + esc(s.class_name) + '"' +
            ' data-name="' + esc(s.name) + '" data-no="' + esc(s.student_no) + '">编辑</button> ' +
          '<button class="mini-btn danger" data-del="' + esc(s.id) + '" data-name="' + esc(s.name) + '">移除</button>';
      html += '<tr style="border-top:1px solid var(--border)">' +
        '<td style="padding:10px"><a class="link" href="#/student-detail?id=' + esc(s.id) + '">' +
          esc(s.name) + '</a></td>' +
        '<td>' + esc(s.student_no) + '</td>' +
        '<td>' + esc(s.school) + '</td>' +
        '<td>' + cls + '</td>' +
        (showOwner ? '<td style="color:#6a7688">' + esc(s.owner_teacher_name || '—') + '</td>' : '') +
        '<td>' + reg + '</td>' +
        '<td style="color:#6a7688">' + fmtDate(s.last_login_at) + '</td>' +
        '<td style="text-align:right">' + ops + '</td></tr>';
    });
    const colCount = showOwner ? 8 : 7;
    if (!items.length) {
      html += '<tr><td colspan="' + colCount + '" style="padding:26px;text-align:center;color:#9aa5b2">' +
        (isReg ? '没有未入册的自主注册学生' : '没有匹配的学生') + '</td></tr>';
    }
    table.innerHTML = html;
    table.querySelectorAll('button[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => openEditStudent(btn));
    });
    table.querySelectorAll('button[data-del]').forEach((btn) => {
      btn.addEventListener('click', () => removeStudent(btn));
    });
    table.querySelectorAll('button[data-adopt]').forEach((btn) => {
      btn.addEventListener('click', () => adoptRegisteredStudent(btn));
    });
  }

  function fillSelect(sel, options, allLabel, current) {
    if (!sel) return;
    let html = '<option value="">' + allLabel + '</option>';
    options.forEach((o) => {
      html += '<option value="' + esc(o) + '">' + esc(o) + '</option>';
    });
    if (current && options.indexOf(current) < 0) {
      html += '<option value="' + esc(current) + '">' + esc(current) + '</option>';
    }
    sel.innerHTML = html;
    sel.value = current || '';
  }

  // 未入册学生 → 收进当前教师名册并指定班级
  // 班级为严格下拉（REQ-001）：候选来自名册中已出现过的班级，不可手输；首项「未分班（留空）」。
  // 新班级的录入入口仍是「名册学生」的「新增学生 / 编辑」弹窗，本入口只做收编。
  function adoptRegisteredStudent(btn) {
    const userId = btn.dataset.adopt;
    const name = btn.dataset.name;

    let options = '<option value="">未分班（留空）</option>';
    studentClassOptions.forEach((c) => {
      options += '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    });

    const emptyHint = studentClassOptions.length
      ? ''
      : '<div class="form-err">名册中还没有任何班级。可先选「未分班（留空）」完成收编；' +
        '如需分班，请先在「名册学生」的「新增学生 / 编辑」里录入班级。</div>';

    openModal('设置班级',
      '<div class="fld"><label>班级</label><select id="aClass" class="filter-select">' + options + '</select></div>' +
      '<div class="hint">将「' + esc(name) + '」加入我的名册，并自动开通 AI 教师提问权限。<br />' +
      '班级只能从已有班级中选择；新班级请先到「名册学生 → 新增学生 / 编辑」录入。</div>' +
      emptyHint +
      '<div id="aErr" class="form-err"></div>',
      '<button class="mini-btn" id="aCancel">取消</button>' +
      '<button class="login-btn filter-btn" id="aConfirm">确定</button>');

    $('aCancel').addEventListener('click', closeModal);
    $('aConfirm').addEventListener('click', async () => {
      $('aErr').textContent = '';
      $('aConfirm').disabled = true;
      const res = await api.adoptStudent({ user_id: userId, class_name: $('aClass').value });
      $('aConfirm').disabled = false;
      if (res && res.ok) {
        closeModal();
        await loadStudents();
      } else {
        $('aErr').textContent = (res && res.msg) || '操作失败';
      }
    });
  }

  async function removeStudent(btn) {
    const id = btn.dataset.del;
    const name = btn.dataset.name;
    if (!confirm('确定从名册中移除「' + name + '」吗？\n\n将同时撤销该学号的 AI 教师提问权限。\n（不影响该学生已注册的微信账号）')) return;
    const res = await api.deleteStudent(id);
    if (res && res.ok) {
      await loadStudents();
    } else {
      alert((res && res.msg) || '移除失败');
    }
  }

  // 编辑单条名册记录（学校 / 班级 / 姓名 / 学号）
  function openEditStudent(btn) {
    const d = btn.dataset;
    openModal('编辑学生',
      '<div class="form-grid">' +
        '<div class="fld"><label>学校 <i>*</i></label><input id="eSchool" class="filter-input" value="' + esc(d.school || '') + '" /></div>' +
        '<div class="fld"><label>班级</label><input id="eClass" class="filter-input" value="' + esc(d.class || '') + '" /></div>' +
        '<div class="fld"><label>姓名 <i>*</i></label><input id="eName" class="filter-input" value="' + esc(d.name || '') + '" /></div>' +
        '<div class="fld"><label>学号 <i>*</i></label><input id="eNo" class="filter-input" value="' + esc(d.no || '') + '" /></div>' +
      '</div>' +
      '<div class="hint">判重规则：同一「学号 + 姓名」不能重复。</div>' +
      '<div id="eErr" class="form-err"></div>',
      '<button class="mini-btn" id="eCancel">取消</button>' +
      '<button class="login-btn filter-btn" id="eSave">保存</button>');

    $('eCancel').addEventListener('click', closeModal);
    $('eSave').addEventListener('click', async () => {
      $('eErr').textContent = '';
      $('eSave').disabled = true;
      const res = await api.updateStudent({
        doc_id: d.edit,
        school: $('eSchool').value.trim(),
        class_name: $('eClass').value.trim(),
        name: $('eName').value.trim(),
        student_no: $('eNo').value.trim()
      });
      $('eSave').disabled = false;
      if (res && res.ok) {
        closeModal();
        await loadStudents();
      } else {
        $('eErr').textContent = (res && res.msg) || '保存失败';
      }
    });
    setTimeout(() => { const el = $('eName'); if (el) el.focus(); }, 50);
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return String(iso).slice(0, 10);
    const p = (n) => (n < 10 ? '0' + n : '' + n);
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
      ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // ---- 通用弹窗 ----
  function openModal(title, bodyHtml, footHtml) {
    closeModal();
    const wrap = document.createElement('div');
    wrap.className = 'modal-mask';
    wrap.id = 'modalMask';
    wrap.innerHTML =
      '<div class="modal">' +
        '<div class="modal-head"><span class="modal-title">' + esc(title) + '</span>' +
        '<button class="modal-x" id="modalX">×</button></div>' +
        '<div class="modal-body">' + bodyHtml + '</div>' +
        '<div class="modal-foot">' + (footHtml || '') + '</div>' +
      '</div>';
    document.body.appendChild(wrap);
    $('modalX').addEventListener('click', closeModal);
    wrap.addEventListener('click', (e) => { if (e.target === wrap) closeModal(); });
  }

  function closeModal() {
    const m = $('modalMask');
    if (m) m.remove();
  }

  // ---- 新增学生 ----
  function openAddStudent() {
    openModal('新增学生',
      '<div class="form-grid">' +
        '<div class="fld"><label>学校 <i>*</i></label><input id="fSchool" class="filter-input" placeholder="如 安徽建筑大学" /></div>' +
        '<div class="fld"><label>班级</label><input id="fClass" class="filter-input" placeholder="如 机械2401" /></div>' +
        '<div class="fld"><label>姓名 <i>*</i></label><input id="fName" class="filter-input" placeholder="学生姓名" /></div>' +
        '<div class="fld"><label>学号 <i>*</i></label><input id="fNo" class="filter-input" placeholder="学号（唯一）" /></div>' +
      '</div>' +
      '<div class="hint">保存后该学号将自动开通 AI 教师提问权限。</div>' +
      '<div id="fErr" class="form-err"></div>',
      '<button class="mini-btn" id="fCancel">取消</button>' +
      '<button class="login-btn filter-btn" id="fSave">保存</button>');

    $('fCancel').addEventListener('click', closeModal);
    $('fSave').addEventListener('click', async () => {
      const payload = {
        school: $('fSchool').value.trim(),
        class_name: $('fClass').value.trim(),
        name: $('fName').value.trim(),
        student_no: $('fNo').value.trim()
      };
      $('fErr').textContent = '';
      $('fSave').disabled = true;
      const res = await api.createStudent(payload);
      $('fSave').disabled = false;
      if (res && res.ok) {
        closeModal();
        await loadStudents();
      } else {
        $('fErr').textContent = (res && res.msg) || '保存失败';
      }
    });
    setTimeout(() => { const el = $('fSchool'); if (el) el.focus(); }, 50);
  }

  // ---- 下载导入模板 ----
  function downloadStudentTemplate() {
    const csv = '\uFEFF学校,班级,姓名,学号\n' +
      '安徽建筑大学,机械2401,张三,20240001\n' +
      '安徽建筑大学,机械2401,李四,20240002\n';
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '学生导入模板.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  // 解析 CSV / 粘贴文本：每行「学校,班级,姓名,学号」
  function parseStudentRows(text) {
    const lines = String(text || '').split(/\r?\n/).filter((l) => l.trim());
    const rows = [];
    lines.forEach((line, idx) => {
      const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
      if (idx === 0 && cols.some((c) => c.indexOf('学号') >= 0 || c.indexOf('姓名') >= 0)) return;
      if (!cols.join('').trim()) return;
      rows.push({
        school: cols[0] || '',
        class_name: cols[1] || '',
        name: cols[2] || '',
        student_no: cols[3] || ''
      });
    });
    return rows;
  }

  // ---- 批量导入 ----
  function openImportStudents() {
    openModal('批量导入学生',
      '<p class="hint">按模板填写 CSV（表头：学校,班级,姓名,学号）。可先下载模板。<br>' +
      '导入成功后，这些学号会自动开通 AI 教师提问权限。</p>' +
      '<div class="fld"><label>选择 CSV 文件</label><input type="file" id="impFile" accept=".csv,text/csv" /></div>' +
      '<div class="fld"><label>或直接粘贴内容（每行一条，逗号分隔）</label>' +
      '<textarea id="impText" class="filter-input imp-text" placeholder="安徽建筑大学,机械2401,张三,20240001"></textarea></div>' +
      '<div id="impResult" class="imp-result"></div>',
      '<button class="mini-btn" id="impCancel">取消</button>' +
      '<button class="mini-btn" id="impValidate">校验</button>' +
      '<button class="login-btn filter-btn" id="impCommit" disabled>确认导入</button>');

    let pendingRows = null;

    $('impCancel').addEventListener('click', closeModal);

    $('impFile').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => { $('impText').value = String(reader.result || ''); };
      reader.readAsText(file, 'utf-8');
    });

    $('impValidate').addEventListener('click', async () => {
      const rows = parseStudentRows($('impText').value);
      const box = $('impResult');
      if (!rows.length) { box.innerHTML = '<span class="err">没有可导入的数据，请检查格式。</span>'; return; }
      $('impValidate').disabled = true;
      const res = await api.importStudents({ mode: 'validate', rows });
      $('impValidate').disabled = false;
      if (!res || !res.ok) {
        box.innerHTML = '<span class="err">' + ((res && res.msg) || '校验失败') + '</span>';
        return;
      }
      const s = res.summary || {};
      let html = '<div class="imp-sum">共 <b>' + s.total + '</b> 条：可导入 <b class="ok">' + s.valid +
        '</b>，学号重复 <b class="err">' + (s.duplicate || 0) + '</b>，信息缺失 <b class="err">' +
        (s.missing || 0) + '</b></div>';
      if (res.errors && res.errors.length) {
        html += '<div class="imp-errs">';
        res.errors.slice(0, 30).forEach((er) => {
          html += '<div>第 ' + er.line + ' 行：' + esc(er.field) + ' ' + esc(er.reason) + '</div>';
        });
        if (res.errors.length > 30) html += '<div>…还有 ' + (res.errors.length - 30) + ' 条</div>';
        html += '</div>';
      }
      box.innerHTML = html;
      pendingRows = rows;
      $('impCommit').disabled = !(s.valid > 0);
    });

    $('impCommit').addEventListener('click', async () => {
      if (!pendingRows) return;
      $('impCommit').disabled = true;
      const res = await api.importStudents({ mode: 'commit', rows: pendingRows });
      if (res && res.ok) {
        alert('导入完成：新增 ' + res.added + ' 条');
        closeModal();
        await loadStudents();
      } else {
        alert((res && res.msg) || '导入失败');
        $('impCommit').disabled = false;
      }
    });
  }

  // ---- 学生详情 ----
  function hashParam(name) {
    const h = location.hash || '';
    const m = new RegExp('[?&]' + name + '=([^&]*)').exec(h);
    return m ? decodeURIComponent(m[1]) : '';
  }

  function fmtDuration(sec) {
    const n = Math.max(0, Math.floor(Number(sec) || 0));
    if (n < 60) return n + ' 秒';
    const m = Math.floor(n / 60);
    if (m < 60) return m + ' 分钟';
    return (m / 60).toFixed(1) + ' 小时';
  }

  function eventLabel(t) {
    return ({
      login: '登录',
      logout: '退出',
      chapter_enter: '进入章节',
      chapter_exit: '离开章节',
      ai_question: '向 AI 教师提问',
      tool_use: '使用互动工具'
    }[t] || t || '');
  }

  async function renderStudentDetail(container) {
    const docId = hashParam('id');
    container.innerHTML = '<div class="card"><div class="placeholder">加载中…</div></div>';
    if (!docId) {
      container.innerHTML = '<div class="card"><div class="placeholder">缺少学生 ID</div></div>';
      return;
    }

    const res = await api.studentDetail(docId);
    if (!res || !res.ok) {
      container.innerHTML = '<div class="card"><div class="placeholder">' +
        esc((res && res.msg) || '加载失败') + '</div></div>';
      return;
    }

    const s = res.student || {};
    const st = res.stats || {};
    const chapters = res.chapters || [];
    const records = res.records || [];
    const ai = res.ai || [];
    const notes = res.notes || [];

    let html = '<div class="detail-head"><button class="mini-btn" id="detailBack">← 返回学生列表</button></div>';

    html += '<div class="card">' +
      '<div class="profile-title">' + esc(s.name || '') +
        ' <span class="muted">' + esc(s.student_no || '') + '</span> ' +
        (s.registered ? '<span class="ok">已注册</span>' : '<span class="pending">未注册</span>') +
      '</div>' +
      '<div class="meta-grid">' +
        '<div><span class="k">学校</span>' + esc(s.school || '—') + '</div>' +
        '<div><span class="k">班级</span>' + esc(s.class_name || '—') + '</div>' +
        '<div><span class="k">录入教师</span>' + esc(s.owner_teacher_name || '—') + '</div>' +
        '<div><span class="k">最近登录</span>' + fmtDate(s.last_login_at) + '</div>' +
      '</div></div>';

    html += '<div class="stat-grid">' +
      '<div class="stat-card"><div class="stat-num">' + fmtDuration(st.total_duration) + '</div><div class="stat-label">累计学习时长</div></div>' +
      '<div class="stat-card"><div class="stat-num">' + (st.session_count || 0) + '</div><div class="stat-label">有效学习次数</div></div>' +
      '<div class="stat-card"><div class="stat-num">' + (st.ai_count || 0) + '</div><div class="stat-label">AI 提问次数</div></div>' +
      '<div class="stat-card"><div class="stat-num">' + (st.event_count || 0) + '</div><div class="stat-label">学习事件数</div></div>' +
      '</div>';

    // 学习进度
    html += '<div class="card"><div class="card-title">学习进度（按章节）</div>';
    if (chapters.length) {
      html += '<table style="width:100%;border-collapse:collapse">' +
        '<tr style="background:var(--panel-soft);text-align:left">' +
        '<th style="padding:8px">章节</th><th>进入次数</th><th>累计时长</th><th>最近学习</th></tr>';
      chapters.forEach((c) => {
        html += '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:8px">' + esc(c.chapter_name) + '</td>' +
          '<td>' + (c.visits || 0) + '</td>' +
          '<td>' + fmtDuration(c.duration) + '</td>' +
          '<td style="color:#6a7688">' + fmtDate(c.last_at) + '</td></tr>';
      });
      html += '</table>';
    } else {
      html += '<div class="chart-empty">暂无学习记录</div>';
    }
    html += '</div>';

    // 学习轨迹
    html += '<div class="card"><div class="card-title">学习轨迹</div>';
    if (records.length) {
      html += '<div class="timeline">';
      records.slice(0, 50).forEach((r) => {
        html += '<div class="tl-item">' +
          '<div class="tl-time">' + fmtDate(r.created_at) + '</div>' +
          '<div class="tl-body">' + esc(eventLabel(r.event_type)) +
            (r.chapter_name ? ' · ' + esc(r.chapter_name) : '') +
            (r.duration ? ' <span class="muted">（' + fmtDuration(r.duration) + '）</span>' : '') +
          '</div></div>';
      });
      html += '</div>';
    } else {
      html += '<div class="chart-empty">暂无学习记录</div>';
    }
    html += '</div>';

    // AI 问答
    html += '<div class="card"><div class="card-title">AI 问答（' + ai.length + ' 条）</div>';
    if (ai.length) {
      ai.forEach((q) => {
        html += '<details class="qa"><summary>' +
          '<span class="muted">' + fmtDate(q.created_at) + '</span> ' + esc(q.question) +
          '</summary><div class="qa-answer">' +
          esc(q.answer || '（无回答记录）').replace(/\n/g, '<br>') +
          '</div></details>';
      });
    } else {
      html += '<div class="chart-empty">暂无 AI 问答记录</div>';
    }
    html += '</div>';

    // 教师备注（仅教师端可见，学生端不展示）
    html += '<div class="card"><div class="card-title">教师备注（' + notes.length + ' 条）</div>';
    html += '<div class="note-add">' +
      '<textarea id="noteInput" class="filter-input imp-text note-text" placeholder="记录该学生的课堂表现、答疑情况或需要跟进的问题…"></textarea>' +
      '<button class="login-btn filter-btn" id="noteSave">添加备注</button>' +
      '</div><div id="noteErr" class="form-err"></div>';
    html += '<div id="noteList">';
    if (notes.length) {
      notes.forEach((n) => {
        html += '<div class="note-item">' +
          '<div class="note-meta"><b>' + esc(n.teacher_name || '教师') + '</b>' +
            '<span class="muted">' + fmtDate(n.created_at) + '</span>' +
            '<button class="mini-btn danger" data-note-del="' + esc(n.id) + '">删除</button></div>' +
          '<div class="note-body">' + esc(n.content).replace(/\n/g, '<br>') + '</div>' +
          '</div>';
      });
    } else {
      html += '<div class="chart-empty">暂无备注</div>';
    }
    html += '</div></div>';

    container.innerHTML = html;
    $('detailBack').addEventListener('click', () => { location.hash = '#/students'; });

    $('noteSave').addEventListener('click', async () => {
      const text = ($('noteInput').value || '').trim();
      $('noteErr').textContent = '';
      if (!text) { $('noteErr').textContent = '备注内容不能为空'; return; }
      $('noteSave').disabled = true;
      const r = await api.addNote(docId, text);
      $('noteSave').disabled = false;
      if (r && r.ok) {
        await renderStudentDetail(container);
      } else {
        $('noteErr').textContent = (r && r.msg) || '添加失败';
      }
    });

    container.querySelectorAll('button[data-note-del]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (!confirm('确定删除这条备注吗？')) return;
        const r = await api.deleteNote(btn.dataset.noteDel);
        if (r && r.ok) await renderStudentDetail(container);
        else alert((r && r.msg) || '删除失败');
      });
    });
  }

  function renderPlaceholder(container, name) {
    container.innerHTML = '<div class="card"><div class="placeholder"><div class="icon">🚧</div><div>「' + name + '」将在后续阶段实现</div></div></div>';
  }

  // ---- 学习记录（全量行为事件流）----
  const EVENT_TYPES = [
    { v: '', t: '全部行为' },
    { v: 'chapter_enter', t: '进入章节' },
    { v: 'chapter_exit', t: '离开章节' },
    { v: 'ai_question', t: 'AI 提问' },
    { v: 'login', t: '登录' },
    { v: 'logout', t: '退出' },
    { v: 'tool_use', t: '互动工具' }
  ];

  const learningFilter = { keyword: '', class_name: '', event_type: '', limit: 200 };

  function eventTypeOptionsHtml() {
    return EVENT_TYPES.map((e) => '<option value="' + esc(e.v) + '">' + esc(e.t) + '</option>').join('');
  }

  async function renderLearning(container) {
    container.innerHTML =
      '<div class="page-title">学习记录</div>' +
      '<div class="page-sub" id="learnSum">加载中…</div>' +
      '<div class="card">' +
        '<div class="filter-row">' +
          '<input id="learnKeyword" class="filter-input" placeholder="搜索姓名或学号" />' +
          '<select id="learnClass" class="filter-select"><option value="">全部班级</option></select>' +
          '<select id="learnType" class="filter-select">' + eventTypeOptionsHtml() + '</select>' +
          '<button id="learnSearch" class="login-btn filter-btn">搜索</button>' +
        '</div>' +
        '<table id="learnTable" style="width:100%;border-collapse:collapse"></table>' +
      '</div>';

    $('learnKeyword').value = learningFilter.keyword;
    $('learnType').value = learningFilter.event_type;
    $('learnSearch').addEventListener('click', () => {
      learningFilter.keyword = $('learnKeyword').value.trim();
      learningFilter.class_name = $('learnClass').value;
      learningFilter.event_type = $('learnType').value;
      loadLearning();
    });
    $('learnKeyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('learnSearch').click(); });
    $('learnClass').addEventListener('change', () => $('learnSearch').click());
    $('learnType').addEventListener('change', () => $('learnSearch').click());

    await loadLearning();
  }

  async function loadLearning() {
    const table = $('learnTable');
    if (!table) return;
    table.innerHTML = '<tr><td style="padding:16px;color:#6a7688">加载中…</td></tr>';

    const res = await api.listLearningRecords(learningFilter);
    if (!res || !res.ok) {
      $('learnSum').textContent = (res && res.msg) || '加载失败';
      table.innerHTML = '<tr><td style="padding:16px;color:#e04444">' +
        esc((res && res.msg) || '加载失败') + '</td></tr>';
      return;
    }

    // 班级下拉随云端返回的可选值刷新
    const classSel = $('learnClass');
    if (classSel) {
      let html = '<option value="">全部班级</option>';
      (res.classes || []).forEach((c) => {
        html += '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      });
      classSel.innerHTML = html;
      classSel.value = learningFilter.class_name || '';
    }

    const items = res.items || [];
    $('learnSum').innerHTML = (res.is_super
      ? '超级管理员视角：全部学生学习记录'
      : '教师视角：你录入名册范围内的学生学习记录') +
      '　·　匹配 <b>' + (res.total || 0) + '</b> 条，显示最近 ' + items.length + ' 条';

    let html = '<tr style="background:var(--panel-soft);text-align:left">' +
      '<th style="padding:10px">时间</th><th>学生</th><th>学号</th><th>班级</th>' +
      '<th>行为</th><th>章节</th><th>时长</th></tr>';
    items.forEach((r) => {
      html += '<tr style="border-top:1px solid var(--border)">' +
        '<td style="padding:10px;color:#6a7688">' + fmtDate(r.created_at) + '</td>' +
        '<td>' + esc(r.student_name || '—') + '</td>' +
        '<td>' + esc(r.student_no || '—') + '</td>' +
        '<td>' + (r.class_name ? esc(r.class_name) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + esc(eventLabel(r.event_type)) + '</td>' +
        '<td>' + (r.chapter_name ? esc(r.chapter_name) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + (r.duration ? fmtDuration(r.duration) : '—') + '</td></tr>';
    });
    if (!items.length) {
      html += '<tr><td colspan="7" style="padding:26px;text-align:center;color:#9aa5b2">暂无学习记录</td></tr>';
    }
    table.innerHTML = html;
  }

  // ---- AI 教师分析（提问统计 + 高频知识点 + 问答明细）----
  const aiFilter = { keyword: '', limit: 100 };

  async function renderAi(container) {
    container.innerHTML =
      '<div class="page-title">AI 教师分析</div>' +
      '<div class="page-sub" id="aiSub">加载中…</div>' +
      '<div class="stat-grid stat-grid-3" id="aiStats"></div>' +
      '<div class="card"><div class="card-title">近 7 天高频知识点</div><div id="aiHot">' +
        '<div class="chart-empty">加载中…</div></div></div>' +
      '<div class="card">' +
        '<div class="card-title">问答记录</div>' +
        '<div class="filter-row">' +
          '<input id="aiKeyword" class="filter-input" placeholder="搜索学生姓名或问题关键字" />' +
          '<button id="aiSearch" class="login-btn filter-btn">搜索</button>' +
        '</div>' +
        '<div id="aiList"><div class="chart-empty">加载中…</div></div>' +
      '</div>';

    $('aiKeyword').value = aiFilter.keyword;
    $('aiSearch').addEventListener('click', () => {
      aiFilter.keyword = $('aiKeyword').value.trim();
      loadAi();
    });
    $('aiKeyword').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('aiSearch').click(); });

    await loadAi();
  }

  async function loadAi() {
    const listBox = $('aiList');
    if (!listBox) return;
    listBox.innerHTML = '<div class="chart-empty">加载中…</div>';

    const res = await api.listAiQuestions(aiFilter);
    if (!res || !res.ok) {
      $('aiSub').textContent = (res && res.msg) || '加载失败';
      listBox.innerHTML = '<div class="chart-empty" style="color:#e04444">' +
        esc((res && res.msg) || '加载失败') + '</div>';
      return;
    }

    const summary = res.summary || { today: 0, week: 0, total: 0 };
    $('aiSub').innerHTML = (res.is_super
      ? '超级管理员视角：全部学生的 AI 提问'
      : '教师视角：你录入名册范围内学生的 AI 提问');
    $('aiStats').innerHTML =
      '<div class="stat-card"><div class="stat-num">' + summary.today + '</div><div class="stat-label">今日提问</div></div>' +
      '<div class="stat-card"><div class="stat-num">' + summary.week + '</div><div class="stat-label">近 7 天提问</div></div>' +
      '<div class="stat-card"><div class="stat-num">' + summary.total + '</div><div class="stat-label">累计提问</div></div>';

    const hot = res.hot || [];
    const hotBox = $('aiHot');
    if (hot.length) {
      const peak = hot.reduce((m, h) => Math.max(m, h.count || 0), 0) || 1;
      let hh = '<div class="hot-list">';
      hot.forEach((h) => {
        const pct = Math.round(((h.count || 0) / peak) * 100);
        hh += '<div class="hot-row">' +
          '<div class="hot-name">' + esc(h.knowledge_point_id) + '</div>' +
          '<div class="hot-track"><div class="hot-fill" style="width:' + pct + '%"></div></div>' +
          '<div class="hot-count">' + h.count + '</div></div>';
      });
      hotBox.innerHTML = hh + '</div>';
    } else {
      hotBox.innerHTML = '<div class="chart-empty">近 7 天暂无提问</div>';
    }

    const items = res.items || [];
    if (!items.length) {
      listBox.innerHTML = '<div class="chart-empty">暂无问答记录</div>';
      return;
    }
    let html = '';
    items.forEach((q) => {
      const who = [q.student_name, q.class_name].filter(Boolean).join(' · ');
      html += '<details class="qa"><summary>' +
        '<span class="muted">' + fmtDate(q.created_at) + '</span> ' +
        (who ? '<b>' + esc(who) + '</b>　' : '') +
        esc(q.question) +
        '</summary><div class="qa-answer">' +
        esc(q.answer || '（无回答记录）').replace(/\n/g, '<br>') +
        '</div></details>';
    });
    listBox.innerHTML = html + (res.total > items.length
      ? '<div class="chart-empty">仅显示最近 ' + items.length + ' 条（共 ' + res.total + ' 条）</div>'
      : '');
  }

  async function renderTeachers(container) {
    container.innerHTML =
      '<div class="page-title">教师管理</div>' +
      '<div class="page-sub">创建、编辑、停用、重置密码教师账号</div>' +
      '<div class="card">' +
        '<div style="margin-bottom:14px"><button id="addTeacherBtn" class="login-btn" style="width:auto;padding:9px 16px;margin-top:0">+ 新增教师</button></div>' +
        '<table id="teacherTable" style="width:100%;border-collapse:collapse"></table>' +
      '</div>';
    $('addTeacherBtn').addEventListener('click', () => openTeacherModal());
    await loadTeacherTable();
  }

  async function loadTeacherTable() {
    const table = $('teacherTable');
    try {
      const res = await api.listTeachers();
      if (!res || !res.ok) {
        table.innerHTML = '<tr><td style="padding:16px;color:#e04444">' + ((res && res.msg) || '加载失败') + '</td></tr>';
        return;
      }
      const items = res.items || [];
      let html = '<tr style="background:var(--panel-soft);text-align:left">' +
        '<th style="padding:10px">账号</th><th>姓名</th><th>角色</th><th>状态</th><th style="text-align:right">操作</th></tr>';
      items.forEach((t) => {
        const isSuperRow = t.role === 'super_admin';
        html += '<tr style="border-top:1px solid var(--border)">' +
          '<td style="padding:10px">' + esc(t.username) + '</td>' +
          '<td>' + esc(t.name) + '</td>' +
          '<td>' + (isSuperRow ? '超级管理员' : '教师') + '</td>' +
          '<td>' + (t.status === 'active' ? '<span style="color:#1a9a4b">启用</span>' : '<span style="color:#e04444">停用</span>') + '</td>' +
          '<td style="text-align:right">' +
            '<button class="mini-btn" data-op="reset" data-id="' + esc(t.id) + '">重置密码</button> ' +
            '<button class="mini-btn" data-op="toggle" data-id="' + esc(t.id) + '" data-status="' + esc(t.status) + '">' +
              (t.status === 'active' ? '停用' : '启用') + '</button> ' +
            (!isSuperRow ? '<button class="mini-btn danger" data-op="del" data-id="' + esc(t.id) + '">删除</button>' : '') +
          '</td></tr>';
      });
      table.innerHTML = html;
      table.querySelectorAll('button[data-op]').forEach((btn) => {
        btn.addEventListener('click', () => handleTeacherAction(btn));
      });
    } catch (e) {
      table.innerHTML = '<tr><td style="padding:16px;color:#e04444">加载失败：' + esc(e.message) + '</td></tr>';
    }
  }

  async function handleTeacherAction(btn) {
    const op = btn.dataset.op;
    const id = btn.dataset.id;
    if (op === 'reset') {
      const p = prompt('请输入新密码（至少6位）：');
      if (!p) return;
      const res = await api.updateTeacher({ teacher_id: id, password: p });
      alert((res && res.ok) ? '密码已重置' : ((res && res.msg) || '失败'));
      await loadTeacherTable();
    } else if (op === 'toggle') {
      const next = btn.dataset.status === 'active' ? 'inactive' : 'active';
      const res = await api.updateTeacher({ teacher_id: id, status: next });
      alert((res && res.ok) ? '已更新' : ((res && res.msg) || '失败'));
      await loadTeacherTable();
    } else if (op === 'del') {
      if (!confirm('确定删除该教师账号吗？')) return;
      const res = await api.deleteTeacher(id);
      alert((res && res.ok) ? '已删除' : ((res && res.msg) || '失败'));
      await loadTeacherTable();
    }
  }

  function openTeacherModal() {
    const username = prompt('请输入教师登录账号（唯一）：');
    if (!username) return;
    const name = prompt('请输入教师姓名：') || username;
    const password = prompt('请输入初始密码（至少6位）：');
    if (!password) return;
    const schoolName = prompt('请输入所属学校（可留空）：') || '';
    api.createTeacher({ username, name, password, school_name: schoolName }).then((res) => {
      alert((res && res.ok) ? '创建成功' : ((res && res.msg) || '创建失败'));
      loadTeacherTable();
    }).catch((e) => alert('创建失败：' + e.message));
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function describeError(e) {
    if (!e) return '未知错误';
    if (typeof e === 'string') return e;
    if (e.errMsg) return String(e.errMsg);
    if (e.message) return String(e.message);
    if (e.code) return String(e.code) + (e.msg ? '：' + e.msg : '');
    try { return JSON.stringify(e); } catch (err) { return '未知错误'; }
  }

  async function init() {
    $('loginBtn').addEventListener('click', handleLogin);
    $('loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') handleLogin(); });
    $('logoutBtn').addEventListener('click', handleLogout);
    // 登录页底部的「确认访问」入口指向网关地址
    const gatewayLink = $('gatewayLink');
    if (gatewayLink && CFG.gatewayUrl) gatewayLink.href = CFG.gatewayUrl;
    window.addEventListener('hashchange', () => {
      if (!$('appView').classList.contains('hidden')) { renderSidebar(); renderRoute(); }
    });
    if (getToken()) {
      try {
        const res = await api.me();
        if (res && res.ok && res.teacher) {
          saveTeacher(res.teacher);
          showApp();
          return;
        }
      } catch (e) {}
      clearSession();
    }
    showLogin();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
