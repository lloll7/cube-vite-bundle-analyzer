<script setup lang="ts">
import { onMounted } from 'vue';
import { useStats, type SourceMatch } from './composables/useStats';
import type { Category, SourceFile } from './types';
import Treemap from './components/Treemap.vue';
import SummaryTable from './components/SummaryTable.vue';
import FilterBar from './components/FilterBar.vue';
import SearchBox from './components/SearchBox.vue';
import DimensionToggle from './components/DimensionToggle.vue';
import DetailPanel from './components/DetailPanel.vue';
import FileList from './components/FileList.vue';

const {
    modules,
    loading,
    error,
    selected,
    dimension,
    searchQuery,
    showEntryOnly,
    enabledCategories,
    selectedSourcePath,
    load,
    filteredSourceFiles,
    sourceMatches,
} = useStats();

onMounted(load);

function toggleCategory(category: Category) {
    const next = new Set(enabledCategories.value);
    if (next.has(category)) {
        next.delete(category);
    } else {
        next.add(category);
    }
    enabledCategories.value = next;
}

function selectSource(match: SourceMatch) {
    selected.value = match.chunk;
    selectedSourcePath.value = match.path;
}

function selectSourceFile(source: SourceFile) {
    selected.value = source.chunk;
    selectedSourcePath.value = source.path;
}

function selectSourcePath(path: string) {
    selectedSourcePath.value = path;
}

function backToSourcePath(path: string) {
    selectedSourcePath.value = path;
}
</script>

<template>
    <div class="app">
        <header class="app-header">
            <div class="title-block">
                <h1>Bundle 分析报告</h1>
                <span class="subtitle">{{ modules.length }} 个产物</span>
            </div>
            <div class="toolbar">
                <SearchBox v-model="searchQuery" />
                <DimensionToggle v-model="dimension" />
                <label class="entry-only">
                    <input type="checkbox" v-model="showEntryOnly" />
                    仅入口
                </label>
            </div>
            <FilterBar :enabled="enabledCategories" @toggle="toggleCategory" />
        </header>

        <div v-if="loading" class="state">正在加载数据...</div>
        <div v-else-if="error" class="state error">数据加载失败：{{ error }}</div>
        <div v-else-if="!modules.length" class="state">没有可分析的产物数据</div>

        <div v-else class="content">
            <SummaryTable :modules="modules" :dimension="dimension" />

            <div class="workspace">
                <section class="treemap-panel">
                    <div class="panel-head">
                        <span class="panel-title">源文件体积树图</span>
                        <span class="panel-hint">{{ filteredSourceFiles.length }} 个源文件</span>
                    </div>
                    <Treemap
                        :items="filteredSourceFiles"
                        :dimension="dimension"
                        @select="selectSourceFile"
                    />
                </section>
                <DetailPanel
                    :module="selected"
                    :dimension="dimension"
                    :highlight="selectedSourcePath"
                    @select-source="selectSourcePath"
                    @back-to="backToSourcePath"
                />
            </div>

            <FileList
                :items="filteredSourceFiles"
                :dimension="dimension"
                :selected="selected"
                :source-matches="sourceMatches"
                :search-query="searchQuery"
                :selected-source-path="selectedSourcePath"
                @select-source-file="selectSourceFile"
                @select-source="selectSource"
            />
        </div>
    </div>
</template>

<style scoped>
.app {
    min-height: 100vh;
}
.app-header {
    background: #ffffff;
    border-bottom: 1px solid var(--border);
    padding: 16px 20px;
}
.title-block {
    display: flex;
    align-items: baseline;
    gap: 10px;
}
h1 {
    font-size: 20px;
    font-weight: 700;
    margin: 0;
    color: var(--text);
}
.subtitle {
    font-size: 12px;
    color: var(--muted);
}
.toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 12px;
    flex-wrap: wrap;
}
.entry-only {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text);
    cursor: pointer;
    height: 32px;
}
.entry-only input {
    accent-color: var(--accent);
}
.content {
    max-width: 1440px;
    margin: 0 auto;
    padding: 16px 20px 48px;
    display: flex;
    flex-direction: column;
    gap: 16px;
}
.state {
    padding: 60px 20px;
    text-align: center;
    color: var(--muted);
    font-size: 14px;
}
.state.error {
    color: #b91c1c;
}
.workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 16px;
    align-items: stretch;
}
.treemap-panel {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 560px;
    height: min(78vh, 860px);
}
.treemap-panel :deep(.treemap) {
    flex: 1;
    min-height: 0;
    height: 100%;
}
.panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 8px;
}
.panel-title {
    font-size: 13px;
    font-weight: 700;
    color: var(--text);
}
.panel-hint {
    font-size: 11px;
    color: var(--muted);
}

@media (max-width: 900px) {
    .workspace {
        grid-template-columns: 1fr;
        height: auto;
        min-height: 0;
    }
    .content {
        padding: 12px;
    }
    .toolbar {
        align-items: stretch;
    }
}
</style>
