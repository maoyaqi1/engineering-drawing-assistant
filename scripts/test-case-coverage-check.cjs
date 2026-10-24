#!/usr/bin/env node
// 需求—测试用例覆盖检查（开发者只读工具）。
//
// 检查两件事：
//   1. 每个当前需求编号至少出现在一份测试用例的“覆盖需求”字段中；
//   2. 测试用例编号唯一，且测试文档没有引用不存在的需求编号。
// 本脚本只证明“有映射”，不代表用例已执行或执行通过。
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const requirementPath = path.join(root, 'docs', 'requirements', '系统需求规格.md');
const casePath = path.join(root, 'docs', 'test', '系统测试用例.md');
const requirementText = fs.readFileSync(requirementPath, 'utf8');
const caseText = fs.readFileSync(casePath, 'utf8');

const requirements = new Set(
  [...requirementText.matchAll(/^`([A-Z]+-[0-9]+)`/gm)].map((match) => match[1])
);

const withoutCaseIds = caseText
  .replace(/TC-[A-Z]+-[0-9]+/g, '')
  .replace(/`/g, '');
const covered = new Set();
const rangePattern = /([A-Z]+)-([0-9]+)\s*[–—-]\s*([A-Z]+)-([0-9]+)/g;
let match;
while ((match = rangePattern.exec(withoutCaseIds))) {
  const [, startPrefix, startText, endPrefix, endText] = match;
  if (startPrefix !== endPrefix) continue;
  const start = Number(startText);
  const end = Number(endText);
  for (let index = start; index <= end; index += 1) {
    covered.add(startPrefix + '-' + String(index).padStart(2, '0'));
  }
}

withoutCaseIds.replace(/\b([A-Z]+)-([0-9]+)\b/g, (whole, prefix, numberText) => {
  covered.add(prefix + '-' + String(Number(numberText)).padStart(2, '0'));
  return whole;
});

const caseIds = [...caseText.matchAll(/\bTC-[A-Z]+-[0-9]+\b/g)].map((item) => item[0]);
const duplicateCaseIds = caseIds.filter((id, index) => caseIds.indexOf(id) !== index);
const missingRequirements = [...requirements].filter((id) => !covered.has(id));
const unknownRequirements = [...covered].filter((id) => !requirements.has(id));

console.log('当前需求：' + requirements.size + ' 条');
console.log('已映射需求：' + (requirements.size - missingRequirements.length) + ' 条');
console.log('测试用例：' + new Set(caseIds).size + ' 个');

const failures = [];
if (missingRequirements.length) failures.push('未覆盖需求：' + missingRequirements.join(', '));
if (unknownRequirements.length) failures.push('引用了不存在的需求：' + unknownRequirements.join(', '));
if (duplicateCaseIds.length) failures.push('重复用例编号：' + [...new Set(duplicateCaseIds)].join(', '));

if (failures.length) {
  failures.forEach((failure) => console.error('FAIL ' + failure));
  process.exitCode = 1;
} else {
  console.log('需求—测试用例覆盖检查：通过（仅表示映射存在，不表示已执行）');
}
