<script setup lang="ts">
import type { LabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Label } from 'reka-ui'
import { cn } from '@/shared/utils'

const { class: className, ...props } = defineProps<
  LabelProps & { class?: HTMLAttributes['class'] }
>()
</script>

<template>
  <Label
    data-slot="label"
    v-bind="props"
    :class="
      cn(
        'inline-flex items-center gap-2 text-sm leading-none font-medium select-none group-data-[disabled=true]:pointer-events-none group-data-[disabled=true]:opacity-50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50',
        className,
      )
    "
  >
    <slot />
  </Label>
</template>
