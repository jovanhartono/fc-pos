<script lang="ts" setup>
import type { LabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { cn } from '@/shared/utils'
import { Label } from '@/shared/components/ui/label'
import { useFormField } from './useFormField'
import { AsteriskIcon } from 'lucide-vue-next'

const props = defineProps<LabelProps & { class?: HTMLAttributes['class']; asterisk?: boolean }>()

const { error, formItemId } = useFormField()
</script>

<template>
  <Label
    data-slot="form-label"
    :data-error="!!error"
    :class="cn('relative data-[error=true]:text-destructive-foreground', props.class)"
    :for="formItemId"
  >
    <slot />
    <AsteriskIcon
      v-if="asterisk"
      class="absolute left-full -top-0.5 size-3 text-destructive ml-0.5"
    />
  </Label>
</template>
