<script setup lang="ts">
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import UsersTable from '@/modules/users/UsersTable.vue'
import { defineAsyncComponent, h } from 'vue'
import { useMutation } from '@tanstack/vue-query'
import { rpc } from '@/core/rpc'
import type { POSTUserSchema } from '@/shared/validation'
import { parseResponse } from 'hono/client'
import { toast } from 'vue-sonner'
import type z from 'zod'

const UserForm = defineAsyncComponent({
  loader: () => import('./UserForm.vue'),
  delay: 0,
  loadingComponent: h(
    'div',
    { class: 'w-full h-[500px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const { openDialog, closeDialog } = useDialogStore()

const { mutateAsync } = useMutation({
  mutationKey: ['create-user'],
  mutationFn: async (data: unknown) =>
    await parseResponse(
      rpc.api.admin.users.$post({
        json: data as z.infer<typeof POSTUserSchema>,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    closeDialog()
  },
})
function handleNewUserClick() {
  openDialog({
    title: 'Add New User',
    description: 'Make sure user has not been registered yet on the system.',
    content: h(UserForm, { onSubmit: mutateAsync, type: 'post' }),
  })
}
</script>

<template>
  <div class="flex flex-col gap-y-6">
    <div class="flex items-center justify-between">
      <h1 class="font-medium text-lg">Users</h1>
      <Button size="sm" variant="outline" @click="handleNewUserClick">
        <PlusIcon /> New User
      </Button>
    </div>

    <UsersTable />
  </div>
</template>
