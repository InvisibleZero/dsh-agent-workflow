import { describe, expect, it } from 'vitest';
import { DEFAULT_GLOBAL_OPERATION_DETAIL } from '../src/schema/workflow';
import { DEFAULT_HARD_RULES } from '../src/schema/hard-rules';
import { assemblePromptLayers } from '../src/engine/prompt-layers';
import { FACTORY_TOOLS, renderCatalogText } from '../src/engine/tool-policy';
import { TOTAL_BUDGET_BYTES } from '../src/host/workflow-state-context';

/**
 * 硬层预算回归：按「验收中 + 满额会话手册」构造最坏情况，硬层合计不能顶破预算。
 *
 * 这条守住「tool-catalog 升硬层后，默认文案仍装得下」——以后改文案、加硬层、
 * 扩会话手册上限导致超预算，会在这里失败，而不是等到真机装配时抛「硬层超预算」。
 */
describe('硬层预算', () => {
  it('验收中最坏情况（满额会话手册）硬层合计不超过总预算', () => {
    const shared = DEFAULT_GLOBAL_OPERATION_DETAIL.shared_detail;
    const verifyingDetail = DEFAULT_GLOBAL_OPERATION_DETAIL.verifying.operation_detail;
    const hardRule = DEFAULT_HARD_RULES.verifying;
    const toolCatalog = renderCatalogText(FACTORY_TOOLS, 'verifying');
    // 满额会话手册：方案贴近 SESSION_MANUAL_BUDGET_BYTES=4600 字节，再加清单头。
    const plan = '甲'.repeat(1500);
    const sessionManual = `本会话手册（唯一真源）：/x/.workflow/会话手册-x.md\n\n方案：\n${plan}\n\n实施顺序：未勾 5 条 / 共 10 条（已勾 5 条不再重复注入）\n${Array.from({ length: 5 }, (_, i) => `${i + 1}. 第 ${i + 1} 层`).join('\n')}`;
    const hardNames = new Set(['header', 'hard-rules', 'shared-detail', 'state-detail', 'tool-catalog', 'session-manual']);
    const layers = [
      { name: 'header', text: '节点：X　workflow：Y\n当前状态：验收中\n（阶段边界：只有「讨论中」会拦写操作；「验收中」「已完结」不拦写文件。改代码仍按阶段规则走，工具会返回该阶段的完整规则。）' },
      { name: 'hard-rules', text: `【本阶段硬规则】\n${hardRule}` },
      { name: 'shared-detail', text: shared },
      { name: 'state-detail', text: verifyingDetail },
      { name: 'tool-catalog', text: toolCatalog },
      { name: 'session-manual', text: sessionManual },
    ];
    const hardBytes = layers
      .filter((layer) => hardNames.has(layer.name))
      .reduce((sum, layer) => sum + Buffer.byteLength(layer.text, 'utf8'), 0);
    expect(hardBytes).toBeLessThanOrEqual(TOTAL_BUDGET_BYTES);
    expect(() => assemblePromptLayers(layers, TOTAL_BUDGET_BYTES)).not.toThrow();
  });
});
