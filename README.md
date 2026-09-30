# nodejs-sandbox

AI practice lab for Node.js/React developers: a simple monorepo (product catalog +
cart) designed as a sandbox for exercising AI prompts and tools on a real codebase.

## Structure

```
.
├── .devcontainer/       # devcontainer.json + post-create.sh (do not modify)
├── server/              # Express + SQLite API (better-sqlite3)
│   ├── src/
│   │   ├── db/          # SQLite connection + reproducible seed
│   │   ├── routes/      # /api/products, /api/orders
│   │   └── index.js     # server entrypoint
│   └── data/            # app.db (generated, not versioned)
└── client/              # React + Vite: catalog and cart
    └── src/
        └── App.jsx
```

## Requirements

- Node.js 20.x (already provided by the devcontainer)
- npm

## Starting the environment

If you're using the devcontainer, `postCreateCommand` already runs `npm install` in
`server/` and `client/` automatically when the container is created.

If you're outside the devcontainer, install the dependencies manually:

```bash
cd server && npm install
cd ../client && npm install
```

## Before you start

The first time you open the Codespace, `git status` will show
`server/src/routes/products.js` as modified and staged (without a commit).
This is intentional — it's the starting state for Challenge 2 in the manual.
Don't discard it with `git restore` or `git checkout`: it's part of the
exercise, not an environment error.

## Seeding synthetic data

The server needs the database seeded before it can serve `/api/products`.
The seed is deterministic (same numeric seed on every run ⇒ the same ~500
synthetic products, with no real customer data).

If you're using the devcontainer, `postCreateCommand` already runs the seed
automatically when the container is created, so you shouldn't need to do
anything.

### Troubleshooting: empty catalog

If `/api/products` returns an empty list, seed the database manually:

```bash
cd server
npm run seed
```

This creates/recreates `server/data/app.db` with the `products` table populated.

## Running the server (API)

```bash
cd server
npm run dev
```

Runs on `http://localhost:3000`.

- `GET /api/products` — lists products (`id`, `name`, `category`, `price`, `stock`).
  Accepts `?category=<name>` to filter.
- `POST /api/orders` — creates an order. Body:
  ```json
  { "items": [{ "productId": 1, "quantity": 2 }] }
  ```
- `GET /api/health` — health check.

## Running the client (React)

In another terminal:

```bash
cd client
npm run dev
```

Runs on `http://localhost:5173`. The client uses a Vite proxy (`/api` →
`http://localhost:3000`), so make sure the server is running first.

## Locators for testing

The catalog/cart view exposes accessible locators (`getByRole`, `getByLabel`)
and `data-testid` on key elements: category filter (`category-filter`), product
list (`product-list`), add-to-cart buttons (`add-to-cart-<id>`), cart (`cart`),
cart items (`cart-item-<id>`), total (`cart-total`), and checkout button
(`checkout-button`).



## Desafío 1 — Bug del stock en el carrito

### Causa raíz
En `client/src/App.jsx`, la función `addToCart` validaba el stock con `existing.quantity > product.stock`. La comparación se hacía **antes** de incrementar la cantidad, así que cuando la cantidad en el carrito era igual al stock, la condición daba `false` y se permitía agregar una unidad más (stock + 1) sin advertencia. En el siguiente clic la condición sí se cumplía y la función salía sin hacer nada y sin ningún mensaje, por eso no aparecía nada en la consola ni en el servidor.

Además, el contador "Stock" en pantalla mostraba siempre el stock original: no descontaba lo que ya estaba en el carrito, y después de confirmar una compra no se actualizaba hasta recargar la página.

### Impacto de extremo a extremo
Un carrito con stock + 1 **no puede completar una orden**. `POST /api/orders` (`server/src/routes/orders.js`) valida el stock de todos los items dentro de una transacción, antes de cualquier escritura: si alguno excede el stock, responde 400 ("Stock insuficiente para el producto X"), no crea la orden y no modifica el stock. Por lo tanto no hay riesgo para los datos; el problema es de UX: el usuario arma un pedido inválido y recién se entera al confirmar la compra.

Conclusión: la corrección corresponde al cliente. El servidor ya actúa como red de seguridad y no se modificó.

### Corrección aplicada
Todos los cambios están en `client/src/App.jsx`:
- La validación de `addToCart` se cambió a `existing.quantity + 1 > product.stock`. Es equivalente a `>=`, pero se eligió esta forma porque expresa la intención: "si agrego una unidad más, ¿supero el stock?".
- El contador muestra el stock disponible (stock menos la cantidad en el carrito). Al llegar al límite, el botón se deshabilita y muestra "Máximo alcanzado".
- Tras un checkout exitoso, el stock se descuenta localmente de inmediato y la lista se recarga en segundo plano desde el servidor para confirmar el valor real, sin ocultar la lista ni perder la posición del scroll.

