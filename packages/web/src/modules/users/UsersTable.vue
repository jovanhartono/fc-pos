<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { Badge } from '@/shared/components/ui/badge'
import DataTable from '@/shared/components/ui/table/DataTable.vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { type ColumnDef } from '@tanstack/vue-table'
import { parseResponse, type InferResponseType } from 'hono/client'
import { h } from 'vue'
import UsersTableActions from './UsersTableActions.vue'

const $get = rpc.api.admin.users.$get
export type User = InferResponseType<typeof $get>['data'][number]
const columns = [
  {
    accessorKey: 'username',
    header: 'Username',
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'role',
    header: 'Role',
  },
  {
    accessorKey: 'is_active',
    header: 'Status',
    cell: ({ getValue }) =>
      h(
        Badge,
        { variant: 'outline', color: getValue() ? 'emerald' : 'red' },
        getValue() ? () => 'Active' : () => 'Inactive',
      ),
  },
  {
    id: 'actions',
    cell: ({ row }) => h(UsersTableActions, { row }),
  },
] satisfies ColumnDef<User>[]

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
