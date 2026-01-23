<script lang="ts" setup>
import { AsteriskIcon } from 'lucide-vue-next'
import type { LabelProps } from 'reka-ui'
import type { HTMLAttributes } from 'vue'
import { Label } from '@/shared/components/ui/label'
import { cn } from '@/shared/utils'
import { useFormField } from './useFormField'

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