### Verificación
Pasos de reproducción, ejecutados antes y después de la corrección:
1. Elegir un producto con stock conocido (por ejemplo, 10).
2. Agregarlo al carrito hasta llegar exactamente a su stock.
   - Antes: permitía agregar una unidad más sin advertencia.
   - Después: el contador llega a 0, el botón se deshabilita y muestra "Máximo alcanzado".
3. Con stock 10, agregar 3 unidades y confirmar la compra.
   - Antes: tras la compra el contador volvía a 10 hasta recargar la página.
   - Después: muestra 7 de inmediato, sin parpadeo ni salto de scroll.
4. Confirmar una compra con un filtro de categoría activo: la lista se mantiene filtrada.
5. Cambiar de categoría: el estado de carga se sigue mostrando como antes.

### Revisión humana
El diagnóstico principal de la IA fue correcto: la comparación de la línea 51 permitía superar el stock en una unidad. Sin embargo, fue incompleto en varios puntos que detecté y corregí:
- Concluyó que el bug era "100% client-side" sin analizar el checkout. Le pedí revisar el impacto de extremo a extremo y confirmé con evidencia (error 400, stock sin cambios) que el servidor rechaza la orden.
- Al proponer el fix omitió el contador de stock en pantalla, que era la mitad del bug reportado.
- Sus correcciones del contador tuvieron tres problemas que no anticipó y que encontré en la verificación manual: el stock volvía al valor anterior tras la compra, la recarga hacía saltar el scroll al inicio, y el contador mostraba el valor anterior durante ~1 segundo.

Cada caso está registrado en el prompt log.

### Hallazgos fuera de alcance
Detectados durante el análisis, pero no corregidos porque no forman parte del bug reportado y cambiarían comportamiento no relacionado:
- **Stock concurrente en el carrito:** el stock de cada item se guarda al agregarlo por primera vez y no se actualiza. Si otro usuario compra el mismo producto mientras tanto, `updateQuantity` permite cantidades mayores al stock real, y el contador podría mostrar valores negativos. El servidor igual rechazaría la orden.
- **`productId` duplicados en la API:** según el análisis de la IA, si se envía directamente a `POST /api/orders` un pedido con el mismo `productId` repetido, cada entrada se valida por separado contra el stock y el total podría dejar el stock negativo. No es alcanzable desde la interfaz, porque el carrito agrupa por producto. **No verificado manualmente.**

### Comparación con la solución de referencia (`referencia-reto-1`)
- **Coincidencias:** la referencia corrige la misma causa raíz, la comparación de `addToCart` en `client/src/App.jsx:51`. Usa `existing.quantity >= product.stock`; mi solución usa `existing.quantity + 1 > product.stock`, que es equivalente con cantidades enteras.
- **Diferencias:** la referencia es un cambio de una sola línea y no modifica el contador de stock en pantalla. Mi solución además muestra el stock disponible descontando el carrito, deshabilita el botón al llegar al máximo y actualiza el contador tras un checkout exitoso, porque el bug reportado incluía que "el contador de stock en pantalla no se actualiza correctamente".
- **Qué aprendí o qué cambiaría:** la referencia prioriza el cambio mínimo, con menos código que revisar y menos riesgo de efectos secundarios. Mi solución cubre el síntoma completo, pero cada ajuste del contador introdujo un efecto secundario nuevo (salto de scroll, parpadeo del stock) que tuve que detectar y corregir. En un proyecto real, separaría la corrección de la validación (urgente y mínima) de las mejoras del contador en un segundo cambio, para revisarlas por separado.


## Prompt log

