import { TestBed } from '@angular/core/testing';
import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  let locationHref: string;

  function ejecutarGuard(url: string): unknown {
    const route = {} as ActivatedRouteSnapshot;
    const state = { url } as RouterStateSnapshot;
    return TestBed.runInInjectionContext(() => authGuard(route, state));
  }

  beforeEach(() => {
    locationHref = '';
    Object.defineProperty(window, 'location', {
      value: {
        ...window.location,
        get href() { return locationHref; },
        set href(v: string) { locationHref = v; }
      },
      writable: true,
      configurable: true
    });
    TestBed.configureTestingModule({});
    sessionStorage.clear();
  });

  afterEach(() => {
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('con token válido en sessionStorage deja pasar (retorna true)', () => {
    sessionStorage.setItem('token', 'jwt-valido');
    const result = ejecutarGuard('/orders');
    expect(result).toBe(true);
  });

  it('sin token redirige al proveedor de identidad con returnUrl', () => {
    sessionStorage.removeItem('token');
    const result = ejecutarGuard('/orders');
    expect(result).toBe(false);
    expect(locationHref).toContain('returnUrl');
    expect(locationHref).toContain(encodeURIComponent('/orders'));
  });

  it('sin token no llama a la API (URL del proveedor, no /api)', () => {
    sessionStorage.removeItem('token');
    ejecutarGuard('/orders');
    expect(locationHref).not.toContain('/api/');
  });

  it('con token vacío (falsy) redirige al proveedor', () => {
    sessionStorage.setItem('token', '');
    const result = ejecutarGuard('/orders');
    expect(result).toBe(false);
  });
});
