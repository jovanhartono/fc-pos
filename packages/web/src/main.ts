import '@/index.css'

import { createApp } from 'vue'
import App from './App.vue'
import router from '@/router'
import { VueQueryPlugin } from '@tanstack/vue-query'
import { DetailedError } from 'hono/client'
import { toast } from 'vue-sonner'
import { createPinia } from 'pinia'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(VueQueryPlugin, {
  queryClientConfig: {
    defaultOptions: {
      mutations: {
        onSuccess: (response: unknown) => {
          // TODO: use ReturnType<typeof success> from @fresclean/api/http
          const res = response as { message?: string }
          if (res?.message) {
            toast.success(res.message)
          }
        },
        onError: (error) => {
          if (error instanceof DetailedError) {
            toast.error(error.detail?.data?.message ?? 'Something went wrong')
          } else {
            toast.error(error.message)
          }
        },
      },
    },
  },
})
app.use(router)
app.mount('#app')
