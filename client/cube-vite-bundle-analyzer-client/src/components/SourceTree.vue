<script setup lang="ts">
import type { Dimension, GroupWithNode } from '../types';
import { formatSize } from '../utils';

defineOptions({ name: 'SourceTree' });

const props = defineProps<{
    nodes: GroupWithNode[];
    dimension: Dimension;
    highlight?: string;
}>();

function nodeSize(node: GroupWithNode, dimension: Dimension): number {
    return (node[dimension] as number | undefined) ?? 0;
}

function isNodeActive(node: GroupWithNode): boolean {
    return Boolean(props.highlight && node.filename === props.highlight);
}

function shouldOpen(node: GroupWithNode): boolean {
    const highlight = props.highlight;
    const filename = node.filename ?? '';
    if (!highlight || !filename) return false;
    return (
        highlight === filename ||
        highlight.startsWith(filename + '/') ||
        highlight.startsWith(filename + '\\')
    );
}
</script>

<template>
    <div class="source-tree">
        <template v-for="(node, index) in nodes" :key="`${node.filename}-${index}`">
            <details
                v-if="node.groups?.length"
                class="tree-node"
                :open="shouldOpen(node)"
            >
                <summary :class="{ highlighted: isNodeActive(node) }">
                    <span class="tree-label">{{ node.label || node.filename }}</span>
                    <span class="tree-path">{{ node.filename }}</span>
                    <span class="tree-size">{{ formatSize(nodeSize(node, dimension)) }}</span>
                </summary>
                <SourceTree :nodes="node.groups" :dimension="dimension" :highlight="highlight" />
            </details>
            <div
                v-else
                class="tree-node tree-leaf"
                :class="{ highlighted: isNodeActive(node) }"
            >
                <span class="tree-label">{{ node.label || node.filename }}</span>
                <span class="tree-path">{{ node.filename }}</span>
                <span class="tree-size">{{ formatSize(nodeSize(node, dimension)) }}</span>
            </div>
        </template>
    </div>
</template>

<style scoped>
.source-tree {
    font-size: 12px;
}
.tree-node {
    border-bottom: 1px solid var(--border-soft);
}
.tree-node summary {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    cursor: pointer;
    list-style: none;
}
.tree-node summary::-webkit-details-marker {
    display: none;
}
.tree-node summary.highlighted,
.tree-leaf.highlighted {
    background: var(--accent-soft);
}
.tree-leaf {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px 6px 24px;
}
.tree-label {
    font-weight: 600;
    color: var(--text);
    min-width: 120px;
    max-width: 240px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.tree-path {
    flex: 1;
    min-width: 0;
    color: var(--muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.tree-size {
    flex-shrink: 0;
    color: var(--muted);
    text-align: right;
}
.source-tree .source-tree {
    margin-left: 12px;
    border-left: 1px solid var(--border-soft);
}
</style>
