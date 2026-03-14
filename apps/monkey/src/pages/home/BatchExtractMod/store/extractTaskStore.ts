import type { ArchiveFileInfo, ExtractTask, SerializedExtractTask } from '../types'
import localforage from 'localforage'
import { debounce } from 'lodash'
import { computed, reactive, watch } from 'vue'
import { drive115 } from '@/utils/drive115'
import { ExtractWrongPasswordError } from '@/utils/drive115/wrap'
import { appLogger } from '@/utils/logger'

const logger = appLogger.sub('ExtractTaskStore')

/** IndexedDB 存储 key */
const STORAGE_KEY = 'extract-tasks'

/** unzip_status 常量 */
const UNZIP_STATUS_FORMAT_ERROR = 0
const UNZIP_STATUS_DONE = 4
const UNZIP_STATUS_WRONG_PASSWORD = 6

/** 轮询间隔 5 秒 */
const POLL_INTERVAL_MS = 5000
/** 最大轮询次数 180（15 分钟） */
const POLL_MAX_RETRY = 180

// ---- 内部状态 ----

const state = reactive({
  tasks: [] as ExtractTask[],
  managerOpen: false,
  initialized: false,
})

/** 轮询取消控制器映射 */
const abortMap = new Map<string, AbortController>()

// ---- 持久化 ----

const persistTasks = debounce(() => {
  const serialized: SerializedExtractTask[] = state.tasks.map(t => ({
    file: t.file,
    pushStatus: t.pushStatus,
    extractStatus: t.extractStatus,
    errorMessage: t.errorMessage,
    usedPassword: t.usedPassword,
    addedAt: t.addedAt,
    targetCid: t.targetCid,
  }))
  localforage.setItem(STORAGE_KEY, serialized).catch((err) => {
    logger.warn('持久化任务失败', err)
  })
}, 500)

async function loadTasks(): Promise<void> {
  try {
    const saved = await localforage.getItem<SerializedExtractTask[]>(STORAGE_KEY)
    if (!saved || saved.length === 0)
      return
    state.tasks = saved.map(t => reactive({
      ...t,
      // 确保字段完整
      pushStatus: t.pushStatus ?? 'pending',
      extractStatus: t.extractStatus ?? 'idle',
      errorMessage: t.errorMessage ?? '',
      usedPassword: t.usedPassword ?? '',
    }))
  }
  catch (err) {
    logger.warn('加载持久化任务失败', err)
  }
}

// ---- 计算属性 ----

const tasks = computed(() => state.tasks)

const hasTasks = computed(() => state.tasks.length > 0)

const activeCount = computed(() =>
  state.tasks.filter(t =>
    t.pushStatus === 'pushing'
    || t.extractStatus === 'extracting',
  ).length,
)

const hasRunning = computed(() => activeCount.value > 0)

const statusCounts = computed(() => {
  let processing = 0
  let completed = 0
  let failed = 0
  let pending = 0
  for (const t of state.tasks) {
    if (t.pushStatus === 'pushing' || t.extractStatus === 'extracting') {
      processing++
    }
    else if (t.extractStatus === 'extract_done') {
      completed++
    }
    else if (t.pushStatus === 'push_error' || t.extractStatus === 'extract_error' || t.pushStatus === 'need_password') {
      failed++
    }
    else {
      pending++
    }
  }
  return { processing, completed, failed, pending }
})

const managerOpen = computed(() => state.managerOpen)

// ---- 去重 ----

function isActive(pickCode: string): boolean {
  return state.tasks.some(t => t.file.pickCode === pickCode)
}

// ---- 任务管理 ----

function addFiles(files: ArchiveFileInfo[], targetCid: string): { added: ExtractTask[], skipped: ArchiveFileInfo[] } {
  const added: ExtractTask[] = []
  const skipped: ArchiveFileInfo[] = []

  for (const file of files) {
    if (isActive(file.pickCode)) {
      skipped.push(file)
      continue
    }
    const task: ExtractTask = reactive({
      file,
      pushStatus: 'pending',
      extractStatus: 'idle',
      errorMessage: '',
      usedPassword: '',
      addedAt: Date.now(),
      targetCid,
    })
    state.tasks.push(task)
    added.push(task)
  }

  return { added, skipped }
}

function getTask(pickCode: string): ExtractTask | undefined {
  return state.tasks.find(t => t.file.pickCode === pickCode)
}

function removeTask(pickCode: string): void {
  cancelTask(pickCode)
  const idx = state.tasks.findIndex(t => t.file.pickCode === pickCode)
  if (idx !== -1)
    state.tasks.splice(idx, 1)
}

function removeTasks(pickCodes: string[]): void {
  for (const pc of pickCodes) {
    cancelTask(pc)
  }
  state.tasks = state.tasks.filter(t => !pickCodes.includes(t.file.pickCode))
}

function clearCompleted(): void {
  state.tasks = state.tasks.filter(t => t.extractStatus !== 'extract_done')
}

function clearAll(): void {
  for (const t of state.tasks) {
    const ctrl = abortMap.get(t.file.pickCode)
    ctrl?.abort()
  }
  abortMap.clear()
  state.tasks = []
}

// ---- 异步推送 ----

