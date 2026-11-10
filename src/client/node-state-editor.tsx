import { useState } from 'react';
import type { StateDetail } from '../schema/node-state';

/**
 * 状态操作细节编辑器：每个状态拆成「操作细节」与「进入后默认输入」两个独立输入框。
 * - 输入框一（textarea）：操作细节
 * - 输入框二（input）：进入该状态后自动触发的默认输入（可空）
 */
export function StateDetailEditor(props: {
  label: string;
  value: StateDetail;
  onChange: (value: StateDetail) => void;
}) {
  const [detail, setDetail] = useState(props.value.operation_detail);
  const [trigger, setTrigger] = useState(props.value.enter_trigger ?? '');

  const commit = () => {
    props.onChange({
      operation_detail: detail,
      enter_trigger: trigger.trim() === '' ? null : trigger.trim(),
    });
  };

  return (
    <div className="dsh-workflow-state-detail-editor">
      <div className="editor-row">
        <label className="editor-label">{props.label} · 操作细节</label>
        <textarea
          value={detail}
          placeholder="该状态要做什么"
          onChange={(e) => setDetail(e.target.value)}
          onBlur={commit}
        />
      </div>
      <div className="editor-row">
        <label className="editor-label">{props.label} · 进入后默认输入</label>
        <input
          value={trigger}
          placeholder="可空，留空则不自动触发"
          onChange={(e) => setTrigger(e.target.value)}
          onBlur={commit}
        />
      </div>
    </div>
  );
}
