<script setup lang="ts">
import CategoriesSelect from '@/shared/components/CategoriesSelect.vue'
import { Button } from '@/shared/components/ui/button'
import {
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form'
import { Input } from '@/shared/components/ui/input'
import { Switch } from '@/shared/components/ui/switch'
import { Textarea } from '@/shared/components/ui/textarea'
import { POSTServiceSchema } from '@/shared/validation'
import { useForm, type FormOptions } from 'vee-validate'
import type z from 'zod'

type ServiceForm = z.input<typeof POSTServiceSchema>
type ServiceFormProps = FormOptions<ServiceForm> & {
  type: 'post' | 'put'
}
const props = defineProps<ServiceFormProps>()
const emit = defineEmits<{
  submit: [data: z.infer<typeof POSTServiceSchema>]
}>()

const { handleSubmit, isSubmitting } = useForm({
  ...props,
  validationSchema: POSTServiceSchema,
})

const onSubmit = handleSubmit((data) => emit('submit', data))
</script>

<template>
  <form @submit="onSubmit" class="flex flex-col gap-y-3">
    <FormField v-slot="{ componentField }" name="code">
      <FormItem>
        <FormLabel asterisk> Code </FormLabel>
        <FormControl>
          <Input
            :disabled="type === 'put'"
            maxlength="4"
            placeholder="Service Code"
            v-bind="componentField"
          />
        </FormControl>
        <FormDescription v-if="type === 'put'"> Code can't be edited </FormDescription>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel asterisk> Service </FormLabel>
        <FormControl>
          <Input placeholder="Service Name" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="category_id">
      <CategoriesSelect v-bind="componentField" />
    </FormField>

    <div class="grid grid-cols-2 gap-x-3">
      <FormField v-slot="{ componentField }" name="price">
        <FormItem>
          <FormLabel asterisk> Price </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              v-model.currency="componentField.modelValue"
              placeholder="Enter price amount"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>

      <FormField v-slot="{ componentField }" name="cogs">
        <FormItem>
          <FormLabel asterisk> COGS </FormLabel>
          <FormControl>
            <Input
              v-bind="componentField"
              v-model.currency="componentField.modelValue"
              placeholder="Enter COGS amount"
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      </FormField>
    </div>

    <FormField v-slot="{ componentField }" name="description">
      <FormItem>
        <FormLabel> Description </FormLabel>
        <FormControl>
          <Textarea placeholder="Description" v-bind="componentField" />
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
