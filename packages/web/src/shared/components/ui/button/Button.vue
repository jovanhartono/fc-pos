<script setup lang="ts">
import { LoaderIcon } from 'lucide-vue-next'
import type { PrimitiveProps } from 'reka-ui'
import { Primitive } from 'reka-ui'
import { type HTMLAttributes, useAttrs } from 'vue'
import { cn } from '@/shared/utils'
import type { ButtonVariants } from '.'
import { buttonVariants } from '.'

interface Props extends PrimitiveProps {
  variant?: ButtonVariants['variant']
  size?: ButtonVariants['size']
  class?: HTMLAttributes['class']
  loading?: boolean
}

const attrs = useAttrs()

const { as = 'button', loading = false, ...props } = defineProps<Props>()
</script>

<template>
  <Primitive
    data-slot="button"
    :as="as"
    :as-child="asChild"
    :disabled="loading || attrs.disabled"
    :class="cn(buttonVariants({ variant, size }), props.class)"
  >
    <slot />
    <span v-if="loading" class="absolute inset-y-0 end-0 flex items-center justify-center px-4">
      <LoaderIcon class="size-4 animate-spin" />
    </span>
  </Primitive>
</template>
