<script setup lang="ts">
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/shared/components/ui/sidebar'
import {
  CogIcon,
  CreditCardIcon,
  PackageIcon,
  StoreIcon,
  TagsIcon,
  UsersIcon,
} from 'lucide-vue-next'

const menus = [
  {
    label: 'Users',
    icon: UsersIcon,
    routeName: 'users',
  },
  {
    label: 'Stores',
    icon: StoreIcon,
    routeName: 'stores',
  },
  {
    label: 'Categories',
    icon: TagsIcon,
    routeName: 'categories',
  },
  {
    label: 'Services',
    icon: CogIcon,
    routeName: 'services',
  },
  {
    label: 'Products',
    icon: PackageIcon,
    routeName: 'products',
  },
  {
    label: 'Payment Methods',
    icon: CreditCardIcon,
    routeName: 'payment-methods',
  },
]
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>Master Data</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="(menu, index) in menus" :key="index">
          <SidebarMenuButton as-child>
            <RouterLink
              :to="{
                name: menu.routeName,
              }"
            >
              <span>{{ menu.label }}</span>
              <SidebarMenuAction>
                <component :is="menu.icon" />
              </SidebarMenuAction>
            </RouterLink>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarGroupContent>
  </SidebarGroup>
</template>
