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
import CategoriesTable from './PaymentMethodsList.vue'
import type { POSTPaymentMethodSchema } from '@/shared/validation'

const PaymentMethodForm = defineAsyncComponent({
  loader: () => import('./PaymentMethodForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[290px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const queryClient = useQueryClient()
const { closeDialog } = useDialogStore()

const { mutateAsync } = useMutation({
  mutationKey: ['create-payment-method'],
  mutationFn: async (data: z.infer<typeof POSTPaymentMethodSchema>) =>
    await parseResponse(
      rpc.api.admin['payment-methods'].$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    queryClient.invalidateQueries({
      queryKey: ['payment-methods'],
    })
    closeDialog()
  },
})

const { openDialog } = useDialogStore()
function handleAddPaymentMethod() {
  openDialog({
    title: 'Add New Payment Method',
    description: 'Make sure payment method has not been registered yet on the system.',
    content: h(PaymentMethodForm, {
      onSubmit: mutateAsync,
      initialValues: { is_active: true },
    }),
  })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Payment Methods</h1>
      <Button size="sm" variant="outline" @click="handleAddPaymentMethod">
        <PlusIcon /> New Payment Method
      </Button>
    </div>

    <CategoriesTable />
  </div>
</template>
