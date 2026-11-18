/**
 * 各技术栈的证据归一化：工具原生产物 → 判据认识的统一 JSON（纯函数、不碰文件）。
 *
 * 判据只认三类统一形状：
 *   - 测试结果：`{numTotalTests, numFailedTests}`
 *   - 违规列表：`{summary: {violations: [{from, to, rule: {severity, name}}]}}`
 *   - 未使用列表：`{issues: [{file, files, exports, ...}]}`
 *
 * 入参是「原始文本」而不是解析好的 JSON：`go test -json` 是 JSONL（一行一个对象），
 * 按整份 `JSON.parse` 会直接失败，必须由这里按行切分。归一化内部吞掉格式错误、给空结果，
 * 由判据报「0 用例 / 无违规」——绝不把坏证据误判成通过。
 */

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

/** Python 契约 / 边界：pytest-json-report → 测试结果。failed 只算断言失败，error 也算失败。 */
export function normalizePytestReport(raw: string): unknown {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { numTotalTests: 0, numFailedTests: 0 };
  }
  const summary = asObject(asObject(parsed).summary);
  return {
    numTotalTests: asNumber(summary.total),
    numFailedTests: asNumber(summary.failed) + asNumber(summary.error),
  };
}

/** Go 契约 / 边界：`go test -json` 的 JSONL 事件 → 测试结果。每个用例只计一次。 */
export function normalizeGoTestJson(raw: string): unknown {
  let total = 0;
  let failed = 0;
  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === '') continue;
    let event: unknown;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    const record = asObject(event);
    const test = record.Test;
    const action = record.Action;
    if (typeof test !== 'string' || test === '') continue;
    if (action === 'pass' || action === 'fail' || action === 'skip') {
      total += 1;
      if (action === 'fail') failed += 1;
    }
  }
  return { numTotalTests: total, numFailedTests: failed };
}

/** Python 依赖：import-linter 文本报告（`<contract> BROKEN` + `-   a -> b (l.N)`）→ 违规列表。 */
export function normalizeImportLinter(raw: string): unknown {
  const violations: Array<{ from: string; to: string; rule: { name: string; severity: 'error' } }> = [];
  let currentContract = '';
  let inBrokenSection = false;
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed === 'Broken contracts') { inBrokenSection = true; continue; }
    if (!inBrokenSection) continue;
    const violation = /^-\s+(.+?)\s+->\s+(.+?)\s+\(l\.\d+\)$/.exec(trimmed);
    if (violation !== null) {
      violations.push({
        from: violation[1] ?? '',
        to: violation[2] ?? '',
        rule: { name: currentContract || 'import-linter-contract', severity: 'error' },
      });
      continue;
    }
    // 契约名行：单独一行、不含空格、不是分隔线（----）
    if (trimmed !== '' && !trimmed.includes(' ') && !trimmed.startsWith('-')) {
      currentContract = trimmed;
    }
  }
  return { summary: { violations } };
}

/** Python 死代码：vulture 文本（`path:line: unused ...`）→ 未使用列表。 */
export function normalizeVulture(raw: string): unknown {
  const issues: Array<{ file: string; files: Array<{ name: string }>; exports: Array<{ name: string }> }> = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(.+?):(\d+):\s+(.+)$/.exec(line.trim());
    if (match === null) continue;
    const file = match[1] ?? '';
    issues.push({ file, files: [{ name: file }], exports: [{ name: match[3] ?? '' }] });
  }
  return { issues };
}

/** Go 依赖：`go build` 的 import cycle 编译错误 → 违规列表。 */
export function normalizeGoBuild(raw: string): unknown {
  const violations: Array<{ from: string; to: string; rule: { name: string; severity: 'error' } }> = [];
  if (raw.includes('import cycle not allowed')) {
    // Go 的循环报错是「package / imports a / imports b / imports a: import cycle not allowed」多行。
    const chain = raw.split(/\r?\n/)
      .map((line) => /imports\s+([^\s:]+)/.exec(line)?.[1] ?? '')
      .filter((pkg) => pkg !== '');
    for (let index = 0; index + 1 < chain.length; index += 1) {
      violations.push({
        from: chain[index] ?? '',
        to: chain[index + 1] ?? '',
        rule: { name: 'import-cycle', severity: 'error' },
      });
    }
    if (violations.length === 0) {
      violations.push({ from: '?', to: '?', rule: { name: 'import-cycle', severity: 'error' } });
    }
  }
  return { summary: { violations } };
}

/** Go 死代码：staticcheck 文本（`file:line:col: U1000: ...`）→ 未使用列表。 */
export function normalizeStaticcheck(raw: string): unknown {
  const issues: Array<{ file: string; files: []; exports: Array<{ name: string }> }> = [];
  for (const line of raw.split(/\r?\n/)) {
    const match = /^(.+?):(\d+):(\d+):\s+(U\d+):\s*(.+)$/.exec(line.trim());
    if (match === null) continue;
    issues.push({ file: match[1] ?? '', files: [], exports: [{ name: match[5] ?? '' }] });
  }
  return { issues };
}
