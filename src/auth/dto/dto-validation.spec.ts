import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { LoginDto } from './login.dto';
import { RegisterDto } from './register.dto';

describe('DTOs de auth', () => {
  it('LoginDto rechaza payload sin password', async () => {
    const dto = plainToInstance(LoginDto, { username: 'javier' });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });

  it('LoginDto acepta payload completo', async () => {
    const dto = plainToInstance(LoginDto, {
      username: 'javier',
      password: 'secreto',
    });
    expect(await validate(dto)).toHaveLength(0);
  });

  it('RegisterDto rechaza email inválido y password corta', async () => {
    const dto = plainToInstance(RegisterDto, {
      username: 'nuevo',
      email: 'no-es-email',
      password: '123',
      name: 'Nuevo',
    });
    const errors = await validate(dto);
    expect(errors.some((e) => e.property === 'email')).toBe(true);
    expect(errors.some((e) => e.property === 'password')).toBe(true);
  });
});
