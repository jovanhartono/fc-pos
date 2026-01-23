<script setup lang="ts">
import { POSTCustomerSchema } from '@fresclean/api/schema'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { PlusIcon } from 'lucide-vue-next'
import { h } from 'vue'
import { toast } from 'vue-sonner'
import { z } from 'zod'
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import CustomersTable from './CustomersTable.vue'

const queryClient = useQueryClient()
const { closeDialog } = useDialogStore()

const { openDialog } = useDialogStore()
const { mutateAsync } = useMutation({
  mutationKey: ['create-customer'],
  mutationFn: async (data: z.infer<typeof POSTCustomerSchema>) =>
    await parseResponse(
      rpc.api.admin.customers.$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    queryClient.invalidateQueries({
      queryKey: ['customers'],
    })
    closeDialog()
  },
})

function handleAddCustomer() {
  openDialog({
    title: 'Add New Customer',
    description: 'Make sure customer has not been registered yet on the system.',
    content: h(CustomerForm, {
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
      <Button size="sm" variant="outline" @click="handleAddCustomer">
        <PlusIcon /> New Customer
      </Button>
    </div>

    <CustomersTable />
  </div>
</template>
