<template>
  <div
    v-if="extractTaskStore.managerOpen.value"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="extractTaskStore.closeManager()"
  >
    <div class="bg-base-100 flex max-h-[80vh] w-[640px] flex-col rounded-xl shadow-2xl">
      <!-- Header -->
      <div class="border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h3 class="m-0 text-base font-semibold">
          云解压任务管理
        </h3>
        <div class="flex items-center gap-1">
          <button
            v-if="counts.completed > 0"
            class="btn btn-ghost btn-sm"
            @click="extractTaskStore.clearCompleted()"
          >
            清除已完成
          </button>
          <button class="btn btn-ghost btn-sm btn-circle" @click="extractTaskStore.closeManager()">
            <iconify-icon icon="material-symbols:close-rounded" width="20" height="20" noobserver />
          </button>
        </div>
      </div>

      <!-- Toolbar -->
      <div class="border-base-300 flex flex-col gap-2 border-b px-4 py-2">
        <!-- 统计信息 -->
        <div class="text-base-content/60 flex items-center gap-2 text-xs">
          <span v-if="counts.processing > 0">{{ counts.processing }} 处理中</span>
          <span v-if="counts.processing > 0 && (counts.completed > 0 || counts.failed > 0 || counts.pending > 0)">·</span>
          <span v-if="counts.completed > 0">{{ counts.completed }} 已完成</span>
          <span v-if="counts.completed > 0 && (counts.failed > 0 || counts.pending > 0)">·</span>
          <span v-if="counts.failed > 0" class="text-error">{{ counts.failed }} 失败</span>
          <span v-if="counts.failed > 0 && counts.pending > 0">·</span>
          <span v-if="counts.pending > 0">{{ counts.pending }} 等待中</span>
          <span v-if="allTasks.length === 0" class="text-base-content/40">暂无任务</span>
        </div>
        <!-- 批量操作 -->
        <div v-if="allTasks.length > 0" class="flex items-center gap-2">
          <label class="flex cursor-pointer items-center gap-1 text-sm">
            <input
              type="checkbox"
              class="checkbox checkbox-sm"
              :checked="isAllSelected"
              :indeterminate="isIndeterminate"
              @change="toggleSelectAll"
            >
            全选
          </label>
          <div class="flex-1" />
          <button
            v-if="selectedRetryable.length > 0"
            class="btn btn-ghost btn-xs"
            @click="handleBatchRetry"
          >
            重试选中（{{ selectedRetryable.length }}）
          </button>
          <button
            v-if="selectedCancellable.length > 0"
            class="btn btn-ghost btn-xs"
            @click="handleBatchCancel"
          >
            取消选中（{{ selectedCancellable.length }}）
          </button>
          <button
            v-if="selectedSet.size > 0"
            class="btn btn-ghost btn-xs text-error"
            @click="handleBatchDelete"
          >
            删除选中（{{ selectedSet.size }}）
          </button>
        </div>
      </div>

      <!-- Task list -->
      <div class="flex flex-1 flex-col gap-1 overflow-y-auto p-4">
        <template v-if="allTasks.length > 0">
          <ExtractTaskItem
            v-for="task in allTasks"
            :key="task.file.pickCode"
            :task="task"
            :checked="selectedSet.has(task.file.pickCode)"
            @toggle="toggleSelect(task.file.pickCode)"
            @cancel="extractTaskStore.cancelTask(task.file.pickCode)"
            @retry="extractTaskStore.retryTask(task)"
            @retry-with-password="(pwd: string) => extractTaskStore.retryTask(task, pwd)"
          />
        </template>
        <div v-else class="text-base-content/40 flex items-center justify-center py-8 text-sm">
          没有云解压任务
        </div>
      </div>

      <!-- Footer -->
      <div class="border-base-300 flex shrink-0 flex-col gap-2 border-t px-4 py-3">
        <!-- 目录选择器（展开时显示） -->
        <FolderPicker
          v-if="showFolderPicker"
          :initial-cid="targetCid"
          @select="handleFolderSelect"
          @cancel="showFolderPicker = false"
        />
        <!-- 底部操作栏 -->
        <div class="flex items-center justify-between">
          <div class="flex items-center gap-2">
            <span class="text-base-content/60 text-sm">解压到:</span>
            <span class="text-sm">{{ targetFolderName }}</span>
            <button
              class="btn btn-ghost btn-xs"
              @click="showFolderPicker = !showFolderPicker"
            >
              {{ showFolderPicker ? '收起' : '更改' }}
            </button>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="extractableCount > 0"
              class="btn btn-primary btn-sm"
              :disabled="isExtracting"
              @click="handleBatchExtract"
            >
              <span v-if="isExtracting" class="loading loading-spinner loading-xs" />
              {{ isExtracting ? '解压中...' : `解压选中（${selectedExtractable.length > 0 ? selectedExtractable.length : extractableCount}）` }}
            </button>
            <button class="btn btn-ghost btn-sm" @click="extractTaskStore.closeManager()">
              关闭
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { extractTaskStore } from '../store/extractTaskStore'
import ExtractTaskItem from './ExtractTaskItem.vue'
import FolderPicker from './FolderPicker.vue'
import 'iconify-icon'