| Initial prompt | Result | Corrected prompt | Why it was corrected |
|---|---|---|---|
| [C1] Describí el bug (al llegar exactamente al stock se permite agregar una unidad más sin advertencia; después ya no agrega nada) y lo observado (sin mensajes en la consola del navegador ni en la terminal del server). Pedí hipótesis de causa raíz citando archivos y líneas, sin modificar archivos. | 🔁 Iteración. Identificó un error de desfase por uno en `client/src/App.jsx:51` (`existing.quantity > product.stock` en lugar de `>=`) y una causa secundaria: el "Stock" en pantalla no descuenta lo que ya está en el carrito. Pero concluyó que el bug era "100% client-side" sin revisar el checkout. | Antes de aplicar el fix, analizar qué pasa si el carrito con stock + 1 llega al checkout: qué valida `POST /api/orders` en `server/src/routes/orders.js`, si se crea la orden, si el stock puede quedar negativo y si la validación ocurre antes de escribir con varios productos en el carrito. Agregué la evidencia observada (error 400 "Stock insuficiente para el producto 36"). Sin modificar archivos. | La conclusión cubría solo el flujo de agregar al carrito, no el impacto de extremo a extremo que pide el manual. Además, la evidencia del checkout (error 400) mostraba que el servidor sí participa en el flujo completo. |
| [C1] Análisis del checkout: qué valida `POST /api/orders`, si se crea la orden, si el stock puede quedar negativo y si la validación es atómica con varios productos. Sin modificar archivos. | ⚠️ Sugerencia incompleta. Confirmó con citas que el servidor valida el stock dentro de una transacción antes de escribir, responde 400 y no crea la orden ni deja stock negativo (verificado recargando la página: el stock no cambió). Conclusión: sin riesgo para los datos, el problema es de UX en el cliente. Pero al ofrecer el fix solo propuso corregir la línea 51 y agregar una alerta, omitiendo el contador de stock en pantalla, que es la mitad del bug reportado. | Pedí la corrección mínima en `client/src/App.jsx` cubriendo las dos partes del bug: la condición de la línea 51 cambiada explícitamente a `existing.quantity + 1 > product.stock`, y el contador mostrando el stock disponible (descontando el carrito), con feedback visible al alcanzar el máximo. Sin modificar el servidor. Mostrar el diff antes de aplicar. | La propuesta de la IA dejaba sin corregir el contador en pantalla. Además, elegí `existing.quantity + 1 > product.stock` en lugar de `>=` porque, siendo equivalentes con enteros, expresa mejor la intención: "si agrego una unidad más, ¿supero el stock?". |
| [C1] Corrección mínima en dos partes (condición `existing.quantity + 1 > product.stock` y contador de stock disponible con feedback de máximo). Mostrar el diff antes de aplicar. | Diff correcto: aplicó la condición pedida, calculó `availableStock` para el contador y deshabilitó el botón con "Máximo alcanzado". Mencionó que no tocó `updateQuantity`, lo que sugería otra forma de cambiar la cantidad en el carrito. | Antes de aplicar, pregunté qué hace `updateQuantity`, si permite superar el stock y si `availableStock` podría quedar negativo, citando líneas. | Verificar que el mismo bug no pudiera ocurrir por otro camino (el input numérico del carrito) antes de dar el fix por completo. |
| [C1] Pregunta sobre `updateQuantity`: si permite superar el stock y si `availableStock` puede quedar negativo. | Explicó que `updateQuantity` limita la cantidad entre 1 y `item.stock`, así que en el flujo de un solo usuario no permite superar el stock. Solo con compras concurrentes (otra pestaña u otro usuario) y un cambio de categoría el contador podría quedar negativo: un caso preexistente y distinto del bug reportado. | "Déjalo fuera del diff actual. Aplica el diff tal como está." | Decisión humana de alcance: el caso concurrente no es el bug reportado y corregirlo alteraría comportamiento no relacionado. Quedó documentado como hallazgo fuera de alcance. |
| [C1] Aplicar el diff de dos partes (condición y contador de stock disponible). | ⚠️ Sugerencia incompleta. Al verificar manualmente detecté que, tras confirmar la compra, el contador volvía al stock anterior (10 en lugar de 7) hasta recargar la página, porque la lista de productos no se recargaba después del checkout. | Pedí que, tras un checkout exitoso, se recargue la lista de productos desde el servidor manteniendo el filtro de categoría, reutilizando la lógica de carga existente y sin modificar el servidor. | La corrección de la IA no cubría el estado después del checkout; lo detecté en la verificación manual, no la IA. |
| [C1] Recargar la lista de productos desde el servidor tras un checkout exitoso, manteniendo el filtro y reutilizando la lógica de carga. | ⚠️ Sugerencia incompleta. El stock se actualizó correctamente, pero la recarga activaba `loading`, que oculta la lista; al reaparecer, el scroll volvía al inicio de la página. La IA mencionó el `loading` como un efecto "aceptable", pero no anticipó el salto de scroll. | Pedí que la recarga después del checkout sea silenciosa (sin activar `loading` ni ocultar la lista) y que, si falla, conserve la lista actual, manteniendo igual la carga al cambiar de categoría. | El efecto secundario alteraba comportamiento no relacionado (la posición del scroll). Lo detecté en la verificación manual. |
| [C1] Recarga silenciosa de productos tras el checkout, sin activar `loading` y conservando la lista si falla. | ⚠️ Sugerencia incompleta. Se eliminó el salto de scroll, pero al verificar detecté que el contador mostraba el stock anterior durante ~1 segundo, porque el carrito se vaciaba antes de que terminara la recarga. | Pedí descontar localmente el stock de los productos comprados antes de vaciar el carrito (actualización optimista), manteniendo la recarga silenciosa para sincronizar con el servidor. | El contador seguía mostrando un valor incorrecto de forma transitoria, que es justamente el síntoma del bug reportado. Lo detecté en la verificación manual. |
| [C1] Actualización optimista del stock tras el checkout exitoso, antes de vaciar el carrito, manteniendo la recarga silenciosa. | Diff correcto. Verificado manualmente: stock 10, agrego 3, el contador muestra 7; al confirmar la compra sigue mostrando 7 de inmediato, sin parpadeo ni salto de scroll. No se puede superar el stock y aparece "Máximo alcanzado". | — | No fue necesario; resultado verificado manualmente. |

> Nota: varios prompts corregidos se redactaron con apoyo de Claude (chat en claude.ai) como segunda opinión, para revisar críticamente las respuestas de Claude Code. Todas las verificaciones se hicieron manualmente.
