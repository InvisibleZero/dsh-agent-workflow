/**
 * 命名审查检查器（第 5 项协助型 / check_naming：只判封杀词）。
 *
 * 跑插件自带脚本 naming-scan.mjs 扫项目根的封杀词（跳过虚拟环境 / 模型 / 缓存），读 naming.json 判定：
 * 有封杀词违规就报不合格。语义部分（反向冗长 / 跨模块暴露 / 前缀越界）由 AI 判，不挂检查器。
 */
import { asArray, asNumber, asRecord, asString, missingEvidence, type CheckResult, type Checker, type CheckerFinding } from './types';

const EVIDENCE = 'naming.json';

export const namingChecker: Checker = {
  id: 'naming',
  name: '命名审查',
  evidence: EVIDENCE,
  defaultTarget: '',
  autoRun: true,
  script: 'naming-scan.mjs',
  check(evidence_json: unknown): CheckResult {
    if (evidence_json === null) return missingEvidence(EVIDENCE, 'node scripts/naming-scan.mjs');
    const root = asRecord(evidence_json);
    if (!Array.isArray(root.violations)) {
      return {
        ok: false,
        findings: [{ location: EVIDENCE, problem: '证据格式不认识：缺 violations，确认用的是 naming-scan.mjs' }],
        stats: {},
      };
    }
    const findings: CheckerFinding[] = [];
    for (const item of asArray(root.violations)) {
      const record = asRecord(item);
      const word = asString(record.word) || '(未知)';
      const file = asString(record.file) || EVIDENCE;
      const line = asNumber(record.line);
      const isNew = record.new;
      const prefix = isNew === true ? '[新增] ' : isNew === false ? '[存量] ' : '';
      findings.push({
        location: line > 0 ? `${file}:${line}` : file,
        problem: `${prefix}封杀词「${word}」：名字要写出含义，别用泛化词`,
      });
    }
    const scanned = asNumber(root.scanned);
    return { ok: findings.length === 0, findings, stats: { scanned, findings: findings.length } };
  },
};
