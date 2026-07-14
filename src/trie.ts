export interface GroupWithNode {
    groups: Array<GroupWithNode>;
    children?: Map<string, Node>;
    filename: string;
    label: string;
    [prop: string]: any;
}

interface NodeDescriptor<T = Record<string, NonNullable<unknown>>> {
    meta: T;
    filename: string;
}

export class Node<T = NonNullable<unknown>> implements NodeDescriptor<T> {
    meta: T;
    filename: string;
    children: Map<string, Node<T>>;
    groups: Array<GroupWithNode>;
    /**
     * 表示当前节点是否是某个文件路径的结束节点（即该节点对应一个完整的文件，而不仅仅是某一路径前缀）。
     * 这样可以区分目录节点和真正的文件叶子节点。
     */
    isEndOfPath: boolean;
    constructor(options?: Partial<NodeDescriptor<T>>) {
        this.meta = options?.meta ?? ({} as T);
        this.filename = options?.filename ?? '';
        this.children = new Map();
        this.groups = [];
        this.isEndOfPath = false;
    }
}

export class Trie<T> {
    root: Node<T>;
    constructor(options?: Partial<NodeDescriptor<T>>) {
        this.root = new Node<T>(options);
    }
    /**
     * 插入一个文件路径到 Trie 中
     * @param filePath 文件路径
     * @param desc 文件描述
     */
    insert(filePath: string, desc: Partial<NodeDescriptor<T>>) {
        let current = this.root;
        // filter(Boolean) 的作用是快速过滤掉数组中的所有“假值”（falsy values）。
        const dirs = filePath.split('/').filter(Boolean);
        let path = '';
        for (const dir of dirs) {
            path = path ? `${path}/${dir}` : dir;
            if (!current.children.has(dir)) {
                current.children.set(dir, new Node({ ...desc }));
            }
            current = current.children.get(dir)!;
            current.filename = path;
        }
        current.isEndOfPath = true;
    }

    /**
     * 
     * @param node 当前节点
     * @description
     *      这段函数mergePrefixSingleDirectory用于优化 Trie（前缀树）结构，将“只有一个子节点的中间路径”合并成更短的路径，减少树的嵌套层级。具体逻辑如下：
            1. 遍历当前节点的所有子节点。如果某个子节点是路径的结尾节点（isEndOfPath为true），不再合并，直接跳出；
            2. 如果某子节点有多个子节点，说明该路径有分叉（并非单链），递归处理每个分叉子节点；
            3. 如果某子节点只有一个子节点，说明这两级可以合并：
                a. 去先删除旧的子节点，
                b. 再把其唯一的孩子（子子节点）合并到当前节点下，其路径名也级联拼接起来（${key}/${subKey}），形成更长的路径。
                c. 合并后递归检查新的子节点，继续做同样的合并，直到无法再合并为止。
                d. 这样能把如 a -> b -> c 合并成 a/b -> c，让 Trie 更紧凑，便于后续显示或处理。
     */
    mergePrefixSingleDirectory(node = this.root) {
        for (const [key, childNode] of node.children.entries()) {
            if (childNode.isEndOfPath) break;

            if (childNode.children.size > 1) {
                this.mergePrefixSingleDirectory(childNode);
                continue;
            }

            // 只有一个子节点 -> 合并路径名
            node.children.delete(key);
            for (const [subKey, subNode] of childNode.children.entries()) {
                node.children.set(`${key}/${subKey}`, subNode);
                if (!subNode.isEndOfPath) {
                    this.mergePrefixSingleDirectory(subNode);
                }
            }
        }
    }
}
