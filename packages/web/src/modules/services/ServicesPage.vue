<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import type { POSTServiceSchema } from '@/shared/validation'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import { defineAsyncComponent, h } from 'vue'
import { toast } from 'vue-sonner'
import type z from 'zod'
import ServicesTable from './ServicesTable.vue'

const ServiceForm = defineAsyncComponent({
  loader: () => import('./ServiceForm.vue'),
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
  mutationKey: ['create-service'],
  mutationFn: async (data: z.infer<typeof POSTServiceSchema>) =>
    await parseResponse(
      rpc.api.admin.services.$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    queryClient.invalidateQueries({
      queryKey: ['services'],
    })
    closeDialog()
  },
})

const { openDialog } = useDialogStore()
function handleAddService() {
  openDialog({
    title: 'Add New Service',
    description: 'Make sure service has not been registered yet on the system.',
    content: h(ServiceForm, {
      onSubmit: mutateAsync,
      type: 'post',
      initialValues: { is_active: true },
    }),
  })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Services</h1>
      <Button size="sm" variant="outline" @click="handleAddService">
        <PlusIcon /> New Service
      </Button>
    </div>

    <ServicesTable />
  </div>
</template>
