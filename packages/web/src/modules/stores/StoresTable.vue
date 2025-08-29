<script setup lang="ts">
import { rpc } from '@/core/rpc'
import StoresTableActions from '@/modules/stores/StoresTableActions.vue'
import { Badge } from '@/shared/components/ui/badge'
import DataTable from '@/shared/components/ui/table/DataTable.vue'
import { keepPreviousData, useQuery } from '@tanstack/vue-query'
import { type ColumnDef } from '@tanstack/vue-table'
import { parseResponse, type InferResponseType } from 'hono/client'
import { h } from 'vue'

const $get = rpc.api.admin.stores.$get
export type Store = InferResponseType<typeof $get>['data'][number]
const columns = [
  {
    accessorKey: 'code',
    header: 'Code',
  },
  {
    accessorKey: 'name',
    header: 'Name',
  },
  {
    accessorKey: 'address',
    header: 'Address',
  },
  // {
  //   id: 'geolocation',
  //   header: 'Latitude/Longitude',
  //   cell: ({
  //     row: {
  //       original: { latitude, longitude },
  //     },
  //   }) => h('span', `${latitude}/${longitude}`),
  // },
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
    cell: ({ row }) => h(StoresTableActions, { row }),
  },
] satisfies ColumnDef<Store>[]

const { data, isPending } = useQuery({
  queryKey: ['stores'],
  queryFn: async () => await parseResponse($get()),
  select: (data) => data.data,
  placeholderData: keepPreviousData,
})
</script>

<template>
  <DataTable :loading="isPending" :data="data ?? []" :columns="columns" />
</template>
