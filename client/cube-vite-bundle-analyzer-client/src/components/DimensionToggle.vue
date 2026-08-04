<script setup lang="ts">
import type { Dimension } from '../types';

defineProps<{ modelValue: Dimension }>();
const emit = defineEmits<{ 'update:modelValue': [value: Dimension] }>();

const options: { value: Dimension; label: string }[] = [
    { value: 'parsedSize', label: '原始' },
    { value: 'gzipSize', label: 'gzip' },
    { value: 'brotliSize', label: 'brotli' },
];

function select(value: Dimension) {
    emit('update:modelValue', value);
}
</script>

<template>
    <div class="toggle" role="group" aria-label="统计维度">
        <button
            v-for="option in options"
            :key="option.value"
            type="button"
            :class="{ active: modelValue === option.value }"
            @click="select(option.value)"
        >
            {{ option.label }}
        </button>
    </div>
</template>

<style scoped>
.toggle {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
    background: #ffffff;
}
button {
    height: 32px;
    padding: 0 12px;
    border: none;
    border-right: 1px solid var(--border);
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    cursor: pointer;
}
button:last-child {
    border-right: none;
}
button.active {
    background: var(--accent-soft);
    color: var(--accent);
    font-weight: 700;
}
</style>
