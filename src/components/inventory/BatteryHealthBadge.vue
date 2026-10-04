<script setup lang="ts">
import { computed } from 'vue'
import { batteryHealthBadgeClass, parseBatteryHealth } from '@/utils/product'

const props = defineProps<{
  health?: number | null
}>()

const percent = computed(() => parseBatteryHealth(props.health))
</script>

<template>
  <span
    v-if="percent !== undefined"
    class="inline-block rounded px-1.5 py-0.5 text-[10px] font-medium"
    :class="batteryHealthBadgeClass(percent)"
  >
    Bat. {{ percent }}%
  </span>
</template>
