import { HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor global de errores: registra en consola el error con ruta y código
 * sin token ni datos del cliente (R4-OBS-1).
 * No transforma el error: lo propaga para que el consumidor lo trate.
 */
export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error) => {
      const status = error?.status ?? 'desconocido';
      const url = req.url;
      console.error(`[HTTP Error] ${status} · ${url}`);
      return throwError(() => error);
    })
  );
};
