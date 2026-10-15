import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes } from '@angular/ssr';
import { appConfig } from './app.config';
import { serverRoutes } from './app.routes.server';

/**
 * Configuración SSR (R4-ARQ-4): usa provideServerRendering(withRoutes(...))
 * según Angular 21. provideServerRoutesConfig no existe en esta versión.
 */
export const config = mergeApplicationConfig(appConfig, {
  providers: [
    provideServerRendering(withRoutes(serverRoutes))
  ]
});
