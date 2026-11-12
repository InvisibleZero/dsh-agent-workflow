import { type ToolAliasEntry } from '../schema/tool-catalog';
export interface AliasListing {
    aliases: ToolAliasEntry[];
    corrupt: boolean;
}
export declare class ToolAliasStore {
    private readonly baseDir;
    /** 同一文件的读改写串行：并发 apply 不会互相覆盖。 */
    private chain;
    constructor(baseDir: string);
    private filePath;
    private serial;
    private readFile;
    list(workflowId: string): Promise<AliasListing>;
    add(workflowId: string, entry: ToolAliasEntry): Promise<ToolAliasEntry[]>;
    snapshot(): Promise<{
        byWorkflow: Record<string, ToolAliasEntry[]>;
        corrupt: boolean;
    }>;
}
//# sourceMappingURL=tool-alias-store.d.ts.map