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
import { Textarea } from '@/shared/components/ui/textarea'
import { POSTStoreSchema } from '@/shared/validation'
import { useForm, type FormOptions } from 'vee-validate'
import type z from 'zod'

type StoreForm = z.infer<typeof POSTStoreSchema>
const props = defineProps<FormOptions<StoreForm>>()
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
          <Input maxlength="3" placeholder="Store Code" v-bind="componentField" />
        </FormControl>
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

    <Button :loading="isSubmitting" size="lg" type="submit" class="w-full mt-3"> Submit </Button>
  </form>
</template>
