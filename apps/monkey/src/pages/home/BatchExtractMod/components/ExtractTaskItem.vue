<template>
  <div class="border-base-300 bg-base-200/30 flex items-center gap-2 rounded-lg border px-2 py-1.5">
    <input
      type="checkbox"
      class="checkbox checkbox-sm"
      :checked="checked"
      @change="emit('toggle')"
    >
    <iconify-icon icon="material-symbols:folder-zip-outline" width="18" height="18" noobserver />
    <div class="flex min-w-0 flex-1 flex-col">
      <span class="truncate text-sm" :title="task.file.title">{{ task.file.title }}</span>
      <span class="text-base-content/50 text-xs">{{ formatSize(Number(task.file.fileSize)) }}</span>
    </div>
    <div class="flex shrink-0 items-center gap-1.5">
      <!-- 状态显示 -->
      <template v-if="task.extractStatus !== 'idle'">
        <span v-if="task.extractStatus === 'extracting'" class="text-base-content/50 flex items-center gap-1 text-xs">
          <span class="loading loading-spinner loading-xs" />
          <span>解压中</span>
        </span>
        <span v-else-if="task.extractStatus === 'extract_done'" class="badge badge-success badge-sm">解压完成</span>
        <span v-else-if="task.extractStatus === 'extract_error'" class="badge badge-error badge-sm" :title="task.errorMessage">
          解压失败
        </span>
      </template>
      <template v-else>
        <span v-if="task.pushStatus === 'pending'" class="badge badge-ghost badge-sm">等待中</span>
        <span v-else-if="task.pushStatus === 'pushing'" class="text-base-content/50 flex items-center gap-1 text-xs">
          <span class="loading loading-spinner loading-xs" />
          <span>推送中</span>
        </span>
        <span v-else-if="task.pushStatus === 'push_done'" class="badge badge-success badge-sm">推送完成</span>
        <span v-else-if="task.pushStatus === 'need_password'" class="badge badge-warning badge-sm">需要密码</span>
        <span v-else-if="task.pushStatus === 'push_error'" class="badge badge-error badge-sm" :title="task.errorMessage">
          推送失败
        </span>
      </template>

      <!-- 操作按钮 -->
      <button
        v-if="task.pushStatus === 'pushing'"
        class="btn btn-ghost btn-xs"
        title="取消"
        @click="emit('cancel')"
      >
        <iconify-icon icon="material-symbols:close-rounded" width="16" height="16" noobserver />
      </button>
      <button
        v-if="task.pushStatus === 'push_error' || task.extractStatus === 'extract_error'"
        class="btn btn-ghost btn-xs"
        title="重试"
        @click="emit('retry')"
      >
        <iconify-icon icon="material-symbols:refresh-rounded" width="16" height="16" noobserver />
      </button>
    </div>
  </div>
  <!-- 需要密码：输入框 -->
  <div v-if="task.pushStatus === 'need_password'" class="flex items-center gap-2 pl-8">
    <input
      v-model="retryPassword"
      type="text"
      class="input input-sm flex-1"
      placeholder="输入密码"
      @keydown.enter="handleRetryWithPassword"
    >
    <button
      class="btn btn-sm btn-primary"
      :disabled="!retryPassword.trim()"
      @click="handleRetryWithPassword"
    >
      重试
    </button>
  </div>
  <!-- 错误信息 -->
  <div
    v-if="(task.pushStatus === 'push_error' || task.extractStatus === 'extract_error') && task.errorMessage"
    class="text-error pl-8 text-xs"
  >
    {{ task.errorMessage }}
  </div>
</template>

<script setup lang="ts">
import type { ExtractTask } from '../types'
import { ref } from 'vue'
import 'iconify-icon'

defineProps<{
  task: ExtractTask
  checked: boolean
}>()

const emit = defineEmits<{
  toggle: []
  cancel: []
  retry: []
  retryWithPassword: [password: string]
}>()

const retryPassword = ref('')

function handleRetryWithPassword() {
  const pwd = retryPassword.value.trim()
  if (!pwd)
    return
  emit('retryWithPassword', pwd)
  retryPassword.value = ''
}

function formatSize(bytes: number): string {
  if (bytes === 0)
    return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  return `${(bytes / 1024 ** i).toFixed(1)} ${units[i]}`
}
</script>
