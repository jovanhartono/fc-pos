<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'
import CategoriesTable from './CategoriesTable.vue'
import type { POSTCategorySchema } from '@/shared/validation'

const CategoryForm = defineAsyncComponent({
  loader: () => import('./CategoryForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[313px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const queryClient = useQueryClient()
const { closeDialog } = useDialogStore()

const { mutateAsync } = useMutation({
  mutationKey: ['create-category'],
  mutationFn: async (data: z.infer<typeof POSTCategorySchema>) =>
    await parseResponse(
      rpc.api.admin.categories.$post({
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

const { openDialog } = useDialogStore()
function handleAddCategory() {
  openDialog({
    title: 'Add New Category',
    description: 'Make sure category has not been registered yet on the system.',
    content: h(CategoryForm, {
      onSubmit: mutateAsync,
      initialValues: { is_active: true },
    }),
  })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Categories</h1>
      <Button size="sm" variant="outline" @click="handleAddCategory">
        <PlusIcon /> New Category
      </Button>
    </div>

    <CategoriesTable />
  </div>
</template>
