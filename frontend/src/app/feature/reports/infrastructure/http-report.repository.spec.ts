import { TestBed } from '@angular/core/testing';
import { HttpClient } from '@angular/common/http';
import { of, throwError } from 'rxjs';
import { createSpyObj } from '../../../../testing/spy-obj';
import { HttpReportRepository } from './http-report.repository';
import { REPORT_REPOSITORY } from '../domain/ports/report-repository.port';
import { HttpReportRepository as Repo } from './http-report.repository';
import {
  InvalidReportInputError,
  ReportInfrastructureError,
  ReportUnauthorizedError
} from '../domain/errors/report.errors';
import { ReportsPage } from '../domain/models/report.model';
import { HttpErrorResponse } from '@angular/common/http';

/** Fábrica de un HttpErrorResponse simulado. */
function httpError(status: number, body: unknown = {}): HttpErrorResponse {
  return new HttpErrorResponse({ status, error: body, url: '/api/reports' });
}

const paginaConDatos: ReportsPage = {
  items: [
    {
      id: 'r1',
      ejecutivo: 'Ana López',
      equipo: 'Equipo A',
      abiertas: '5',
      valorAbierto: 15000,
      ganado: 8000,
      conversion: '53%',
      actVencidas: '2'
    }
  ],
  total: 1,
  page: 1,
  pageSize: 20
};

function crear() {
  const httpSpy = createSpyObj<HttpClient>('HttpClient', ['get']);

  TestBed.configureTestingModule({
    providers: [
      { provide: REPORT_REPOSITORY, useClass: HttpReportRepository },
      HttpReportRepository,
      { provide: HttpClient, useValue: httpSpy }
    ]
  });

  const repo = TestBed.inject(HttpReportRepository);
  return { repo, httpSpy };
}

describe('HttpReportRepository', () => {

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    TestBed.resetTestingModule();
  });

  // ─── R4-PRUEBAS-2: 200 ───────────────────────────────────────────────────

  describe('listReports · 200 OK', () => {
    it('devuelve la página de reportes al recibir 200', () => {
      const { repo, httpSpy } = crear();
      httpSpy.get.mockReturnValue(of(paginaConDatos));

      let resultado: ReportsPage | undefined;
      repo.listReports({ page: 1, pageSize: 20 }).subscribe(r => (resultado = r));

      expect(resultado).toEqual(paginaConDatos);
      expect(httpSpy.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/reports'),
        expect.objectContaining({ params: expect.anything() })
      );
    });
  });

  // ─── R4-PRUEBAS-2: 401 ───────────────────────────────────────────────────

  describe('listReports · 401 → ReportUnauthorizedError (R4-SEG-1)', () => {
    it('traduce 401 a ReportUnauthorizedError', () => {
      const { repo, httpSpy } = crear();
      httpSpy.get.mockReturnValue(throwError(() => httpError(401, { code: 'UNAUTHORIZED' })));

      let error: Error | undefined;
      repo.listReports({}).subscribe({ error: e => (error = e) });

      expect(error).toBeInstanceOf(ReportUnauthorizedError);
    });
  });

  // ─── R4-PRUEBAS-2: 400 ───────────────────────────────────────────────────

  describe('listReports · 400 → InvalidReportInputError', () => {
    it('traduce 400 a InvalidReportInputError', () => {
      const { repo, httpSpy } = crear();
      httpSpy.get.mockReturnValue(
        throwError(() => httpError(400, { code: 'VALIDATION_ERROR', details: [{ field: 'page', message: 'Fuera de rango' }] }))
      );

      let error: Error | undefined;
      repo.listReports({ page: -1 }).subscribe({ error: e => (error = e) });

      expect(error).toBeInstanceOf(InvalidReportInputError);
    });
  });

  // ─── Resto de códigos → ReportInfrastructureError ────────────────────────

  describe('listReports · 500 → ReportInfrastructureError', () => {
    it('traduce cualquier otro código a ReportInfrastructureError', () => {
      const { repo, httpSpy } = crear();
      httpSpy.get.mockReturnValue(throwError(() => httpError(500)));

      let error: Error | undefined;
      repo.listReports({}).subscribe({ error: e => (error = e) });

      expect(error).toBeInstanceOf(ReportInfrastructureError);
    });
  });
});
