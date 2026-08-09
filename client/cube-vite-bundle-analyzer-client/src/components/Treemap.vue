<script setup lang="ts">
import { onMounted, onUnmounted, ref, watch } from 'vue';
import { hierarchy, treemap, treemapSquarify } from 'd3-hierarchy';
import type { Dimension, SourceFile } from '../types';
import { CATEGORY_COLORS, categorizeFile, formatSize } from '../utils';

interface Box {
    item: SourceFile;
    x: number;
    y: number;
    width: number;
    height: number;
}

const props = defineProps<{ items: SourceFile[]; dimension: Dimension }>();
const emit = defineEmits<{ select: [item: SourceFile] }>();

const containerRef = ref<HTMLElement | null>(null);
const boxes = ref<Box[]>([]);
const hovered = ref<SourceFile | null>(null);
const viewWidth = ref(0);
const viewHeight = ref(0);
let observer: ResizeObserver | null = null;
let lastWidth = 0;
let lastHeight = 0;

function measure() {
    const el = containerRef.value;
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
    if (!props.items.length || !viewWidth.value || !viewHeight.value) {
        boxes.value = [];
        return;
    }

    const data = { children: props.items };
    const root = hierarchy(data as unknown as SourceFile, (d) => {
        return (d as unknown as { children?: SourceFile[] }).children ?? null;
    });
    root.sum((d) => (d.parsedSize === undefined ? 0 : d[props.dimension]));

    const layout = treemap<SourceFile>()
        .size([viewWidth.value, viewHeight.value])
        .tile(treemapSquarify)
        .paddingOuter(3)
        .paddingInner(2);
    const rectRoot = layout(root);

    boxes.value = rectRoot.leaves().map((node) => ({
        item: node.data,
        x: node.x0,
        y: node.y0,
        width: Math.max(0, node.x1 - node.x0),
        height: Math.max(0, node.y1 - node.y0),
    }));
}

function handleClick(item: SourceFile) {
    emit('select', item);
}

onMounted(() => {
    observer = new ResizeObserver(() => draw());
    if (containerRef.value) observer.observe(containerRef.value);
    draw();
});

onUnmounted(() => observer?.disconnect());

watch([() => props.items, () => props.dimension], () => {
    lastWidth = 0;
    lastHeight = 0;
    draw();
});
</script>

<template>
    <div ref="containerRef" class="treemap">
        <svg :viewBox="`0 0 ${viewWidth} ${viewHeight}`" width="100%" height="100%" role="img" aria-label="源文件体积树图">
            <g v-for="(box, index) in boxes" :key="`${box.item.path}-${index}`">
                <rect
                    :x="box.x"
                    :y="box.y"
                    :width="box.width"
                    :height="box.height"
                    :fill="CATEGORY_COLORS[categorizeFile(box.item.path)]"
                    :opacity="hovered === box.item ? 1 : 0.82"
                    @mousemove="hovered = box.item"
                    @mouseleave="hovered = null"
                    @click="handleClick(box.item)"
                />
                <text
                    v-if="box.width > 64 && box.height > 30"
                    :x="box.x + 8"
                    :y="box.y + 17"
                    class="cell-label"
                >
                    {{ box.item.path }}
                </text>
                <text
                    v-if="box.width > 120 && box.height > 52"
                    :x="box.x + 8"
                    :y="box.y + 35"
                    class="cell-size"
                >
                    {{ formatSize(box.item[dimension]) }}
                </text>
            </g>
        </svg>
        <div v-if="hovered" class="hover-strip">
            <span class="hover-name">{{ hovered.path }}</span>
            <span class="hover-size">{{ formatSize(hovered[dimension]) }}</span>
        </div>
        <div v-if="!boxes.length" class="empty-state">当前筛选条件下没有可展示的源文件</div>
    </div>
</template>

<style scoped>
.treemap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 280px;
    background: #ffffff;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow: hidden;
}
svg {
    display: block;
}
rect {
    cursor: pointer;
    transition: opacity 0.12s ease;
}
.cell-label {
    fill: #ffffff;
    font-size: 12px;
    font-weight: 600;
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35);
}
.cell-size {
    fill: rgba(255, 255, 255, 0.92);
    font-size: 11px;
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
