<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import AppSidebar from './AppSidebar.vue'
import GlobalSearch from './GlobalSearch.vue'
import ToastNotification from './ToastNotification.vue'
import { useStorage } from '@/composables/useStorage'
import { useStoreInfo } from '@/composables/useStoreInfo'
import LoadingSpinner from './LoadingSpinner.vue'
import NewSaleButton from './NewSaleButton.vue'

const route = useRoute()
const { ready, loading } = useStorage()
const { displayName } = useStoreInfo()

const pageTitle = computed(() => (route.meta.title as string) ?? displayName())
// Pantallas donde no se muestra el atajo de Nueva venta (incluida la propia Nueva venta).
const HIDE_NEW_SALE_BUTTON = new Set(['sales', 'sales-history', 'inventory', 'settings'])
const showNewSaleButton = computed(() => !HIDE_NEW_SALE_BUTTON.has(String(route.name)))
</script>

<template>
  <div v-if="!ready && loading" class="flex h-screen items-center justify-center bg-surface">
    <LoadingSpinner size="lg" label="Inicializando base de datos local..." />
  </div>

  <div v-else class="flex h-screen overflow-hidden bg-surface">
    <AppSidebar />

    <div class="flex min-w-0 flex-1 flex-col">
      <header
        class="flex h-14 shrink-0 items-center justify-between gap-4 border-b border-border bg-surface-raised px-6"
      >
        <h1 class="text-lg font-semibold text-zinc-100">{{ pageTitle }}</h1>
        <div class="flex items-center gap-4">
          <GlobalSearch />
        </div>
      </header>

      <!-- Con el botón visible, espacio extra abajo para que no tape la paginación ni el final de la página. -->
      <main class="flex-1 overflow-y-auto p-6" :class="{ 'pb-24': showNewSaleButton }">
        <slot />
      </main>

      <Transition name="fab">
        <NewSaleButton v-if="showNewSaleButton" />
      </Transition>
    </div>

    <!-- El aviso también va abajo a la derecha: con el botón visible, se apila encima de él. -->
    <ToastNotification :above-fab="showNewSaleButton" />
  </div>
</template>
<style scoped>
.fab-enter-active,
.fab-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.fab-enter-from,
.fab-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
