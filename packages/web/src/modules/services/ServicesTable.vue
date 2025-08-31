<script setup lang="ts">
import { rpc } from '@/core/rpc'
import { Badge } from '@/shared/components/ui/badge'
import DataTable from '@/shared/components/ui/table/DataTable.vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { getFilteredRowModel, type ColumnDef, type TableOptions } from '@tanstack/vue-table'
import { parseResponse, type InferResponseType } from 'hono/client'
import { h, ref } from 'vue'
import ServicesTableActions from './ServicesTableActions.vue'
import { formatIDRCurrency } from '@/shared/utils'
import { Input } from '@/shared/components/ui/input'
import { valueUpdater } from '@/shared/components/ui/table/utils'

const $get = rpc.api.admin.services.$get
export type Service = InferResponseType<typeof $get>['data'][number]
const columns = [
  {
    accessorKey: 'code',
    header: 'Code',
    cell: ({ getValue }) => h('span', { class: 'font-mono' }, getValue<string>()),
  },
  {
    accessorKey: 'name',
    header: 'Service',
    cell: ({ getValue }) => h('span', { class: 'font-medium' }, getValue<string>()),
  },
  {
    id: 'category',
    accessorKey: 'category.name',
    header: 'Category',
    cell: ({ renderValue }) => h(Badge, { variant: 'outline' }, () => renderValue<string>()),
  },
  {
    accessorKey: 'description',
    header: 'Description',
  },
  {
    id: 'price',
    header: 'Price / COGS',
    cell: ({ row }) =>
      h('div', [
        h('span', formatIDRCurrency(row.original.price)),
        h('span', ` / ${formatIDRCurrency(row.original.cogs)}`),
      ]),
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
] satisfies ColumnDef<Service>[]

const { data, isPending } = useQuery({
  queryKey: ['services'],
  queryFn: async () => await parseResponse($get()),
  select: (data) => data.data,
  placeholderData: keepPreviousData,
})

const searchFilter = ref<string>('')
const tableProps: Partial<TableOptions<Service>> = {
  getFilteredRowModel: getFilteredRowModel(),
  state: {
    get globalFilter() {
      return searchFilter.value
    },
  },
  onGlobalFilterChange: (updaterOrValue) => valueUpdater(updaterOrValue, searchFilter),
}
</script>

<template>
  <Input v-model="searchFilter" placeholder="Search" class="max-w-md" />
  <DataTable :loading="isPending" :data="data ?? []" :columns="columns" :table-props="tableProps" />
</template>
