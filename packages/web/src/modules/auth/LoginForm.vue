<script setup lang="ts">
import { type HTMLAttributes } from 'vue'
import { Button } from '@/shared/components/ui/button'
import { Input } from '@/shared/components/ui/input'
import { cn } from '@/shared/utils'
import { useForm } from 'vee-validate'
import { z } from 'zod'
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/shared/components/ui/form'
import { rpc } from '@/core/rpc'
import { parseResponse } from 'hono/client'
import { useMutation } from '@tanstack/vue-query'
import { toast } from 'vue-sonner'
import { useAuth } from '@/core/stores/auth-store'
import { useRouter } from 'vue-router'

const props = defineProps<{
  class?: HTMLAttributes['class']
}>()

const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
})

const { setToken } = useAuth()
const router = useRouter()
const { mutateAsync } = useMutation({
  mutationKey: ['login'],
  mutationFn: async (data: z.infer<typeof loginSchema>) =>
    await parseResponse(
      rpc.api.auth.login.$post({
        json: data,
      }),
    ),
  onSuccess: (data) => {
    if (data.message) {
      toast.success(data.message)
    }

    const token = data.data?.token
    if (token) {
      setToken(token)
      router.push('/')
    }
  },
})

const { handleSubmit, isSubmitting } = useForm({
  validationSchema: loginSchema,
  initialValues: {
    username: '',
    password: '',
  },
})

const onSubmit = handleSubmit((data) => mutateAsync(data))
</script>

<template>
  <form
    @submit="onSubmit"
    :class="cn('flex flex-col gap-6 border rounded-md p-4 shadow', props.class)"
  >
    <h1 class="text-2xl font-bold">Login</h1>
    <FormField v-slot="{ componentField }" name="username" class="grid gap-6">
      <FormItem>
        <FormLabel asterisk>Username</FormLabel>
        <FormControl>
          <Input placeholder="Username" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <FormField v-slot="{ componentField }" name="password" class="grid gap-6">
      <FormItem>
        <FormLabel asterisk>Password</FormLabel>
        <FormControl>
          <Input placeholder="Password" type="password" v-bind="componentField" />
        </FormControl>
        <FormMessage />
      </FormItem>
    </FormField>
    <Button :loading="isSubmitting" type="submit" class-name="w-full"> Login </Button>
  </form>
</template>
