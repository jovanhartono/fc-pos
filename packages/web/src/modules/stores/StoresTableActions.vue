<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import type { Store } from '@/modules/stores/StoresTable.vue'
import { Button } from '@/shared/components/ui/button'
import type { POSTStoreSchema } from '@/shared/validation'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Row } from '@tanstack/vue-table'
import { parseResponse } from 'hono/client'
import { EditIcon, LoaderIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'

const { row } = defineProps<{
  row: Row<Store>
}>()

const EditStore = defineAsyncComponent({
  loader: () => import('./StoreForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[500px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const { openDialog, closeDialog } = useDialogStore()

const queryClient = useQueryClient()
const { mutateAsync } = useMutation({
  mutationKey: ['edit-user'],
  mutationFn: async (data: z.infer<typeof POSTStoreSchema>) =>
    await parseResponse(
      rpc.api.admin.stores[':id'].$put({
        param: {
          id: row.original.id.toString(),
        },
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

function handleEditStore() {
  openDialog({
    title: `Edit ${row.original.name}`,
    content: h(EditStore, { initialValues: { ...row.original }, onSubmit: mutateAsync }),
  })
}
</script>

<template>
  <div class="flex gap-x-1 items-center">
    <Button size="icon" variant="ghost" @click="handleEditStore">
      <EditIcon />
    </Button>
  </div>
</template>
