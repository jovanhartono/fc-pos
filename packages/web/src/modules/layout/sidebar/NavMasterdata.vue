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
  ScrollTextIcon,
  StoreIcon,
  TagsIcon,
  UsersIcon,
} from 'lucide-vue-next'

const masterDataMenus = [
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

const salesMenus = [
  {
    label: 'Orders',
    icon: ScrollTextIcon,
    routeName: 'orders',
  },
]
</script>

<template>
  <SidebarGroup>
    <SidebarGroupLabel>Master Data</SidebarGroupLabel>
    <SidebarGroupContent>
      <SidebarMenu>
        <SidebarMenuItem v-for="(menu, index) in masterDataMenus" :key="index">
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
  <SidebarGroup>
    <SidebarGroupLabel> Sales </SidebarGroupLabel>
    <SidebarMenu>
      <SidebarMenuItem v-for="(menu, index) in salesMenus" :key="index">
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
  </SidebarGroup>
</template>
