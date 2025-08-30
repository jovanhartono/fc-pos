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
import { POSTUserSchema } from '@/shared/validation'
import { RadioGroupItem, RadioGroupRoot } from 'reka-ui'
import { type FormOptions, useForm } from 'vee-validate'
import type z from 'zod'

const radioItems = [
  {
    label: 'Cashier',
    description: 'Create Invoice, Order',
    value: 'cashier',
  },
  {
    label: 'Worker',
    description: 'Process Order and Services',
    value: 'worker',
  },
]
type UserForm = z.infer<typeof POSTUserSchema>
const props = defineProps<FormOptions<UserForm>>()
const emit = defineEmits<{
  submit: [data: UserForm]
}>()

const { handleSubmit, isSubmitting } = useForm({
  ...props,
  validationSchema: POSTUserSchema,
})

const onSubmit = handleSubmit((data) => emit('submit', data))
</script>

<template>
  <form @submit="onSubmit" class="flex flex-col gap-y-3">
    <FormField v-slot="{ componentField }" name="username">
      <FormItem>
        <FormLabel asterisk> Username </FormLabel>
        <FormControl>
          <Input placeholder="Username" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="name">
      <FormItem>
        <FormLabel asterisk> Name </FormLabel>
        <FormControl>
          <Input placeholder="Name" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="password">
      <FormItem>
        <FormLabel asterisk> Password </FormLabel>
        <FormControl>
          <Input type="password" placeholder="Password" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="confirm_password">
      <FormItem>
        <FormLabel asterisk> Confirm Password </FormLabel>
        <FormControl>
          <Input type="password" placeholder="Confirm Password" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="role">
      <FormItem class="space-y-3">
        <FormLabel asterisk>Role</FormLabel>

        <FormControl>
          <RadioGroupRoot class="grid grid-cols-2 gap-x-3" v-bind="componentField">
            <FormItem :key="radio.value" v-for="radio in radioItems">
              <FormControl>
                <RadioGroupItem
                  :value="radio.value"
                  class="w-full relative group ring-1 ring-border rounded px-3 py-2.5 text-start data-[state=checked]:ring-black"
                >
                  <span>{{ radio.label }}</span>
                  <p className="text-xs text-muted-foreground">{{ radio.description }}</p>
                </RadioGroupItem>
              </FormControl>
            </FormItem>
          </RadioGroupRoot>
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
