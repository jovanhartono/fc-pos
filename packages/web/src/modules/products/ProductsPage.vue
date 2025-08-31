<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import type { POSTProductSchema } from '@/shared/validation'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'
import ServicesTable from './ProductsTable.vue'

const ProductForm = defineAsyncComponent({
  loader: () => import('./ProductForm.vue'),
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
  mutationKey: ['create-product'],
  mutationFn: async (data: z.infer<typeof POSTProductSchema>) =>
    await parseResponse(
      rpc.api.admin.products.$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    queryClient.invalidateQueries({
      queryKey: ['products'],
    })
    closeDialog()
  },
})

const { openDialog } = useDialogStore()
function handleAddProduct() {
  openDialog({
    title: 'Add New Product',
    description: 'Make sure product has not been registered yet on the system.',
    content: h(ProductForm, {
      onSubmit: mutateAsync,
      type: 'post',
      initialValues: { is_active: true, stock: 1 },
    }),
  })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Products</h1>
      <Button size="sm" variant="outline" @click="handleAddProduct">
        <PlusIcon /> New Product
      </Button>
    </div>

    <ServicesTable />
  </div>
</template>
