import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

/**
 * Spec de app.routes.server.ts (R4-ARQ-4):
 * - /orders/** se renderiza en modo Client (el token no existe en el servidor).
 * - El resto usa Prerender.
 */
describe('serverRoutes (app.routes.server.ts)', () => {
  it('define un array de rutas de servidor', () => {
    expect(Array.isArray(serverRoutes)).toBe(true);
    expect(serverRoutes.length).toBeGreaterThan(0);
  });

  it('R4-ARQ-4: /orders/** usa RenderMode.Client', () => {
    const rutaOrders = serverRoutes.find(r => r.path === 'orders/**');
    expect(rutaOrders).toBeDefined();
    expect(rutaOrders?.renderMode).toBe(RenderMode.Client);
  });

  it('la ruta comodín usa un modo de renderizado para el resto de páginas', () => {
    const rutaComodin = serverRoutes.find(r => r.path === '**');
    expect(rutaComodin).toBeDefined();
    expect(rutaComodin?.renderMode).toBeDefined();
  });

  it('/nuevo-prospecto usa RenderMode.Client (el token solo existe en el navegador)', () => {
    const ruta = serverRoutes.find(r => r.path === 'nuevo-prospecto');
    expect(ruta?.renderMode).toBe(RenderMode.Client);
  });
});
