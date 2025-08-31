<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { Badge } from '@/shared/components/ui/badge'
import DataTable from '@/shared/components/ui/table/DataTable.vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { type ColumnDef } from '@tanstack/vue-table'
import { parseResponse, type InferResponseType } from 'hono/client'
import { h } from 'vue'
import ServicesTableActions from './CategoriesTableActions.vue'

const $get = rpc.api.admin.categories.$get
export type Category = InferResponseType<typeof $get>['data'][number]
const columns = [
  {
    accessorKey: 'name',
    header: 'Category',
  },
  {
    accessorKey: 'description',
    header: 'Description',
    cell: ({ renderValue }) => h('span', renderValue() as string | undefined),
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
    cell: ({ row }) => h(ServicesTableActions, { row }),
  },
] satisfies ColumnDef<Category>[]

const { data, isPending } = useQuery({
  queryKey: ['categories'],
  queryFn: async () => await parseResponse($get()),
  select: (data) => data.data,
  placeholderData: keepPreviousData,
})
</script>

<template>
  <DataTable :loading="isPending" :data="data ?? []" :columns="columns" />
</template>
