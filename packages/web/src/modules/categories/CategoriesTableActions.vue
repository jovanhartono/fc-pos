<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import type { POSTCategorySchema } from '@/shared/validation'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Row } from '@tanstack/vue-table'
import { parseResponse } from 'hono/client'
import { EditIcon, LoaderIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'
import type { Category } from './CategoriesTable.vue'

const { row } = defineProps<{
  row: Row<Category>
}>()

const CategoryForm = defineAsyncComponent({
  loader: () => import('./CategoryForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[313px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const { openDialog, closeDialog } = useDialogStore()

const queryClient = useQueryClient()
const { mutateAsync } = useMutation({
  mutationKey: ['edit-category'],
  mutationFn: async (data: z.infer<typeof POSTCategorySchema>) =>
    await parseResponse(
      rpc.api.admin.categories[':id'].$put({
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
      queryKey: ['categories'],
    })
    closeDialog()
  },
})

function handleEditCategory() {
  openDialog({
    title: `Edit ${row.original.name}`,
    content: h(CategoryForm, {
      initialValues: { ...row.original },
      onSubmit: mutateAsync,
    }),
  })
}
</script>

<template>
  <div class="flex gap-x-1 items-center">
    <Button size="icon" variant="ghost" @click="handleEditCategory"> <EditIcon /> </Button>
  </div>
</template>
