import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { provideRouter, Router } from '@angular/router';
import { createSpyObj } from '../../../../../testing/spy-obj';
import { ReportListComponent, ESTADOS_VISTA, MENSAJES_VALIDACION } from './report-list.component';
import { ListReportsUseCase } from '../../application/report.use-cases';
import { REPORT_REPOSITORY, ReportRepositoryPort } from '../../domain/ports/report-repository.port';
import { ReportsPage } from '../../domain/models/report.model';
import {
  InvalidReportInputError,
  ReportInfrastructureError,
  ReportUnauthorizedError
} from '../../domain/errors/report.errors';

const paginaVacia: ReportsPage = { items: [], total: 0, page: 1, pageSize: 20 };

const paginaConDatos: ReportsPage = {
  items: [
    {
      id: 'rpt-001',
      ejecutivo: 'Ana López',
      equipo: 'Equipo Norte',
      abiertas: '8',
      valorAbierto: 25000,
      ganado: 12000,
      conversion: '48%',
      actVencidas: '3'
    },
    {
      id: 'rpt-002',
      ejecutivo: 'Carlos Ruiz',
      equipo: 'Equipo Sur',
      abiertas: '5',
      valorAbierto: 18000,
      ganado: 9000,
      conversion: '50%',
      actVencidas: '1'
    }
  ],
  total: 2,
  page: 1,
  pageSize: 20
};

function crear() {
  const repoSpy = createSpyObj<ReportRepositoryPort>('ReportRepositoryPort', ['listReports']);

  TestBed.configureTestingModule({
    imports: [ReportListComponent],
    providers: [
      provideRouter([
        { path: 'oportunidades/:id', component: ReportListComponent },
        { path: 'actividades', component: ReportListComponent }
      ]),
      ListReportsUseCase,
      { provide: REPORT_REPOSITORY, useValue: repoSpy }
    ]
  });

  const fixture = TestBed.createComponent(ReportListComponent);
  const component = fixture.componentInstance;
  const router = TestBed.inject(Router);
  return { fixture, component, repoSpy, router };
}

