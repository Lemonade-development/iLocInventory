import { ref } from 'vue'

const AUTO_PRINT_KEY = 'iloc-auto-print'

function readStoredAutoPrint(): boolean {
  try {
    return localStorage.getItem(AUTO_PRINT_KEY) === 'true'
  } catch {
    // localStorage no disponible
    return false
  }
}

// Preferencia de este equipo: no viaja en el respaldo porque depende de la impresora local.
const autoPrint = ref<boolean>(readStoredAutoPrint())

/** Impresión automática del comprobante al registrar una operación. */
export function usePrintSettings() {
  function setAutoPrint(next: boolean): void {
    autoPrint.value = next
    try {
      localStorage.setItem(AUTO_PRINT_KEY, String(next))
    } catch {
      // localStorage no disponible
    }
  }

  return { autoPrint, setAutoPrint }
}
