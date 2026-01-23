<script setup lang="ts">
import { useQuery } from '@tanstack/vue-query'
import { parseResponse } from 'hono/client'
import type { ComponentFieldBindingObject } from 'vee-validate'
import { rpc } from '@/core/rpc'
import { FormControl, FormItem, FormLabel, FormMessage } from './ui/form'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from './ui/select'

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
