import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { environment } from '../../../../environments/environment';

/**
 * Interceptor de sesión de la feature customers.
 * Ante un 401 limpia la sesión y lleva al inicio de sesión con returnUrl, como la feature
 * orders. Todo lo demás lo deja pasar sin transformar para que el repositorio lo traduzca.
 */
export const customersSessionInterceptor: HttpInterceptorFn = (req, next) => {
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
