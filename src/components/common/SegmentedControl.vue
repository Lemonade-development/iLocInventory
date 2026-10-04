<script setup lang="ts" generic="T extends string">
defineProps<{
  options: { value: T; label: string }[]
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="inline-flex rounded-lg border border-border p-0.5">
    <button
      v-for="opt in options"
      :key="opt.value"
      type="button"
      class="rounded-md px-3 py-1.5 text-sm transition"
      :class="model === opt.value ? 'bg-accent/15 text-accent' : 'text-zinc-400 hover:text-zinc-100'"
      @click="model = opt.value"
    >
      {{ opt.label }}
    </button>
  </div>
</template>
