import { RenderMode, ServerRoute } from '@angular/ssr';

/**
 * R4-ARQ-4: Las rutas /orders/** se renderizan solo en cliente
 * (RenderMode.Client) porque el token no existe en el servidor.
 * El SSR sirve solo el shell y la página de inicio.
 * /nuevo-prospecto, igual: el authGuard y el token viven en sessionStorage, que no existe en el servidor.
 */
export const serverRoutes: ServerRoute[] = [
  {
    path: 'orders/**',
    renderMode: RenderMode.Client
  },
  {
    path: 'nuevo-prospecto',
    renderMode: RenderMode.Client
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender
  }
];
