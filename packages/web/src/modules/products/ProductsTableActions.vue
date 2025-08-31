<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import type { POSTProductSchema } from '@/shared/validation'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import type { Row } from '@tanstack/vue-table'
import { parseResponse } from 'hono/client'
import { EditIcon, LoaderIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'
import type { Product } from './ProductsTable.vue'
import { formatIDRCurrency } from '@/shared/utils'

const { row } = defineProps<{
  row: Row<Product>
}>()

const ProductForm = defineAsyncComponent({
  loader: () => import('./ProductForm.vue'),
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
  mutationKey: ['edit-product'],
  mutationFn: async (data: z.infer<typeof POSTProductSchema>) =>
    await parseResponse(
      rpc.api.admin.products[':id'].$put({
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
      queryKey: ['products'],
    })
    closeDialog()
  },
})

function handleEditProduct() {
  openDialog({
    title: `Edit ${row.original.name}`,
    content: h(ProductForm, {
      initialValues: {
        ...row.original,
        cogs: formatIDRCurrency(row.original.cogs),
        price: formatIDRCurrency(row.original.price),
      },
      onSubmit: mutateAsync,
      type: 'put',
    }),
  })
}
</script>

<template>
  <div class="flex gap-x-1 items-center">
    <Button size="icon" variant="ghost" @click="handleEditProduct"> <EditIcon /> </Button>
  </div>
</template>
