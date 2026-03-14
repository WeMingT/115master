<template>
  <div
    v-if="extractTaskStore.hasTasks.value"
    class="fixed right-6 bottom-6 z-50"
  >
    <button
      class="btn btn-primary btn-circle shadow-lg"
      title="云解压任务管理"
      @click="extractTaskStore.openManager()"
    >
      <div class="relative">
        <iconify-icon icon="material-symbols:folder-zip-outline" width="24" height="24" noobserver />
        <span
          v-if="extractTaskStore.activeCount.value > 0"
          class="badge badge-error badge-xs absolute -top-2.5 -right-2.5"
        >
          {{ extractTaskStore.activeCount.value }}
        </span>
      </div>
    </button>
  </div>
</template>

<script setup lang="ts">
import { extractTaskStore } from '../store/extractTaskStore'
import 'iconify-icon'
</script>
