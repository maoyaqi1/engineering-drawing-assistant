#!/usr/bin/env node
// 云数据库体检（只读本地导出文件，不连云端、不写任何库）。
//
// 用法：
//   node scripts/data-audit.js <导出目录> [--out 报告文件] [--max 20]
//
// 导出目录里放「每个集合一个 JSON 文件」：users.json / students.json / classes.json /
// roster.json / learning_sessions.json / learning_records.json / ai_conversations.json /
// ai_messages.json / survey_responses.json / survey_invites.json / teachers.json /
// teacher_notes.json / maintenance_logs.json …
// 也支持单个 all.json（形如 { "users": [...], "students": [...] }）。
// 文件内容是文档数组（微信云开发控制台导出的 JSON 数组，或从控制台复制粘贴的 [{...}]）。
//
// 报告可能包含真实姓名与学号，请勿把报告文件放进仓库（本工具默认只打印到终端）。
const fs = require('fs');
const path = require('path');

const dir = process.argv[2];
const outIndex = process.argv.indexOf('--out');
const outFile = outIndex >= 0 ? process.argv[outIndex + 1] : '';
const maxIndex = process.argv.indexOf('--max');
const MAX_LIST = maxIndex >= 0 ? Math.max(1, Number(process.argv[maxIndex + 1]) || 20) : 20;

if (!dir) {
  console.log('用法：node scripts/data-audit.js <导出目录> [--out 报告文件] [--max 20]');
  process.exitCode = 2;
  return;
}

// 支持三种导出格式：JSON 数组、控制台 JSON Lines（一行一条）、{ 集合名: [...] } 合并文件
function parseDocuments(text) {
  const trimmed = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed;
    if (parsed && Array.isArray(parsed.data)) return parsed.data;
    if (parsed && typeof parsed === 'object') {
      const arrayKeys = Object.keys(parsed).filter((k) => Array.isArray(parsed[k]));
      if (arrayKeys.length) return { combined: parsed };
      return [parsed];
    }
  } catch (error) {
    // 不是整体 JSON，继续按 JSON Lines 逐行解析
  }
  const docs = [];
  trimmed.split('\n').forEach((line) => {
    const one = line.trim().replace(/,$/, '');
    if (!one || one === '[' || one === ']') return;
    docs.push(JSON.parse(one));
  });
  return docs;
}

// 控制台导出的文件名是随机串，这里按文档字段自动识别集合
const SIGNATURES = [
  { name: 'teachers', test: (d) => 'password_hash' in d || ('username' in d && 'role' in d) },
  { name: 'teacher_sessions', test: (d) => 'token' in d && 'teacher_id' in d },
  { name: 'teacher_notes', test: (d) => 'student_doc_id' in d },
  { name: 'maintenance_logs', test: (d) => 'action' in d && ('removed' in d || 'operator_id' in d) },
  { name: 'survey_invites', test: (d) => 'trigger_count' in d },
  { name: 'survey_responses', test: (d) => 'survey_id' in d || 'answers' in d },
  { name: 'ai_messages', test: (d) => 'conversation_id' in d },
  { name: 'ai_conversations', test: (d) => 'title' in d && 'knowledge_point' in d && 'openid' in d },
  { name: 'learning_records', test: (d) => 'event_type' in d },
  { name: 'learning_sessions', test: (d) => 'start_time' in d || ('module' in d && 'is_valid' in d) },
  { name: 'classes', test: (d) => 'owner_teacher_id' in d && 'status' in d && !('student_no' in d) },
  { name: 'students', test: (d) => 'student_no' in d },
  // 说明：AI 白名单集合 roster 已下线（REQ-003 D16）。若导出里仍能看到它，说明还没执行"删集合"这一步。
  { name: 'roster', test: (d) => 'student_id' in d && !('openid' in d) && !('profile_completed' in d) },
  { name: 'users', test: (d) => 'openid' in d && ('role' in d || 'profile_completed' in d || 'student_id' in d) }
];
const KNOWN_COLLECTIONS = SIGNATURES.map((s) => s.name).concat(['schools', 'teacher_classes']);

function detectCollection(docs) {
  const sample = docs.slice(0, 5);
  const score = {};
  SIGNATURES.forEach((sig) => { score[sig.name] = sample.filter(sig.test).length; });
  const best = Object.keys(score).sort((a, b) => score[b] - score[a])[0];
  return { name: score[best] > 0 ? best : '', hits: score[best] || 0, of: sample.length };
}

