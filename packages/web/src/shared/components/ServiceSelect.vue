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

const { data: services } = useQuery({
  queryKey: ['services'],
  queryFn: () => parseResponse(rpc.api.admin.services.$get()),
  select: (res) => res.data,
})
</script>

<template>
  <FormItem>
    <FormLabel asterisk>Service</FormLabel>

    <Select v-bind="props">
      <FormControl>
        <SelectTrigger class="w-full">
          <SelectValue placeholder="Select service" />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectGroup>
          <SelectItem v-for="service in services" :value="service.id" :key="service.id">
            {{ service.name }}
          </SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
    <FormMessage />
  </FormItem>
</template>
