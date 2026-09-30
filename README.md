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


## Desafío 2 — Commit y PR con IA

### Mensaje de commit
Generado por Claude Code a partir de `git diff --staged` y corregido en una iteración: la ruta real es `GET /api/products` (verificado en `server/src/index.js:17`), y agregué el porqué del cambio, que no está en el diff. Ver el commit `feat(products): agregar filtro por rango de precio en listado`.

### Descripción del PR
  Contexto

  El endpoint GET /api/products permitía listar productos con filtro opcional
  por category, pero no ofrecía forma de acotar por precio.

  Propósito

  Permitir que el cliente filtre el listado de productos por rango de precio
  (minPrice / maxPrice), solo o combinado con el filtro existente de category.

  Cambios realizados

  - Se agregan dos consultas preparadas nuevas:
    - SELECT_BY_PRICE_RANGE: filtra por price BETWEEN ? AND ?.
    - SELECT_BY_CATEGORY_AND_PRICE_RANGE: filtra por category = ? y price 
  BETWEEN ? AND ?.
  - El handler de GET / (montado en /api/products) ahora lee minPrice y maxPrice
  de req.query, además de category.
  - min toma Number(minPrice) si viene definido, si no 0. max toma
  Number(maxPrice) si viene definido, si no Number.MAX_SAFE_INTEGER.
  - Se elige la consulta según combinación de category y hasPriceRange (si vino
  minPrice o maxPrice): categoría+rango, solo rango, solo categoría, o todo
  (comportamiento previo sin cambios).
  - El resto de la lógica (cálculo de cheaperInCategory con
  COUNT_CHEAPER_IN_CATEGORY) no se modificó.

  Checklist de pruebas

  Resultados verificados con curl (todos respondieron HTTP 200):

  - GET /api/products (sin parámetros) → 500 productos (comportamiento previo
  sin cambios).
  - GET /api/products?category=Libros (sin rango de precio) → 42 productos
  (comportamiento previo sin cambios).
  - GET /api/products?minPrice=10&maxPrice=50 → 35 productos (rango inclusivo).
  - GET /api/products?category=Libros&minPrice=10&maxPrice=50 → 1 producto
  (combinación de ambos filtros).
  - GET /api/products?minPrice=50&maxPrice=10 (mínimo mayor que máximo) → 0
  productos, sin error.
  - GET /api/products?minPrice=abc (valor no numérico) → 0 productos, sin
  error 500.
  - GET /api/products?minPrice= (vacío) → 500 productos (equivale a minPrice=0,
  igual que no enviarlo).
  - GET /api/products?maxPrice= (vacío) → 0 productos (Number("") es 0, entonces
  filtra price BETWEEN 0 AND 0).
  - GET /api/products?minPrice=-10 → 500 productos (valor negativo aceptado sin
  filtrar nada, ya que actúa como mínimo por debajo de todos los precios).

  Posibles problemas / ambigüedades a revisar

  - Sin validación de tipo: minPrice/maxPrice no numéricos (ej. minPrice=abc) no
  producen error; se convierten en NaN y la consulta responde 200 con lista
  vacía.
  - min > max no se valida: no hay respuesta de error explícita; simplemente
  devuelve lista vacía (confirmado: minPrice=50&maxPrice=10 → 0 productos).
  - String vacío en minPrice y maxPrice se comportan de forma asimétrica y 
  contraintuitiva: minPrice= vacío equivale a min=0 (sin filtro real, ya que es
  el default), pero maxPrice= vacío equivale a max=0, lo que filtra todo excepto
  productos con price exactamente 0 (confirmado: 0 productos). Es decir, un
  parámetro vacío no se trata como "no enviado".
  - Un cliente no puede distinguir una entrada inválida de un rango legítimo sin
  resultados: tanto un valor no numérico (minPrice=abc) como un rango invertido
  (min > max) como un maxPrice vacío devuelven 200 con lista vacía, en vez de
  un error 400. Desde la respuesta HTTP no hay forma de diferenciar "no hay
  productos en ese rango" de "el parámetro estaba mal formado".
  - Valores negativos se aceptan sin validación (minPrice=-10): no tiene sentido
  de negocio para un precio, aunque no rompe la consulta.

### Auto-revisión
Comparé cada afirmación de la descripción con el diff y ejecuté el checklist con curl contra `GET /api/products`. La primera versión de la IA tenía tres errores que corregí con la evidencia de las pruebas:
- Usaba la categoría `electronics`, que no existe; las categorías reales están en español (se usó `Libros`).
- Dejaba abierta la posibilidad de que `minPrice=abc` produjera un error 500; en realidad responde 200 con lista vacía.
- Omitía el caso `maxPrice=` (vacío), que devuelve una lista vacía porque `Number('')` es 0.

