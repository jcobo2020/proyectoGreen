# Capturas de las tres pantallas (evidencia de persona)

Tomadas el 2026-10-15 con la rama en `5d733fa`. La aplicación se sirvió en local (`ng serve`) contra la API del
cliente con MongoDB y datos de prueba, y con una sesión de prueba. Las aporta una persona, porque el agente no tiene
navegador. La revisión completa está en el control plane: `docs/plans/plan_ensayo_sin_modelo.md` §4.

| Work item | Pantalla | Capturas |
|---|---|---|
| WI-ORD-UX-004 | `/orders` | con datos, vacío, error (sin sesión: redirige al proveedor con `returnUrl`) |
| WI-ORD-UX-002 | `/orders/new` | resumen conservado al cambiar de página, 409 stock insuficiente, error |
| WI-ORD-UX-003 | `/orders/:id/confirm` | pendiente, confirmado |

Aceptado con excepción (decisión de Jorge):
- UX-002, AC-06 tras un 409: «Continuar» sigue habilitado con la cantidad por encima del nuevo disponible;
- UX-003, el 409 `ORDER_NOT_PENDING` se registra como `UNKNOWN`, y sus pruebas doblan los casos de uso y no el puerto.
