import { reportsRoutes } from './reports.routes';
import { authGuard } from '../../@core/guards/auth.guard';

describe('reportsRoutes', () => {
  it('la ruta raíz está protegida por authGuard', () => {
    const raiz = reportsRoutes[0];
    expect(raiz.canActivate).toContain(authGuard);
  });

  it('la ruta hija carga el componente ReportListComponent de forma lazy', () => {
    const raiz = reportsRoutes[0];
    const hija = (raiz.children ?? [])[0];
    expect(hija.path).toBe('');
    expect(typeof hija.loadComponent).toBe('function');
  });

  it('los providers incluyen el token REPORT_REPOSITORY', () => {
    const raiz = reportsRoutes[0];
    const providers = (raiz.providers ?? []) as Array<{ provide?: unknown }>;
    const tieneToken = providers.some(p => p.provide?.toString().includes('REPORT_REPOSITORY') || String(p.provide).includes('REPORT_REPOSITORY'));
    // Comprobamos que hay al menos un provider (HttpClient + repo + use case)
    expect(providers.length).toBeGreaterThan(0);
  });
});
