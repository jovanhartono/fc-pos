<script setup lang="ts">
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
import { POSTStoreSchema } from '@/shared/validation'
import { useForm, type FormOptions } from 'vee-validate'
import type z from 'zod'

type StoreForm = z.infer<typeof POSTStoreSchema>
type StoreFormProps = FormOptions<StoreForm> & {
  type: 'post' | 'put'
}
const props = defineProps<StoreFormProps>()
const emit = defineEmits<{
  submit: [data: StoreForm]
}>()

const { handleSubmit, isSubmitting } = useForm({
  ...props,
  validationSchema: POSTStoreSchema,
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
            maxlength="3"
            placeholder="Store Code"
            v-bind="componentField"
          />
        </FormControl>
        <FormDescription v-if="type === 'put'"> Code can't be edited </FormDescription>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel asterisk> Name </FormLabel>
        <FormControl>
          <Input placeholder="Store Name" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="phone_number">
      <FormItem>
        <FormLabel asterisk> Phone Number </FormLabel>
        <FormControl>
          <Input
            placeholder="Phone Number"
            v-model.phone="componentField.modelValue"
            v-bind="componentField"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="address">
      <FormItem>
        <FormLabel asterisk> Address </FormLabel>
        <FormControl>
          <Textarea placeholder="Address" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="latitude">
      <FormItem>
        <FormLabel asterisk> Latitude </FormLabel>
        <FormControl>
          <Input placeholder="Latitude" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="longitude">
      <FormItem>
        <FormLabel asterisk> Longitude </FormLabel>
        <FormControl>
          <Input placeholder="Longitude" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ value, handleChange }" name="is_active">
      <FormItem class="flex flex-row items-center justify-between rounded-lg border p-4">
        <div class="space-y-0.5">
          <FormLabel class="text-base"> Activation Status </FormLabel>
          <FormDescription> Activate store to create orders. </FormDescription>
        </div>
        <FormControl>
          <Switch :model-value="value" @update:model-value="handleChange" />
        </FormControl>
      </FormItem>
    </FormField>

    <Button :loading="isSubmitting" size="lg" type="submit" class="w-full mt-3"> Submit </Button>
  </form>
</template>
