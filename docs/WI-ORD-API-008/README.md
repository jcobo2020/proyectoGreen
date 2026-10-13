# WI-ORD-API-008 — [Documentation] Products

## Qué pide la spec

El contrato REST de la API de pedidos de GREEN-H2 [ancla:endpoint GET /api/products] crea desde cero el backend que permite a un cliente autenticado consultar el catálogo de productos, componer un pedido y confirmarlo. Este work item de documentación tiene como objeto el extremo de consulta del catálogo [spec:endpoint GET /api/products] y el mecanismo de autenticación que lo protege, tal como los delimita [spec:acceptance_criteria AC-06] y [spec:acceptance_criteria AC-07].

El endpoint [spec:endpoint GET /api/products] sirve los productos activos con su precio y su disponibilidad actuales; su consumidor principal es la pantalla `/orders/new` de GREEN-ORD-UX-001 [ancla:user_story HU-01], que necesita el catálogo para que el cliente pueda componer el pedido. La entidad central es [spec:entidad Product], cuyos campos `unitPrice` y `available` son los que alimentan ese formulario; el campo `active` actúa como filtro de publicación del catálogo.

La spec fija dos reglas que afectan directamente a este endpoint. Por un lado, [spec:business_rule RN-01] establece que el listado refleja siempre el último estado guardado, sin cachés. Por otro, [spec:business_rule RN-06] exige que cualquier endpoint sin token válido responda `401 UNAUTHORIZED` [spec:error UNAUTHORIZED]: `GET /api/products` no es una excepción. Los precios los calcula siempre el servidor ([spec:business_rule RN-05]), de modo que el cliente nunca envía ni puede manipular valores monetarios.

Quedan fuera de alcance la gestión del catálogo (altas, bajas, modificaciones de productos), los pagos, el envío y la cancelación de pedidos, así como la emisión de tokens de identidad.

## El trabajo y su historia

| work item | tipo | estado | asignado a |
|---|---|---|---|
| WI-ORD-API-001 | Backend | Cancelado | sin asignar |
| WI-ORD-API-002 | Documentación | Cancelado | sin asignar |
| WI-ORD-API-003 | Backend | Cancelado | Jorge Developer |
| WI-ORD-API-004 | Documentación | Cancelado | sin asignar |
| WI-ORD-API-005 | Backend | Generado | sin asignar |
| WI-ORD-API-006 | Documentación | Generado | sin asignar |
| WI-ORD-API-007 | Backend | Cerrado | Jorge Developer |
| WI-ORD-API-008 | Documentación | Generado | Jorge Developer |

