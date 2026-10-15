import { TestBed } from '@angular/core/testing';
import { DOCUMENT } from '@angular/common';
import { appConfig } from './app.config';
import { environment } from '../environments/environment';

/**
 * Spec de app.config.ts (R4-ARQ-1, R4-SEG-2):
 * - La configuración global provee Router, HttpClient con interceptores.
 * - La URL del proveedor y la base de la API vienen del environment (por configuración).
 */
describe('appConfig', () => {
  it('importa appConfig sin error', () => {
    expect(appConfig).toBeDefined();
    expect(appConfig.providers).toBeDefined();
    expect(Array.isArray(appConfig.providers)).toBe(true);
    expect((appConfig.providers as unknown[]).length).toBeGreaterThan(0);
  });

  it('environment define apiBaseUrl como URL de configuración, no literal en código', () => {
    // R4-SEG-2: la base de la API viene por configuración
    expect(environment.apiBaseUrl).toBeDefined();
    expect(typeof environment.apiBaseUrl).toBe('string');
    expect(environment.apiBaseUrl.length).toBeGreaterThan(0);
  });

  it('environment define identityProviderUrl como URL de configuración, no literal en código', () => {
    // R4-SEG-2: la URL del proveedor viene por configuración
    expect(environment.identityProviderUrl).toBeDefined();
    expect(typeof environment.identityProviderUrl).toBe('string');
    expect(environment.identityProviderUrl.length).toBeGreaterThan(0);
  });

  it('environment de producción define las mismas claves que el de desarrollo', async () => {
    // R4-SEG-2: el entorno de producción también tiene las claves de configuración
    const { environment: envProd } = await import('../environments/environment.prod');
    expect(envProd.apiBaseUrl).toBeDefined();
    expect(envProd.identityProviderUrl).toBeDefined();
    expect(envProd.production).toBe(true);
  });

  it('puede inicializar TestBed con los providers de appConfig', () => {
    // Verifica que los providers son compatibles con TestBed
    expect(() => {
      TestBed.configureTestingModule({
        providers: appConfig.providers
      });
    }).not.toThrow();
  });
});
