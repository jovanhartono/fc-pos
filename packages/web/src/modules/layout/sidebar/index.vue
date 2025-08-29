<script setup lang="ts">
import { Command, LayoutDashboardIcon } from 'lucide-vue-next'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  type SidebarProps,
} from '@/shared/components/ui/sidebar'
import SidebarFooter from './SidebarFooter.vue'
import NavMasterdata from './NavMasterdata.vue'

const props = withDefaults(defineProps<SidebarProps>(), {
  variant: 'inset',
})
</script>

<template>
  <Sidebar v-bind="props">
    <SidebarHeader>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" as-child>
            <a href="#">
              <div
                class="flex aspect-square size-8 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground"
              >
                <samp></samp>
                <Command class="size-4" />
              </div>
              <div class="grid flex-1 text-left text-sm leading-tight">
                <span class="truncate font-semibold">Fresclean POS</span>
                <span class="truncate text-xs">v0.0.1</span>
              </div>
            </a>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>

    <SidebarContent>
      <SidebarGroup>
        <SidebarGroupContent>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton as-child>
                <RouterLink to="/" >
                  <span>Dashboard</span>
                  <SidebarMenuAction>
                    <LayoutDashboardIcon />
                  </SidebarMenuAction>
                </RouterLink>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarGroupContent>
      </SidebarGroup>

      <NavMasterdata />
    </SidebarContent>

    <SidebarFooter />
  </Sidebar>
</template>
