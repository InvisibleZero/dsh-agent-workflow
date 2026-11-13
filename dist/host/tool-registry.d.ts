import { type ToolEntry } from '../schema/tool-catalog';
export interface RegistryListing {
    entries: ToolEntry[];
    corrupt: boolean;
}
export declare class ToolRegistryStore {
    private readonly toolsDir;
    /** 同一文件的读改写串行：并发 save 不会互相覆盖。 */
    private chain;
    constructor(toolsDir: string);
    private filePath;
    private serial;
    private readFile;
    list(): Promise<RegistryListing>;
    /** 只读快照：设置页「工具」页签要展示全局扩展工具；字段形状与 list 一致。 */
    snapshot(): Promise<RegistryListing>;
    /** 新增一条；同名已存在时抛错（并发下也不会出现两条同名）。 */
    save(entry: ToolEntry): Promise<ToolEntry[]>;
    /** 整条替换；找不到同名条目时抛错。 */
    update(entry: ToolEntry): Promise<ToolEntry[]>;
    private write;
}
//# sourceMappingURL=tool-registry.d.ts.map