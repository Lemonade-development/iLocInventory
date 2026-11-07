import { computed, onScopeDispose, reactive, watch } from 'vue'

/**
 * Registro de capas abiertas (paneles de detalle y modales), compartido por toda la app.
 * Lo usa el botón flotante de Nueva venta para acompañar al panel lateral y para
 * quedar por debajo de cualquier modal.
 */
type OverlayKind = 'drawer' | 'modal'

const counts = reactive<Record<OverlayKind, number>>({ drawer: 0, modal: 0 })

/** Cuenta la capa como abierta mientras `isOpen()` sea verdadero (o hasta desmontarse). */
export function trackOverlay(kind: OverlayKind, isOpen: () => boolean) {
  let counted = false
  const set = (open: boolean) => {
    if (open === counted) return
    counted = open
    counts[kind] += open ? 1 : -1
  }
  watch(isOpen, set, { immediate: true })
  onScopeDispose(() => set(false))
}

export function useOverlays() {
  return {
    drawerOpen: computed(() => counts.drawer > 0),
    modalOpen: computed(() => counts.modal > 0),
  }
}
