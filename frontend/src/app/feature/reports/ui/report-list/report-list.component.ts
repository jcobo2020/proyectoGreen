import { Component, inject, OnInit, signal, ElementRef, ViewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ListReportsUseCase } from '../../application/report.use-cases';
import { Report, ReportsPage, PERIODO_OPCIONES } from '../../domain/models/report.model';
import { InvalidReportInputError, ReportUnauthorizedError } from '../../domain/errors/report.errors';
import { environment } from '../../../../../environments/environment';

/** Textos literales de cada estado de vista (§2 de GREEN-H2-UX-REPORTES-001). */
export const ESTADOS_VISTA = {
  loading: 'Cargando…',
  empty: 'No hay datos que mostrar.',
  error: 'No se pudo cargar. Vuelve a intentarlo.',
  badRequest: 'Revisa los datos marcados.',
  unauthorized: 'Tu sesión terminó: vuelve a entrar.'
} as const;

/** Mensajes de validación de los campos del formulario (§2). */
export const MENSAJES_VALIDACION = {
  periodoRequired: 'Período es obligatorio.'
} as const;

/** Lo que enseña «Exportar» (ctl_b48178afeb): un mensaje, sin API. */
export const MENSAJE_EXPORTAR = 'Generamos el reporte en Excel.';

type EstadoVista = 'loading' | 'empty' | 'error' | 'unauthorized' | 'data';

/**
 * Pantalla /reportes — lista de reportes de ventas.
 * Estados de §2: cargando, vacío, error (carga fallida y 400), sin sesión (401) y con datos.
 */
@Component({
  selector: 'app-report-list',
  standalone: true,
  imports: [ReactiveFormsModule, DecimalPipe],
  templateUrl: './report-list.component.html',
  styleUrl: './report-list.component.css'
})
export class ReportListComponent implements OnInit {
  private readonly listReports = inject(ListReportsUseCase);
  private readonly router = inject(Router);

  /** El select de Período, para llevar el foco al primer campo con error (scr_4d8096d442). */
  @ViewChild('periodoSelect') periodoSelectRef?: ElementRef<HTMLSelectElement>;

  readonly estados = ESTADOS_VISTA;
  readonly mensajeExportar = MENSAJE_EXPORTAR;
  readonly periodoOpciones = PERIODO_OPCIONES;

  /** «vuelve a entrar»: el inicio de sesión que usa el authGuard, con returnUrl a /reportes. */
  readonly urlDeEntrada = `${environment.identityProviderUrl}?returnUrl=${encodeURIComponent('/reportes')}`;

  /** Filtros: Período empieza con «Este año» y es obligatorio (fld_f931c8aa65). */
  readonly form = new FormGroup({
    periodo: new FormControl('Este año', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  readonly estadoVista = signal<EstadoVista>('loading');
  readonly reportes = signal<Report[]>([]);
  readonly mensajeError = signal<string>('');
  /** true: se ve «Generamos el reporte en Excel.». */
  readonly exportado = signal(false);
  /** true tras pulsar «Filtrar»: a partir de ahí se enseñan los errores de los campos. */
  readonly intentado = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  /** «Cargar la lista» — GET /api/reports (act_cargar_bf50351776). También la repite «Vuelve a intentarlo». */
  cargar(): void {
    this.estadoVista.set('loading');
    this.listReports.execute({ page: 1, pageSize: 20 }).subscribe({
      next: (pagina: ReportsPage) => {
        this.reportes.set(pagina.items);
        this.estadoVista.set(pagina.items.length === 0 ? 'empty' : 'data');
      },
      error: (err: unknown) => {
        if (err instanceof ReportUnauthorizedError) {
          this.estadoVista.set('unauthorized');
          return;
        }
        // 400 → su aviso de §2; cualquier otro fallo (500, red…) → el aviso genérico de carga.
        this.mensajeError.set(
          err instanceof InvalidReportInputError ? ESTADOS_VISTA.badRequest : ESTADOS_VISTA.error
        );
        this.estadoVista.set('error');
      }
    });
  }

  /**
   * «Filtrar» (ctl_529e1c2a36): solo cambia la pantalla, nunca llama a la API.
   * Valida el formulario y, con errores, lleva el foco al primer campo con error.
   * Con un Período válido la tabla no cambia: GET /api/reports no acepta período y sus filas no traen
   * fecha, así que no hay con qué filtrarlas (pregunta abierta en el control plane).
   */
  filtrar(): void {
    this.intentado.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      this.periodoSelectRef?.nativeElement.focus();
    }
  }

  /** «Exportar» (ctl_b48178afeb): enseña «Generamos el reporte en Excel.» sin llamar a ninguna API. */
  exportar(): void {
    this.exportado.set(true);
  }

  /** Pulsar una fila abre /oportunidades/:id con su id (dv_bf50351776 · nav_4d20350fae). */
  abrirFila(id: string): void {
    this.router.navigate(['/oportunidades', id]);
  }

  /** nav_35547b4526: «click» → /actividades (el control no lo declara §2: ver el informe). */
  irAActividades(): void {
    this.router.navigate(['/actividades']);
  }

  /** Mensaje de validación del campo Período, solo tras tocarlo o pulsar «Filtrar». */
  get mensajePeriodo(): string | null {
    const ctrl = this.form.controls.periodo;
    if (!ctrl.errors?.['required']) return null;
    if (!(ctrl.touched || this.intentado())) return null;
    return MENSAJES_VALIDACION.periodoRequired;
  }
}
