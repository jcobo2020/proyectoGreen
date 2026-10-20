/**
 * Modelo de dominio del cliente (customer) para el alta, tal como lo define
 * POST /api/customers en GREEN-H2-API-CLIENTES-001 (§2 del pack).
 */
export type PersonType = 'legal' | 'natural';
export type IdType = 'cedula' | 'ruc' | 'passport';
export type City =
  | 'guayaquil'
  | 'quito'
  | 'manta'
  | 'cuenca'
  | 'duran'
  | 'ambato'
  | 'machala'
  | 'riobamba';
export type SourceChannel =
  | 'referido_de_cliente'
  | 'cartera_propia'
  | 'campana_digital'
  | 'alianza_bancaria'
  | 'cuenta_estrategica';

/** Cuerpo de POST /api/customers: solo los campos del contrato. */
export interface CreateCustomerPayload {
  personType: PersonType;
  idType: IdType;
  idNumber: string;
  email: string;
  sourceChannel: SourceChannel;
  legalName?: string;
  firstNames?: string;
  lastNames?: string;
  mobilePhone?: string;
  city?: City;
  address?: string;
  accountExecutiveId?: string;
  notes?: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
}

/** Respuesta 201 de POST /api/customers: {id, code, ...los datos enviados, createdAt}. */
export interface Customer extends CreateCustomerPayload {
  id: string;
  /** PRO-AAAA-NNN */
  code: string;
  createdAt: string;
}

/** Cada elemento de details en un 400 VALIDATION_ERROR: el campo y su mensaje literal. */
export interface CustomerFieldError {
  field: string;
  message: string;
}