| fecha y hora (UTC) | work item | qué pasó | quién | motivo |
|---|---|---|---|---|
| 2026-10-12 20:05 | WI-ORD-API-001 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 20:05 | WI-ORD-API-002 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 20:05 | WI-ORD-API-003 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 20:05 | WI-ORD-API-004 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 20:07 | WI-ORD-API-003 | «Generado» → «Contexto Listo» | Administrador Global | context pack preparado |
| 2026-10-12 20:07 | WI-ORD-API-003 | «Contexto Listo» → «Aprobado» | Administrador Global | Pack revisado (v3, 10.245 tokens): contratos, modelo de datos, contexto técnico, constitución y convenciones incluidos. Ola 7 · H3. |
| 2026-10-12 20:07 | WI-ORD-API-003 | «Aprobado» → «Asignado» | Administrador Global | asignación de work item |
| 2026-10-12 20:07 | WI-ORD-API-003 | «Asignado» → «En Progreso» | Administrador Global | Run autónomo 71f7f431-e151-48a8-90d0-f8bdad9293f7 (agente developer) |
| 2026-10-12 20:22 | WI-ORD-API-003 | «En Progreso» → «Bloqueado» | Administrador Global | El run 71f7f431-e151-48a8-90d0-f8bdad9293f7 del agente developer murió sin terminar: No se publica: el work item no cumple sus puertas — gate_sin_cumplir: confirmar un pedido y comprobar que GET /api/orders y GET /api/orders/:id lo devuelven confirmed en la siguiente petición — el informe no la declara cumplida (RN-01) · gate_sin_cumplir: GET y POST confirm sobre un pedido de otro cliente responden 403 ORDER_FORBIDDEN — el informe no la declara cumplida (RN-02) |
| 2026-10-12 23:06 | WI-ORD-API-004 | «Generado» → «Contexto Listo» | Administrador Global | context pack preparado |
| 2026-10-12 23:06 | WI-ORD-API-002 | «Generado» → «Contexto Listo» | Administrador Global | context pack preparado |
| 2026-10-12 23:06 | WI-ORD-API-001 | «Generado» → «Contexto Listo» | Administrador Global | context pack preparado |
| 2026-10-12 23:08 | WI-ORD-API-001 | «Contexto Listo» → «Cancelado» | Administrador Global | Generado antes de arreglar el reparto de entidades por recurso: llevaba «Migración de esquema — Product, Order» y la entidad ajena en su pack. Se regenera desde el agrupador con el descomponedor corregido (H0 de plan_ux_llenar_bien_la_spec). |
| 2026-10-12 23:08 | WI-ORD-API-002 | «Contexto Listo» → «Cancelado» | Administrador Global | Generado antes de arreglar el reparto de entidades por recurso: llevaba «Migración de esquema — Product, Order» y la entidad ajena en su pack. Se regenera desde el agrupador con el descomponedor corregido (H0 de plan_ux_llenar_bien_la_spec). |
| 2026-10-12 23:08 | WI-ORD-API-003 | «Bloqueado» → «Cancelado» | Administrador Global | Generado antes de arreglar el reparto de entidades por recurso: llevaba «Migración de esquema — Product, Order» y la entidad ajena en su pack. Se regenera desde el agrupador con el descomponedor corregido (H0 de plan_ux_llenar_bien_la_spec). |
| 2026-10-12 23:08 | WI-ORD-API-004 | «Contexto Listo» → «Cancelado» | Administrador Global | Generado antes de arreglar el reparto de entidades por recurso: llevaba «Migración de esquema — Product, Order» y la entidad ajena en su pack. Se regenera desde el agrupador con el descomponedor corregido (H0 de plan_ux_llenar_bien_la_spec). |
| 2026-10-12 23:08 | WI-ORD-API-005 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 23:08 | WI-ORD-API-006 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 23:08 | WI-ORD-API-007 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 23:08 | WI-ORD-API-008 | nace en «Generado» | Administrador Global | nacimiento del work item |
| 2026-10-12 23:09 | WI-ORD-API-007 | «Generado» → «Contexto Listo» | Administrador Global | context pack preparado |
| 2026-10-12 23:11 | WI-ORD-API-007 | «Contexto Listo» → «Aprobado» | Administrador Global | — |
| 2026-10-12 23:12 | WI-ORD-API-007 | «Aprobado» → «Asignado» | Administrador Global | asignación de work item |
| 2026-10-12 23:12 | WI-ORD-API-007 | «Asignado» → «En Progreso» | Administrador Global | Run autónomo c31137c4-5217-4056-8565-ca6e597c7d86 (agente developer) |
| 2026-10-12 23:28 | WI-ORD-API-007 | «En Progreso» → «Bloqueado» | Administrador Global | El run c31137c4-5217-4056-8565-ca6e597c7d86 del agente developer murió sin terminar: Alguien canceló el run: el bucle se paró antes de pedir el turno siguiente |
| 2026-10-13 01:15 | WI-ORD-API-007 | «Bloqueado» → «En Progreso» | Administrador Global | Run autónomo db551f0c-fa44-42ce-b55f-f2cb46fc0479 (agente developer) |
| 2026-10-13 01:23 | WI-ORD-API-003, WI-ORD-API-007 | PR #1 abierto | git | WI-ORD-API-007 · implementación autónoma |
| 2026-10-13 01:57 | WI-ORD-API-007 | «En Progreso» → «MR Abierto · en revisión» | Administrador Global | sugerencia de git aceptada |
| 2026-10-13 02:03 | WI-ORD-API-003, WI-ORD-API-007 | PR #1 mergeado | git | WI-ORD-API-007 · implementación autónoma |
| 2026-10-13 03:04 | WI-ORD-API-007 | «MR Abierto · en revisión» → «Validado» | Administrador Global | — |
| 2026-10-13 03:05 | WI-ORD-API-007 | «Validado» → «Mergeado» | Administrador Global | sugerencia de git aceptada |
| 2026-10-13 03:05 | WI-ORD-API-007 | «Mergeado» → «Cerrado» | Administrador Global | — |

