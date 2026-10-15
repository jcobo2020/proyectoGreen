import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { routes } from './app.routes';
import { jwtInterceptor } from './@core/interceptors/jwt.interceptor';
import { errorInterceptor } from './@core/interceptors/error.interceptor';

/**
 * Configuración global de la aplicación (Angular 21).
 * - provideBrowserGlobalErrorListeners + provideClientHydration(withEventReplay()): Angular 21, sin Zone.js.
 * - Sin provideZoneChangeDetection (causa NG0908 en Angular 21 sin Zone.js).
 * - HttpClient global con jwtInterceptor + errorInterceptor.
 * - La feature orders provee su propio HttpClient sin errorInterceptor (R4-ARQ-6).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideClientHydration(withEventReplay()),
    provideHttpClient(
      withFetch(),
      withInterceptors([jwtInterceptor, errorInterceptor])
    )
  ]
};