const targetCid = ref('0')
const targetFolderName = ref('根目录')
const isExtracting = ref(false)
const showFolderPicker = ref(false)
const selectedSet = ref<Set<string>>(new Set())

const allTasks = extractTaskStore.tasks
const counts = extractTaskStore.statusCounts

const isAllSelected = computed(() =>
  allTasks.value.length > 0 && selectedSet.value.size === allTasks.value.length,
)

const isIndeterminate = computed(() =>
  selectedSet.value.size > 0 && selectedSet.value.size < allTasks.value.length,
)

const selectedRetryable = computed(() =>
  allTasks.value.filter(t =>
    selectedSet.value.has(t.file.pickCode)
    && (t.pushStatus === 'push_error' || t.pushStatus === 'need_password' || t.extractStatus === 'extract_error'),
  ),
)

const selectedCancellable = computed(() =>
  allTasks.value.filter(t =>
    selectedSet.value.has(t.file.pickCode)
    && t.pushStatus === 'pushing',
  ),
)

const selectedExtractable = computed(() =>
  allTasks.value.filter(t =>
    selectedSet.value.has(t.file.pickCode)
    && t.pushStatus === 'push_done'
    && t.extractStatus === 'idle',
  ),
)

const extractableCount = computed(() =>
  allTasks.value.filter(t => t.pushStatus === 'push_done' && t.extractStatus === 'idle').length,
)

function handleFolderSelect(cid: string, name: string) {
  targetCid.value = cid
  targetFolderName.value = name
  showFolderPicker.value = false
}

function toggleSelect(pickCode: string) {
  if (selectedSet.value.has(pickCode)) {
    selectedSet.value.delete(pickCode)
  }
  else {
    selectedSet.value.add(pickCode)
  }
  selectedSet.value = new Set(selectedSet.value)
}

function toggleSelectAll() {
  if (isAllSelected.value) {
    selectedSet.value = new Set()
  }
  else {
    selectedSet.value = new Set(allTasks.value.map(t => t.file.pickCode))
  }
}

function handleBatchRetry() {
  for (const task of selectedRetryable.value) {
    extractTaskStore.retryTask(task)
  }
}

function handleBatchCancel() {
  for (const task of selectedCancellable.value) {
    extractTaskStore.cancelTask(task.file.pickCode)
  }
}

function handleBatchDelete() {
  const pickCodes = [...selectedSet.value]
  extractTaskStore.removeTasks(pickCodes)
  selectedSet.value = new Set()
}

async function handleBatchExtract() {
  isExtracting.value = true
  /** 优先解压选中的，没有选中则解压全部可解压的 */
  const toExtract = selectedExtractable.value.length > 0
    ? selectedExtractable.value
    : allTasks.value.filter(t => t.pushStatus === 'push_done' && t.extractStatus === 'idle')

  for (const task of toExtract) {
    task.targetCid = targetCid.value
    await extractTaskStore.extractFile(task)
  }
  isExtracting.value = false
}
</script>
