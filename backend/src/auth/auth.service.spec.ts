import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getModelToken } from '@nestjs/mongoose';
import { Test, TestingModule } from '@nestjs/testing';
import { BrevoService } from '../mail/brevo.service';
import { Usuario } from '../users/schemas/usuario.schema';
import { AuthService } from './auth.service';

describe('AuthService', () => {
  let service: AuthService;
  let brevoService: {
    validateEmailExistence: jest.Mock;
    sendVerificationEmail: jest.Mock;
    sendWelcomeEmail: jest.Mock;
  };
  let mockUsuarioModel: any;

  beforeEach(async () => {
    brevoService = {
      validateEmailExistence: jest.fn(),
      sendVerificationEmail: jest.fn().mockResolvedValue(true),
      sendWelcomeEmail: jest.fn().mockResolvedValue(true),
    };

    const saveMock = jest.fn().mockResolvedValue({});
    mockUsuarioModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      save: saveMock,
    }));
    mockUsuarioModel.findOne = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(Usuario.name), useValue: mockUsuarioModel },
        {
          provide: JwtService,
          useValue: { signAsync: jest.fn(), verifyAsync: jest.fn() },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('secret') },
        },
        { provide: BrevoService, useValue: brevoService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('debe rechazar el registro si no acepta el aviso de privacidad (RNF-22)', async () => {
    await expect(
      service.register({
        nombre: 'Ana',
        apellidos: 'López',
        correo: 'ana@gmail.com',
        contrasena: 'Password123!',
        aceptoPrivacidad: false,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe validar existencia MX y enviar correo de verificación sin enviar bienvenida aún', async () => {
    brevoService.validateEmailExistence.mockResolvedValue({ valid: true });

    const res = await service.register({
      nombre: 'Ana',
      apellidos: 'López',
      correo: 'ana@gmail.com',
      contrasena: 'Password123!',
      aceptoPrivacidad: true,
    });

    expect(res.requiereVerificacion).toBe(true);
    expect(brevoService.validateEmailExistence).toHaveBeenCalledWith(
      'ana@gmail.com',
    );
    expect(brevoService.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect(brevoService.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('debe enviar el correo de bienvenida solo después de verificar el token', async () => {
    const fakeUser = {
      correo: 'ana@gmail.com',
      nombre: 'Ana',
      emailVerified: false,
      save: jest.fn().mockResolvedValue(true),
    };
    mockUsuarioModel.findOne.mockReturnValue({
      exec: jest.fn().mockResolvedValue(fakeUser),
    });

    const res = await service.verifyEmail('valid-token');
    expect(res.success).toBe(true);
    expect(fakeUser.emailVerified).toBe(true);
    expect(brevoService.sendWelcomeEmail).toHaveBeenCalledWith(
      'ana@gmail.com',
      'Ana',
    );
  });
});
