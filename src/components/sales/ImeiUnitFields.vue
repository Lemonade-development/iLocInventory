<script setup lang="ts">
import { IMEI_MAX_LENGTH, normalizeImei, type ImeiDraft } from '@/utils/imei'

defineProps<{
  units: ImeiDraft[]
  /** Texto del primer campo cuando el teléfono entra en permuta. */
  received?: boolean
}>()

function onInput(unit: ImeiDraft, field: 'imei' | 'imei2', event: Event) {
  unit[field] = normalizeImei((event.target as HTMLInputElement).value)
}
</script>

<template>
  <div class="space-y-3">
    <div v-for="(unit, index) in units" :key="index" class="space-y-1.5">
      <p v-if="units.length > 1" class="text-xs font-medium text-zinc-400">Unidad {{ index + 1 }}</p>
      <label class="block">
        <span class="mb-0.5 block text-xs text-zinc-500">
          IMEI<span v-if="received"> recibido</span> *
        </span>
        <input
          :value="unit.imei"
          inputmode="numeric"
          :maxlength="IMEI_MAX_LENGTH"
          autocomplete="off"
          placeholder="Solo números"
          class="w-full rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm tracking-wide text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          @input="onInput(unit, 'imei', $event)"
        />
      </label>
      <label v-if="unit.showImei2" class="block">
        <span class="mb-0.5 block text-xs text-zinc-500">IMEI 2</span>
        <input
          :value="unit.imei2"
          inputmode="numeric"
          :maxlength="IMEI_MAX_LENGTH"
          autocomplete="off"
          placeholder="Opcional"
          class="w-full rounded-lg border border-border bg-surface px-3 py-1.5 font-mono text-sm tracking-wide text-zinc-100 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          @input="onInput(unit, 'imei2', $event)"
        />
      </label>
      <button
        v-else
        type="button"
        class="text-xs font-medium text-accent hover:underline"
        @click="unit.showImei2 = true"
      >
        Agregar IMEI 2
      </button>
    </div>
  </div>
</template>
