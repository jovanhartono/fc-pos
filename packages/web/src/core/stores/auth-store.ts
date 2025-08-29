import { defineStore } from 'pinia'
import { computed } from 'vue'
import { jwtDecode } from 'jwt-decode'
import { useLocalStorage } from '@vueuse/core'
import type { JWTPayload } from '@fresclean/api/types/jwt'
import router from '@/router'

export const useAuth = defineStore('auth', () => {
  const token = useLocalStorage<string | null>('jwt', null)

  const user = computed(() => {
    if (!token.value) {
      return
    }

    return jwtDecode<JWTPayload>(token.value)
  })

  function setToken(tokenArgument: string) {
    token.value = tokenArgument
  }

  function logout() {
    token.value = null
    router.push({
      name: 'login',
    })
  }

  return { token: token, setToken, logout, user }
})