function loadCollections(root) {
  const collections = {};
  const mapping = [];
  const files = fs.readdirSync(root).filter((f) => f.endsWith('.json')).sort();
  files.forEach((file) => {
    let docs;
    try {
      docs = parseDocuments(fs.readFileSync(path.join(root, file), 'utf8'));
    } catch (error) {
      mapping.push({ file, name: '(无法解析)', count: 0, note: String(error.message || error) });
      return;
    }
    if (docs && docs.combined) {
      Object.keys(docs.combined).filter((k) => Array.isArray(docs.combined[k])).forEach((key) => {
        collections[key] = docs.combined[key];
        mapping.push({ file, name: key, count: docs.combined[key].length, note: '合并文件' });
      });
      return;
    }
    const base = path.basename(file, '.json');
    const known = KNOWN_COLLECTIONS.indexOf(base) >= 0;
    const detected = known ? { name: base, hits: docs.length, of: docs.length } : detectCollection(docs);
    if (!detected.name) {
      mapping.push({ file, name: '(未识别)', count: docs.length, note: '字段不匹配任何已知集合' });
      collections['(未识别) ' + base] = docs;
      return;
    }
    if (collections[detected.name]) {
      mapping.push({ file, name: detected.name, count: docs.length, note: '重复：先前已有同集合文件，本次忽略' });
      return;
    }
    collections[detected.name] = docs;
    mapping.push({ file, name: detected.name, count: docs.length, note: known ? '按文件名' : '按字段识别 ' + detected.hits + '/' + detected.of });
  });
  return { collections, mapping };
}

if (!fs.existsSync(dir)) {
  console.log('导出目录不存在：' + dir);
  process.exitCode = 2;
  return;
}

const loaded = loadCollections(dir);
const db = loaded.collections;
const fileMapping = loaded.mapping;
const lines = [];
let serious = 0;
let warn = 0;

const rows = (name) => {
  const value = db[name];
  return Array.isArray(value) ? value : [];
};
const text = (value) => String(value == null ? '' : value).trim();
const normNo = (value) => text(value).replace(/\s+/g, '');
const key = (no, name) => normNo(no) + '|' + text(name);
const dump = (value) => JSON.stringify(value === undefined ? null : value);
const dateOf = (value) => {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
};

function head(title) {
  lines.push('');
  lines.push('## ' + title);
}
function item(label, detail, level) {
  if (level === 'error') serious += 1;
  if (level === 'warn') warn += 1;
  const flag = level === 'error' ? '[!]' : (level === 'warn' ? '[~]' : '[ ]');
  lines.push(flag + ' ' + label + (detail ? '：' + detail : ''));
}
function sample(list) {
  const shown = list.slice(0, MAX_LIST).join('；');
  return list.length > MAX_LIST ? shown + ' …（共 ' + list.length + ' 条）' : shown;
}
function groupCount(list, pick) {
  const map = new Map();
  list.forEach((row) => {
    const k = pick(row) || '(空)';
    map.set(k, (map.get(k) || 0) + 1);
  });
  return [...map.entries()].sort((a, b) => b[1] - a[1]);
}

// ---------- 概览 ----------
head('导出文件识别');
if (!fileMapping.length) item('导出目录里没有 .json 文件', dir, 'error');
fileMapping.forEach((m) => {
  item(m.file + ' → ' + m.name, m.count + ' 条' + (m.note ? '（' + m.note + '）' : ''),
    m.name.indexOf('未识别') === 0 || m.name.indexOf('无法解析') === 0 ? 'error' : '');
});

head('集合概览');
const NAMES = ['users', 'students', 'classes', 'roster', 'learning_sessions', 'learning_records',
  'ai_conversations', 'ai_messages', 'survey_responses', 'survey_invites', 'teachers',
  'teacher_sessions', 'teacher_notes', 'maintenance_logs', 'teacher_classes', 'schools'];
NAMES.forEach((name) => {
  const list = rows(name);
  const value = db[name];
  if (value === undefined) { item(name, '导出里没有这个集合（可能为空或未导出）', 'warn'); return; }
  if (value && value.__error) { item(name, '无法解析：' + value.__error, 'error'); return; }
  const dates = list.map((r) => text(r.created_at)).filter(Boolean).sort();
  item(name, list.length + ' 条' + (dates.length ? '，created_at ' + dateOf(dates[0]) + ' ~ ' + dateOf(dates[dates.length - 1]) : ''));
});
const otherCollections = Object.keys(db).filter((k) => NAMES.indexOf(k) < 0);
if (otherCollections.length) item('代码未使用的其它集合', otherCollections.join('、'), 'warn');
// roster 已下线（D16），不再算关键集合；它的存在与否另有一条提示
const critical = ['users', 'students', 'classes', 'learning_sessions', 'learning_records'];
const missingCritical = critical.filter((name) => db[name] === undefined);
item('关键集合没有导出文件', missingCritical.length
  ? missingCritical.join('、') + '（控制台里确认这集合是真的空，还是导出时漏掉了）'
  : '无', missingCritical.length ? 'warn' : '');