También verifiqué que la descripción no atribuye al cambio el cálculo de `cheaperInCategory`, que ya existía antes.

Los problemas detectados en el código (falta de validación, entradas inválidas que devuelven 200 con lista vacía, parámetros vacíos con comportamiento asimétrico) se documentaron en la descripción del PR, pero no se corrigieron: el desafío consiste en describir el cambio existente, no en modificarlo.


## Desafío 3 — Optimización de GET /api/products

### Diagnóstico
`GET /api/products` presentaba un patrón **N+1**: después de obtener el listado, ejecutaba `COUNT_CHEAPER_IN_CATEGORY` una vez por cada producto para calcular `cheaperInCategory` (`server/src/routes/products.js`). Con 500 productos eran **501 consultas por request**. Según `EXPLAIN QUERY PLAN`, cada una hacía `SCAN products` (recorrido completo de la tabla), porque no existen índices aparte de la clave primaria.

### Optimización aplicada
El cálculo de `cheaperInCategory` se reemplazó por una sola consulta con la función de ventana:

`RANK() OVER (PARTITION BY category ORDER BY price) - 1`

`RANK()` asigna a cada producto 1 más la cantidad de productos de su categoría con precio estrictamente menor, y los empates reciben el mismo valor. Restando 1 se obtiene exactamente el conteo que hacía la consulta original (`price < ?`). La consulta se calcula sobre **toda la tabla**, sin los filtros de la petición, así que el valor sigue siendo sobre toda la categoría aunque se filtre por precio. Ahora se ejecutan **2 consultas por request**. No se agregó ningún índice: las mediciones no mostraron que fuera necesario.

### Evidencia antes / después
Tiempo de respuesta, promedio de 50 peticiones con `curl`:

| Caso | Antes (N+1) | Intento 1 (self-join) | Final (`RANK()`) |
|---|---|---|---|
| Sin filtros (500 productos) | 23,9 ms | 10,4 ms | **3,6 ms** |
| `category=Libros&minPrice=10&maxPrice=50` (1 producto) | 0,9 ms | 7,9 ms | **1,8 ms** |

Plan de ejecución:
- **Antes:** `COUNT_CHEAPER_IN_CATEGORY` → `SCAN products`, ejecutada 500 veces por request.
- **Después:** `CHEAPER_RANKS` → `CO-ROUTINE (subquery-2)`, `SCAN products`, `USE TEMP B-TREE FOR ORDER BY`, `SCAN (subquery-2)`: una sola pasada con un ordenamiento.

**Compensación aceptada:** el caso filtrado pasó de 0,9 ms a 1,8 ms, porque el ranking siempre recorre y ordena la tabla completa. A cambio, el caso principal es unas 6,6 veces más rápido.

### Revisión humana
- **Los datos no cambiaron:** guardé las respuestas del endpoint antes del cambio (sin filtros, por categoría, por rango de precio y combinado) y las comparé byte a byte con `cmp` después de la optimización. Las cuatro son idénticas.
- **Cuestioné el diagnóstico de la IA:** afirmaba que sin un índice el problema no se resolvería, contradiciendo su propia observación de que escanear 500 filas es barato. Pedí empezar por el cambio mínimo y medir; el índice resultó innecesario.
- **Detecté una regresión en la primera propuesta:** el self-join mejoraba el caso sin filtros, pero hacía el caso filtrado unas 9 veces más lento. La IA no había considerado ese caso; lo encontré porque medí ambos. Con esa evidencia pedí la versión con `RANK()`.
- **Invalidé mediciones contaminadas:** mientras la IA aplicaba el primer diff en dos partes, el servidor (con `--watch`) se reinició en un estado intermedio y respondió con errores `ReferenceError`. Reinicié el servidor, comprobé que respondía 200 y repetí las mediciones antes de usarlas.

### Mejora futura (fuera de alcance)
Cuando la petición filtra por `category`, el ranking podría calcularse solo sobre esa categoría, lo que seguiría siendo correcto porque se particiona por categoría. Así se reduciría el costo fijo del caso filtrado. No se aplicó porque agrega complejidad para una ganancia menor a 1 ms.


## Prompt log

