// 「学生名单 ←→ 班级管理」归并自测：写入时解析班级、以及把历史名册并入班级。
const { enableOfflineSdkStub, repoPath } = require('./bootstrap.js');
enableOfflineSdkStub();
const sdk = require('wx-server-sdk');
const teacherFn = require(repoPath('cloudfunctions/teacher/index.js'));

function table(name) {
  if (!sdk.__store.has(name)) sdk.__store.set(name, new Map());
  return sdk.__store.get(name);
}
function seed(name, rows) { rows.forEach((r) => table(name).set(r._id, r)); }

const results = [];
function check(name, pass, detail) { results.push({ name, pass: !!pass, detail: detail === undefined ? '' : String(detail) }); }

const T0 = '2026-09-11T09:30:00.000Z';
seed('teachers', [
  { _id: 'SUPER', username: 'myq', name: '超级管理员', role: 'super_admin', status: 'active' },
  { _id: 'T1', username: 't1', name: '教师一', role: 'teacher', status: 'active' },
  { _id: 'T2', username: 't2', name: '教师二', role: 'teacher', status: 'active' }
]);
seed('teacher_sessions', [
  { _id: 'ss', token: 'tok-super', teacher_id: 'SUPER', expires_at: Date.now() + 86400000 },
  { _id: 'st', token: 'tok-t1', teacher_id: 'T1', expires_at: Date.now() + 86400000 },
  { _id: 'st2', token: 'tok-t2', teacher_id: 'T2', expires_at: Date.now() + 86400000 }
]);
// 教师一建了一个班级实体
seed('classes', [
  { _id: 'C1', name: '机械2401', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T1', owner_teacher_name: '教师一', created_at: T0, updated_at: T0 }
]);
// 从学生页录入的历史名册：只写了 class_name，没有 class_id
seed('students', [
  { _id: 'S1', school: '安徽建筑大学', class_name: '机械2401', name: '甲', student_no: '2025001', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'S2', school: '安徽建筑大学', class_name: '机械25①②', name: '乙', student_no: '2025002', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'S3', school: '安徽建筑大学', class_name: '', name: '丙', student_no: '2025003', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
  { _id: 'S9', school: '合肥大学', class_name: '车辆2401', name: '丁', student_no: '2099001', owner_teacher_id: 'T2', owner_teacher_name: '教师二', source: 'teacher', created_at: T0, updated_at: T0 }
]);
seed('users', [
  { _id: 'U1', openid: 'o1', role: 'student', student_id: '2099009', name: '戊', school: '合肥大学', created_at: T0 },
  { _id: 'U2', openid: 'o2', role: 'student', student_id: '2099008', name: '己二', school: '合肥大学', created_at: T0 }
]);

const t1 = (p) => teacherFn.main(Object.assign({ token: 'tok-t1' }, p));
const t2 = (p) => teacherFn.main(Object.assign({ token: 'tok-t2' }, p));
const tSuper = (p) => teacherFn.main(Object.assign({ token: 'tok-super' }, p));

(async () => {
  // M1 新增学生：班级名与已有班级同名 → 归入该班实体
  const m1 = await t1({ action: 'student.create', school: '安徽建筑大学', class_name: '机械2401', name: '己', student_no: '2026001' });
  check('M1 新增学生同名班级自动关联 class_id', m1.ok === true && m1.student.class_id === 'C1' && m1.student.class_name === '机械2401', JSON.stringify(m1.student || m1));

  // M2 名称不一致但只有一个班级 → 归入教师建的那个班
  const m2 = await t1({ action: 'student.create', school: '安徽建筑大学', class_name: '机械25①②', name: '庚', student_no: '2026002' });
  check('M2 名称不一致且仅一个班级 → 归入该班', m2.ok === true && m2.student.class_id === 'C1' && m2.student.class_name === '机械2401', JSON.stringify(m2.student || m2));

  // M3 明确指定 class_id
  const m3 = await t1({ action: 'student.create', school: '安徽建筑大学', name: '辛', student_no: '2026003', class_id: 'C1' });
  check('M3 显式 class_id 生效', m3.ok === true && m3.student.class_id === 'C1', JSON.stringify(m3.student || m3));

  // M4 批量导入（未指定班级）：同名归入 + 不一致但只有一个班级 → 也归入
  const rows = [
    { school: '安徽建筑大学', class_name: '机械2401', name: '壬', student_no: '2026004' },
    { school: '安徽建筑大学', class_name: '机械25①②', name: '癸', student_no: '2026005' }
  ];
  const m4 = await t1({ action: 'student.import', mode: 'commit', rows });
  check('M4 导入按统一规则归班', m4.ok === true && m4.summary.class_assigned === 2 && m4.summary.class_unmatched === 0,
    JSON.stringify(m4.summary));
  const imported = Array.from(table('students').values()).filter((s) => s.student_no === '2026004' || s.student_no === '2026005');
  check('M4b 导入后写了 class_id 且班级名归一为实体名', imported.length === 2 && imported.every((s) => s.class_id === 'C1' && s.class_name === '机械2401'),
    JSON.stringify(imported.map((s) => ({ id: s.class_id, name: s.class_name }))));

  // M5 编辑学生：改班级名 → class_id 同步
  const m5 = await t1({ action: 'student.update', doc_id: 'S1', class_name: '别的班' });
  check('M5 编辑改班级名仍归入唯一班级', m5.ok === true && m5.student.class_id === 'C1', JSON.stringify(m5.student || m5));

  // M6 收编未入册学生（R19）：教师只能手动输入学号 + 姓名，收编到自己负责的班
  const m6 = await t1({ action: 'student.adopt', student_no: '2099009', name: '戊', school: '合肥大学', class_name: '机械2401' });
  check('M6 教师手动收编：写入 class_id 且归属教师本人',
    m6.ok === true && m6.student.class_id === 'C1' && m6.student.owner_teacher_id === 'T1',
    JSON.stringify(m6.student || m6));
  // M6b 教师不提供学号姓名（想按账号收编）→ 拒绝
  const m6b = await t1({ action: 'student.adopt', user_id: 'U1', class_name: '机械2401' });
  check('M6b 教师按 user_id 收编被拒（未入册列表是超管能力，R19）',
    m6b.ok === false && m6b.code === 'FORBIDDEN', JSON.stringify(m6b.code));
  // M6c 超管从「未入册列表」按账号收编到指定班：owner 写目标班负责教师（A4），并留审计
  const m6c = await tSuper({ action: 'student.adopt', user_id: 'U2', class_id: 'C1' });
  const adoptedU2 = Array.from(table('students').values()).find((s) => s.student_no === '2099008');
  const adoptLogs = Array.from(table('maintenance_logs').values()).filter((l) => l.action === 'student.adopt');
  check('M6c 超管收编：owner=目标班负责教师（不是超管本人），并写审计',
    m6c.ok === true && !!adoptedU2 && adoptedU2.owner_teacher_id === 'T1' && adoptLogs.length === 1,
    JSON.stringify({ owner: adoptedU2 && adoptedU2.owner_teacher_id, logs: adoptLogs.length }));
  // M6d 同一「学号+姓名」再收编 → 明确冲突（D23：本期不支持跨教师转班）
  const m6d = await tSuper({ action: 'student.adopt', user_id: 'U2', class_id: 'C1' });
  check('M6d 重复收编同一「学号+姓名」被拒（ALREADY_IN_ROSTER）',
    m6d.ok === false && m6d.code === 'ALREADY_IN_ROSTER', JSON.stringify(m6d.code));

  // M7 历史名册并入：同名 → 匹配
  // 先造两条"历史遗留"：同名未关联、名称不一致未关联（模拟从学生页录入的旧数据）
  seed('students', [
    { _id: 'H1', school: '安徽建筑大学', class_name: '机械2401', name: '丑', student_no: '2026101', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 },
    { _id: 'H2', school: '安徽建筑大学', class_name: '机械25③④', name: '寅', student_no: '2026102', owner_teacher_id: 'T1', owner_teacher_name: '教师一', source: 'teacher', created_at: T0, updated_at: T0 }
  ]);
  const m7 = await t1({ action: 'class.syncMembers', class_id: 'C1', dry_run: true });
  check('M7 并入预览只匹配同名记录', m7.ok === true && m7.mode === 'dry_run' && m7.matched === 1, JSON.stringify({ matched: m7.matched }));

  // M8 adopt_unmatched（只有一个班级）→ 把名称不一致的也并入
  const m8 = await t1({ action: 'class.syncMembers', class_id: 'C1', dry_run: true, adopt_unmatched: true });
  check('M8 勾选"名称不一致也并入"时匹配数增加', m8.ok === true && m8.matched >= m7.matched, JSON.stringify({ withUnmatched: m8.matched, plain: m7.matched }));

  // M9 提交并入（confirm_count 校验）
  const bad = await t1({ action: 'class.syncMembers', class_id: 'C1', dry_run: false, confirm_count: 999 });
  check('M9 confirm_count 不匹配被拒', bad.ok === false && bad.code === 'CONFIRM_MISMATCH', bad.code);
  const pre = await t1({ action: 'class.syncMembers', class_id: 'C1', dry_run: true, adopt_unmatched: true });
  const ok = await t1({ action: 'class.syncMembers', class_id: 'C1', dry_run: false, confirm_count: pre.matched, adopt_unmatched: true });
  check('M9b 提交并入成功', ok.ok === true && ok.updated === pre.matched, JSON.stringify({ updated: ok.updated, matched: pre.matched }));
  const stillEmpty = Array.from(table('students').values()).filter((s) => s.owner_teacher_id === 'T1' && !s.class_id);
  check('M9c 教师一的名册全部已关联班级', stillEmpty.length === 0, JSON.stringify(stillEmpty.map((s) => s.name)));

  // M10 班级详情能看到成员
  const detail = await t1({ action: 'class.detail', class_id: 'C1' });
  check('M10 班级详情成员数 > 0', detail.ok === true && detail.summary.member_count >= 5, JSON.stringify(detail.summary));

  // M11 权限：他人班级不能并入
  const forbidden = await t2({ action: 'class.syncMembers', class_id: 'C1', dry_run: true });
  check('M11 普通教师不能操作他人班级', forbidden.ok === false && forbidden.code === 'FORBIDDEN', forbidden.code);

  // M12 两个班级时不做"名称不一致也并入"
  seed('classes', [{ _id: 'C2', name: '车辆2402', school: '安徽建筑大学', status: 'active', owner_teacher_id: 'T1', owner_teacher_name: '教师一', created_at: T0, updated_at: T0 }]);
  const m12 = await t1({ action: 'student.create', school: '安徽建筑大学', class_name: '不存在的班', name: '子', student_no: '2026006' });
  check('M12 多个班级且名称不匹配 → 保持未分班', m12.ok === true && m12.student.class_id === '' && m12.student.class_name === '不存在的班',
    JSON.stringify({ id: m12.student.class_id, name: m12.student.class_name }));

  // M13 显式「未分班」不被自动归并规则覆盖
  const m13 = await t1({ action: 'student.create', school: '安徽建筑大学', class_name: '', name: '辰', student_no: '2026007', no_class: true });
  check('M13 no_class 显式未分班', m13.ok === true && m13.student.class_id === '' && m13.student.class_name === '',
    JSON.stringify({ id: m13.student.class_id, name: m13.student.class_name }));

  // M14 编辑时显式移出班级
  const m14 = await t1({ action: 'student.update', doc_id: 'S1', no_class: true });
  check('M14 编辑时显式清空班级关联', m14.ok === true && m14.student.class_id === '' && m14.student.class_name === '',
    JSON.stringify({ id: m14.student.class_id, name: m14.student.class_name }));

  // M15 导入时选择「全部保持未分班」
  const m15 = await t1({ action: 'student.import', mode: 'commit', no_class: true,
    rows: [{ school: '安徽建筑大学', class_name: '机械2401', name: '卯', student_no: '2026008' }] });
  const m15row = Array.from(table('students').values()).find((s) => s.student_no === '2026008');
  check('M15 导入 no_class 全部未分班', m15.ok === true && m15row && !m15row.class_id, JSON.stringify({ id: m15row && m15row.class_id, assigned: m15.summary && m15.summary.class_assigned }));

  const failed = results.filter((r) => !r.pass);
  results.forEach((r) => console.log((r.pass ? 'PASS ' : 'FAIL ') + r.name + (r.pass ? '' : ' :: ' + r.detail)));
  console.log('---');
  console.log('总计=' + results.length + ' 通过=' + (results.length - failed.length) + ' 失败=' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.log('HARNESS_ERROR ' + (e && e.stack ? e.stack : e)); process.exit(2); });
