<script setup lang="ts">
import { X } from 'lucide-vue-next'

defineProps<{
  title: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}>()

const open = defineModel<boolean>({ required: true })

const sizeClasses = {
  sm: 'max-w-md',
  md: 'max-w-lg',
  lg: 'max-w-2xl',
  xl: 'max-w-4xl',
}
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="open"
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div
          class="absolute inset-0 bg-black/70"
          @click="open = false"
        />
        <div
          class="relative w-full rounded-xl border border-border bg-surface-raised shadow-2xl"
          :class="sizeClasses[size ?? 'md']"
        >
          <div class="flex items-center justify-between border-b border-border px-6 py-4">
            <h2 class="text-lg font-semibold text-zinc-100">{{ title }}</h2>
            <button
              type="button"
              class="rounded-lg p-1.5 text-zinc-400 transition hover:bg-surface-overlay hover:text-zinc-100"
              @click="open = false"
            >
              <X :size="18" />
            </button>
          </div>
          <div class="max-h-[70vh] overflow-y-auto px-6 py-4">
            <slot />
          </div>
          <div v-if="$slots.footer" class="border-t border-border px-6 py-4">
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>