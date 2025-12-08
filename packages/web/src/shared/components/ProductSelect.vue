<script setup lang="ts">
import type { ComponentFieldBindingObject } from 'vee-validate'
import { FormControl, FormItem, FormLabel, FormMessage } from './ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectTrigger,
  SelectItem,
  SelectValue,
} from './ui/select'
import { useQuery } from '@tanstack/vue-query'
import { rpc } from '@/core/rpc'
import { parseResponse } from 'hono/client'

const props = defineProps<ComponentFieldBindingObject>()

const { data: products } = useQuery({
  queryKey: ['products'],
  queryFn: () => parseResponse(rpc.api.admin.products.$get()),
  select: (res) => res.data,
})
</script>

<template>
  <FormItem>
    <FormLabel asterisk>Product</FormLabel>

    <Select v-bind="props">
      <FormControl>
        <SelectTrigger class="w-full">
          <SelectValue placeholder="Select product" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectGroup>
          <SelectItem v-for="product in products" :value="product.id" :key="product.id">
            {{ product.name }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <FormMessage />
  </FormItem>
</template>
