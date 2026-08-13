<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { hierarchy, treemap, treemapResquarify } from 'd3-hierarchy';
import type { Dimension, SourceFile } from '../types';
import { formatSize } from '../utils';

const TOP_PADDING = 20;
const ORANGE_DEPTH_COLORS = ['#ffb37a', '#ff9a52', '#ff7d2e', '#f2661d'];

interface TreemapNode {
    name: string;
    path: string;
    children: TreemapNode[];
    item: SourceFile | null;
    parsedSize: number;
    gzipSize: number;
    brotliSize: number;
}

interface Box {
    node: TreemapNode;
    x: number;
    y: number;
    width: number;
    height: number;
}

const props = defineProps<{ items: SourceFile[]; dimension: Dimension }>();
const emit = defineEmits<{ select: [item: SourceFile] }>();

const viewRef = ref<HTMLElement | null>(null);
const boxes = ref<Box[]>([]);
const hovered = ref<TreemapNode | null>(null);
const selectedPath = ref('');
const tree = ref<TreemapNode>(createNode('', ''));
const viewWidth = ref(0);
const viewHeight = ref(0);
let observer: ResizeObserver | null = null;
let lastWidth = 0;
let lastHeight = 0;

function createNode(name: string, path: string): TreemapNode {
    return {
        name,
        path,
        children: [],
        item: null,
        parsedSize: 0,
        gzipSize: 0,
        brotliSize: 0,
    };
}

function aggregateSizes(node: TreemapNode) {
    if (node.item) {
        node.parsedSize = node.item.parsedSize;
        node.gzipSize = node.item.gzipSize;
        node.brotliSize = node.item.brotliSize;
    } else {
        node.parsedSize = 0;
        node.gzipSize = 0;
        node.brotliSize = 0;
    }

    for (const child of node.children) {
        aggregateSizes(child);
        node.parsedSize += child.parsedSize;
        node.gzipSize += child.gzipSize;
        node.brotliSize += child.brotliSize;
    }
}

function buildTree(items: SourceFile[]): TreemapNode {
    const root = createNode('', '');

    for (const item of items) {
        const segments = item.path.replace(/\\/g, '/').split('/').filter(Boolean);
        let node = root;
        let currentPath = '';

        for (const segment of segments) {
            currentPath = currentPath ? `${currentPath}/${segment}` : segment;
            let child = node.children.find((candidate) => candidate.name === segment);
            if (!child) {
                child = createNode(segment, currentPath);
                node.children.push(child);
            }
            node = child;
        }

        node.item = item;
    }

    aggregateSizes(root);
    return root;
}

function findNode(node: TreemapNode, path: string): TreemapNode | null {
    if (node.path === path) return node;
    for (const child of node.children) {
        const found = findNode(child, path);
        if (found) return found;
    }
    return null;
}

function getScopeNode(): TreemapNode {
    if (!selectedPath.value) return tree.value;
    const found = findNode(tree.value, selectedPath.value);
    return found?.children.length ? found : tree.value;
}

function getParentPath(path: string): string {
    const normalized = path.replace(/\\/g, '/');
    const index = normalized.lastIndexOf('/');
    return index <= 0 ? '' : normalized.slice(0, index);
}

const breadcrumbs = computed(() => {
    const parts = selectedPath.value.split('/').filter(Boolean);
    const result = [{ name: '全部', path: '' }];
    let path = '';

    for (const part of parts) {
        path = path ? `${path}/${part}` : part;
        result.push({ name: part, path });
    }

    return result;
});

const hasParent = computed(() => Boolean(selectedPath.value));

function handleNodeClick(node: TreemapNode) {
    if (node.children.length) {
        selectedPath.value =
            selectedPath.value === node.path ? getParentPath(node.path) : node.path;
        return;
    }

    if (node.item) {
        emit('select', node.item);
    }
}

function goBack() {
    selectedPath.value = getParentPath(selectedPath.value);
}

