<template>
  <div
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
    @click.self="handleClose"
  >
    <div class="bg-base-100 flex max-h-[80vh] w-[640px] flex-col rounded-xl shadow-2xl">
      <!-- Header -->
      <div class="border-base-300 flex shrink-0 items-center justify-between border-b px-4 py-3">
        <h3 class="m-0 text-base font-semibold">
          批量云解压
        </h3>
        <button class="btn btn-ghost btn-sm btn-circle" @click="handleClose">
          <iconify-icon icon="material-symbols:close-rounded" width="20" height="20" noobserver />
        </button>
      </div>

      <!-- Content -->
      <div class="flex flex-1 flex-col gap-4 overflow-y-auto p-4">
        <!-- 去重提示 -->
        <div v-if="skippedCount > 0" class="text-warning flex items-center gap-1.5 text-sm">
          <iconify-icon icon="material-symbols:info-outline" width="18" height="18" noobserver />
          <span>{{ skippedCount }} 个文件已在任务队列中，已跳过</span>
        </div>

        <!-- 密码列表区域 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1.5 text-sm font-medium">
            <iconify-icon icon="material-symbols:password" width="18" height="18" noobserver />
            <span>解压密码（可选）</span>
          </div>
          <PasswordList v-model:passwords="passwords" />
        </div>

        <!-- 文件列表区域 -->
        <div class="flex flex-col gap-2">
          <div class="flex items-center gap-1.5 text-sm font-medium">
            <iconify-icon icon="material-symbols:folder-zip-outline" width="18" height="18" noobserver />
            <span>压缩文件（{{ sessionTasks.length }}个）</span>
            <span v-if="pushProgress" class="text-base-content/50 ml-auto text-xs font-normal">
              {{ pushProgress }}
            </span>
          </div>
          <div class="flex flex-col gap-1.5">
            <ExtractFileItem
              v-for="task in sessionTasks"
              :key="task.file.pickCode"
              :state="task"
              @retry="password => retryFile(task, password)"
            />
          </div>
        </div>

        <!-- 解压目标区域 -->
        <div v-if="showExtractSection" class="flex flex-col gap-2">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-1.5 text-sm font-medium">
              <iconify-icon icon="material-symbols:drive-file-move-outline" width="18" height="18" noobserver />
              <span>解压到</span>
              <span class="text-base-content/60 font-normal">{{ targetFolderName }}</span>
            </div>
            <button
              class="btn btn-ghost btn-xs"
              @click="showFolderPicker = !showFolderPicker"
            >
              {{ showFolderPicker ? '收起' : '更改目录' }}
            </button>
          </div>
          <FolderPicker
            v-if="showFolderPicker"
            :initial-cid="targetCid"
            @select="handleFolderSelect"
            @cancel="showFolderPicker = false"
          />
        </div>
      </div>

      <!-- Footer -->
      <div class="border-base-300 flex shrink-0 justify-end gap-2 border-t px-4 py-3">
        <button class="btn btn-ghost btn-sm" @click="handleClose">
          {{ isRunning ? '后台运行' : '关闭' }}
        </button>
        <button
          v-if="!allPushDone"
          class="btn btn-primary btn-sm"
          :disabled="isPushing || sessionTasks.length === 0"
          @click="startPush"
        >
          <span v-if="isPushing" class="loading loading-spinner loading-xs" />
          {{ isPushing ? '解析中...' : '开始解析' }}
        </button>
        <button
          v-else-if="hasExtractableFiles"
          class="btn btn-primary btn-sm"
          :disabled="isExtracting"
          @click="startExtract"
        >
          <span v-if="isExtracting" class="loading loading-spinner loading-xs" />
          {{ isExtracting ? '解压中...' : `解压全部（${extractableCount}）` }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { ExtractTask, PasswordEntry } from '../types'
import { computed, ref } from 'vue'
import { extractTaskStore } from '../store/extractTaskStore'
import ExtractFileItem from './ExtractFileItem.vue'
import FolderPicker from './FolderPicker.vue'
import PasswordList from './PasswordList.vue'
import 'iconify-icon'

const props = defineProps<{
  files: import('../types').ArchiveFileInfo[]
  currentCid: string
}>()

const emit = defineEmits<{
  close: []
  minimize: []
}>()

const passwords = ref<PasswordEntry[]>([])
const isPushing = ref(false)
const isExtracting = ref(false)
const showFolderPicker = ref(false)
const targetCid = ref(props.currentCid)
const targetFolderName = ref('当前目录')
const pushDoneCount = ref(0)

/** 通过 store 添加任务（自动去重） */
const { added: sessionTasks, skipped } = extractTaskStore.addFiles(props.files, props.currentCid)
const skippedCount = skipped.length

const isRunning = computed(() => isPushing.value || isExtracting.value)

const allPushDone = computed(() =>
  sessionTasks.length > 0
  && sessionTasks.every(t =>
    t.pushStatus === 'push_done'
    || t.pushStatus === 'push_error'
    || t.pushStatus === 'need_password',
  ),
)

const showExtractSection = computed(() =>
  allPushDone.value && sessionTasks.some(t => t.pushStatus === 'push_done'),
)

const hasExtractableFiles = computed(() =>
  sessionTasks.some(t => t.pushStatus === 'push_done' && t.extractStatus === 'idle'),
)

const extractableCount = computed(() =>
  sessionTasks.filter(t => t.pushStatus === 'push_done' && t.extractStatus === 'idle').length,
)

const pushProgress = computed(() => {
  if (!isPushing.value)
    return ''
  return `已完成 ${pushDoneCount.value}/${sessionTasks.length}`
})

function handleClose() {
  if (isRunning.value) {
    emit('minimize')
  }
  else {
    emit('close')
  }
}

function handleFolderSelect(cid: string, name: string) {
  targetCid.value = cid
  targetFolderName.value = name
  showFolderPicker.value = false
}

async function startPush() {
  isPushing.value = true
  pushDoneCount.value = 0

  const passwordList = passwords.value.map(p => p.value)

  for (const task of sessionTasks) {
    if (task.pushStatus !== 'pending')
      continue
    await extractTaskStore.pushFile(task, passwordList)
    pushDoneCount.value++
  }

  isPushing.value = false
}

async function retryFile(task: ExtractTask, password: string) {
  await extractTaskStore.retryTask(task, password)
}

async function startExtract() {
  isExtracting.value = true

  const extractableFiles = sessionTasks.filter(
    t => t.pushStatus === 'push_done' && t.extractStatus === 'idle',
  )

  for (const task of extractableFiles) {
    task.targetCid = targetCid.value
    await extractTaskStore.extractFile(task)
  }

  isExtracting.value = false
}
</script>
