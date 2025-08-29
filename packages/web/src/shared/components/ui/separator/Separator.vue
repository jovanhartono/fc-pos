<script setup lang="ts">
import type { SeparatorProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Separator } from 'reka-ui'
import { cn } from '@/shared/utils'

const {
  class: className,
  orientation = 'horizontal',
  decorative = true,
  ...props
} = defineProps<SeparatorProps & { class?: HTMLAttributes['class'] }>()
</script>

<template>
  <Separator
    data-slot="separator-root"
    :orientation="orientation"
    :decorative="decorative"
    v-bind="props"
    :class="
      cn(
        `bg-border shrink-0 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px`,
        className,
      )
    "
  />
</template>