function nodeColor(node: TreemapNode): string {
    const depth = node.path.split('/').filter(Boolean).length - 1;
    return ORANGE_DEPTH_COLORS[Math.min(Math.max(depth, 0), ORANGE_DEPTH_COLORS.length - 1)];
}

function textFontSize(box: Box, isSize = false): number {
    const widthBudget = Math.max(0, box.width - 10);
    const heightBudget = Math.max(0, box.height - (isSize ? 12 : 8));
    const maxSize = isSize ? 11 : 12;
    const sizeByWidth = Math.floor(widthBudget / 8);
    const sizeByHeight = Math.floor(heightBudget / (isSize ? 2.4 : 2));
    return Math.max(7, Math.min(maxSize, sizeByWidth, sizeByHeight));
}

function measure() {
    const el = viewRef.value;
    if (!el) return;
    const width = Math.max(320, el.clientWidth);
    const height = Math.max(280, el.clientHeight);
    if (width === lastWidth && height === lastHeight) {
        return false;
    }
    lastWidth = width;
    lastHeight = height;
    viewWidth.value = width;
    viewHeight.value = height;
    return true;
}

function draw() {
    if (!measure() && boxes.value.length) {
        return;
    }

    tree.value = buildTree(props.items);
    if (selectedPath.value && !findNode(tree.value, selectedPath.value)) {
        selectedPath.value = '';
    }
    if (!props.items.length || !viewWidth.value || !viewHeight.value) {
        boxes.value = [];
        return;
    }

    const scope = getScopeNode();
    const data = { children: scope.children };
    const root = hierarchy(data as unknown as TreemapNode, (d) =>
        d.children.length ? d.children : null
    );
    root.eachAfter((node) => {
        if (node.children?.length) {
            node.value = node.children.reduce((sum, child) => sum + (child.value ?? 0), 0);
        } else {
            node.value = Math.sqrt(Math.max(0, node.data[props.dimension] ?? 0));
        }
    });

    const layout = treemap<TreemapNode>()
        .size([viewWidth.value, viewHeight.value])
        .tile(treemapResquarify)
        .paddingOuter(3)
        .paddingTop(TOP_PADDING)
        .paddingInner(2)
        .round(true);
    const rectRoot = layout(root);

    boxes.value = rectRoot
        .descendants()
        .filter((node) => node.depth > 0)
        .map((node) => ({
            node: node.data,
            x: node.x0,
            y: node.y0,
            width: Math.max(0, node.x1 - node.x0),
            height: Math.max(0, node.y1 - node.y0),
        }));
}

onMounted(() => {
    observer = new ResizeObserver(() => draw());
    if (viewRef.value) observer.observe(viewRef.value);
    draw();
});

onUnmounted(() => observer?.disconnect());

watch([() => props.items, () => props.dimension, selectedPath], () => {
    lastWidth = 0;
    lastHeight = 0;
    draw();
});
</script>