async function pushFile(task: ExtractTask, passwordList: string[]): Promise<void> {
  task.pushStatus = 'pushing'
  task.errorMessage = ''

  const passwordsToTry = passwordList.length > 0 ? passwordList : ['']

  for (const pwd of passwordsToTry) {
    try {
      const pushRes = await drive115.webApiPostPushExtract({
        pick_code: task.file.pickCode,
        ...(pwd ? { secret: pwd } : {}),
      })

      if (!pushRes.state) {
        task.pushStatus = 'push_error'
        task.errorMessage = `推送解压失败: ${JSON.stringify(pushRes)}`
        return
      }

      const status = pushRes.data.unzip_status
      if (status === UNZIP_STATUS_WRONG_PASSWORD) {
        continue
      }
      if (status === UNZIP_STATUS_FORMAT_ERROR) {
        task.pushStatus = 'push_error'
        task.errorMessage = '文件格式不支持云解压'
        return
      }
      if (status === UNZIP_STATUS_DONE) {
        task.pushStatus = 'push_done'
        task.usedPassword = pwd
        return
      }
      // status 1/2 → 任务已推送，启动后台轮询
      task.usedPassword = pwd
      startPollPush(task)
      return
    }
    catch (error) {
      if (error instanceof ExtractWrongPasswordError) {
        continue
      }
      task.pushStatus = 'push_error'
      task.errorMessage = error instanceof Error ? error.message : String(error)
      return
    }
  }

  task.pushStatus = 'need_password'
}

function startPollPush(task: ExtractTask): void {
  const ctrl = new AbortController()
  abortMap.set(task.file.pickCode, ctrl)

  const poll = async () => {
    for (let i = 0; i < POLL_MAX_RETRY; i++) {
      if (ctrl.signal.aborted)
        return
      await new Promise<void>(r => setTimeout(r, POLL_INTERVAL_MS))
      if (ctrl.signal.aborted)
        return

      try {
        const res = await drive115.webApiGetPushExtract({ pick_code: task.file.pickCode })
        const extractStatus = res.data?.extract_status
        if (!extractStatus)
          continue

        if (extractStatus.unzip_status === UNZIP_STATUS_DONE) {
          task.pushStatus = 'push_done'
          abortMap.delete(task.file.pickCode)
          return
        }
        if (extractStatus.unzip_status === UNZIP_STATUS_FORMAT_ERROR) {
          task.pushStatus = 'push_error'
          task.errorMessage = '文件格式不支持云解压'
          abortMap.delete(task.file.pickCode)
          return
        }
        if (extractStatus.unzip_status === UNZIP_STATUS_WRONG_PASSWORD) {
          task.pushStatus = 'need_password'
          abortMap.delete(task.file.pickCode)
          return
        }
        // 1/2 继续轮询
      }
      catch (error) {
        task.pushStatus = 'push_error'
        task.errorMessage = error instanceof Error ? error.message : String(error)
        abortMap.delete(task.file.pickCode)
        return
      }
    }
    // 超时
    task.pushStatus = 'push_error'
    task.errorMessage = '推送解压超时（超过 15 分钟）'
    abortMap.delete(task.file.pickCode)
  }

  poll()
}

function cancelTask(pickCode: string): void {
  const ctrl = abortMap.get(pickCode)
  if (ctrl) {
    ctrl.abort()
    abortMap.delete(pickCode)
  }
  const task = getTask(pickCode)
  if (task && task.pushStatus === 'pushing') {
    task.pushStatus = 'push_error'
    task.errorMessage = '已取消'
  }
}

// ---- 解压操作 ----

async function extractFile(task: ExtractTask): Promise<void> {
  task.extractStatus = 'extracting'
  task.errorMessage = ''
  try {
    const entries = await drive115.listExtractEntries(task.file.pickCode)
    const extractId = await drive115.submitExtract(task.file.pickCode, entries, task.targetCid)
    await drive115.waitExtractDone(extractId)
    task.extractStatus = 'extract_done'
  }
  catch (error) {
    task.extractStatus = 'extract_error'
    task.errorMessage = error instanceof Error ? error.message : String(error)
  }
}

async function retryTask(task: ExtractTask, password?: string): Promise<void> {
  task.pushStatus = 'pending'
  task.extractStatus = 'idle'
  task.errorMessage = ''
  const passwords = password ? [password] : (task.usedPassword ? [task.usedPassword] : [])
  await pushFile(task, passwords)
}

// ---- 面板控制 ----

function openManager(): void {
  state.managerOpen = true
}

function closeManager(): void {
  state.managerOpen = false
}

// ---- 初始化 + 自动恢复 ----

async function init(): Promise<void> {
  if (state.initialized)
    return
  state.initialized = true

  await loadTasks()

  // 恢复 pushing 状态的任务：重新启动轮询
  for (const task of state.tasks) {
    if (task.pushStatus === 'pushing') {
      startPollPush(task)
    }
  }

  // extracting 状态的任务：无法恢复（extract_id 未持久化），标记失败
  for (const task of state.tasks) {
    if (task.extractStatus === 'extracting') {
      task.extractStatus = 'extract_error'
      task.errorMessage = '页面刷新导致解压中断，请重试'
    }
  }

  // 启动 deep watch 进行持久化
  watch(() => state.tasks, persistTasks, { deep: true })
}

// ---- 导出 ----

export const extractTaskStore = {
  // 状态
  tasks,
  hasTasks,
  activeCount,
  hasRunning,
  statusCounts,
  managerOpen,
  // 去重
  isActive,
  // 任务管理
  addFiles,
  getTask,
  removeTask,
  removeTasks,
  clearCompleted,
  clearAll,
  // 异步操作
  pushFile,
  cancelTask,
  extractFile,
  retryTask,
  // 面板
  openManager,
  closeManager,
  // 初始化
  init,
}
