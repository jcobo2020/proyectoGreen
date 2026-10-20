import { FormControl } from '@angular/forms';
import { ValidationService } from './validation.service';

describe('ValidationService.email', () => {
  const validar = (valor: unknown) => new ValidationService().email()(new FormControl(valor));

  it('acepta un correo válido, también con espacios alrededor', () => {
    expect(validar('ana@example.com')).toBeNull();
    expect(validar(' ana@example.com ')).toBeNull();
  });

  it('marca {email: true} un correo sin arroba, sin dominio o con espacios dentro', () => {
    expect(validar('ana')).toEqual({ email: true });
    expect(validar('ana@example')).toEqual({ email: true });
    expect(validar('an a@example.com')).toEqual({ email: true });
  });

  it('un valor vacío o que no es texto no es un correo inválido (lo obligatorio va aparte)', () => {
    expect(validar('')).toBeNull();
    expect(validar(null)).toBeNull();
  });
});
