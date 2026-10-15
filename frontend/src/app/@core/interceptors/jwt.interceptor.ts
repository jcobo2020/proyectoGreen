import { HttpInterceptorFn } from '@angular/common/http';

/**
 * Interceptor global que lee el token de sessionStorage y lo adjunta
 * como cabecera Authorization: Bearer <token>.
 * El token NUNCA viaja en la URL.
 */
export const jwtInterceptor: HttpInterceptorFn = (req, next) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    const authReq = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
    return next(authReq);
  }
  return next(req);
};
