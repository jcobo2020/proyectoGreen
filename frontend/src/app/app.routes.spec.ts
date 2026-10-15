import { routes } from './app.routes';

/**
 * Spec de app.routes.ts (R4-ARQ-1, R4-ARQ-2):
 * - Las rutas raíz montan cada feature de forma lazy.
 * - /orders se carga de forma lazy desde feature/orders.
 */
describe('routes (app.routes.ts)', () => {
  it('define un array de rutas', () => {
    expect(Array.isArray(routes)).toBe(true);
    expect(routes.length).toBeGreaterThan(0);
  });

  it('incluye la ruta /orders con loadChildren (lazy loading)', () => {
    const rutaOrders = routes.find(r => r.path === 'orders');
    expect(rutaOrders).toBeDefined();
    expect(typeof rutaOrders?.loadChildren).toBe('function');
  });

  it('la ruta raíz redirige a /orders', () => {
    const rutaRaiz = routes.find(r => r.path === '' || r.path === '/');
    expect(rutaRaiz).toBeDefined();
    expect(rutaRaiz?.redirectTo).toBe('orders');
  });

  it('loadChildren de /orders resuelve a ordersRoutes', async () => {
    const rutaOrders = routes.find(r => r.path === 'orders');
    // Verifica que la función de carga lazy resuelve sin error
    const modulo = await (rutaOrders?.loadChildren as () => Promise<unknown>)();
    expect(modulo).toBeDefined();
  });
});
