<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import type { Dimension, GroupWithNode, Module } from '../types';
import { formatSize } from '../utils';
import SourceTree from './SourceTree.vue';

const props = defineProps<{
    module: Module | null;
    dimension: Dimension;
    highlight?: string;
}>();

const emit = defineEmits<{
    backTo: [path: string];
    selectSource: [path: string];
}>();

/** imports 区折叠状态：默认收起，避免依赖列表过长时撑高面板产生大片留白 */
const importsOpen = ref(false);

// 切换选中模块时重置为收起，避免反复点击面板时一直处于展开状态
watch(
    () => props.module?.filename,
    () => {
        importsOpen.value = false;
    }
);

function findNode(nodes: GroupWithNode[], target: string): GroupWithNode | null {
    for (const node of nodes) {
        if (node.filename === target || node.label === target) return node;
        if (node.groups?.length) {
            const found = findNode(node.groups, target);
            if (found) return found;
        }
    }
    return null;
}

const activeSizes = computed(() => {
    const node =
        props.highlight && props.module
            ? findNode(props.module.source, props.highlight)
            : null;

    return {
        parsedSize: node?.parsedSize ?? props.module?.parsedSize ?? 0,
        gzipSize: node?.gzipSize ?? props.module?.gzipSize ?? 0,
        brotliSize: node?.brotliSize ?? props.module?.brotliSize ?? 0,
        mapSize: props.module?.mapSize ?? 0,
    };
});

const activeSize = computed(() => activeSizes.value[props.dimension]);

function handleBack() {
    const path = props.highlight ?? '';
    const normalized = path.replace(/\\/g, '/');
    const parentIndex = normalized.lastIndexOf('/');
    emit('backTo', parentIndex <= 0 ? '' : normalized.slice(0, parentIndex));
}
</script>

<template>
    <aside class="detail-panel">
        <div v-if="!module" class="detail-empty">点击树图或列表查看模块详情</div>
        <template v-else>
            <div class="detail-head">
                <div class="detail-name">{{ highlight || module.label }}</div>
                <div class="detail-badges">
                    <button v-if="highlight" type="button" class="back-button" @click="handleBack">返回上级</button>
                    <span v-if="highlight" class="badge source">SOURCE</span>
                    <span v-if="module.isEntry" class="badge entry">ENTRY</span>
                    <span v-if="module.isAsset" class="badge asset">ASSET</span>
                    <span v-else class="badge chunk">CHUNK</span>
                </div>
            </div>
            <div class="detail-path">{{ highlight ? `来自 ${module.filename}` : module.filename }}</div>
            <div class="size-grid">
                <div class="size-cell">
                    <span class="size-label">parsed</span>
                    <span class="size-value">{{ formatSize(activeSizes.parsedSize) }}</span>
                </div>
                <div class="size-cell">
                    <span class="size-label">gzip</span>
                    <span class="size-value">{{ formatSize(activeSizes.gzipSize) }}</span>
                </div>
                <div class="size-cell">
                    <span class="size-label">brotli</span>
                    <span class="size-value">{{ formatSize(activeSizes.brotliSize) }}</span>
                </div>
                <div class="size-cell">
                    <span class="size-label">map</span>
                    <span class="size-value">{{ formatSize(activeSizes.mapSize) }}</span>
                </div>
            </div>
            <div class="active-size">当前维度：{{ formatSize(activeSize) }}</div>

            <section class="detail-section">
                <button
                    type="button"
                    class="section-title collapsible"
                    :aria-expanded="importsOpen"
                    @click="importsOpen = !importsOpen"
                >
                    <span class="collapse-icon" :class="{ open: importsOpen }">▸</span>
                    <span>imports ({{ module.imports.length }})</span>
                    <span v-if="!importsOpen && module.imports.length" class="collapse-hint">
                        展开查看 {{ module.imports.length }} 条
                    </span>
                </button>
                <div v-if="importsOpen && module.imports.length" class="import-list import-scroll">
                    <div v-for="imp in module.imports" :key="imp" class="import-item">{{ imp }}</div>
                </div>
                <div v-if="importsOpen && !module.imports.length" class="section-empty">无直接依赖</div>
            </section>

            <section class="detail-section source-section">
                <div class="section-title">source 子模块 ({{ module.source.length }})</div>
                <div v-if="module.source.length" class="source-scroll">
                    <SourceTree
                        :nodes="module.source"
                        :dimension="dimension"
                        :highlight="highlight"
                        @select="emit('selectSource', $event)"
                    />
                </div>
                <div v-else class="section-empty">无 source 子模块</div>
            </section>
        </template>
    </aside>
</template>

<style scoped>
.detail-panel {
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 14px 16px;
    min-height: 320px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow: hidden;
}
.detail-empty {
    color: var(--muted);
    font-size: 13px;
    text-align: center;
    margin: auto;
}
.detail-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 10px;
}
.detail-name {
    font-size: 14px;
    font-weight: 700;
    color: var(--text);
    word-break: break-all;
}
.detail-badges {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
    flex-shrink: 0;
}
.badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 999px;
}
.back-button {
    border: 1px solid var(--border);
    border-radius: 4px;
    background: #ffffff;
    color: var(--text);
    font-size: 11px;
    font-weight: 600;
    padding: 3px 8px;
    cursor: pointer;
    white-space: nowrap;
}
.back-button:hover {
    border-color: var(--accent);
    color: var(--accent);
}
.badge.entry {
    color: #1d4ed8;
    background: #dbeafe;
}
.badge.asset {
    color: #b45309;
    background: #fef3c7;
}
.badge.chunk {
    color: #047857;
    background: #d1fae5;
}
.badge.source {
    color: #7c3aed;
    background: #ede9fe;
}
.detail-path {
    font-size: 12px;
    color: var(--muted);
    word-break: break-all;
}
.size-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
}
.size-cell {
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.size-label {
    font-size: 10px;
    color: var(--muted);
    text-transform: uppercase;
}
.size-value {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
}
.active-size {
    font-size: 12px;
    color: var(--accent);
    font-weight: 600;
}
.detail-section {
    border-top: 1px solid var(--border);
    padding-top: 10px;
    min-height: 0;
}
.section-title {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
    margin-bottom: 8px;
}
/* 可折叠标题：整行可点击，hover 高亮 */
.section-title.collapsible {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    margin-bottom: 0;
    color: var(--text);
}
.section-title.collapsible:hover {
    color: var(--accent);
}
.collapse-icon {
    display: inline-block;
    font-size: 10px;
    transition: transform 0.15s ease;
    color: var(--muted);
}
.collapse-icon.open {
    transform: rotate(90deg);
}
.collapse-hint {
    margin-left: auto;
    font-size: 11px;
    font-weight: 500;
    color: var(--muted);
}
.section-empty {
    font-size: 12px;
    color: var(--muted);
    padding-top: 8px;
}
.import-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
}
/* 展开后的 imports 限高滚动：避免依赖过多时撑高面板 */
.import-scroll {
    margin-top: 8px;
    max-height: 180px;
    overflow-y: auto;
    border: 1px solid var(--border-soft);
    border-radius: 4px;
    padding: 6px;
}
.import-item {
    font-size: 12px;
    color: var(--muted);
    word-break: break-all;
    padding: 4px 6px;
    background: #f8fafc;
    border-radius: 4px;
}
.source-section {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-height: 120px;
}
.source-scroll {
    flex: 1;
    overflow: auto;
    border: 1px solid var(--border-soft);
    border-radius: 4px;
    max-height: 340px;
}
</style>
