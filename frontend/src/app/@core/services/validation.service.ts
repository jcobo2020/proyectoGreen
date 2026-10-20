import { Injectable } from '@angular/core';
import { AbstractControl, ValidationErrors, ValidatorFn } from '@angular/forms';

/** Un correo: algo@dominio.ext, sin espacios. El servidor lo vuelve a validar (R4-SEG-4). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validaciones transversales de formulario (plantilla de stack, §3 «Formularios»).
 * Un campo vacío no es un correo inválido: lo obligatorio lo dice Validators.required.
 */
@Injectable({ providedIn: 'root' })
export class ValidationService {
  email(): ValidatorFn {
    return (control: AbstractControl): ValidationErrors | null => {
      const value = typeof control.value === 'string' ? control.value.trim() : '';
      if (value === '') return null;
      return EMAIL_PATTERN.test(value) ? null : { email: true };
    };
  }
}
