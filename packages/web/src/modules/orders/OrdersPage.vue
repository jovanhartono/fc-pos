<script setup lang="ts">

import { POSTOrderSchema } from '@fresclean/api/schema'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import z from 'zod'
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'

const OrderForm = defineAsyncComponent({
  loader: () => import('./OrderForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[500px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const queryClient = useQueryClient()
const { closeDialog } = useDialogStore()

const { data } = useQuery({
  queryKey: ['orders'],
  queryFn: () => parseResponse(rpc.api.admin.orders.$get()),
})

const { mutateAsync } = useMutation({
  mutationKey: ['create-orders'],
  mutationFn: async (data: z.infer<typeof POSTOrderSchema>) =>
    await parseResponse(
      rpc.api.admin.orders.$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    queryClient.invalidateQueries({
      queryKey: ['orders'],
    })
    closeDialog()
  },
})

const { openDialog } = useDialogStore()
function handleAddOrder() {
  openDialog({
    title: 'Add New Order',
    description: 'Create a new order for a customer',
    content: h(OrderForm, {
      onSubmit: mutateAsync,
      initialValues: {
        discount: '0',
        customer_phone: '+62',
      },
    }),
  })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Orders</h1>
      <Button size="sm" variant="outline" @click="handleAddOrder"> <PlusIcon /> New Order </Button>
    </div>

    <pre class="whitespace-pre"
      >{{ JSON.stringify(data) }}
    </pre>

    <!-- <CategoriesTable /> -->
  </div>
</template>
