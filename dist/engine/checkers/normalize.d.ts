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
/** Python 契约 / 边界：pytest-json-report → 测试结果。failed 只算断言失败，error 也算失败。 */
export declare function normalizePytestReport(raw: string): unknown;
/** Go 契约 / 边界：`go test -json` 的 JSONL 事件 → 测试结果。每个用例只计一次。 */
export declare function normalizeGoTestJson(raw: string): unknown;
/** Python 依赖：import-linter 文本报告（`<contract> BROKEN` + `-   a -> b (l.N)`）→ 违规列表。 */
export declare function normalizeImportLinter(raw: string): unknown;
/** Python 死代码：vulture 文本（`path:line: unused ...`）→ 未使用列表。 */
export declare function normalizeVulture(raw: string): unknown;
/** Go 依赖：`go build` 的 import cycle 编译错误 → 违规列表。 */
export declare function normalizeGoBuild(raw: string): unknown;
/** Go 死代码：staticcheck 文本（`file:line:col: U1000: ...`）→ 未使用列表。 */
export declare function normalizeStaticcheck(raw: string): unknown;
//# sourceMappingURL=normalize.d.ts.map