// ---------- 索引 ----------
const users = rows('users');
const students = rows('students');
const classes = rows('classes');
const roster = rows('roster');
const sessions = rows('learning_sessions');
const records = rows('learning_records');
const conversions = rows('ai_conversations');
const messages = rows('ai_messages');
const responses = rows('survey_responses');
const invites = rows('survey_invites');
const teachersList = rows('teachers');

const usersByOpenid = new Map();
users.forEach((u) => {
  const list = usersByOpenid.get(text(u.openid)) || [];
  list.push(u);
  usersByOpenid.set(text(u.openid), list);
});
const classById = new Map(classes.map((c) => [text(c._id), c]));
const teacherById = new Map(teachersList.map((t) => [text(t._id), t]));
const userKeys = new Set(users.map((u) => key(u.student_id, u.name)).filter((k) => k !== '|'));
const studentKeys = new Set(students.map((s) => key(s.student_no, s.name)).filter((k) => k !== '|'));

// ---------- users ----------
head('users（学生账号）');
const dupOpenids = [...usersByOpenid.entries()].filter(([, list]) => list.length > 1);
item('同 openid 多条账号', dupOpenids.length ? dupOpenids.map(([openid, list]) => openid + '×' + list.length).join('，') + '（登录自愈会删除多余行，保留填过资料的那条）' : '无', dupOpenids.length ? 'error' : '');
const dupIdentity = groupCount(users.filter((u) => text(u.student_id) && text(u.name)), (u) => key(u.student_id, u.name)).filter(([, n]) => n > 1);
item('同「学号+姓名」多条账号', dupIdentity.length ? sample(dupIdentity.map(([k, n]) => k + '×' + n)) : '无', dupIdentity.length ? 'error' : '');
const sameNoDiffName = groupCount(users.filter((u) => text(u.student_id)), (u) => normNo(u.student_id)).filter(([, n]) => n > 1);
item('同学号对应多个姓名', sameNoDiffName.length ? sample(sameNoDiffName.map(([k, n]) => k + '×' + n)) : '无', sameNoDiffName.length ? 'warn' : '');
item('注册资料完成度', groupCount(users, (u) => (text(u.student_id) && text(u.name) ? '已填姓名+学号' : (text(u.student_id) || text(u.name) ? '只填了一半' : '未填'))).map(([k, n]) => k + ' ' + n).join('，'),
  users.some((u) => (text(u.student_id) ? 1 : 0) + (text(u.name) ? 1 : 0) === 1) ? 'warn' : '');
item('僵尸字段 nickname / avatar', 'nickname 非空 ' + users.filter((u) => text(u.nickname)).length + ' 条，avatar 非空 ' + users.filter((u) => text(u.avatar)).length + ' 条（代码从不写这两个字段，非空说明是历史数据）');

// ---------- 名册（students）vs 账号（users）----------
// REQ-003 D16：判定源已经是 students，白名单 roster 已下线，这里不再做三方一致性。
head('名册（students）/ 账号（users）一致性（roster 白名单已下线）');
if (roster.length) {
  item('导出里仍有 roster 白名单行', roster.length + ' 条 —— 该集合已废弃，确认新代码部署后可在控制台删除集合',
    'warn');
}
const studentsNotRegistered = students.filter((s) => !userKeys.has(key(s.student_no, s.name)));
item('名册里但还没有人用该「学号+姓名」注册（新生未注册属正常）', studentsNotRegistered.length
  ? studentsNotRegistered.length + ' 人，例：' + sample(studentsNotRegistered.map((s) => text(s.student_no) + ' ' + text(s.name)))
  : '无');
const registeredNotInRoster = users.filter((u) => text(u.student_id) && text(u.name) && !studentKeys.has(key(u.student_id, u.name)));
item('已注册但不在名册（游客状态，不能使用 AI）',
  registeredNotInRoster.length + ' 人（含老师尚未录入与姓名/学号填错两类）');
