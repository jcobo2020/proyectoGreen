import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { environment } from '../../../environments/environment';

/**
 * Guard funcional (R4-ARQ-6): deja pasar si hay token vigente en sessionStorage.
 * Si no, lleva al inicio de sesión del proveedor de identidad con returnUrl.
 * No llama a la API.
 */
export const authGuard: CanActivateFn = (route, state) => {
  const token = sessionStorage.getItem('token');
  if (token) {
    return true;
  }
  const returnUrl = encodeURIComponent(state.url);
  const loginUrl = `${environment.identityProviderUrl}?returnUrl=${returnUrl}`;
  window.location.href = loginUrl;
  return false;
};
