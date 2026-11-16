import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import { provideRouter, Router } from '@angular/router';
import { createSpyObj } from '../../../../../testing/spy-obj';
import {
  ReportListComponent,
  ESTADOS_VISTA,
  MENSAJES_VALIDACION,
  MENSAJE_EXPORTAR
} from './report-list.component';
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
      valorAbierto: 18000.5,
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
  const el: HTMLElement = fixture.nativeElement;
  return { fixture, component, repoSpy, router, el };
}

/** Prepara la pantalla con la respuesta dada y la pinta (ngOnInit → «Cargar la lista»). */
function crearCon(respuesta: ReturnType<ReportRepositoryPort['listReports']>) {
  const ctx = crear();
  ctx.repoSpy.listReports.mockReturnValue(respuesta);
  ctx.fixture.detectChanges();
  return ctx;
}

function boton(el: HTMLElement, etiqueta: string): HTMLButtonElement {
  const encontrado = Array.from(el.querySelectorAll('button')).find(
    b => b.getAttribute('aria-label') === etiqueta || b.textContent?.trim() === etiqueta
  );
  if (!encontrado) throw new Error(`No hay botón «${etiqueta}»`);
  return encontrado;
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

  // ─── AC-01: cargando ─────────────────────────────────────────────────────

  describe('AC-01 · estado cargando', () => {
    it('muestra «Cargando…» mientras la petición está en vuelo, y nada más', () => {
      const enVuelo = new Subject<ReportsPage>();
      const { el } = crearCon(enVuelo.asObservable());

      expect(el.querySelector('.estado-cargando')?.textContent?.trim()).toBe(ESTADOS_VISTA.loading);
      expect(el.querySelector('.estado-datos')).toBeNull();
      expect(el.querySelector('.estado-vacio')).toBeNull();
      expect(el.querySelector('.estado-error')).toBeNull();

      enVuelo.complete();
    });
  });

  // ─── AC-02: vacío ────────────────────────────────────────────────────────

  describe('AC-02 · estado vacío', () => {
    it('muestra «No hay datos que mostrar.» cuando la lista llega vacía', () => {
      const { el } = crearCon(of(paginaVacia));

      expect(el.querySelector('.estado-vacio')?.textContent?.trim()).toBe(ESTADOS_VISTA.empty);
      expect(el.querySelector('.estado-datos')).toBeNull();
      expect(el.querySelector('.estado-cargando')).toBeNull();
    });
  });

  // ─── AC-03: la carga falla ───────────────────────────────────────────────

  describe('AC-03 · estado error', () => {
    it('muestra «No se pudo cargar. Vuelve a intentarlo.» ante un 500', () => {
      const { el } = crearCon(throwError(() => new ReportInfrastructureError(500, '/api/reports')));

      expect(el.querySelector('.estado-error p')?.textContent?.trim()).toBe(ESTADOS_VISTA.error);
      expect(el.querySelector('.estado-datos')).toBeNull();
    });

    it('muestra el mismo aviso si la API no responde (error de red, status 0)', () => {
      const { el } = crearCon(throwError(() => new ReportInfrastructureError(0, '/api/reports')));

      expect(el.querySelector('.estado-error p')?.textContent?.trim()).toBe(ESTADOS_VISTA.error);
    });

    it('muestra el mismo aviso ante un fallo que no es de dominio', () => {
      const { el } = crearCon(throwError(() => new Error('inesperado')));

      expect(el.querySelector('.estado-error p')?.textContent?.trim()).toBe(ESTADOS_VISTA.error);
    });

    it('«Vuelve a intentarlo» repite «Cargar la lista» y, si ahora responde, pinta los datos', () => {
      const { fixture, el, repoSpy } = crearCon(
        throwError(() => new ReportInfrastructureError(500, '/api/reports'))
      );
      repoSpy.listReports.mockReturnValue(of(paginaConDatos));

      boton(el, 'Vuelve a intentarlo').click();
      fixture.detectChanges();

      expect(repoSpy.listReports).toHaveBeenCalledTimes(2);
      expect(el.querySelector('.estado-error')).toBeNull();
      expect(el.querySelectorAll('tbody tr').length).toBe(2);
    });
  });

  // ─── AC-04: 400 ──────────────────────────────────────────────────────────

  describe('AC-04 · estado 400', () => {
    it('muestra «Revisa los datos marcados.» cuando la API responde 400', () => {
      const { el } = crearCon(
        throwError(() => new InvalidReportInputError([{ field: 'page', message: 'Fuera de rango' }]))
      );

      expect(el.querySelector('.estado-error p')?.textContent?.trim()).toBe(ESTADOS_VISTA.badRequest);
      expect(el.textContent).not.toContain(ESTADOS_VISTA.error);
    });
  });

  // ─── AC-05: 401 (R4-SEG-1) ───────────────────────────────────────────────

  describe('AC-05 · estado sin sesión (401, R4-SEG-1)', () => {
    it('muestra «Tu sesión terminó: vuelve a entrar.» y no pinta la tarjeta', () => {
      const { el } = crearCon(throwError(() => new ReportUnauthorizedError()));

      expect(el.querySelector('.estado-sin-permiso p')?.textContent?.trim()).toBe(ESTADOS_VISTA.unauthorized);
      expect(el.querySelector('.reportes-card')).toBeNull();
    });

    it('«vuelve a entrar» lleva al inicio de sesión del authGuard con returnUrl=/reportes', () => {
      const { el } = crearCon(throwError(() => new ReportUnauthorizedError()));

      const enlace = el.querySelector('.estado-sin-permiso a') as HTMLAnchorElement;
      expect(enlace.textContent?.trim()).toBe('vuelve a entrar');
      expect(enlace.getAttribute('href')).toBe('http://localhost:4000/login?returnUrl=%2Freportes');
    });
  });

  // ─── Con datos: vista «Reportes» (dv_bf50351776) ─────────────────────────

  describe('estado con datos (200) · dv_bf50351776', () => {
    it('pinta la tabla dentro de la tarjeta, con los filtros encima y las columnas de §2', () => {
      const { el } = crearCon(of(paginaConDatos));

      const tarjeta = el.querySelector('.reportes-card') as HTMLElement;
      const hijos = Array.from(tarjeta.children);
      const posFiltros = hijos.findIndex(h => h.matches('form.reportes-filtros'));
      const posTabla = hijos.findIndex(h => h.matches('.estado-datos'));
      expect(posFiltros).toBeGreaterThanOrEqual(0);
      expect(posFiltros).toBeLessThan(posTabla);

      const cabeceras = Array.from(el.querySelectorAll('thead th')).map(th => th.textContent?.trim());
      expect(cabeceras).toEqual([
        'Ejecutivo',
        'Equipo',
        'Abiertas',
        'Valor abierto',
        'Ganado',
        'Conversión',
        'Act. vencidas'
      ]);
    });

    it('pinta una fila por elemento, con sus valores y el dinero con dos decimales', () => {
      const { el } = crearCon(of(paginaConDatos));

      const filas = el.querySelectorAll('tbody tr');
      expect(filas.length).toBe(2);
      const celdas = Array.from(filas[1].querySelectorAll('td')).map(td => td.textContent?.trim());
      expect(celdas).toEqual(['Carlos Ruiz', 'Equipo Sur', '5', '18,000.50', '9,000.00', '50%', '1']);
    });
  });

  // ─── act_cargar_bf50351776:llama ─────────────────────────────────────────

  describe('act_cargar_bf50351776:llama · «Cargar la lista» al entrar', () => {
    it('pide la primera página (page 1, pageSize 20) una sola vez al abrir la pantalla', () => {
      const { repoSpy } = crearCon(of(paginaConDatos));

      expect(repoSpy.listReports).toHaveBeenCalledTimes(1);
      expect(repoSpy.listReports).toHaveBeenCalledWith({ page: 1, pageSize: 20 });
    });
  });

  // ─── dv_bf50351776:abre_la_fila · nav_4d20350fae:navega ──────────────────

  describe('dv_bf50351776:abre_la_fila · nav_4d20350fae:navega', () => {
    it('pulsar cualquier celda de una fila abre /oportunidades/:id con su id', () => {
      const { fixture, el, router } = crearCon(of(paginaConDatos));
      const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const celda = el.querySelectorAll('tbody tr')[1].querySelectorAll('td')[4] as HTMLElement;
      celda.click();
      fixture.detectChanges();

      expect(navegar).toHaveBeenCalledWith(['/oportunidades', 'rpt-002']);
    });

    it('con el foco en una fila, Enter también la abre', () => {
      const { fixture, el, router } = crearCon(of(paginaConDatos));
      const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      const fila = el.querySelector('tbody tr') as HTMLElement;
      expect(fila.getAttribute('tabindex')).toBe('0');
      fila.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      fixture.detectChanges();

      expect(navegar).toHaveBeenCalledWith(['/oportunidades', 'rpt-001']);
    });
  });

  // ─── nav_35547b4526:navega ───────────────────────────────────────────────

  describe('nav_35547b4526:navega · «click» → /actividades', () => {
    it('al pulsar «Actividades», va a /actividades', () => {
      const { fixture, el, router } = crearCon(of(paginaConDatos));
      const navegar = vi.spyOn(router, 'navigate').mockResolvedValue(true);

      boton(el, 'Ver actividades').click();
      fixture.detectChanges();

      expect(navegar).toHaveBeenCalledWith(['/actividades']);
    });
  });

  // ─── fld_f931c8aa65:partida ──────────────────────────────────────────────

  describe('fld_f931c8aa65:partida · Período empieza con «Este año»', () => {
    it('al abrir, el select de Período muestra «Este año» y ofrece las cuatro opciones', async () => {
      const { fixture, el } = crearCon(of(paginaConDatos));
      await fixture.whenStable();

      const select = el.querySelector('select#periodo') as HTMLSelectElement;
      expect(select.value).toBe('Este año');
      expect(Array.from(select.options).map(o => o.textContent?.trim())).toEqual([
        'Este mes',
        'Mes anterior',
        'Este trimestre',
        'Este año'
      ]);
    });

    it('la etiqueta marca el obligatorio con «*» tras «Período»', () => {
      const { el } = crearCon(of(paginaConDatos));

      const etiqueta = el.querySelector('label[for="periodo"]') as HTMLLabelElement;
      expect(etiqueta.textContent?.replace(/\s+/g, ' ').trim()).toBe('Período *');
      expect(etiqueta.querySelector('.campo-obligatorio')).not.toBeNull();
    });
  });

  // ─── fld_f931c8aa65:required ─────────────────────────────────────────────

  describe('fld_f931c8aa65:required · Período es obligatorio', () => {
    it('sin «Período», al pulsar «Filtrar» no se envía nada y aparece «Período es obligatorio.»', () => {
      const { fixture, component, el, repoSpy } = crearCon(of(paginaConDatos));
      expect(el.textContent).not.toContain(MENSAJES_VALIDACION.periodoRequired);

      component.form.controls.periodo.setValue('');
      boton(el, 'Filtrar reportes').click();
      fixture.detectChanges();

      expect(el.querySelector('#periodo-error')?.textContent?.trim()).toBe(MENSAJES_VALIDACION.periodoRequired);
      expect(repoSpy.listReports).toHaveBeenCalledTimes(1);
    });
  });

  // ─── scr_4d8096d442:accesible ────────────────────────────────────────────

  describe('scr_4d8096d442:accesible', () => {
    it('el obligatorio lleva aria-required="true" desde el principio, sin aria-invalid', () => {
      const { el } = crearCon(of(paginaConDatos));

      const select = el.querySelector('select#periodo') as HTMLSelectElement;
      expect(select.getAttribute('aria-required')).toBe('true');
      expect(select.hasAttribute('aria-invalid')).toBe(false);
      expect(select.hasAttribute('aria-describedby')).toBe(false);
    });

    it('al enviar con errores: aria-invalid="true", mensaje enlazado por aria-describedby y foco en Período', () => {
      const { fixture, component, el } = crearCon(of(paginaConDatos));
      const select = el.querySelector('select#periodo') as HTMLSelectElement;
      const enfocar = vi.spyOn(select, 'focus');

      component.form.controls.periodo.setValue('');
      boton(el, 'Filtrar reportes').click();
      fixture.detectChanges();

      expect(select.getAttribute('aria-invalid')).toBe('true');
      const idMensaje = select.getAttribute('aria-describedby');
      expect(idMensaje).toBe('periodo-error');
      expect(el.querySelector(`#${idMensaje}`)?.textContent?.trim()).toBe(MENSAJES_VALIDACION.periodoRequired);
      expect(enfocar).toHaveBeenCalled();
    });
  });

  // ─── ctl_b48178afeb:control ──────────────────────────────────────────────

  describe('ctl_b48178afeb:control · «Exportar»', () => {
    it('está junto al título y al pulsarlo enseña «Generamos el reporte en Excel.» sin llamar a la API', () => {
      const { fixture, el, repoSpy } = crearCon(of(paginaConDatos));
      const exportar = boton(el, 'Exportar reporte');
      expect(exportar.closest('.reportes-titulo-grupo')?.querySelector('h1')?.textContent).toBe('Reportes');
      expect(el.textContent).not.toContain(MENSAJE_EXPORTAR);

      exportar.click();
      fixture.detectChanges();

      expect(el.querySelector('.aviso-exportar')?.textContent?.trim()).toBe(MENSAJE_EXPORTAR);
      expect(repoSpy.listReports).toHaveBeenCalledTimes(1);
    });
  });

  // ─── ctl_529e1c2a36:control ──────────────────────────────────────────────

  describe('ctl_529e1c2a36:control · «Filtrar» solo cambia la pantalla', () => {
    it('con un Período válido no llama a la API, no enseña errores y la tabla sigue ahí', () => {
      const { fixture, component, el, repoSpy } = crearCon(of(paginaConDatos));

      component.form.controls.periodo.setValue('Este mes');
      boton(el, 'Filtrar reportes').click();
      fixture.detectChanges();

      expect(repoSpy.listReports).toHaveBeenCalledTimes(1);
      expect(el.querySelector('#periodo-error')).toBeNull();
      expect(el.querySelectorAll('tbody tr').length).toBe(2);
    });

    it('al corregir el Período tras un error, el aviso desaparece', () => {
      const { fixture, component, el } = crearCon(of(paginaConDatos));

      component.form.controls.periodo.setValue('');
      boton(el, 'Filtrar reportes').click();
      fixture.detectChanges();
      expect(el.querySelector('#periodo-error')).not.toBeNull();

      component.form.controls.periodo.setValue('Este trimestre');
      boton(el, 'Filtrar reportes').click();
      fixture.detectChanges();

      expect(el.querySelector('#periodo-error')).toBeNull();
      expect((el.querySelector('select#periodo') as HTMLSelectElement).hasAttribute('aria-invalid')).toBe(false);
    });
  });
});
