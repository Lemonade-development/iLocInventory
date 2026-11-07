<script setup lang="ts">
import { CheckCircle, AlertCircle, Info } from 'lucide-vue-next'
import { useAppStore } from '@/stores/app'
import { storeToRefs } from 'pinia'
import { computed } from 'vue'
import { useOverlays } from '@/composables/useOverlays'

/** `aboveFab`: el botón flotante de Nueva venta está visible en la esquina. */
const props = defineProps<{ aboveFab?: boolean }>()

const appStore = useAppStore()
const { toastMessage, toastType } = storeToRefs(appStore)
const { drawerOpen, modalOpen } = useOverlays()

// Con un panel abierto el botón se corre a la izquierda y deja libre la esquina.
const raised = computed(() => props.aboveFab && !(drawerOpen.value && !modalOpen.value))
</script>

<template>
  <Teleport to="body">
    <Transition name="toast">
      <div
        v-if="toastMessage"
        class="fixed right-6 z-[60] flex items-center gap-3 rounded-lg border px-4 py-3 shadow-lg"
        :class="{
          'bottom-24': raised,
          'bottom-6': !raised,
          'border-green-800 bg-green-950 text-green-200': toastType === 'success',
          'border-red-800 bg-red-950 text-red-200': toastType === 'error',
          'border-zinc-700 bg-surface-raised text-zinc-200': toastType === 'info',
        }"
      >
        <CheckCircle v-if="toastType === 'success'" :size="18" />
        <AlertCircle v-else-if="toastType === 'error'" :size="18" />
        <Info v-else :size="18" />
        <span class="text-sm">{{ toastMessage }}</span>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}
</style>