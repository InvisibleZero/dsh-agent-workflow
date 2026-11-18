/**
 * 各技术栈的证据归一化：工具原生产物 → 判据认识的统一 JSON（纯函数、不碰文件）。
 *
 * 判据只认三类统一形状：
 *   - 测试结果：`{numTotalTests, numFailedTests}`
 *   - 违规列表：`{summary: {violations: [{from, to, rule: {severity, name}}]}}`
 *   - 未使用列表：`{issues: [{file, files, exports, ...}]}`
 *
 * 入参是「原始文本」而不是解析好的 JSON：不同工具的原生输出有 JSON / 文本两种形态，
 * 由这里各自解析。归一化内部吞掉格式错误、给空结果，由判据报「0 用例 / 无违规」——绝不把坏证据误判成通过。
 */
function asObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
        ? value
        : {};
}
function asNumber(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}
/** Python 契约 / 边界：pytest-json-report → 测试结果。failed 只算断言失败，error 也算失败。 */
export function normalizePytestReport(raw) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        return { numTotalTests: 0, numFailedTests: 0, exitcode: 0 };
    }
    const root = asObject(parsed);
    const summary = asObject(root.summary);
    return {
        numTotalTests: asNumber(summary.total),
        numFailedTests: asNumber(summary.failed) + asNumber(summary.error),
        // pytest 自己的退出码：判据用它做 fail-closed 交叉校验（异常退出时不完全信 summary）。
        exitcode: asNumber(root.exitcode),
    };
}
/** Python 依赖：import-linter 文本报告（`<contract> BROKEN` + `-   a -> b (l.N)`）→ 违规列表。 */
export function normalizeImportLinter(raw) {
    const violations = [];
    let currentContract = '';
    let inBrokenSection = false;
    for (const line of raw.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (trimmed === 'Broken contracts') {
            inBrokenSection = true;
            continue;
        }
        if (!inBrokenSection)
            continue;
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
/** Python 死代码：vulture 文本（`path:line: unused ...`）→ 未使用列表（一条 message 一条，不拆 files/exports）。 */
export function normalizeVulture(raw) {
    const issues = [];
    for (const line of raw.split(/\r?\n/)) {
        const match = /^(.+?):(\d+):\s+(.+)$/.exec(line.trim());
        if (match === null)
            continue;
        issues.push({
            file: match[1] ?? '',
            line: Number(match[2] ?? 0),
            message: match[3] ?? '',
        });
    }
    return { issues };
}
//# sourceMappingURL=normalize.js.map