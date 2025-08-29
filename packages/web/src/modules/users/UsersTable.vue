<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { Badge } from '@/shared/components/ui/badge'
import DataTable from '@/shared/components/ui/table/DataTable.vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { createColumnHelper } from '@tanstack/vue-table'
import { parseResponse, type InferResponseType } from 'hono/client'
import { h } from 'vue'

const $get = rpc.api.admin.users.$get
type User = InferResponseType<typeof $get>['data'][number]
const columnHelper = createColumnHelper<User>()
const columns = [
  columnHelper.accessor('username', {
    header: 'Username',
    cell: ({ getValue }) => getValue(),
  }),
  columnHelper.accessor('name', {
    header: 'Name',
    cell: ({ getValue }) => getValue(),
  }),
  columnHelper.accessor('role', {
    header: 'Role',
    cell: ({ getValue }) => getValue(),
  }),
  columnHelper.accessor('is_active', {
    header: 'Status',
    cell: ({ getValue }) =>
      h(
        Badge,
        { variant: 'outline', color: 'emerald' },
        getValue() ? () => 'Active' : () => 'Inactive',
      ),
  }),
]

const { data, isPending } = useQuery({
  queryKey: ['users'],
  queryFn: async () => await parseResponse($get()),
  select: (data) => data.data,
  placeholderData: keepPreviousData,
})
</script>

<template>
  <DataTable :data="data ?? []" :columns="columns" :loading="isPending" />
</template>
