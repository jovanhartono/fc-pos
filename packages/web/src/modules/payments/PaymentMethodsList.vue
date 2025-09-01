<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { parseResponse, type InferResponseType } from 'hono/client'
import { LoaderIcon, XCircleIcon } from 'lucide-vue-next'
import PaymentMethodItem from './PaymentMethodItem.vue'

const $get = rpc.api.admin['payment-methods'].$get
export type PaymentMethod = InferResponseType<typeof $get>['data'][number]

const { data, isPending } = useQuery({
  queryKey: ['payment-methods'],
  queryFn: async () => await parseResponse($get()),
  select: (data) => data.data,
  placeholderData: keepPreviousData,
})
</script>

<template>
  <LoaderIcon v-if="isPending" class="mx-auto animate-spin" />

  <template v-else>
    <ul class="flex flex-col gap-y-3" v-if="data?.length">
      <PaymentMethodItem v-for="item in data" :key="item.id" :payment-method="item" />
    </ul>

    <div v-else class="h-[128px] w-full rounded border flex items-center justify-center">
      <XCircleIcon class="size-4 mr-2 text-destructive" />
      <span>Payment method is not available</span>
    </div>
  </template>
</template>