describe('ReportListComponent', () => {
  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  // ─── AC-01: Estado cargando ──────────────────────────────────────────────

  describe('AC-01 · estado cargando', () => {
    it('muestra «Cargando…» mientras la petición está en vuelo', () => {
      const { fixture, repoSpy } = crear();
      const enVuelo = new Subject<ReportsPage>();
      repoSpy.listReports.mockReturnValue(enVuelo.asObservable());

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-cargando')).not.toBeNull();
      expect(el.textContent).toContain(ESTADOS_VISTA.loading);
      expect(el.querySelector('.estado-datos')).toBeNull();

      enVuelo.complete();
    });
  });

  // ─── AC-02: Estado vacío ─────────────────────────────────────────────────

  describe('AC-02 · estado vacío', () => {
    it('muestra «No hay datos que mostrar.» cuando la lista está vacía', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaVacia));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-vacio')).not.toBeNull();
      expect(el.textContent).toContain(ESTADOS_VISTA.empty);
      expect(el.querySelector('.estado-datos')).toBeNull();
    });
  });

  // ─── AC-03: Estado error ─────────────────────────────────────────────────

  describe('AC-03 · estado error (infraestructura)', () => {
    it('muestra «No se pudo cargar. Vuelve a intentarlo.» ante un error 500', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(
        throwError(() => new ReportInfrastructureError(500, '/api/reports'))
      );

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-error')).not.toBeNull();
      expect(el.textContent).toContain(ESTADOS_VISTA.error);
    });
  });

  // ─── AC-04: Estado 400 ───────────────────────────────────────────────────

  describe('AC-04 · estado 400', () => {
    it('muestra «Revisa los datos marcados.» cuando la API responde 400', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(
        throwError(() => new InvalidReportInputError([{ field: 'page', message: 'Fuera de rango' }]))
      );

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-error')).not.toBeNull();
      expect(el.textContent).toContain(ESTADOS_VISTA.badRequest);
    });
  });

  // ─── AC-05: Estado 401 ───────────────────────────────────────────────────

  describe('AC-05 · estado 401 (R4-SEG-1)', () => {
    it('muestra «Tu sesión terminó: vuelve a entrar.» cuando la API responde 401', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(
        throwError(() => new ReportUnauthorizedError())
      );

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-sin-permiso')).not.toBeNull();
      expect(el.textContent).toContain(ESTADOS_VISTA.unauthorized);
    });
  });

  // ─── Estado con datos ────────────────────────────────────────────────────

  describe('estado con datos (200)', () => {
    it('pinta la tabla con todas las columnas y filas correctas', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-datos')).not.toBeNull();
      expect(el.querySelector('table')).not.toBeNull();

      const filas = el.querySelectorAll('tbody tr');
      expect(filas.length).toBe(2);
      expect(el.textContent).toContain('Ana López');
      expect(el.textContent).toContain('Carlos Ruiz');
      expect(el.textContent).toContain('Equipo Norte');
    });
  });

  // ─── act_cargar_bf50351776: llama a GET /api/reports ────────────────────

  describe('act_cargar_bf50351776 · llama a GET /api/reports al entrar', () => {
    it('invoca listReports en ngOnInit', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      expect(repoSpy.listReports).toHaveBeenCalledTimes(1);
      expect(repoSpy.listReports).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    });
  });

  // ─── dv_bf50351776: pulsar fila abre /oportunidades/:id ─────────────────

  describe('dv_bf50351776 · nav_4d20350fae · pulsar fila navega a /oportunidades/:id', () => {
    it('al hacer click en una fila, navega a /oportunidades/:id con el id correcto', async () => {
      const { fixture, repoSpy, router } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.detectChanges();

      const fila = fixture.nativeElement.querySelector('tbody tr') as HTMLElement;
      fila.click();
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith(['/oportunidades', 'rpt-001']);
    });
  });

  // ─── fld_f931c8aa65:required · Período obligatorio ───────────────────────

  describe('fld_f931c8aa65:required · Período es obligatorio', () => {
    it('sin valor en Período, al filtrar muestra «Período es obligatorio.»', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      // Vaciar el campo Período
      component.form.controls.periodo.setValue('');
      component.filtrar();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain(MENSAJES_VALIDACION.periodoRequired);
    });

    it('sin Período no se envía la petición extra (filtrar no llama al repo si hay error)', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges(); // ngOnInit: 1 llamada
      const llamadasIniciales = repoSpy.listReports.mock.calls.length;

      component.form.controls.periodo.setValue('');
      component.filtrar();
      fixture.detectChanges();

      // No se debe haber añadido otra llamada
      expect(repoSpy.listReports.mock.calls.length).toBe(llamadasIniciales);
    });
  });

  // ─── fld_f931c8aa65:partida · «Este año» por defecto ─────────────────────

  describe('fld_f931c8aa65:partida · Período empieza con «Este año»', () => {
    it('el campo Período tiene «Este año» al abrir el formulario', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      expect(component.form.controls.periodo.value).toBe('Este año');
    });
  });

  // ─── scr_4d8096d442:accesible · aria-invalid, aria-describedby y foco ───

  describe('scr_4d8096d442:accesible · aria-invalid, aria-describedby y foco al primer campo con error', () => {
    it('el select de Período lleva aria-invalid="true" y aria-describedby al enviarse vacío', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      component.form.controls.periodo.setValue('');
      component.filtrar();
      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select#periodo') as HTMLSelectElement;
      expect(select.getAttribute('aria-invalid')).toBe('true');
      expect(select.getAttribute('aria-describedby')).toBe('periodo-error');
      expect(select.getAttribute('aria-required')).toBe('true');
    });

    it('al enviar con errores, el foco va al select de Período (primer campo con error)', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      const select = fixture.nativeElement.querySelector('select#periodo') as HTMLSelectElement;
      const focusSpy = vi.spyOn(select, 'focus');

      component.form.controls.periodo.setValue('');
      component.filtrar();
      fixture.detectChanges();

      expect(focusSpy).toHaveBeenCalled();
    });
  });

  // ─── ctl_b48178afeb: Exportar muestra mensaje sin API ────────────────────

  describe('ctl_b48178afeb · Exportar enseña «Generamos el reporte en Excel.»', () => {
    it('al pulsar Exportar aparece «Generamos el reporte en Excel.»', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      component.exportar();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).toContain('Generamos el reporte en Excel.');
    });

    it('antes de pulsar Exportar, el mensaje no aparece', () => {
      const { fixture, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.textContent).not.toContain('Generamos el reporte en Excel.');
    });
  });

  // ─── ctl_529e1c2a36: Filtrar solo cambia la pantalla (sin API) ──────────

  describe('ctl_529e1c2a36 · Filtrar solo cambia la pantalla', () => {
    it('al filtrar con período válido, NO llama de nuevo a la API (solo cambia la pantalla)', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges(); // ngOnInit: 1 llamada
      const llamadasDespuesDeInit = repoSpy.listReports.mock.calls.length;

      component.form.controls.periodo.setValue('Este mes');
      component.filtrar();
      fixture.detectChanges();

      // Filtrar NO debe añadir más llamadas a la API
      expect(repoSpy.listReports.mock.calls.length).toBe(llamadasDespuesDeInit);
    });

    it('al filtrar con período válido, la tabla sigue mostrando los datos (pantalla cambia)', () => {
      const { fixture, component, repoSpy } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      fixture.detectChanges();

      component.form.controls.periodo.setValue('Mes anterior');
      component.filtrar();
      fixture.detectChanges();

      const el: HTMLElement = fixture.nativeElement;
      expect(el.querySelector('.estado-datos')).not.toBeNull();
      expect(el.querySelector('table')).not.toBeNull();
    });
  });

  // ─── nav_35547b4526: navega a /actividades al hacer click ───────────────

  describe('nav_35547b4526 · navega a /actividades al hacer click', () => {
    it('al hacer click en el botón Actividades, navega a /actividades', () => {
      const { fixture, repoSpy, router } = crear();
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));
      const navigateSpy = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      fixture.detectChanges();

      // Buscar el botón que navega a /actividades
      const botones = fixture.nativeElement.querySelectorAll('button[type="button"]') as NodeListOf<HTMLButtonElement>;
      const botonActividades = Array.from(botones).find(b =>
        b.getAttribute('aria-label') === 'Ver actividades'
      );
      expect(botonActividades).not.toBeNull();

      botonActividades!.click();
      fixture.detectChanges();

      expect(navigateSpy).toHaveBeenCalledWith(['/actividades']);
    });
  });
});
