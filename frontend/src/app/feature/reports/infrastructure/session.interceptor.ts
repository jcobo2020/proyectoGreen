import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor de sesión de la feature reports.
 * Ante un 401 limpia el token de sesión para que la pantalla muestre
 * «Tu sesión terminó: vuelve a entrar.» (R4-SEG-1).
 * Todo lo demás lo deja pasar sin transformar para que el repositorio lo traduzca.
 */
export const reportsSessionInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error?.status === 401) {
        sessionStorage.removeItem('token');
      }
      return throwError(() => error);
    })
  );
};
