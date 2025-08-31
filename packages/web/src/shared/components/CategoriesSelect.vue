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

const { data: categories } = useQuery({
  queryKey: ['categories'],
  queryFn: () => parseResponse(rpc.api.admin.categories.$get()),
  select: (res) => res.data,
})
</script>

<template>
  <FormItem>
    <FormLabel asterisk>Category</FormLabel>

    <Select v-bind="props">
      <FormControl>
        <SelectTrigger class="w-full">
          <SelectValue placeholder="Select category" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectGroup>
          <SelectItem v-for="category in categories" :value="category.id" :key="category.id">
            {{ category.name }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <FormMessage />
  </FormItem>
</template>