const inRosterArchived = students.filter((s) => {
  const cls = classById.get(text(s.class_id));
  return !!cls && text(cls.status) === 'archived';
});
item('名册命中但班级已停用（不能使用 AI，互动可用）', inRosterArchived.length
  ? inRosterArchived.length + ' 人：' + sample(inRosterArchived.map((s) => text(s.student_no) + ' ' + text(s.name)))
  : '无');
const inRosterNoClass = students.filter((s) => !text(s.class_id));
item('名册命中但未分班（不能使用 AI，需老师分班）', inRosterNoClass.length
  ? inRosterNoClass.length + ' 人：' + sample(inRosterNoClass.map((s) => text(s.student_no) + ' ' + text(s.name)))
  : '无');

// ---------- 四态分布（按新判定规则模拟，对应 REQ-003 §3 与上线门禁 G1）----------
head('四态分布（按 students + classes 判定规则模拟，用于上线门禁 G1）');
const rosterNoByName = new Map();
students.forEach((s) => {
  const n = normNo(s.student_no);
  if (!n) return;
  if (!rosterNoByName.has(n)) rosterNoByName.set(n, []);
  rosterNoByName.get(n).push(s);
});
const stateOfUser = (u) => {
  const no = normNo(u.student_id);
  const nm = text(u.name);
  if (!no || !nm) return 'no_profile';
  const hits = (rosterNoByName.get(no) || []).filter((s) => text(s.name) === nm);
  if (!hits.length) return 'not_in_roster';
  const row = hits[0];
  if (!text(row.class_id)) return 'no_class';
  const cls = classById.get(text(row.class_id));
  if (!cls) return 'no_class';
  return text(cls.status) === 'archived' ? 'class_archived' : 'ok';
};
const stateCounts = groupCount(users, stateOfUser);
stateCounts.forEach(([state, n]) => {
  const label = {
    ok: '在册学生（可用 AI）',
    no_profile: '未注册游客（仅互动）',
    not_in_roster: '已注册游客（仅互动）',
    class_archived: '班级停用（仅互动）',
    no_class: '未分班（仅互动）'
  }[state] || state;
  item(label, n + ' 人', state === 'ok' ? '' : '');
});
const totalUsers = users.length;
const sumStates = stateCounts.reduce((sum, [, n]) => sum + n, 0);
item('四态求和 = users 总数', sumStates + ' / ' + totalUsers, sumStates === totalUsers ? '' : 'error');
item('切换后的"在册学情"人数', String((stateCounts.find(([s]) => s === 'ok') || [, 0])[1])
  + ' 人（上线初期为 0 属预期：两个新生班尚未注册、教师组为演示班，见 REQ-003 §12-7）');

// ---------- 班级双轨 ----------
head('班级关联双轨（students.class_id 权威 / class_name 快照）');
const nameOnly = students.filter((s) => !text(s.class_id) && text(s.class_name));
item('class_id 为空但 class_name 有值（名册看着在班里、班级成员里没有）',
  nameOnly.length ? nameOnly.length + ' 条：' + sample(nameOnly.map((s) => text(s.student_no) + ' ' + text(s.name) + '→' + text(s.class_name))) : '无',
  nameOnly.length ? 'error' : '');
const danglingClass = students.filter((s) => text(s.class_id) && !classById.has(text(s.class_id)));
item('class_id 指向不存在的班级', danglingClass.length ? sample(danglingClass.map((s) => text(s.student_no) + ' ' + text(s.name) + '→' + text(s.class_id))) : '无', danglingClass.length ? 'error' : '');
const archivedMember = students.filter((s) => {
  const c = classById.get(text(s.class_id));
  return c && text(c.status) && text(c.status) !== 'active';
});
item('仍挂在已停用班级下的学生', archivedMember.length ? sample(archivedMember.map((s) => text(s.student_no) + ' ' + text(s.name) + '→' + text(s.class_id))) : '无', archivedMember.length ? 'warn' : '');
const nameDrift = students.filter((s) => {
  const c = classById.get(text(s.class_id));
  return c && text(c.name) !== text(s.class_name);
});
item('class_name 与班级实体名不一致（快照漂移）',
  nameDrift.length ? nameDrift.length + ' 条：' + sample(nameDrift.map((s) => text(s.student_no) + ' ' + text(s.name) + '：' + text(s.class_name) + ' ≠ ' + text(classById.get(text(s.class_id)).name))) : '无',
  nameDrift.length ? 'warn' : '');
