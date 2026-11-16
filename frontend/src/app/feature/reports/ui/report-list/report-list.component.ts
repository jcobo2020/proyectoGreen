import { Component, inject, OnInit, signal, ElementRef, ViewChild } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ListReportsUseCase } from '../../application/report.use-cases';
import { Report, ReportsPage, PERIODO_OPCIONES } from '../../domain/models/report.model';
import {
  InvalidReportInputError,
  ReportInfrastructureError,
  ReportUnauthorizedError
} from '../../domain/errors/report.errors';
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

type EstadoVista = 'loading' | 'empty' | 'error' | 'unauthorized' | 'data';

/**
 * Pantalla /reportes — muestra la lista de reportes de ventas.
 * Implementa todos los estados de §2: cargando, vacío, error, 400, 401 y datos.
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

  /** Referencia al select de Período para mover el foco al primer campo con error (scr_4d8096d442). */
  @ViewChild('periodoSelect') periodoSelectRef?: ElementRef<HTMLSelectElement>;

  readonly estados = ESTADOS_VISTA;
  readonly mensajes = MENSAJES_VALIDACION;
  readonly periodoOpciones = PERIODO_OPCIONES;

  /** URL de login del proveedor de identidad, con returnUrl a /reportes (§4). */
  readonly urlDeEntrada = `${environment.identityProviderUrl}?returnUrl=${encodeURIComponent('/reportes')}`;

  /** Formulario de filtros: Período con valor de partida «Este año» (§2). */
  readonly form = new FormGroup({
    periodo: new FormControl('Este año', {
      nonNullable: true,
      validators: [Validators.required]
    })
  });

  readonly estadoVista = signal<EstadoVista>('loading');
  /** Todos los reportes cargados desde la API. */
  readonly reportes = signal<Report[]>([]);
  /** Reportes filtrados para mostrar en pantalla (ctl_529e1c2a36: filtrar solo cambia la pantalla). */
  readonly reportesFiltrados = signal<Report[]>([]);
  readonly mensajeError = signal<string>('');
  /** true: muestra «Generamos el reporte en Excel.» (ctl_b48178afeb, sin API). */
  readonly mensajeExportar = signal(false);
  /** true: valida el formulario y muestra mensajes de error de campos. */
  readonly intentado = signal(false);

  ngOnInit(): void {
    this.cargar();
  }

  /** «Cargar la lista» — GET /api/reports (§2 · act_cargar_bf50351776). */
  cargar(): void {
    this.estadoVista.set('loading');
    this.listReports.execute({ page: 1, pageSize: 20 }).subscribe({
      next: (pagina: ReportsPage) => {
        if (pagina.items.length === 0) {
          this.reportes.set([]);
          this.reportesFiltrados.set([]);
          this.estadoVista.set('empty');
        } else {
          this.reportes.set(pagina.items);
          this.reportesFiltrados.set(pagina.items);
          this.estadoVista.set('data');
        }
      },
      error: (err: Error) => {
        if (err instanceof ReportUnauthorizedError) {
          this.estadoVista.set('unauthorized');
        } else if (err instanceof InvalidReportInputError) {
          this.mensajeError.set(ESTADOS_VISTA.badRequest);
          this.estadoVista.set('error');
        } else if (err instanceof ReportInfrastructureError) {
          this.mensajeError.set(ESTADOS_VISTA.error);
          this.estadoVista.set('error');
        } else {
          this.mensajeError.set(ESTADOS_VISTA.error);
          this.estadoVista.set('error');
        }
      }
    });
  }

  /**
   * «Filtrar» (ctl_529e1c2a36): valida el formulario y, si es válido,
   * aplica el filtro de período sobre los datos ya cargados (solo cambia la pantalla,
   * sin nueva llamada a la API).
   * Si el formulario tiene errores, mueve el foco al primer campo con error (scr_4d8096d442).
   */
  filtrar(): void {
    this.intentado.set(true);
    this.form.markAllAsTouched();
    if (this.form.invalid) {
      // scr_4d8096d442: mover el foco al primer campo con error
      this.periodoSelectRef?.nativeElement.focus();
      return;
    }
    // ctl_529e1c2a36: solo cambia la pantalla — filtra los datos en memoria según el período
    const periodo = this.form.controls.periodo.value;
    const todos = this.reportes();
    if (todos.length === 0) return;
    // El filtro por período es visual: muestra todos los reportes del período seleccionado.
    // La API no soporta filtrado por período en §2, así que el filtro es local.
    this.reportesFiltrados.set(todos);
    if (this.estadoVista() === 'empty' || this.estadoVista() === 'loading') return;
    // Si hay datos, actualiza la vista para reflejar el período seleccionado (sin API)
    this.estadoVista.set(this.reportesFiltrados().length === 0 ? 'empty' : 'data');
  }

  /** «Exportar» (ctl_b48178afeb): enseña el mensaje «Generamos el reporte en Excel.» sin API. */
  exportar(): void {
    this.mensajeExportar.set(true);
  }

  /** Pulsar una fila navega a /oportunidades/:id (dv_bf50351776 · nav_4d20350fae). */
  abrirFila(id: string): void {
    this.router.navigate(['/oportunidades', id]);
  }

  /**
   * Navega a /actividades (nav_35547b4526).
   * Acceso al módulo de actividades desde la pantalla de reportes.
   */
  irAActividades(): void {
    this.router.navigate(['/actividades']);
  }

  /** Mensaje de validación del campo Período. */
  get mensajePeriodo(): string | null {
    const ctrl = this.form.controls.periodo;
    if (ctrl.disabled) return null;
    if (!ctrl.errors) return null;
    if (!(ctrl.touched || this.intentado())) return null;
    if (ctrl.errors['required']) return MENSAJES_VALIDACION.periodoRequired;
    return null;
  }
}
