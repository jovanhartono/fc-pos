<script setup lang="ts">
import { useDialogStore } from '@/core/stores/dialog-store'
import Dialog from './Dialog.vue'
import DialogContent from './DialogContent.vue'
import DialogHeader from './DialogHeader.vue'
import DialogTitle from './DialogTitle.vue'
import DialogDescription from './DialogDescription.vue'
import { storeToRefs } from 'pinia'

const dialogStore = useDialogStore()
const { dialogState } = storeToRefs(dialogStore)

// only handle close as open state will be handled by the store hooks
function handleOpenChange(open: boolean) {
  if (!open) {
    dialogStore.closeDialog()
  }
}
</script>

<template>
  <Dialog :open="dialogState.open" @update:open="handleOpenChange">
    <DialogContent class="max-h-[90dvh] overflow-y-auto">
      <DialogHeader v-if="dialogState.title || dialogState.description">
        <DialogTitle v-if="dialogState.title">
          {{ dialogState.title }}
        </DialogTitle>
        <DialogDescription v-if="dialogState.description">
          {{ dialogState.description }}
        </DialogDescription>
      </DialogHeader>

      <component :is="dialogState.content" />
    </DialogContent>
  </Dialog>
</template>
