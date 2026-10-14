import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors, withFetch } from '@angular/common/http';
import { routes } from './app.routes';
import { jwtInterceptor } from './@core/interceptors/jwt.interceptor';
import { errorInterceptor } from './@core/interceptors/error.interceptor';

/**
 * Configuración global de la aplicación.
 * HttpClient global con jwtInterceptor + errorInterceptor.
 * La feature orders provee su propio HttpClient sin errorInterceptor (R4-ARQ-6).
 */
export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withFetch(),
      withInterceptors([jwtInterceptor, errorInterceptor])
    )
  ]
};
