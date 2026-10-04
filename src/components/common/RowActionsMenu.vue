<script setup lang="ts">
import { nextTick, onMounted, onUnmounted, ref, type Component } from 'vue'
import { MoreVertical } from 'lucide-vue-next'

export interface RowAction {
  key: string
  label: string
  icon: Component
  /** Acción destructiva: texto rojo y separador arriba. */
  danger?: boolean
}

defineProps<{
  items: RowAction[]
}>()

const emit = defineEmits<{
  select: [key: string]
}>()

const open = ref(false)
const buttonRef = ref<HTMLElement | null>(null)
const menuRef = ref<HTMLElement | null>(null)
const position = ref({ top: 0, left: 0 })

// El menú va en <body> con posición fija: así la tabla con scroll horizontal no lo recorta.
async function toggle() {
  if (open.value) {
    open.value = false
    return
  }
  const rect = buttonRef.value?.getBoundingClientRect()
  if (!rect) return
  position.value = { top: rect.bottom + 4, left: rect.left }
  open.value = true
  await nextTick()
  // Se mide ya dibujado: si no entra abajo o a la derecha, se acomoda.
  const menu = menuRef.value?.getBoundingClientRect()
  if (!menu) return
  const top =
    rect.bottom + 4 + menu.height > window.innerHeight - 8 ? rect.top - menu.height - 4 : rect.bottom + 4
  const left = Math.min(rect.left, window.innerWidth - menu.width - 8)
  position.value = { top: Math.max(top, 8), left: Math.max(left, 8) }
}

function close() {
  open.value = false
}

function onClickOutside(event: MouseEvent) {
  if (!open.value) return
  const target = event.target as Node
  if (buttonRef.value?.contains(target) || menuRef.value?.contains(target)) return
  close()
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') close()
}

function run(key: string) {
  close()
  emit('select', key)
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  document.addEventListener('keydown', onKeydown)
  window.addEventListener('scroll', close, true)
  window.addEventListener('resize', close)
})
onUnmounted(() => {
  document.removeEventListener('mousedown', onClickOutside)
  document.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('resize', close)
})
</script>

<template>
  <div class="inline-flex" @click.stop>
    <button
      ref="buttonRef"
      type="button"
      class="rounded-lg p-1.5 text-zinc-500 transition hover:bg-surface-overlay hover:text-zinc-200"
      :class="{ 'bg-surface-overlay text-zinc-200': open }"
      title="Acciones"
      aria-haspopup="menu"
      :aria-expanded="open"
      @click="toggle"
    >
      <MoreVertical :size="16" />
    </button>

    <Teleport to="body">
      <div
        v-if="open"
        ref="menuRef"
        role="menu"
        class="fixed z-40 w-48 overflow-hidden rounded-lg border border-border bg-surface-raised py-1 shadow-xl"
        :style="{ top: `${position.top}px`, left: `${position.left}px` }"
      >
        <template v-for="(item, index) in items" :key="item.key">
          <div v-if="item.danger && index > 0 && !items[index - 1]?.danger" class="my-1 border-t border-border" />
          <button
            type="button"
            role="menuitem"
            class="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition"
            :class="
              item.danger
                ? 'text-danger hover:bg-danger/10'
                : 'text-zinc-300 hover:bg-surface-overlay hover:text-accent'
            "
            @click="run(item.key)"
          >
            <component :is="item.icon" :size="15" :class="item.danger ? '' : 'text-zinc-400'" />
            {{ item.label }}
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>
