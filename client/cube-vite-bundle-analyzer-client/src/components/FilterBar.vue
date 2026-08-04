<script setup lang="ts">
import type { Category } from '../types';
import { CATEGORIES, CATEGORY_COLORS } from '../utils';

defineProps<{ enabled: Set<Category> }>();
const emit = defineEmits<{ toggle: [category: Category] }>();

function toggle(category: Category) {
    emit('toggle', category);
}
</script>

<template>
    <div class="filter-bar" role="group" aria-label="资源类型筛选">
        <label v-for="category in CATEGORIES" :key="category" class="filter-item">
            <input
                type="checkbox"
                :checked="enabled.has(category)"
                @change="toggle(category)"
            />
            <span class="dot" :style="{ background: CATEGORY_COLORS[category] }"></span>
            {{ category }}
        </label>
    </div>
</template>

<style scoped>
.filter-bar {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    padding: 8px 0;
}
.filter-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    white-space: nowrap;
}
.filter-item input {
    accent-color: var(--accent);
    margin: 0;
}
.dot {
    width: 8px;
    height: 8px;
    border-radius: 2px;
    flex-shrink: 0;
}
</style>