<template>
    <div class="treemap">
        <div v-if="hasParent" class="tree-nav">
            <button
                v-for="crumb in breadcrumbs"
                :key="crumb.path"
                type="button"
                class="nav-btn"
                :class="{ active: crumb.path === selectedPath }"
                @click="selectedPath = crumb.path"
            >
                {{ crumb.name }}
            </button>
            <span class="nav-sep">/</span>
            <button type="button" class="nav-btn back-btn" @click="goBack">返回上级</button>
        </div>

        <div ref="viewRef" class="tree-body">
            <svg
                :viewBox="`0 0 ${viewWidth} ${viewHeight}`"
                width="100%"
                height="100%"
                role="img"
                aria-label="源文件体积树图"
            >
                <defs>
                    <clipPath
                        v-for="(box, index) in boxes"
                        :key="`clip-${box.node.path}-${index}`"
                        :id="`cell-clip-${index}`"
                    >
                        <rect
                            :x="box.x + 2"
                            :y="box.y + 2"
                            :width="Math.max(0, box.width - 4)"
                            :height="Math.max(0, box.height - 4)"
                        />
                    </clipPath>
                </defs>
                <g v-for="(box, index) in boxes" :key="`${box.node.path}-${index}`">
                    <title>{{ box.node.path }} - {{ formatSize(box.node[dimension]) }}</title>
                    <rect
                        :x="box.x"
                        :y="box.y"
                        :width="box.width"
                        :height="box.height"
                        :fill="nodeColor(box.node)"
                        :opacity="hovered === box.node ? 1 : 0.82"
                        @mousemove="hovered = box.node"
                        @mouseleave="hovered = null"
                        @click="handleNodeClick(box.node)"
                    />
                    <text
                        v-if="box.node.children.length && box.width > 30 && box.height > 14"
                        class="cell-label dir-label"
                        :x="box.x + 6"
                        :y="box.y + 13"
                        :font-size="textFontSize(box)"
                        :clip-path="`url(#cell-clip-${index})`"
                    >
                        {{ box.node.name }}
                    </text>
                    <text
                        v-else-if="!box.node.children.length && box.width > 46 && box.height > 18"
                        class="cell-label"
                        :x="box.x + 6"
                        :y="box.y + 14"
                        :font-size="textFontSize(box)"
                        :clip-path="`url(#cell-clip-${index})`"
                    >
                        {{ box.node.name }}
                    </text>
                    <text
                        v-if="!box.node.children.length && box.width > 80 && box.height > 36"
                        class="cell-size"
                        :x="box.x + 6"
                        :y="box.y + 30"
                        :font-size="textFontSize(box, true)"
                        :clip-path="`url(#cell-clip-${index})`"
                    >
                        {{ formatSize(box.node[dimension]) }}
                    </text>
                </g>
            </svg>

            <div v-if="hovered" class="hover-strip">
                <span class="hover-name">{{ hovered.path }}</span>
                <span class="hover-size">{{ formatSize(hovered[dimension]) }}</span>
            </div>
            <div v-if="!boxes.length" class="empty-state">当前筛选条件下没有可展示的源文件</div>
        </div>
    </div>
</template>

<style scoped>
.treemap {
    position: relative;
    display: flex;
    flex-direction: column;
    width: 100%;
    height: 100%;
    min-height: 280px;
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
}
.tree-nav {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 8px 10px;
    border-bottom: 1px solid var(--border);
    background: #f8fafc;
    overflow-x: auto;
    flex-shrink: 0;
}
.nav-btn {
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
.nav-btn:hover,
.nav-btn.active {
    border-color: var(--accent);
    color: var(--accent);
}
.nav-sep {
    color: var(--muted);
    font-size: 11px;
}
.tree-body {
    position: relative;
    flex: 1;
    min-height: 0;
}
svg {
    display: block;
    width: 100%;
    height: 100%;
}
rect {
    cursor: pointer;
    transition: opacity 0.12s ease;
}
.cell-label {
    fill: #ffffff;
    font-size: 11px;
    font-weight: 600;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
    stroke: rgba(15, 23, 42, 0.35);
    stroke-width: 3px;
    paint-order: stroke;
}
.dir-label {
    fill: #e2e8f0;
    font-size: 11px;
    font-weight: 700;
}
.cell-size {
    fill: rgba(255, 255, 255, 0.92);
    font-size: 10px;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.hover-strip {
    position: absolute;
    left: 12px;
    right: 12px;
    bottom: 12px;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 8px 12px;
    background: rgba(15, 23, 42, 0.86);
    color: #ffffff;
    border-radius: 4px;
    font-size: 12px;
    pointer-events: none;
}
.hover-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.hover-size {
    flex-shrink: 0;
    font-weight: 600;
}
.empty-state {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--muted);
    font-size: 13px;
}
</style>
