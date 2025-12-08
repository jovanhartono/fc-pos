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
import { POSTOrderSchema } from '@fresclean/api/schema'
import { useForm, useFieldArray, type FormOptions } from 'vee-validate'
import type z from 'zod'
import CustomerSelect from '@/shared/components/CustomerSelect.vue'
import ProductSelect from '@/shared/components/ProductSelect.vue'
import ServiceSelect from '@/shared/components/ServiceSelect.vue'
import { PlusIcon, XIcon } from 'lucide-vue-next'

type OrderForm = z.input<typeof POSTOrderSchema>
type OrderFormProps = FormOptions<OrderForm>
const props = defineProps<OrderFormProps>()
const emit = defineEmits<{
  submit: [data: z.infer<typeof POSTOrderSchema>]
}>()

const { handleSubmit, isSubmitting } = useForm({
  ...props,
  validationSchema: POSTOrderSchema,
})

const {
  fields: productFields,
  push: pushProduct,
  remove: removeProduct,
} = useFieldArray('products')

const {
  fields: serviceFields,
  push: pushService,
  remove: removeService,
} = useFieldArray('services')

const addProduct = () => {
  pushProduct({ id: undefined, qty: 1, notes: '' })
}

const addService = () => {
  pushService({ id: undefined, qty: 1, notes: '' })
}

const onSubmit = handleSubmit((data) => emit('submit', data))
</script>

<template>
  <form @submit="onSubmit" class="flex flex-col gap-y-3">
    <FormField v-slot="{ componentField }" name="customer_phone">
      <FormItem>
        <FormLabel asterisk>Customer Phone</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            v-model.phone="componentField.modelValue"
            placeholder="Phone number"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="customer_name">
      <FormItem>
        <FormLabel asterisk>Customer Name</FormLabel>
        <FormControl>
          <Input v-bind="componentField" placeholder="Customer Name" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <!-- Products Section -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <label class="text-sm font-medium">Products</label>
        <Button type="button" variant="ghost" size="sm" @click="addProduct">
          Add Product <PlusIcon />
        </Button>
      </div>

      <div
        v-for="(field, index) in productFields"
        :key="field.key"
        class="space-y-2 border rounded p-3 relative"
      >
        <Button
          type="button"
          variant="destructive"
          size="icon"
          @click="removeProduct(index)"
          class="absolute -right-2 -top-2"
        >
          <XIcon class="size-4" />
          <span class="sr-only">Remove product</span>
        </Button>

        <div class="flex-1 space-y-2">
          <div class="flex gap-x-2">
            <FormField :name="`products.${index}.id`" v-slot="{ componentField }">
              <ProductSelect class="grow" v-bind="componentField" />
            </FormField>

            <FormField :name="`products.${index}.qty`" v-slot="{ componentField }">
              <FormItem>
                <FormLabel asterisk>Qty</FormLabel>
                <FormControl>
                  <Input
                    class="w-16"
                    type="number"
                    min="1"
                    placeholder="Quantity"
                    v-bind="componentField"
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            </FormField>
          </div>

          <FormField :name="`products.${index}.notes`" v-slot="{ componentField }">
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea :rows="2" placeholder="Optional notes" v-bind="componentField" />
              </FormControl>
              <FormMessage />
            </FormItem>
          </FormField>
        </div>
      </div>
    </div>

    <!-- Services Section -->

    <FormField v-slot="{ componentField }" name="discount">
      <FormItem>
        <FormLabel asterisk>Discount Amount</FormLabel>
        <FormControl>
          <Input
            v-bind="componentField"
            v-model.currency="componentField.modelValue"
            placeholder="Enter discount amount"
          />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <FormField v-slot="{ componentField }" name="notes">
      <FormItem>
        <FormLabel>Notes</FormLabel>
        <FormControl>
          <Textarea placeholder="Order notes" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>

    <Button :loading="isSubmitting" size="lg" type="submit" class="w-full mt-3"> Submit </Button>
  </form>
</template>