| Initial prompt | Result | Corrected prompt | Why it was corrected |
|---|---|---|---|
| [D1] Describí el bug (al llegar exactamente al stock se permite agregar una unidad más sin advertencia; después ya no agrega nada) y lo observado (sin mensajes en la consola del navegador ni en la terminal del server). Pedí hipótesis de causa raíz citando archivos y líneas, sin modificar archivos. | 🔁 Iteración. Identificó un error de desfase por uno en `client/src/App.jsx:51` (`existing.quantity > product.stock` en lugar de `>=`) y una causa secundaria: el "Stock" en pantalla no descuenta lo que ya está en el carrito. Pero concluyó que el bug era "100% client-side" sin revisar el checkout. | Antes de aplicar el fix, analizar qué pasa si el carrito con stock + 1 llega al checkout: qué valida `POST /api/orders` en `server/src/routes/orders.js`, si se crea la orden, si el stock puede quedar negativo y si la validación ocurre antes de escribir con varios productos en el carrito. Agregué la evidencia observada (error 400 "Stock insuficiente para el producto 36"). Sin modificar archivos. | La conclusión cubría solo el flujo de agregar al carrito, no el impacto de extremo a extremo que pide el manual. Además, la evidencia del checkout (error 400) mostraba que el servidor sí participa en el flujo completo. |
| [D1] Análisis del checkout: qué valida `POST /api/orders`, si se crea la orden, si el stock puede quedar negativo y si la validación es atómica con varios productos. Sin modificar archivos. | ⚠️ Sugerencia incompleta. Confirmó con citas que el servidor valida el stock dentro de una transacción antes de escribir, responde 400 y no crea la orden ni deja stock negativo (verificado recargando la página: el stock no cambió). Conclusión: sin riesgo para los datos, el problema es de UX en el cliente. Pero al ofrecer el fix solo propuso corregir la línea 51 y agregar una alerta, omitiendo el contador de stock en pantalla, que es la mitad del bug reportado. | Pedí la corrección mínima en `client/src/App.jsx` cubriendo las dos partes del bug: la condición de la línea 51 cambiada explícitamente a `existing.quantity + 1 > product.stock`, y el contador mostrando el stock disponible (descontando el carrito), con feedback visible al alcanzar el máximo. Sin modificar el servidor. Mostrar el diff antes de aplicar. | La propuesta de la IA dejaba sin corregir el contador en pantalla. Además, elegí `existing.quantity + 1 > product.stock` en lugar de `>=` porque, siendo equivalentes con enteros, expresa mejor la intención: "si agrego una unidad más, ¿supero el stock?". |
| [D1] Corrección mínima en dos partes (condición `existing.quantity + 1 > product.stock` y contador de stock disponible con feedback de máximo). Mostrar el diff antes de aplicar. | Diff correcto: aplicó la condición pedida, calculó `availableStock` para el contador y deshabilitó el botón con "Máximo alcanzado". Mencionó que no tocó `updateQuantity`, lo que sugería otra forma de cambiar la cantidad en el carrito. | Antes de aplicar, pregunté qué hace `updateQuantity`, si permite superar el stock y si `availableStock` podría quedar negativo, citando líneas. | Verificar que el mismo bug no pudiera ocurrir por otro camino (el input numérico del carrito) antes de dar el fix por completo. |
| [D1] Pregunta sobre `updateQuantity`: si permite superar el stock y si `availableStock` puede quedar negativo. | Explicó que `updateQuantity` limita la cantidad entre 1 y `item.stock`, así que en el flujo de un solo usuario no permite superar el stock. Solo con compras concurrentes (otra pestaña u otro usuario) y un cambio de categoría el contador podría quedar negativo: un caso preexistente y distinto del bug reportado. | "Déjalo fuera del diff actual. Aplica el diff tal como está." | Decisión humana de alcance: el caso concurrente no es el bug reportado y corregirlo alteraría comportamiento no relacionado. Quedó documentado como hallazgo fuera de alcance. |
| [D1] Aplicar el diff de dos partes (condición y contador de stock disponible). | ⚠️ Sugerencia incompleta. Al verificar manualmente detecté que, tras confirmar la compra, el contador volvía al stock anterior (10 en lugar de 7) hasta recargar la página, porque la lista de productos no se recargaba después del checkout. | Pedí que, tras un checkout exitoso, se recargue la lista de productos desde el servidor manteniendo el filtro de categoría, reutilizando la lógica de carga existente y sin modificar el servidor. | La corrección de la IA no cubría el estado después del checkout; lo detecté en la verificación manual, no la IA. |
| [D1] Recargar la lista de productos desde el servidor tras un checkout exitoso, manteniendo el filtro y reutilizando la lógica de carga. | ⚠️ Sugerencia incompleta. El stock se actualizó correctamente, pero la recarga activaba `loading`, que oculta la lista; al reaparecer, el scroll volvía al inicio de la página. La IA mencionó el `loading` como un efecto "aceptable", pero no anticipó el salto de scroll. | Pedí que la recarga después del checkout sea silenciosa (sin activar `loading` ni ocultar la lista) y que, si falla, conserve la lista actual, manteniendo igual la carga al cambiar de categoría. | El efecto secundario alteraba comportamiento no relacionado (la posición del scroll). Lo detecté en la verificación manual. |
| [D1] Recarga silenciosa de productos tras el checkout, sin activar `loading` y conservando la lista si falla. | ⚠️ Sugerencia incompleta. Se eliminó el salto de scroll, pero al verificar detecté que el contador mostraba el stock anterior durante ~1 segundo, porque el carrito se vaciaba antes de que terminara la recarga. | Pedí descontar localmente el stock de los productos comprados antes de vaciar el carrito (actualización optimista), manteniendo la recarga silenciosa para sincronizar con el servidor. | El contador seguía mostrando un valor incorrecto de forma transitoria, que es justamente el síntoma del bug reportado. Lo detecté en la verificación manual. |
| [D1] Actualización optimista del stock tras el checkout exitoso, antes de vaciar el carrito, manteniendo la recarga silenciosa. | Diff correcto. Verificado manualmente: stock 10, agrego 3, el contador muestra 7; al confirmar la compra sigue mostrando 7 de inmediato, sin parpadeo ni salto de scroll. No se puede superar el stock y aparece "Máximo alcanzado". | — | No fue necesario; resultado verificado manualmente. |
| [D2] Pedí un mensaje de commit en Conventional Commits, en español, basado únicamente en `git diff --staged`, explicando qué cambió y por qué, sin inventar pruebas ni validaciones inexistentes y sin hacer el commit. | 🔁 Iteración. Título correcto y sin afirmaciones inventadas, pero indicaba la ruta `GET /products` en lugar de `GET /api/products`, no explicaba el porqué del cambio y omitía que los límites son inclusivos y que sin los parámetros nuevos el comportamiento no cambia. | Pedí corregir la ruta a `GET /api/products`, agregar el porqué (filtrar el listado por rango de precio, solo o combinado con la categoría) y mencionar los límites inclusivos y el comportamiento sin parámetros, manteniendo el título y sin agregar nada fuera del diff. | La IA solo veía el router, con rutas relativas; verifiqué en `server/src/index.js:17` que se monta en `/api/products`. El propósito del cambio no está en el diff, así que ese contexto tuve que aportarlo yo. |
| [D2] Corregir el mensaje de commit: ruta `GET /api/products`, porqué del cambio, límites inclusivos y comportamiento sin parámetros, manteniendo el título. | Mensaje corregido con los cuatro ajustes, sin agregar afirmaciones fuera del diff. | — | No fue necesario; verificado contra el diff y mis notas de lectura del cambio. |
| [D2] Pedí una descripción de PR para un revisor sin contexto (contexto, propósito, cambios y checklist de pruebas con casos límite), basada solo en el diff y señalando aparte cualquier posible problema. Sin modificar archivos. | ⚠️ Sugerencia incorrecta. Estructura correcta y sin validaciones inventadas, pero usaba la categoría `electronics`, que no existe (las reales están en español); dejaba como pregunta abierta si `minPrice=abc` producía un error 500; y omitía el caso `maxPrice=` (vacío). Al probar con curl: `minPrice=abc` y `maxPrice=` devuelven 200 con lista vacía. | Pedí corregir la descripción con los resultados reales de curl: usar la categoría `Libros`, poner resultados esperados según lo observado, agregar el caso `maxPrice=` y aclarar que entradas inválidas o vacías devuelven 200 con lista vacía. | La IA solo veía el diff: no conocía las categorías reales ni el comportamiento en ejecución. Las pruebas con curl mostraron que su hipótesis del error 500 era incorrecta y que faltaba un caso límite relevante. |
| [D2] Corregir la descripción del PR con los resultados reales de curl (categoría `Libros`, resultados observados, caso `maxPrice=`, entradas inválidas que devuelven 200 con lista vacía). Sin modificar archivos. | ⚠️ Acción incorrecta. En lugar de solo corregir la descripción, la IA intentó ejecutar `rm -f` sobre archivos `.txt` del repositorio (mis exportaciones de conversación), que habían quedado seleccionados en el editor y entraron como contexto. | Rechacé el comando y le indiqué que no borrara ningún archivo y continuara solo con la corrección de la descripción, sin ejecutar comandos ni modificar archivos. | La acción no fue solicitada, era destructiva e irreversible, y contradecía la instrucción "No modifiques archivos". Moví yo mismo las exportaciones fuera del repositorio. |
| [D2] No borrar ningún archivo y continuar solo con la corrección de la descripción del PR, sin ejecutar comandos ni modificar archivos. | Descripción corregida: categoría `Libros`, resultados observados en el checklist, caso `maxPrice=` agregado y aclaración de que las entradas inválidas o vacías devuelven 200 con lista vacía. Respetó la instrucción de no tocar archivos. Solo ajusté a mano "(rango inclusivo)" por "(rango inclusivo según `BETWEEN`)", porque lo inclusivo sale del código y no de las pruebas. | — | No fue necesario; cada afirmación verificada contra el diff y las pruebas con curl. |
| [D3] Describí la lentitud de `GET /api/products` con mi medición y pedí identificar el cuello de botella: cuántas consultas se ejecutan por request, `EXPLAIN QUERY PLAN` de las consultas involucradas y citas de archivos y líneas. Sin modificar archivos. | 🔁 Iteración. Diagnóstico correcto: patrón N+1 (501 consultas por request, `server/src/routes/products.js:37-40`) y todas las consultas con `SCAN products`, sin índices aparte de la clave primaria. Pero afirmó que eliminar el N+1 sin agregar un índice no resolvería el problema, contradiciendo su propia observación de que escanear 500 filas es barato. | Pedí empezar por el cambio mínimo (eliminar el N+1), mantener exactamente el contrato (en particular, que `cheaperInCategory` cuente sobre toda la categoría aunque haya filtros de precio) y justificar si el índice es necesario o si podemos medir primero sin él. Mostrar el diff antes de aplicar. | La afirmación sobre el índice no estaba demostrada y era inconsistente con el propio análisis; agregar un índice implica un cambio de esquema que debe justificarse con evidencia. |
| [D3] Pedí eliminar el N+1 como cambio mínimo, manteniendo exactamente el contrato (en particular, `cheaperInCategory` sobre toda la categoría aunque haya filtros de precio) y justificar si el índice es necesario. | ⚠️ Sugerencia incompleta. Reemplazó las 500 consultas por un self-join (`LEFT JOIN products b ON b.category = a.category AND b.price < a.price`) sobre toda la tabla: 2 consultas por request y valores idénticos (verificado por la IA, 0 discrepancias). Pero al medir con 50 peticiones: sin filtros bajó de 23,9 ms a 10,4 ms, mientras que el caso filtrado (1 producto) subió de 0,9 ms a 7,9 ms. | Pedí reemplazar el self-join por la función de ventana `RANK() OVER (PARTITION BY category ORDER BY price) - 1`, calculada en una sola pasada sobre toda la tabla, manteniendo el mismo contrato y explicando por qué da el mismo resultado. | La propuesta mejoraba un caso a costa de otro: el self-join tiene un costo fijo sobre toda la tabla en cada petición. Lo detecté midiendo también el caso filtrado, que la IA no había considerado. |
| [D3] Con mis mediciones como evidencia, pedí reemplazar el self-join por `RANK() OVER (PARTITION BY category ORDER BY price) - 1`, calculado en una sola pasada sobre toda la tabla, manteniendo el mismo contrato y explicando por qué da el mismo resultado. Mostrar el diff antes de aplicar. | Diff correcto y más simple (lookup por `id`). Explicó correctamente la equivalencia con el conteo estricto, incluidos los empates, y la verificó con los 500 productos (0 discrepancias). Plan: un solo `SCAN products` con `USE TEMP B-TREE FOR ORDER BY`. Mediciones (50 peticiones): sin filtros 23,9 → 3,6 ms; filtrado 0,9 → 1,8 ms. Respuestas del endpoint idénticas antes y después (`cmp`). | — | No fue necesario. Acepté la compensación en el caso filtrado (+0,9 ms, por el costo fijo de ordenar la tabla completa) a cambio de que el caso principal sea ~6,6 veces más rápido, y la documenté en el README. |

> Nota: varios prompts corregidos se redactaron con apoyo de Claude (chat en claude.ai) como segunda opinión, para revisar críticamente las respuestas de Claude Code. Todas las verificaciones se hicieron manualmente.