La historia de esta spec arrancó el 2026-10-12 con la generación simultánea de cuatro work items ([estado:WI-ORD-API-001], [estado:WI-ORD-API-002], [estado:WI-ORD-API-003], [estado:WI-ORD-API-004]). [wi:WI-ORD-API-003], el primer work item de backend, avanzó hasta «En Progreso» y fue bloqueado porque el run autónomo no declaró cumplidas las puertas relativas a RN-01 y RN-02 [estado:WI-ORD-API-003]. Poco después los cuatro work items originales fueron cancelados por un defecto en el descomponedor: el pack llevaba entidades ajenas y una migración de esquema que no correspondía al reparto por recurso [estado:WI-ORD-API-001], [estado:WI-ORD-API-002], [estado:WI-ORD-API-003], [estado:WI-ORD-API-004].

El 2026-10-12 23:08 UTC nacieron los cuatro work items de la segunda generación ([estado:WI-ORD-API-005], [estado:WI-ORD-API-006], [estado:WI-ORD-API-007], [estado:WI-ORD-API-008]), esta vez con el descomponedor corregido. [wi:WI-ORD-API-007] (el backend que ancla este documento) fue el primero en progresar: su primer run fue interrumpido externamente y quedó bloqueado [estado:WI-ORD-API-007]; un segundo run (db551f0c) lo retomó el 2026-10-13 01:15 UTC, abrió [git:PR #1] a las 01:23 y lo mergeó a las 02:03. El work item fue validado y cerrado a las 03:05 UTC [estado:WI-ORD-API-007].

WI-ORD-API-008 (este documento) nació en «Generado» el 2026-10-12 23:08 UTC y permanece en ese estado [estado:WI-ORD-API-008]. Los work items [wi:WI-ORD-API-005] y [wi:WI-ORD-API-006] permanecen en «Generado» y sin asignar.

El doc-pack no incluye información sobre si WI-ORD-API-008 tiene un context pack preparado ni sobre cuándo está previsto su avance.

## Lo que se tocó

### WI-ORD-API-007 · Backend · «Cerrado»
- Informe de finalización [informe:WI-ORD-API-007], 2026-10-13 01:23 UTC, commit 9d2c4e8: 1 de 1 criterios cubiertos.
  - Lo que dijo al entregarlo: Run autónomo db551f0c-fa44-42ce-b55f-f2cb46fc0479 (agente developer): El build TypeScript pasa sin errores. Todo está en verde. --- ## Resumen de implementación — WI-ORD-API-007 ### Qué se implementó **Endpoint `GET /api/products`** — catálogo de productos activos con precio y disponibilidad, paginado y ordenado por `name`/`sku`. Proyecto completamente greenfield (solo existía `README.md`). Se construyó la estructura completa del backend siguiendo la plantilla del stack: ### Ficheros creados | Fichero | Propósito | |---|---| | `api/package.json` + `tsconfig.json` + `jest.config.js` | Configuración del proyecto | | `api/.env.example` | Variables de entorno documentadas sin valores reales | | `api/src/config/env.ts` | Lectura de variables de entorno | | `api/src/config/connectDB.ts` | Conexión centralizada a MongoDB | | `api/src/config/swagger.ts` | Configuración de swagger-jsdoc | | `api/src/lib/errors.ts` | `AppError`, `ValidationError`, `UnauthorizedError`, `InternalError` | | `api/src/lib/obfuscate.ts` | Util `obfuscateValue()` centralizado | | `api/src/models/product.ts` | Modelo Mongoose `Product` con índices `sku` (único) y `{active, name, sku}` | | `api/src/services/ProductService.ts` | `listActive()`, `toPublicProduct()`, tipo `PublicProduct` | | `api/src/validators/product.validator.ts` | Validación de `page` y `pageSize` con respuesta `VALIDATION_ERROR` | | `api/src/middlewares/authenticate.middleware.ts` | JWT HS256, `sub`+`exp` obligatorios, tolerancia de reloj 30 s, rotación con `JWT_SECRET_PREVIOUS`, rechaza `alg:none` | | `
  - Criterios y sus pruebas:
    - AC-06 (cubierto): GET /api/products devuelve los productos activos con precio y disponibilidad. Verificado con tests de integración que comprueban: lista vacía, solo activos, orden por name/sku, paginación, formato de unitPrice (2 decimales) y campo available ≥ 0.
  - Decisiones:
    - desviación: La spec (§4) declara explícitamente: 'Excepción declarada a la plantilla: no hay attachAuthenticatedUser ni requireAdmin, porque no hay colección de usuarios ni roles (la identidad es externa)'. La spec manda sobre la plantilla según §4-bis.
    - desviación: Necesario para que los tests (que fijan las variables de entorno antes de crear la app) funcionen correctamente sin reiniciar el módulo. La seguridad no se ve afectada: en producción las variables se cargan antes del arranque del servidor.
  - Evidencias:
    - test_results `workflow_artifacts/092a1d4d-6634-48ef-8cbd-78c26fa2fda7` (corroborada): Salida real del comando, ejecutado en el contenedor efímero
    - test_results `workflow_artifacts/84352be5-ef30-4488-9ca2-555a8e845a94` (corroborada): Salida real del comando, ejecutado en el contenedor efímero
    - coverage_report `workflow_artifacts/092a1d4d-6634-48ef-8cbd-78c26fa2fda7` (corroborada): Informe de cobertura dentro de la salida de las pruebas, en el contenedor efímero
    - test_results `.sdd/evidence/test-results.txt` (corroborada): 30 tests passing: 29 en products.spec.ts (integración + unitarios) y 1 en migration.spec.ts
    - migration_log `.sdd/evidence/migration.log` (corroborada): Log generado por migration.spec.ts: colección products creada con índices sku (único) y {active, name, sku} compuesto. Verificado en MongoDB in-memory.
    - coverage_report `api/coverage/lcov-report/index.html`: Cobertura medida en la corrida: 90.51% de líneas en los 11 ficheros tocados (exigida ≥ 80%). Resumen en api/coverage/coverage-summary.json.
    - api_docs `api/src/controllers/*.ts` (corroborada): —
- Contratos del código: [codigo:model:Product]

### Ficheros del PR #1, mergeado el 2026-10-13 02:03 UTC: 25 ficheros, +7911 −0
| fichero | cambio | + | − |
|---|---|---|---|
| `api/package-lock.json` | añadido | 6499 | 0 |
| `api/src/__tests__/products.spec.ts` | añadido | 489 | 0 |
| `api/src/__tests__/migration.spec.ts` | añadido | 103 | 0 |
| `api/src/controllers/ProductController.ts` | añadido | 89 | 0 |
| `api/src/middlewares/authenticate.middleware.ts` | añadido | 75 | 0 |
| `api/src/config/swagger.ts` | añadido | 72 | 0 |
| `.sdd/completion-report-WI-ORD-API-007.json` | añadido | 60 | 0 |
| `api/src/services/ProductService.ts` | añadido | 54 | 0 |
| `api/src/models/product.ts` | añadido | 50 | 0 |
| `.sdd/evidence/test-results.txt` | añadido | 48 | 0 |
| `api/src/lib/errors.ts` | añadido | 48 | 0 |
| `api/src/middlewares/errorHandler.middleware.ts` | añadido | 43 | 0 |
| `api/package.json` | añadido | 37 | 0 |
| `api/src/validators/product.validator.ts` | añadido | 31 | 0 |
| `api/src/app.ts` | añadido | 29 | 0 |
| `api/jest.config.js` | añadido | 28 | 0 |
| `api/src/middlewares/requestLogger.middleware.ts` | añadido | 27 | 0 |
| `api/src/config/env.ts` | añadido | 26 | 0 |
| `api/src/routes/api.routes.ts` | añadido | 24 | 0 |
| `api/tsconfig.json` | añadido | 19 | 0 |
| `api/src/server.ts` | añadido | 18 | 0 |
| `.sdd/evidence/migration.log` | añadido | 11 | 0 |
| `api/.env.example` | añadido | 11 | 0 |
| `api/src/config/connectDB.ts` | añadido | 11 | 0 |
| `api/src/lib/obfuscate.ts` | añadido | 9 | 0 |

El PR #1 ([git:PR #1]), mergeado el 2026-10-13 02:03 UTC, creó el proyecto completo desde cero: 25 ficheros añadidos, +7 911 líneas, 0 eliminadas [informe:WI-ORD-API-007]. El repositorio solo contenía un `README.md` antes de este merge.

El contrato del código que declara [wi:WI-ORD-API-007] es [codigo:model:Product], que materializa la entidad [spec:entidad Product] [ancla:entity Product] con los campos `sku`, `name`, `unitPrice`, `available` y `active` en `api/src/models/product.ts`. La infraestructura de servicio reside en `api/src/services/ProductService.ts`, que expone `listActive()` y `toPublicProduct()` [informe:WI-ORD-API-007]. El controlador `api/src/controllers/ProductController.ts` maneja el endpoint [ancla:endpoint GET /api/products]. La validación de los parámetros de paginación (`page`, `pageSize`) con respuesta [spec:error VALIDATION_ERROR] se ubica en `api/src/validators/product.validator.ts`.

El middleware de autenticación `api/src/middlewares/authenticate.middleware.ts` implementa la restricción de seguridad de la spec: JWT HS256, claims `sub` y `exp` obligatorios, tolerancia de reloj de 30 s, rotación con `JWT_SECRET_PREVIOUS` y rechazo explícito de `alg:none` [informe:WI-ORD-API-007]. La infraestructura de soporte comprende `api/src/lib/errors.ts` (jerarquía de errores de aplicación), `api/src/lib/obfuscate.ts` (utilidad de ofuscación para los logs), `api/src/middlewares/requestLogger.middleware.ts` (log estructurado JSON con `requestId`) y `api/src/middlewares/errorHandler.middleware.ts` [informe:WI-ORD-API-007].

El informe registra dos desviaciones respecto a la plantilla de la capa [informe:WI-ORD-API-007]: no se implementan `attachAuthenticatedUser` ni `requireAdmin` porque la spec los excluye explícitamente (la identidad es externa y no hay colección de usuarios); y la carga de variables de entorno se hace de forma diferida para que los tests puedan fijarlas antes de instanciar la app, sin efecto sobre la seguridad en producción.

## Cómo está construido

El modelo de datos de [ancla:entity Product] según el contrato ORM es el siguiente:

```mermaid
erDiagram
  Product {
    Boolean active
    Number available "required"
    String name "required"
    String sku "required"
    Number unitPrice "required"
  }
```

El campo `active` actúa como flag de publicación: `listActive()` filtra por `active: true` antes de devolver el catálogo [informe:WI-ORD-API-007]. El campo `available` es de solo lectura para este endpoint; únicamente la confirmación de un pedido lo modifica ([spec:business_rule RN-04], implementada en [wi:WI-ORD-API-007]).

El flujo de una petición `GET /api/products` es:

1. **Autenticación.** `authenticate.middleware.ts` verifica la firma HS256 con `JWT_SECRET` (y `JWT_SECRET_PREVIOUS` si está definida), comprueba que `exp` no ha vencido con 30 s de tolerancia y que `sub` no está vacío. Si falla, lanza [spec:error UNAUTHORIZED] antes de llegar al controlador [informe:WI-ORD-API-007].
2. **Validación de parámetros.** `product.validator.ts` valida `page` y `pageSize`; un valor inválido produce [spec:error VALIDATION_ERROR] con un elemento de `details` por campo [informe:WI-ORD-API-007].
3. **Consulta.** `ProductService.listActive()` consulta MongoDB usando el índice compuesto `{active, name, sku}` (declarado en [codigo:model:Product]), devuelve solo los documentos con `active: true` ordenados por `name`/`sku` y aplica la paginación.
4. **Serialización.** `toPublicProduct()` formatea `unitPrice` a dos decimales antes de enviarlo al cliente [informe:WI-ORD-API-007].
5. **Log.** `requestLogger.middleware.ts` emite un registro JSON con método, ruta, status, duración y `requestId` (de la cabecera `X-Request-Id` o generado), sin incluir el token ni datos personales.

La conexión a MongoDB se gestiona en `api/src/config/connectDB.ts`; las variables de entorno (`MONGODB_URI`, `JWT_SECRET`, `JWT_SECRET_PREVIOUS`) se leen en `api/src/config/env.ts` y nunca se vuelcan al repositorio —solo existe `api/.env.example` sin valores reales [informe:WI-ORD-API-007].

El doc-pack no incluye información sobre aristas de llamada entre componentes (p. ej. `ProductController→ProductService`) más allá de lo declarado en el informe de finalización.

## Reglas de negocio

Las reglas que gobiernan directamente este endpoint son:

- **[spec:business_rule RN-01]** — El catálogo que devuelve `GET /api/products` refleja siempre el estado real de la base de datos en el momento de la petición. No existe ninguna capa de caché que pueda devolver datos obsoletos. La disponibilidad que ve el cliente es la misma que la confirmación usará para tomar su decisión atómica.
- **[spec:business_rule RN-05]** — Los precios los calcula y los sirve el servidor. El cliente nunca envía `unitPrice` ni ningún campo monetario; el endpoint solo los expone como lectura.
- **[spec:business_rule RN-06]** — La ausencia de token, un token con firma inválida, un token caducado (fuera de la tolerancia de 30 s), o un token sin `sub` o sin `exp` producen [spec:error UNAUTHORIZED] antes de que la petición llegue a la capa de servicio.

Las reglas [spec:business_rule RN-02], [spec:business_rule RN-03] y [spec:business_rule RN-04] afectan a otros endpoints de la spec; para su documentación véase [wi:WI-ORD-API-007] y, cuando esté disponible, [wi:WI-ORD-API-005].

## Cómo verificarlo

El informe de finalización de [wi:WI-ORD-API-007] declara 30 tests en verde: 29 en `api/src/__tests__/products.spec.ts` (integración + unitarios) y 1 en `api/src/__tests__/migration.spec.ts` [informe:WI-ORD-API-007]. La cobertura de líneas en `services/` alcanzó el 90,51 % sobre los 11 ficheros incluidos en la medición, superando el mínimo del 80 % exigido por la spec.

Los casos cubiertos por los tests de integración de [spec:acceptance_criteria AC-06] incluyen [informe:WI-ORD-API-007]:

- Lista vacía (sin productos activos en la base).
- Solo se devuelven los productos con `active: true`; los inactivos no aparecen.
- Orden correcto: por `name` y, en caso de empate, por `sku`.
- Paginación funcional con `page` y `pageSize`.
- Formato de `unitPrice` a dos decimales.
- Campo `available` presente y con valor ≥ 0.

Para [spec:acceptance_criteria AC-07] los tests verifican [informe:WI-ORD-API-007]:

- Petición sin token → `401 UNAUTHORIZED`.
- Token con firma inválida → `401 UNAUTHORIZED`.
- Token sin claim `sub` → `401 UNAUTHORIZED`.
- Token sin claim `exp` → `401 UNAUTHORIZED`.

El test de migración (`migration.spec.ts`) verifica que la colección `products` se crea con los índices `sku` (único) y `{active, name, sku}` (compuesto) en MongoDB in-memory [informe:WI-ORD-API-007].

Los tests de integración usan `mongodb-memory-server` en modo réplica y JWTs firmados en la propia prueba con un `JWT_SECRET` de test, de acuerdo con la restricción de testing de la spec.

El doc-pack no incluye información sobre si existen tests que cubran el forzado del error [spec:error INTERNAL_ERROR] (caída de base de datos) en el contexto de `GET /api/products`, ni sobre si la prueba de concurrencia (50 peticiones simultáneas, p95 < 300 ms) fue ejecutada para este endpoint concreto.

## Notas para el mantenedor

**Primer intento cancelado.** Los work items [wi:WI-ORD-API-001] a [wi:WI-ORD-API-004] fueron cancelados por un defecto en el descomponedor del agrupador: el pack original asignaba la entidad `Order` al pack de `Product` y añadía una migración de esquema que no correspondía. La segunda generación ([estado:WI-ORD-API-005] a [estado:WI-ORD-API-008]) corrigió ese reparto. Cualquier revisión de la historia de git antes del 2026-10-12 23:08 UTC debe considerarse descartada.

**Interrupción del primer run de WI-ORD-API-007.** El run `c31137c4` fue cancelado externamente antes de completarse [estado:WI-ORD-API-007]. El run `db551f0c` lo retomó y entregó la implementación completa. El doc-pack no incluye información sobre qué estado dejó el run cancelado ni si requirió limpieza manual.

**Proyecto greenfield.** Todo el código nació en [git:PR #1]; no hay ficheros preexistentes que comparar ni migraciones incrementales. Si en el futuro se añaden endpoints (los de pedidos, cubiertos por [wi:WI-ORD-API-005] cuando se complete), el mantenedor deberá extender `api/src/routes/api.routes.ts` y registrar los nuevos servicios sin tocar la infraestructura ya creada por este work item.

**Desviación de plantilla documentada.** La ausencia de `attachAuthenticatedUser` y `requireAdmin` es una decisión arquitectónica de la spec, no un olvido: la identidad la emite un proveedor externo y no existe colección de usuarios [informe:WI-ORD-API-007]. Cualquier intento de añadir esos middlewares requeriría una modificación de la spec.

**Variables de entorno.** `MONGODB_URI`, `JWT_SECRET` y `JWT_SECRET_PREVIOUS` deben inyectarse exclusivamente por entorno. El fichero `api/.env.example` documenta los nombres sin valores reales [informe:WI-ORD-API-007]. La carga diferida de `api/src/config/env.ts` es intencional para el entorno de tests.

**Work items pendientes.** [wi:WI-ORD-API-005] (backend de pedidos) y [wi:WI-ORD-API-006] (documentación de pedidos) permanecen en «Generado» y sin asignar [estado:WI-ORD-API-005], [estado:WI-ORD-API-006]. Los endpoints [spec:endpoint POST /api/orders], [spec:endpoint GET /api/orders], [spec:endpoint GET /api/orders/:id] y [spec:endpoint POST /api/orders/:id/confirm] no están implementados aún.