import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { createSpyObj } from '../../../../testing/spy-obj';
import { ListExecutivesUseCase } from './executive.use-cases';
import { EXECUTIVE_REPOSITORY, ExecutiveRepositoryPort } from '../domain/ports/executive-repository.port';
import { ExecutiveOption } from '../domain/models/executive.model';

describe('ListExecutivesUseCase', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('pide las opciones al puerto en cada ejecución (sin caché)', () => {
    const repo = createSpyObj<ExecutiveRepositoryPort>('ExecutiveRepositoryPort', ['listExecutives']);
    TestBed.configureTestingModule({
      providers: [ListExecutivesUseCase, { provide: EXECUTIVE_REPOSITORY, useValue: repo }]
    });
    const opciones: ExecutiveOption[] = [{ value: 'e-1', label: 'Daniela Ríos' }];
    repo.listExecutives.mockReturnValue(of(opciones));
    const casoDeUso = TestBed.inject(ListExecutivesUseCase);

    let recibido: ExecutiveOption[] | undefined;
    casoDeUso.execute().subscribe(o => (recibido = o));
    casoDeUso.execute().subscribe();

    expect(recibido).toEqual(opciones);
    expect(repo.listExecutives).toHaveBeenCalledTimes(2);
  });
});
