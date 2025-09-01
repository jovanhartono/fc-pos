<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import type { POSTPaymentMethodSchema } from '@/shared/validation'
import { useQueryClient, useMutation } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'
import type { PaymentMethod } from './PaymentMethodsList.vue'
import { EditIcon, LoaderIcon } from 'lucide-vue-next'
import { Badge } from '@/shared/components/ui/badge'
import { Switch } from '@/shared/components/ui/switch'
import { Button } from '@/shared/components/ui/button'

const PaymentMethodForm = defineAsyncComponent({
  loader: () => import('./PaymentMethodForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[290px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const { paymentMethod } = defineProps<{
  paymentMethod: PaymentMethod
}>()
const queryClient = useQueryClient()
const { openDialog, closeDialog } = useDialogStore()

const { mutateAsync } = useMutation({
  mutationKey: ['edit-payment-method'],
  mutationFn: async (data: z.infer<typeof POSTPaymentMethodSchema>) =>
    await parseResponse(
      rpc.api.admin['payment-methods'][':id'].$put({
        param: {
          id: `${paymentMethod.id}`,
        },
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

function handleEditPaymentMethod() {
  openDialog({
    title: `Edit ${paymentMethod.name}`,
    content: h(PaymentMethodForm, {
      initialValues: paymentMethod,
      onSubmit: mutateAsync,
    }),
  })
}
</script>

<template>
  <li class="rounded p-4 border flex items-center justify-between">
    <div class="space-y-1">
      <p class="text-muted-foreground text-sm">{{ paymentMethod.code }}</p>
      <p class="font-medium">{{ paymentMethod.name }}</p>
    </div>
    <div class="flex items-center gap-x-3">
      <Badge :color="paymentMethod.is_active ? 'emerald' : 'red'" variant="outline">
        {{ paymentMethod.is_active ? 'Active' : 'Inactive' }}
      </Badge>
      <Button variant="ghost" size="icon" @click="handleEditPaymentMethod">
        <EditIcon />
      </Button>
      <Switch
        :default-value="paymentMethod.is_active"
        @update:model-value="
          (value) => {
            mutateAsync({ code: paymentMethod.code, name: paymentMethod.name, is_active: value })
          }
        "
      />
    </div>
  </li>
</template>
