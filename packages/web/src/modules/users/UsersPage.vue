<script setup lang="ts">
import { useDialogStore } from '@/core/stores/dialog-store'
import { Button } from '@/shared/components/ui/button'
import { LoaderIcon, PlusIcon } from 'lucide-vue-next'
import UsersTable from '@/modules/users/UsersTable.vue'
import { defineAsyncComponent, h } from 'vue'

const AddNewUser = defineAsyncComponent({
  loader: () => import('./AddNewUser.vue'),
  loadingComponent: h(
    'div',
    { class: 'w-full h-[500px] flex items-center justify-center' },
    h(LoaderIcon, { class: 'animate-spin' }),
  ),
})

const { openDialog } = useDialogStore()
function handleNewUserClick() {
  openDialog({
    title: 'Add New User',
    description: 'Make sure user has not been registered yet on the system.',
    content: h(AddNewUser),
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
