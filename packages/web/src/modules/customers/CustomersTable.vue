<script setup lang="ts">
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { type ColumnDef } from '@tanstack/vue-table'
import { type InferResponseType, parseResponse } from 'hono/client'
import { h } from 'vue'
import { rpc } from '@/core/rpc'
import { Badge } from '@/shared/components/ui/badge'
import DataTable from '@/shared/components/ui/table/DataTable.vue'

const $get = rpc.api.admin.customers.$get
export type Customer = InferResponseType<typeof $get>['data'][number]
const columns = [
  {
    accessorKey: 'name',
    header: 'Customer',
  },
  {
    accessorKey: 'phone_number',
    header: 'Phone Number',
  },
  {
    accessorKey: 'email',
    header: 'Email',
  },
  {
    accessorKey: 'originStore.name',
    header: 'Origin Store',
  },
] satisfies ColumnDef<Customer>[]

const { data, isPending } = useQuery({
  queryKey: ['customers'],
  queryFn: async () => await parseResponse($get()),
  select: (data) => data.data,
  placeholderData: keepPreviousData,
})
</script>

<template>
  <DataTable :loading="isPending" :data="data ?? []" :columns="columns" />
</template>
