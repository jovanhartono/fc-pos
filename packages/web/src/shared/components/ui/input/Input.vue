<script setup lang="ts">
import { cn, formatIDRCurrency, getNumericValue } from '@/shared/utils'
import type { ClassValue } from 'clsx'
import { AsYouType } from 'libphonenumber-js'
import { computed, readonly, useAttrs } from 'vue'

const attrs = useAttrs()

const [modelValue, modifiers] = defineModel<string, 'phone' | 'currency'>({
  default: '',
  set(value) {
    if (modifiers.phone) {
      return new AsYouType('ID').input(value)
    }

    if (modifiers.currency) {
      return formatIDRCurrency(value)
    }

    return value
  },
})

const numericValue = computed(() => {
  if (modifiers.currency) {
    return getNumericValue(modelValue.value)
  }
  return modelValue.value
})

// Expose numeric value to parent
defineExpose({
  numericValue: readonly(numericValue),
})
</script>

<template>
  <input
    autocomplete="off"
    v-model="modelValue"
    data-slot="input"
    :placeholder="modifiers.currency ? '0' : (attrs.placeholder as string | undefined)"
    :class="
      cn(
        'file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex h-10 w-full min-w-0 rounded-md border bg-transparent px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
        'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
        attrs.class as ClassValue,
      )
    "
  />
</template>
