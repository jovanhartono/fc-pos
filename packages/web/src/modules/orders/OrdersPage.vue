<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import { useMutation, useQuery, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import z from 'zod'

import { POSTOrderSchema } from '@fresclean/api/schema'

// const PaymentMethodForm = defineAsyncComponent({
//   loader: () => import('./PaymentMethodForm.vue'),
//   delay: 0,
//   loadingComponent: h(
//     'div',
//     { class: 'w-full h-[290px] flex items-center justify-center' },
//     h(LoaderIcon, { class: 'animate-spin' }),
//   ),
// })

const queryClient = useQueryClient()
const { closeDialog } = useDialogStore()

const { data } = useQuery({
  queryKey: ['orders'],
  queryFn: () => parseResponse(rpc.api.admin['orders'].$get()),
})

const { mutateAsync } = useMutation({
  mutationKey: ['create-orders'],
  mutationFn: async (data: z.infer<typeof POSTOrderSchema>) =>
    await parseResponse(
      rpc.api.admin['orders'].$post({
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
function handleAddPaymentMethod() {
  // openDialog({
  //   title: 'Add New Payment Method',
  //   description: 'Make sure payment method has not been registered yet on the system.',
  //   content: h(PaymentMethodForm, {
  //     onSubmit: mutateAsync,
  //     initialValues: { is_active: true },
  //   }),
  // })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Orders</h1>
      <Button size="sm" variant="outline" @click="handleAddPaymentMethod">
        <PlusIcon /> New Order
      </Button>
    </div>

    <pre class="whitespace-pre"
      >{{ JSON.stringify(data) }}
    </pre>

    <!-- <CategoriesTable /> -->
  </div>
</template>
