import { describe, expect, it } from 'vitest';
import { Trie } from '../src/trie.ts';

function buildTree(trie: Trie<{ size: number }>) {
    trie.mergePrefixSingleDirectory();
    trie.walk(trie.root, {
        enter: (child, parent) => {
            if (parent) {
                parent.groups.push(child);
            }
        },
        leave: (child) => {
            if (child.groups?.length) {
                child.size = child.groups.reduce((sum, group) => sum + group.size, 0);
            }
        },
    });
    return trie.root.groups;
}

function collectLeaves(nodes: Array<{ groups?: unknown[]; size: number; filename: string }>) {
    const leaves: Array<{ size: number; filename: string }> = [];
    for (const node of nodes) {
        if (node.groups?.length) {
            leaves.push(...collectLeaves(node.groups as never));
        } else {
            leaves.push({ size: node.size, filename: node.filename });
        }
    }
    return leaves;
}

describe('Trie', () => {
    it('aggregates directory sizes during walk', () => {
        const trie = new Trie<{ size: number }>({ meta: { size: 0 } });
        trie.insert('src/utils.ts', { meta: { size: 10 } });
        trie.insert('src/api.ts', { meta: { size: 20 } });

        const rootGroups = buildTree(trie);

        expect(rootGroups).toHaveLength(1);
        expect(rootGroups[0].filename).toBe('src');
        expect(rootGroups[0].size).toBe(30);
        expect(collectLeaves(rootGroups).map((leaf) => leaf.size).sort()).toEqual([10, 20]);
    });

    it('merges single-child directory chains', () => {
        const trie = new Trie<{ size: number }>({ meta: { size: 0 } });
        trie.insert('src/main.ts', { meta: { size: 5 } });

        const leaves = collectLeaves(buildTree(trie));

        expect(leaves).toHaveLength(1);
        expect(leaves[0].filename).toBe('src/main.ts');
        expect(leaves[0].size).toBe(5);
    });
});
