<script setup lang="ts">
import { Button } from '@/shared/components/ui/button'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { Textarea } from '@/shared/components/ui/textarea'
import { POSTCategorySchema } from '@/shared/validation'
import { useForm, type FormOptions } from 'vee-validate'
import type z from 'zod'

type ServiceForm = z.input<typeof POSTCategorySchema>
type ServiceFormProps = FormOptions<ServiceForm>
const props = defineProps<ServiceFormProps>()
const emit = defineEmits<{
  submit: [data: z.infer<typeof POSTCategorySchema>]
}>()

const { handleSubmit, isSubmitting } = useForm({
  ...props,
  validationSchema: POSTCategorySchema,
})

const onSubmit = handleSubmit((data) => emit('submit', data))
</script>

<template>
  <form @submit="onSubmit" class="flex flex-col gap-y-3">
    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel asterisk> Name </FormLabel>
        <FormControl>
          <Input placeholder="Category Name" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="description">
      <FormItem>
        <FormLabel> Description </FormLabel>
        <FormControl>
          <Textarea placeholder="Category Description" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="is_active">
      <FormItem class="flex flex-row items-center justify-between rounded-lg border p-4">
        <div class="space-y-0.5">
          <FormLabel class="text-base"> Activation Status </FormLabel>
        </div>
        <FormControl>
          <Switch :model-value="value" @update:model-value="handleChange" />
        </FormControl>
      </FormItem>
    </FormField>

    <Button :loading="isSubmitting" size="lg" type="submit" class="w-full mt-3"> Submit </Button>
  </form>
</template>
