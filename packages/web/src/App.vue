<script setup lang="ts">
import { VueQueryDevtools } from '@tanstack/vue-query-devtools'
import { defineAsyncComponent } from 'vue'
import 'vue-sonner/style.css'

const GlobalDialog = defineAsyncComponent(
  () => import('./shared/components/ui/dialog/GlobalDialog.vue'),
)
const Toaster = defineAsyncComponent(() => import('../src/shared/components/ui/sonner/Sonner.vue'))
</script>

<template>
  <Toaster richColors position="top-right" class="pointer-events-auto" />
  <GlobalDialog />
  <VueQueryDevtools />
  <main class="flex flex-col min-h-dvh h-full">
    <RouterView />
  </main>
</template>
