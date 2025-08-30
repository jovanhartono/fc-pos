<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import StoresTable from '@/modules/stores/StoresTable.vue'
import { Button } from '@/shared/components/ui/button'
import type { POSTStoreSchema } from '@/shared/validation'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'

const StoreForm = defineAsyncComponent({
  loader: () => import('./StoreForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[500px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const queryClient = useQueryClient()
const { closeDialog } = useDialogStore()

const { mutateAsync } = useMutation({
  mutationKey: ['create-user'],
  mutationFn: async (data: z.infer<typeof POSTStoreSchema>) =>
    await parseResponse(
      rpc.api.admin.stores.$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    queryClient.invalidateQueries({
      queryKey: ['stores'],
    })
    closeDialog()
  },
})

const { openDialog } = useDialogStore()
function handleAddStore() {
  openDialog({
    title: 'Add New Store',
    description: 'Make sure store has not been registered yet on the system.',
    content: h(StoreForm, {
      onSubmit: mutateAsync,
      type: 'post',
      initialValues: { is_active: true },
    }),
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
