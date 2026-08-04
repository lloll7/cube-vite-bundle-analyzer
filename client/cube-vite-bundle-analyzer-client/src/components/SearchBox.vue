<script setup lang="ts">
defineProps<{ modelValue: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();

function onInput(event: Event) {
    emit('update:modelValue', (event.target as HTMLInputElement).value);
}
</script>

<template>
    <input
        class="search-box"
        type="search"
        placeholder="搜索文件名"
        :value="modelValue"
        @input="onInput"
    />
</template>

<style scoped>
.search-box {
    width: 220px;
    height: 32px;
    padding: 0 10px;
    border: 1px solid var(--border);
    border-radius: 4px;
    background: #ffffff;
    color: var(--text);
    font-size: 13px;
    outline: none;
}
.search-box:focus {
    border-color: var(--accent);
    box-shadow: 0 0 0 2px var(--accent-soft);
}
</style>
