/**
 * 会话手册「方案」五小节的只读解析：设置页「附表」按打开那一刻的模板现算。
 *
 * 清单不在客户端写死——模板（host 的 SESSION_MANUAL_TEMPLATE）是唯一真源，
 * 这里只做「一段 markdown → 五个小节」的纯变换：不读盘、不碰 DOM、不抛错。
 */

/** 一处方案小节：序号、标题、模板注释里的提示。只有本模块用，不导出。 */
interface PlanSection {
  id: number;
  title: string;
  /** 模板里该节 `<!-- -->` 注释的正文；该节没写注释就是空串。 */
  hint: string;
}

const SECTION_HEADING = /^###\s+(\d+)\.\s*(.+?)\s*$/;
const HINT_BLOCK = /<!--([\s\S]*?)-->/;

/**
 * 解析模板里的 `### N. 标题` 与紧随的 `<!-- 提示 -->`。
 *
 * 凑不齐 1..5 五节就返回空数组：调用方（路由）据此回退成整段模板原文，
 * 不能因为标题写法被改了就显示成「五项是空的」。
 */
export function plan_sections_from_template(template: string): PlanSection[] {
  const lines = template.split(/\r?\n/);
  const sections: PlanSection[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const heading = SECTION_HEADING.exec(lines[index] ?? '');
    if (heading === null) continue;
    const id = Number(heading[1]);
    const title = heading[2] ?? '';
    let hint = '';
    // 只看到下一个 `###` 为止：别把别节的注释算进这一节。
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      const line = lines[scan] ?? '';
      if (SECTION_HEADING.test(line)) break;
      const hintBlock = HINT_BLOCK.exec(line);
      if (hintBlock !== null) {
        hint = (hintBlock[1] ?? '').trim();
        break;
      }
      // 标题下面先出现正文（不是注释）：这节没有提示，不再往下找。
      if (line.trim() !== '') break;
    }
    sections.push({ id, title, hint });
  }
  const complete = sections.length === 5 && sections.every((section, index) => section.id === index + 1);
  return complete ? sections : [];
}
