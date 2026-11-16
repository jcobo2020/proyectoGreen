import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { createSpyObj } from '../../../../testing/spy-obj';
import { ListReportsUseCase } from './report.use-cases';
import { REPORT_REPOSITORY, ReportRepositoryPort } from '../domain/ports/report-repository.port';
import { ReportsPage } from '../domain/models/report.model';

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
  const repoSpy = createSpyObj<ReportRepositoryPort>('ReportRepositoryPort', ['listReports']);

  TestBed.configureTestingModule({
    providers: [
      ListReportsUseCase,
      { provide: REPORT_REPOSITORY, useValue: repoSpy }
    ]
  });

  const useCase = TestBed.inject(ListReportsUseCase);
  return { useCase, repoSpy };
}

describe('ListReportsUseCase', () => {
  afterEach(() => {
    TestBed.resetTestingModule();
  });

  it('llama al repositorio con page=1 y pageSize=20 por defecto', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listReports.mockReturnValue(of(paginaConDatos));

    useCase.execute().subscribe();

    expect(repoSpy.listReports).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
  });

  it('devuelve la página que devuelve el repositorio', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listReports.mockReturnValue(of(paginaConDatos));

    let resultado: ReportsPage | undefined;
    useCase.execute().subscribe(r => (resultado = r));

    expect(resultado).toEqual(paginaConDatos);
  });

  it('acepta un query personalizado', () => {
    const { useCase, repoSpy } = crear();
    repoSpy.listReports.mockReturnValue(of(paginaConDatos));

    useCase.execute({ page: 2, pageSize: 50 }).subscribe();

    expect(repoSpy.listReports).toHaveBeenCalledWith({ page: 2, pageSize: 50 });
  });
});
