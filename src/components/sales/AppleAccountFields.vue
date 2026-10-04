<script setup lang="ts">
import { ref, useId } from 'vue'
import { Eye, EyeOff } from 'lucide-vue-next'
import type { AppleAccountDraft } from '@/utils/appleAccount'

defineProps<{
  account: AppleAccountDraft
}>()

const showPassword = ref(false)
const passwordId = useId()

function onInput(account: AppleAccountDraft, field: 'appleId' | 'password', event: Event) {
  account[field] = (event.target as HTMLInputElement).value
}
</script>

<template>
  <div class="space-y-2">
    <p class="text-sm text-zinc-400">Cuenta Apple (opcional)</p>
    <div class="grid gap-2 sm:grid-cols-2">
      <label class="block">
        <span class="mb-0.5 block text-xs text-zinc-500">Apple ID</span>
        <input
          :value="account.appleId"
          type="email"
          inputmode="email"
          autocomplete="off"
          autocapitalize="off"
          spellcheck="false"
          placeholder="correo@ejemplo.com"
          class="input-field"
          @input="onInput(account, 'appleId', $event)"
        />
      </label>
      <div>
        <label :for="passwordId" class="mb-0.5 block text-xs text-zinc-500">Contraseña</label>
        <!-- El marco del campo envuelve input y botón para que el ojo quede dentro. -->
        <div
          class="flex w-full items-center rounded-lg border border-border bg-surface-overlay transition-colors focus-within:border-accent focus-within:ring-1 focus-within:ring-accent"
        >
          <input
            :id="passwordId"
            :value="account.password"
            :type="showPassword ? 'text' : 'password'"
            autocomplete="new-password"
            autocapitalize="off"
            spellcheck="false"
            placeholder="Opcional"
            class="min-w-0 flex-1 bg-transparent py-2 pl-3 text-sm text-zinc-100 focus:outline-none"
            @input="onInput(account, 'password', $event)"
          />
          <button
            type="button"
            class="flex h-9 w-9 shrink-0 items-center justify-center text-zinc-500 hover:text-zinc-300"
            :aria-label="showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'"
            @click="showPassword = !showPassword"
          >
            <EyeOff v-if="showPassword" :size="15" />
            <Eye v-else :size="15" />
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