const badOwner = students.filter((s) => text(s.owner_teacher_id) && !teacherById.has(text(s.owner_teacher_id)));
item('owner_teacher_id 指向不存在的教师', badOwner.length ? badOwner.length + ' 条' : '无', badOwner.length ? 'warn' : '');

// ---------- 班级实体 ----------
head('classes（班级实体）');
const byClassId = new Map();
students.forEach((s) => {
  const id = text(s.class_id);
  if (id) byClassId.set(id, (byClassId.get(id) || 0) + 1);
});
const byClassName = new Map();
students.forEach((s) => {
  const name = text(s.class_name);
  if (name) byClassName.set(name, (byClassName.get(name) || 0) + 1);
});
classes.forEach((c) => {
  const members = byClassId.get(text(c._id)) || 0;
  const namePeers = byClassName.get(text(c.name)) || 0;
  const owner = teacherById.get(text(c.owner_teacher_id));
  const gaps = [];
  if (namePeers !== members) gaps.push('名册里班级名为「' + text(c.name) + '」的有 ' + namePeers + ' 条，实际成员(class_id) ' + members + ' 条，差 ' + (namePeers - members) + ' 条');
  if (!owner) gaps.push('负责人不存在');
  if (members === 0) gaps.push('空班');
  item('班级「' + text(c.name) + '」' + (text(c.school) ? '（' + text(c.school) + '）' : '') + ' [' + text(c.status || 'active') + ']',
    '成员 ' + members + ' 条' + (gaps.length ? '，需注意：' + gaps.join('；') : ''),
    gaps.some((g) => g.indexOf('差') >= 0) ? 'error' : (gaps.length ? 'warn' : ''));
});
const sameNameSameSchool = groupCount(classes, (c) => text(c.owner_teacher_id) + '|' + text(c.name) + '|' + text(c.school)).filter(([, n]) => n > 1);
item('同教师下同名同校的班级实体', sameNameSameSchool.length ? sample(sameNameSameSchool.map(([k, n]) => k + '×' + n)) : '无', sameNameSameSchool.length ? 'error' : '');

// ---------- 学习会话 ----------
head('learning_sessions（学习会话）');
item('is_valid 分布', groupCount(sessions, (s) => (s.is_valid === true ? 'valid=true' : 'valid=false')).map(([k, n]) => k + ' ' + n).join('，'));
const noEnd = sessions.filter((s) => !text(s.end_time));
item('没有 end_time 的会话（App 被切掉/未正常结束）', noEnd.length + ' 条' + (sessions.length ? '（占 ' + Math.round(noEnd.length / sessions.length * 100) + '%）' : ''), noEnd.length ? 'warn' : '');
const impossible = sessions.filter((s) => s.is_valid === true && !(Number(s.duration) >= 60 || Number(s.interaction_count) >= 3));
item('is_valid=true 但不满足「时长≥60s 或 交互≥3 次」', impossible.length ? impossible.length + ' 条' : '无', impossible.length ? 'error' : '');
item('module 分布', groupCount(sessions, (s) => text(s.module)).map(([k, n]) => k + ' ' + n).join('，'));
const sessionUserMissing = sessions.filter((s) => text(s.user_id) && !users.some((u) => text(u._id) === text(s.user_id)));
item('user_id 指向不存在的账号', sessionUserMissing.length ? sessionUserMissing.length + ' 条' : '无', sessionUserMissing.length ? 'warn' : '');
const validByUser = new Map();
sessions.filter((s) => s.is_valid === true).forEach((s) => {
  validByUser.set(text(s.user_id), (validByUser.get(text(s.user_id)) || 0) + 1);
});
const countDrift = users.filter((u) => Number(u.valid_session_count || 0) !== (validByUser.get(text(u._id)) || 0));
item('users.valid_session_count 与实际有效会话数不一致', countDrift.length ? countDrift.length + ' 条账号（缓存字段，可在必要时重算）' : '无', countDrift.length ? 'warn' : '');

// ---------- 行为事件 ----------
head('learning_records（学习行为事件）');
item('event_type 分布', groupCount(records, (r) => text(r.event_type)).slice(0, 12).map(([k, n]) => k + ' ' + n).join('，'));
const snapshotDrift = [];
records.forEach((r) => {
  const owner = users.find((u) => text(u._id) === text(r.user_id));
  if (owner && (text(owner.student_id) !== text(r.student_id) || text(owner.name) !== text(r.student_name))) {
    snapshotDrift.push(text(r.user_id) + '：库里「' + text(r.student_id) + ' ' + text(r.student_name) + '」 vs 账号当前「' + text(owner.student_id) + ' ' + text(owner.name) + '」');
  }
});
item('事件里的姓名/学号快照与账号当前值不一致（改过名或学号）', snapshotDrift.length ? snapshotDrift.length + ' 条：' + sample(snapshotDrift) : '无', snapshotDrift.length ? 'warn' : '');
const noUserId = records.filter((r) => !text(r.user_id));
item('缺 user_id 的事件（早期只有 openid）', noUserId.length ? noUserId.length + ' 条' : '无', noUserId.length ? 'warn' : '');

