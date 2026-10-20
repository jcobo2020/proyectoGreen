import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';

/**
 * Interceptor de sesión de la feature customers.
 * Ante un 401 limpia la sesión y deja pasar el error: la pantalla dice «Tu sesión terminó:
 * vuelve a entrar.» y «vuelve a entrar» lleva al inicio de sesión. No redirige al instante,
 * porque entonces el mensaje que pide la spec no se llegaría a ver.
 * Todo lo demás lo deja pasar sin transformar para que el repositorio lo traduzca.
 */
export const customersSessionInterceptor: HttpInterceptorFn = (req, next) => {
  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error?.status === 401) {
        sessionStorage.removeItem('token');
      }
      return throwError(() => error);
    })
  );
};
