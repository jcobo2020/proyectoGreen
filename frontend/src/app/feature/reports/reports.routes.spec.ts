import { ClassProvider, Provider } from '@angular/core';
import { reportsRoutes } from './reports.routes';
import { authGuard } from '../../@core/guards/auth.guard';
import { REPORT_REPOSITORY } from './domain/ports/report-repository.port';
import { HttpReportRepository } from './infrastructure/http-report.repository';
import { ListReportsUseCase } from './application/report.use-cases';
import { ReportListComponent } from './ui/report-list/report-list.component';

describe('reportsRoutes', () => {
  const raiz = reportsRoutes[0];

  it('la ruta raíz está protegida por authGuard', () => {
    expect(raiz.path).toBe('');
    expect(raiz.canActivate).toContain(authGuard);
  });

  it('provee el puerto REPORT_REPOSITORY con HttpReportRepository y el caso de uso ListReportsUseCase', () => {
    const providers = (raiz.providers ?? []) as Provider[];
    const puerto = providers.find(
      (p): p is ClassProvider =>
        typeof p === 'object' && p !== null && 'provide' in p && p.provide === REPORT_REPOSITORY
    );
    expect(puerto?.useClass).toBe(HttpReportRepository);
    expect(providers).toContain(ListReportsUseCase);
  });

  it('la ruta hija carga ReportListComponent de forma lazy', async () => {
    const hija = (raiz.children ?? [])[0];
    expect(hija.path).toBe('');
    const componente = await (hija.loadComponent as () => Promise<unknown>)();
    expect(componente).toBe(ReportListComponent);
  });
});
