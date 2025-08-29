<script setup lang="ts">
import { useDialogStore } from '@/core/stores/dialog-store'
import StoresTable from '@/modules/stores/StoresTable.vue'
import { Button } from '@/shared/components/ui/button'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'

const AddNewStore = defineAsyncComponent({
  loader: () => import('./AddNewStore.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[500px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const { openDialog } = useDialogStore()
function handleAddStore() {
  openDialog({
    title: 'Add New Store',
    description: 'Make sure store has not been registered yet on the system.',
    content: h(AddNewStore),
  })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Stores</h1>
      <Button size="sm" variant="outline" @click="handleAddStore"> <PlusIcon /> New Store </Button>
    </div>

    <StoresTable />
  </div>
</template>
