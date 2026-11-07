<script setup lang="ts">
import { computed } from 'vue'
import { RouterLink } from 'vue-router'
import { ShoppingCart } from 'lucide-vue-next'
import { useOverlays } from '@/composables/useOverlays'

const { drawerOpen, modalOpen } = useOverlays()

// Con un panel de detalle abierto (y sin modal encima), el botón acompaña al panel:
// se coloca a su izquierda y por encima del fondo oscuro.
const besideDrawer = computed(() => drawerOpen.value && !modalOpen.value)
</script>

<template>
  <!--
    Atajo flotante a Nueva venta, abajo a la derecha.
    - Normal: z-30, por debajo de modales y paneles (z-50) y del aviso (z-60).
    - Con panel abierto: se desplaza el ancho del panel (max-w-md = 28rem) y sube a z-[55].
      En pantallas angostas el panel ocupa casi todo el ancho, así que ahí se oculta.
    - Con un modal abierto: vuelve a z-30 y queda tapado por el fondo del modal.
  -->
  <RouterLink
    :to="{ name: 'sales' }"
    class="fixed bottom-6 flex items-center gap-2 rounded-full bg-accent px-5 py-3 text-sm font-medium text-white shadow-lg shadow-black/30 transition-[right,background-color] duration-[250ms] ease-out hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-surface"
    :class="besideDrawer ? 'right-[calc(28rem+1.5rem)] z-[55] max-md:hidden' : 'right-6 z-30'"
    aria-label="Nueva venta"
  >
    <ShoppingCart :size="18" />
    Nueva venta
  </RouterLink>
</template>