// ---------- AI ----------
head('AI 会话（ai_conversations / ai_messages）');
const convIds = new Set(conversions.map((c) => text(c._id)));
const orphanMessages = messages.filter((m) => text(m.conversation_id) && !convIds.has(text(m.conversation_id)));
item('消息找不到所属会话', orphanMessages.length ? orphanMessages.length + ' 条' : '无', orphanMessages.length ? 'error' : '');
const convOpenidNotUser = conversions.filter((c) => text(c.openid) && !usersByOpenid.has(text(c.openid)));
item('会话的 openid 找不到账号', convOpenidNotUser.length ? convOpenidNotUser.length + ' 条' : '无', convOpenidNotUser.length ? 'warn' : '');
item('会话/消息是否带 user_id', 'ai_conversations 带 user_id：' + conversions.filter((c) => text(c.user_id)).length + ' 条；'
  + 'ai_messages 带 user_id：' + messages.filter((m) => text(m.user_id)).length + ' 条（结构里只有 openid，教师端按 openid 归人）');
item('反馈分布', groupCount(messages, (m) => text(m.feedback_rating) || '(未评价)').map(([k, n]) => k + ' ' + n).join('，'));
item('消息缺 model / token 计数', '带 model 的 ' + messages.filter((m) => text(m.model)).length + ' 条（写入时未落库，属已知遗留）');

// ---------- 问卷 ----------
head('问卷（survey_invites / survey_responses）');
const inviteCompletedNoResponse = invites.filter((i) => i.completed === true && !responses.some((r) => text(r.user_id) === text(i.user_id)));
item('标记已完成但没有答卷', inviteCompletedNoResponse.length ? inviteCompletedNoResponse.length + ' 条' : '无', inviteCompletedNoResponse.length ? 'warn' : '');
const responseNoInvite = responses.filter((r) => !invites.some((i) => text(i.user_id) === text(r.user_id)));
item('有答卷但没有邀请记录', responseNoInvite.length ? responseNoInvite.length + ' 条' : '无');
const dupResponse = groupCount(responses, (r) => text(r.user_id) + '|' + text(r.survey_id)).filter(([, n]) => n > 1);
item('同一账号同一问卷重复作答', dupResponse.length ? sample(dupResponse.map(([k, n]) => k + '×' + n)) : '无', dupResponse.length ? 'warn' : '');
const inviteUserMissing = invites.filter((i) => text(i.user_id) && !users.some((u) => text(u._id) === text(i.user_id)));
item('邀请记录的 user_id 找不到账号（账号去重后可能发生）', inviteUserMissing.length ? inviteUserMissing.length + ' 条' : '无', inviteUserMissing.length ? 'warn' : '');

// ---------- 维护留痕 ----------
head('maintenance_logs（数据清理留痕）');
const logs = rows('maintenance_logs');
if (!logs.length) item('没有清理记录', '（若"学习记录突然变少"，这里为空就说明不是清理工具造成的）');
logs
  .slice()
  .sort((a, b) => text(a.created_at).localeCompare(text(b.created_at)))
  .forEach((log) => {
    item(dateOf(log.created_at) + ' ' + text(log.action) + ' by ' + (text(log.operator_name) || text(log.operator_id)),
      '删除 ' + dump(log.removed || log.counts || null) + (log.collections ? '，集合 ' + dump(log.collections) : ''),
      'warn');
  });

// ---------- 结语 ----------
head('汇总');
item('需要处理（[!]）', String(serious) + ' 项');
item('建议关注（[~]）', String(warn) + ' 项');
lines.push('');
lines.push('说明：本报告只读取你导出的 JSON，不连接云端、不修改任何数据。含真实姓名/学号，请勿提交进仓库。');

const report = lines.join('\n');
console.log(report);
if (outFile) {
  fs.writeFileSync(outFile, report + '\n', 'utf8');
  console.log('\n报告已写入：' + outFile);
}
process.exitCode = serious ? 1 : 0;
