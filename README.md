# iLoc Inventory

Aplicación web para llevar el inventario, las ventas y los pedidos de compra de una tienda de celulares. Funciona en el navegador, se puede instalar como aplicación y guarda todo en el propio dispositivo.

**En línea:** [lemonade-development.github.io/iLocInventory](https://lemonade-development.github.io/iLocInventory/)

## Qué hace

| Sección | Para qué sirve |
| --- | --- |
| Dashboard | Stock total, ventas del día y de la semana, ingresos y productos bajo el mínimo. |
| Inventario | Productos por categoría (celular, tablet, smartwatch, computadora, accesorio u otro), condición, salud de batería, fotos, stock mínimo y ajustes de existencias. Una base nueva arranca con el catálogo de iPhone. |
| Nueva venta | Venta con descuento, métodos de pago, IMEI, permuta, crédito con abonos, cuenta Apple y comprobante en PDF. |
| Ventas | Historial, edición, devoluciones parciales o totales, cobro de saldos e importación desde una hoja de cálculo. |
| Pedidos de compra | Órdenes a proveedores, recepción parcial o total (el stock entra al inventario) e impresión o descarga en PDF. |
| Contactos | Clientes y proveedores, con el historial ligado a cada uno. |
| Configuración | Datos de la tienda, tema, tipo de cambio, impresión, usuario, contraseña, importación y respaldos. |

Los precios se manejan en bolivianos. El equivalente en dólares usa el tipo de cambio oficial del BCB, tomado de [DolarApi](https://bo.dolarapi.com/v1/dolares/oficial). Si no hay internet, se conserva el último valor. También se puede fijar a mano.

## Dónde quedan los datos

No hay servidor ni base de datos compartida. Cada navegador tiene su propia copia:

- Inventario, ventas, contactos y pedidos se guardan en IndexedDB (Dexie).
- Las fotos de los productos se guardan en el almacenamiento del navegador.
- La contraseña no se guarda en texto plano: se deriva con PBKDF2 y queda en ese mismo navegador.
- El candado protege los datos de ese navegador. Quien abra la dirección en otro equipo empieza con una base vacía, más el catálogo de iPhone.

Por eso conviene exportar un respaldo antes de borrar los datos del navegador o de cambiar de equipo.

En **Configuración** hay tres formas de sacar los datos:

- **Exportar todo (JSON).** Copia completa para llevarla a otra máquina e importarla ahí.
- **Carpeta de respaldo.** En Chrome o Edge se elige una carpeta (por ejemplo en iCloud Drive o Google Drive) y la app puede guardar el JSON sola. Safari y Firefox no ofrecen esa API.
- **Hojas de cálculo.** Se puede importar inventario y el historial de ventas.

## Requisitos

- [Node.js](https://nodejs.org/) 22 para desarrollar y compilar.
- Un navegador actual. Chrome o Edge aprovechan mejor las fotos locales y la carpeta de respaldo.

## Desarrollo

```bash
npm install
npm run dev
```

Vite abre la app en local. Los datos de esa dirección no se mezclan con los de la versión publicada.

| Comando | Qué hace |
| --- | --- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Comprueba los tipos y genera `dist/` para servir en la raíz del dominio. |
| `npm run preview` | Sirve el resultado de `build`. |
| `npm run build:pages` | Compila con la ruta `/iLocInventory/` y copia `index.html` a `404.html`, que es lo que GitHub Pages necesita para las rutas de la app. |
| `npm run preview:pages` | Compila para Pages y previsualiza esa versión. |

## Publicación

El repositorio ya publica en GitHub Pages. El workflow [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) se ejecuta en cada push a `main`: instala dependencias, corre `npm run build:pages` y despliega `dist/`.

La dirección publicada es [https://lemonade-development.github.io/iLocInventory/](https://lemonade-development.github.io/iLocInventory/).

Después de la primera visita la app queda disponible sin conexión. Cuando hay una versión nueva, el navegador pide confirmación para actualizar.

## Paquete para una Mac antigua

`scripts/build-portable.sh` se ejecuta en una Mac moderna. Compila la app y arma `iloc-portable.zip`. En la Mac de destino (pensada para macOS High Sierra) se descomprime y se abre `iniciar-iloc.command`. Ese script no necesita Node: usa el Python del sistema, sirve la app en `http://localhost:8080` y la abre en Chrome. El puerto va fijo para que el navegador siga encontrando los mismos datos.

## Cómo está armado

```
src/
  views/         pantallas de cada sección
  components/    piezas de interfaz, agrupadas por módulo
  composables/   estado y reglas de inventario, ventas, moneda, tema y sesión
  services/      IndexedDB, PDF, importación, catálogo y autenticación
  stores/        estado compartido con Pinia
  router/        rutas de la aplicación
```

Vue 3, TypeScript, Vite, Pinia, Vue Router, Tailwind CSS 4 y Dexie. Los PDF salen con jsPDF y las hojas de cálculo con SheetJS. El empaquetado como PWA lo hace `vite-plugin-pwa`.
