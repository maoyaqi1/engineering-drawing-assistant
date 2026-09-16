#!/usr/bin/env node
// 一键运行本仓库全部「只读」开发者检查（不修改任何源文件）。
//
// 运行：node scripts/run-all.js          （失败时打印该步完整输出）
//       node scripts/run-all.js --full   打印每一步的完整输出
//
// 定位：开发者本机工具，不是 CI，也不是自动化测试框架（AGENTS.md C11）。
//       它替代不了真机/模拟器回归，也替代不了云函数部署后的验证（未部署不算验证）。
//
// 注意：scripts/ 下有两个「生成器」（wxss-wide.cjs / wxss-wide-all.cjs 的历史版本）会改写源文件，
//       故意没有放进本仓库，避免被误当作检查脚本运行。

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STUB_ROOT = path.join(__dirname, 'offline', 'stub');
const showFull = process.argv.includes('--full');

const STEPS = [
  { name: '几何真值回归', script: 'scripts/geometry-test.js' },
  { name: '截交三视图等价性守护', script: 'scripts/section-projection-check.cjs' },
  { name: '静态接线检查', script: 'scripts/integrity-check.js' },
  { name: '整体静态检查', script: 'scripts/full-check.cjs' },
  { name: '首页布局校验', script: 'scripts/layout-check.cjs' },
  { name: '宽屏一屏放下估算', script: 'scripts/pad-fit-check.cjs' },
  { name: '手机端折行估算（仅报告）', script: 'scripts/phone-fit-check.cjs', informational: true },
  { name: '网页版模块加载检查', script: 'scripts/web-loader-check.cjs' },
  { name: '转发能力自测', script: 'scripts/share-selfcheck.cjs' },
  { name: '尺规移除自测', script: 'scripts/ruler-removal-selfcheck.cjs' }
];

fs.readdirSync(path.join(__dirname, 'offline'))
  .filter((file) => /^run.*\.cjs$/.test(file))
  .sort()
  .forEach((file) => {
    const label = file === 'run.cjs' ? 'class.*' : file.replace(/^run-/, '').replace(/\.cjs$/, '');
    STEPS.push({ name: '离线云函数自测 · ' + label, script: 'scripts/offline/' + file });
  });

function lastMeaningfulLine(output) {
  const lines = String(output || '').split('\n').map((line) => line.trim()).filter(Boolean);
  if (!lines.length) return '';
  return lines[lines.length - 1];
}

function pad(text, width) {
  const visible = text.replace(/[\u4e00-\u9fa5]/g, '  ');
  return text + ' '.repeat(Math.max(0, width - visible.length));
}

const results = [];
STEPS.forEach((step, index) => {
  const absolute = path.join(ROOT, step.script);
  if (!fs.existsSync(absolute)) {
    results.push({ ...step, ok: false, code: 127, detail: '脚本不存在：' + step.script, output: '' });
    return;
  }
  const run = spawnSync(process.execPath, [absolute], {
    cwd: ROOT,
    encoding: 'utf8',
    env: Object.assign({}, process.env, { NODE_PATH: STUB_ROOT })
  });
  const output = (run.stdout || '') + (run.stderr || '');
  const ok = step.informational ? true : run.status === 0;
  results.push({
    ...step,
    ok,
    code: run.status === null ? -1 : run.status,
    detail: lastMeaningfulLine(output),
    output,
    index: index + 1
  });
});

console.log('工程制图学习助手 · 只读检查汇总（' + STEPS.length + ' 项）\n');
results.forEach((result) => {
  const status = result.ok ? 'PASS' : 'FAIL';
  console.log(status + '  ' + pad(result.name, 34) + (result.detail || ''));
  if (showFull || !result.ok) {
    String(result.output || '').split('\n').forEach((line) => {
      if (line.trim()) console.log('        ' + line.trim());
    });
  }
});

const failed = results.filter((result) => !result.ok);
console.log('\n合计 ' + results.length + ' 项，通过 ' + (results.length - failed.length) + '，失败 ' + failed.length);
if (failed.length) {
  console.log('失败项：' + failed.map((item) => item.name).join('、'));
}
process.exitCode = failed.length ? 1 : 0;
