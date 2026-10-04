import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { registerSW } from 'virtual:pwa-register'
import App from './App.vue'
import router from './router'
import { useAuth } from './composables/useAuth'
import { useStorage } from './composables/useStorage'
import { useTheme } from './composables/useTheme'
import { startOfficialRateAutoRefresh } from './composables/useCurrency'
import './style.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

// Inicializa el tema (aplica preferencia guardada y escucha cambios del sistema).
useTheme()

// Dólar oficial del día (si está en automático); sin internet queda el último.
startOfficialRateAutoRefresh()

const { initialize } = useStorage()
const { init: initAuth } = useAuth()

initialize()
  .then(() => initAuth())
  .then(() => {
    app.mount('#app')
  })

registerSW({
  onNeedRefresh() {
    if (confirm('Nueva versión disponible. ¿Actualizar ahora?')) {
      window.location.reload()
    }
  },
  onOfflineReady() {
    console.info('[PWA] App lista para uso offline')
  },
})