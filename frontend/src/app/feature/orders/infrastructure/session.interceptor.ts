import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Interceptor de sesión de la feature orders (R4-ARQ-3, R4-ARQ-6).
 * Ante un 401 (token caducado), limpia la sesión y redirige al proveedor
 * de identidad con returnUrl. El resto lo deja pasar sin transformar
 * para que el repositorio lo traduzca a error de dominio.
 */
export const ordersSessionInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error?.status === 401) {
        sessionStorage.removeItem('token');
        const returnUrl = encodeURIComponent(window.location.pathname);
        window.location.href = `${environment.identityProviderUrl}?returnUrl=${returnUrl}`;
      }
      return throwError(() => error);
    })
  );
};
