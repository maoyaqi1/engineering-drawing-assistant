// 极简断言器：零第三方依赖，供 scripts/ 下的开发者检查脚本共用。
//
// 定位：只在开发者本机运行，不参与小程序、云函数、教师网页的运行时；
//       本项目没有自动化测试框架、没有 CI（AGENTS.md C11），本文件只是把
//       「§49 纯数学函数应进行确定性测试」做成可执行的一次性检查。
//
// 用法：
//   const { createSuite } = require('./lib/harness.js');
//   const suite = createSuite('几何真值回归', { quiet: false });
//   suite.section('A1 xxx');
//   suite.equal(actual, expected, '说明');
//   process.exitCode = suite.finish();

function formatValue(value) {
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return String(value);
    return String(Number(value.toPrecision(12)));
  }
  if (typeof value === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(formatValue).join(', ') + ']';
  if (value && typeof value === 'object') {
    const keys = Object.keys(value);
    if (keys.length > 5) return '{…共 ' + keys.length + ' 个字段}';
    return '{' + keys.map((key) => key + ': ' + formatValue(value[key])).join(', ') + '}';
  }
  return String(value);
}

function createSuite(title, options) {
  const opts = options || {};
  const quiet = opts.quiet === true;
  const failures = [];
  const notes = [];
  let passed = 0;
  let currentSection = '(未分组)';

  function section(name) {
    currentSection = name;
    if (!quiet) console.log('\n■ ' + name);
  }

  function record(isOk, label, detail) {
    if (isOk) {
      passed += 1;
      if (!quiet) console.log('  ✓ ' + label);
      return true;
    }
    failures.push({ section: currentSection, label, detail: detail || '' });
    console.log('  ✗ ' + label + (detail ? '\n      ' + detail : ''));
    return false;
  }

  function check(condition, label, detail) {
    return record(!!condition, label, detail);
  }

  function equal(actual, expected, label) {
    const isOk = Object.is(actual, expected);
    return record(isOk, label, isOk ? '' : '期望 ' + formatValue(expected) + '，实际 ' + formatValue(actual));
  }

  function close(actual, expected, tolerance, label) {
    const isOk = Number.isFinite(actual) && Number.isFinite(expected)
      && Math.abs(actual - expected) <= tolerance;
    return record(isOk, label, isOk ? ''
      : '期望 ' + formatValue(expected) + ' ± ' + formatValue(tolerance) + '，实际 ' + formatValue(actual));
  }

  function throws(fn, messagePattern, label) {
    let error = null;
    try {
      fn();
    } catch (caught) {
      error = caught;
    }
    if (!error) return record(false, label, '期望抛出异常，实际没有抛出');
    const text = String(error && error.message || error);
    const isOk = !messagePattern || messagePattern.test(text);
    return record(isOk, label, isOk ? '' : '异常信息不匹配：' + text);
  }

  function note(text) {
    notes.push(text);
    console.log('  · 备注：' + text);
  }

  function finish() {
    const failed = failures.length;
    console.log('\n' + title + '：合计 ' + (passed + failed) + ' 项，通过 ' + passed + '，失败 ' + failed);
    if (failed) {
      console.log('失败明细：');
      failures.forEach((item) => {
        console.log('  [' + item.section + '] ' + item.label + (item.detail ? ' :: ' + item.detail : ''));
      });
    }
    return failed ? 1 : 0;
  }

  return { section, check, equal, close, throws, note, finish, failures, notes };
}

module.exports = { createSuite, formatValue };
