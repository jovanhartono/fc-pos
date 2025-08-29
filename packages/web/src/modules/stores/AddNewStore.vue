<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { useDialogStore } from '@/core/stores/dialog-store'
import StoreForm from '@/modules/stores/StoreForm.vue'
import { POSTStoreSchema } from '@/shared/validation'
import { useMutation, useQueryClient } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import { toast } from 'vue-sonner'
import type z from 'zod'

const queryClient = useQueryClient()
const { closeDialog } = useDialogStore()

const { mutateAsync } = useMutation({
  mutationKey: ['create-user'],
  mutationFn: async (data: z.infer<typeof POSTStoreSchema>) =>
    await parseResponse(
      rpc.api.admin.stores.$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }
    queryClient.invalidateQueries({
      queryKey: ['stores'],
    })
    closeDialog()
  },
})
</script>

<template>
  <StoreForm @submit="mutateAsync" />
</template>
