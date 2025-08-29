<script setup lang="ts">
import { ChevronsUpDown, LogOut } from 'lucide-vue-next'

import { SidebarFooter, useSidebar, SidebarMenuButton } from '@/shared/components/ui/sidebar'
import { useAuth } from '@/core/stores/auth-store'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/components/ui/dropdown-menu'
import { storeToRefs } from 'pinia'

const authStore = useAuth()
const { user } = storeToRefs(authStore)

const { isMobile } = useSidebar()

function onSelect() {
  authStore.logout()
}
</script>

<template>
  <SidebarFooter>
    <DropdownMenu>
      <DropdownMenuTrigger as-child>
        <SidebarMenuButton
          size="lg"
          class="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
        >
          <div class="grid flex-1 text-left text-sm leading-tight">
            <span class="truncate font-semibold">{{ user?.name }}</span>
            <span class="truncate text-xs">{{ user?.role }}</span>
          </div>
          <ChevronsUpDown class="ml-auto size-4" />
        </SidebarMenuButton>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        class="w-[--reka-dropdown-menu-trigger-width] min-w-56 rounded-lg"
        :side="isMobile ? 'bottom' : 'right'"
        align="end"
        :side-offset="4"
      >
        <DropdownMenuItem @select="onSelect">
          <LogOut />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </SidebarFooter>
</template>
