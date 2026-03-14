<template>
  <div class="border-base-300 flex flex-col gap-2 rounded-lg border p-2" style="max-height: 280px">
    <div class="bg-base-200 flex flex-wrap items-center gap-0.5 rounded px-1 py-0.5 text-xs">
      <span
        v-for="(seg, i) in pathSegments"
        :key="seg.cid"
        class="flex items-center"
      >
        <span v-if="i > 0" class="text-base-content/50 mx-0.5">/</span>
        <button
          class="btn btn-ghost btn-xs"
          @click="navigateTo(seg.cid)"
        >
          {{ seg.name }}
        </button>
      </span>
    </div>
    <div class="flex min-h-15 flex-1 flex-col gap-0.5 overflow-y-auto">
      <div v-if="loading" class="text-base-content/50 flex items-center justify-center gap-2 p-3 text-sm">
        <span class="loading loading-spinner loading-sm" />
        <span>加载中...</span>
      </div>
      <template v-else>
        <div
          v-if="folders.length === 0"
          class="text-base-content/50 p-3 text-center text-sm"
        >
          无子目录
        </div>
        <div
          v-for="folder in folders"
          :key="folder.cid"
          class="hover:bg-base-200 flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm"
          :class="folder.cid === selectedCid ? 'bg-primary/10' : ''"
          @click="selectedCid = folder.cid"
          @dblclick="navigateTo(folder.cid)"
        >
          <iconify-icon icon="material-symbols:folder-outline" width="20" height="20" noobserver />
          <span class="truncate">{{ folder.name }}</span>
        </div>
      </template>
    </div>
    <div class="border-base-300/50 flex items-center justify-between border-t pt-2">
      <span class="text-base-content/50 truncate text-xs">
        目标: {{ selectedName }}
      </span>
      <div class="flex shrink-0 gap-1">
        <button class="btn btn-ghost btn-sm" @click="emit('cancel')">
          取消
        </button>
        <button class="btn btn-primary btn-sm" @click="confirmSelection">
          确定
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { GMRequestInstance } from '@/utils/request/gmRequst'
import 'iconify-icon'

interface FolderItem {
  cid: string
  name: string
}

const props = defineProps<{
  initialCid: string
}>()

const emit = defineEmits<{
  select: [cid: string, name: string]
  cancel: []
}>()

const currentCid = ref(props.initialCid)
const selectedCid = ref(props.initialCid)
const folders = ref<FolderItem[]>([])
const pathSegments = ref<FolderItem[]>([{ cid: '0', name: '根目录' }])
const loading = ref(false)

const selectedName = computed(() => {
  if (selectedCid.value === currentCid.value) {
    return pathSegments.value[pathSegments.value.length - 1]?.name ?? '当前目录'
  }
  return folders.value.find(f => f.cid === selectedCid.value)?.name ?? '当前目录'
})

async function loadFolders(cid: string) {
  loading.value = true
  try {
    /**
     * 使用 GM_xmlhttpRequest 替代 fetchRequest 获取目录列表
     * 原因：Tampermonkey sandbox 中原生 fetch 对 webapi.115.com 的跨域请求
     * 可能因 CORS 被浏览器拦截，GM_xmlhttpRequest 可绕过此限制
     */
    const params = new URLSearchParams({
      aid: '1',
      cid,
      offset: '0',
      limit: '200',
      show_dir: '1',
      stdir: '1',
      type: '0',
      format: 'json',
      o: 'file_name',
      asc: '1',
      cur: '1',
      natsort: '1',
    })
    const response = await GMRequestInstance.get(
      `https://webapi.115.com/files?${params.toString()}`,
    )
    const raw = await response.json() as Record<string, unknown>

    const list = Array.isArray(raw.data)
      ? raw.data as Array<Record<string, unknown>>
      : Array.isArray((raw.data as Record<string, unknown>)?.data)
        ? ((raw.data as Record<string, unknown>).data as Array<Record<string, unknown>>)
        : []

    const pathList = Array.isArray(raw.path)
      ? raw.path as Array<Record<string, unknown>>
      : Array.isArray((raw.data as Record<string, unknown>)?.path)
        ? ((raw.data as Record<string, unknown>).path as Array<Record<string, unknown>>)
        : []

    const isDir = (item: Record<string, unknown>) => {
      if (item.fc !== undefined)
        return String(item.fc) === '0'
      if (item.file_category !== undefined)
        return String(item.file_category) === '0'
      if ('fid' in item)
        return false
      if ('file_id' in item)
        return false
      return true
    }

    const getName = (item: Record<string, unknown>) => {
      return String(
        item.n
        ?? item.fn
        ?? item.file_name
        ?? item.category_name
        ?? item.name
        ?? '未命名目录',
      )
    }

    const getCid = (item: Record<string, unknown>) => {
      return String(
        item.cid
        ?? item.fid
        ?? item.category_id
        ?? item.id
        ?? '',
      )
    }

    if (raw.state !== false) {
      folders.value = list
        .filter(isDir)
        .map(item => ({
          cid: getCid(item),
          name: getName(item),
        }))
        .filter(item => item.cid)

      if (pathList.length > 0) {
        pathSegments.value = pathList.map(p => ({
          cid: String(p.cid ?? p.id ?? p.category_id ?? '0'),
          name: String(p.name ?? p.fn ?? p.file_name ?? '根目录'),
        }))
      }
    }
  }
  catch {
    folders.value = []
  }
  finally {
    loading.value = false
  }
}

function navigateTo(cid: string) {
  currentCid.value = cid
  selectedCid.value = cid
}

function confirmSelection() {
  emit('select', selectedCid.value, selectedName.value)
}

watch(currentCid, (cid) => {
  loadFolders(cid)
})

onMounted(() => {
  loadFolders(currentCid.value)
})
</script>
