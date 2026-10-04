<script setup lang="ts">
import { ref } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import type { AppleAccount } from '@/types'

defineProps<{
  account: AppleAccount
}>()

const showPassword = ref(false)
</script>

<template>
  <dl class="space-y-1 text-sm">
    <div class="flex items-center justify-between gap-3">
      <dt class="text-zinc-500">Apple ID</dt>
      <dd class="min-w-0 truncate text-zinc-200 select-all">{{ account.appleId }}</dd>
    </div>
    <div v-if="account.password" class="flex items-center justify-between gap-3">
      <dt class="text-zinc-500">Contraseña</dt>
      <dd class="flex min-w-0 items-center gap-2">
        <span class="truncate font-mono text-zinc-200" :class="{ 'select-all': showPassword }">
          {{ showPassword ? account.password : '••••••••' }}
        </span>
        <button
          type="button"
          class="flex shrink-0 items-center gap-1 text-xs text-zinc-400 hover:text-accent"
          @click="showPassword = !showPassword"
        >
          <EyeOff v-if="showPassword" :size="13" />
          <Eye v-else :size="13" />
          {{ showPassword ? 'Ocultar' : 'Mostrar' }}
        </button>
      </dd>
    </div>
  </dl>
</template>
