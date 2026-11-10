import { StateDetailEditor } from './node-state-editor';
import type { GlobalOperationDetail } from '../schema/workflow';

/** 全局操作细节设置面板：A（公共）+ B/C/D（三态），操作细节与默认输入各自独立输入框。 */
export function SettingsPanel(props: {
  value: GlobalOperationDetail;
  onChange: (value: GlobalOperationDetail) => void;
}) {
  const { value, onChange } = props;
  return (
    <div className="dsh-workflow-settings">
      <div className="settings-row">
        <label>公共操作细节（A）</label>
        <textarea value={value.shared_detail} onChange={(e) => onChange({ ...value, shared_detail: e.target.value })} />
      </div>
      <StateDetailEditor label="讨论中" value={value.discussing} onChange={(d) => onChange({ ...value, discussing: d })} />
      <StateDetailEditor label="实现中" value={value.implementing} onChange={(d) => onChange({ ...value, implementing: d })} />
      <StateDetailEditor label="验收中" value={value.verifying} onChange={(d) => onChange({ ...value, verifying: d })} />
    </div>
  );
}
