import { BadRequestException, ForbiddenException } from '@nestjs/common';
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
    mockUsuarioModel.findOneAndUpdate = jest.fn().mockReturnValue({
      exec: jest.fn().mockResolvedValue(null),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getModelToken(Usuario.name), useValue: mockUsuarioModel },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn().mockResolvedValue('jwt-token'),
            verifyAsync: jest.fn(),
          },
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

  it('debe rechazar el registro de DOCENTE si el correo no termina en @utvtol.edu.mx', async () => {
    await expect(
      service.register({
        nombre: 'Luis',
        apellidos: 'Pérez',
        correo: 'luis@gmail.com',
        contrasena: 'Password123!',
        rol: 'DOCENTE' as any,
        aceptoPrivacidad: true,
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('debe rechazar el registro público como ADMINISTRADOR', async () => {
    await expect(
      service.register({
        nombre: 'Admin',
        apellidos: 'Intruso',
        correo: 'intruso@gmail.com',
        contrasena: 'Password123!',
        rol: 'ADMINISTRADOR' as any,
        aceptoPrivacidad: true,
      }),
    ).rejects.toThrow(ForbiddenException);
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
      _id: '507f1f77bcf86cd799439011',
      correo: 'ana@gmail.com',
      nombre: 'Ana',
      rol: 'ESTUDIANTE',
      tokenVersion: 0,
      emailVerified: true,
    };
    mockUsuarioModel.findOneAndUpdate
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(fakeUser),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

    const res = await service.verifyEmail('12345678');
    expect(res.accessToken).toBe('jwt-token');
    expect(res.requiresVerification).toBe(false);
    expect(mockUsuarioModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ emailVerificationToken: '12345678' }),
      expect.objectContaining({
        $set: expect.objectContaining({ emailVerified: true }),
        $unset: { emailVerificationToken: 1, emailVerificationExpires: 1 },
      }),
      { new: true },
    );
    expect(brevoService.sendWelcomeEmail).toHaveBeenCalledWith(
      'ana@gmail.com',
      'Ana',
    );

    await expect(service.verifyEmail('12345678')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('debe invalidar el token de recuperación tras usarse y rechazar su reutilización', async () => {
    mockUsuarioModel.findOneAndUpdate
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue({ correo: 'ana@gmail.com' }),
      })
      .mockReturnValueOnce({
        exec: jest.fn().mockResolvedValue(null),
      });

    const res = await service.resetPassword({
      token: '87654321',
      nuevaContrasena: 'NewPassword123!',
    });
    expect(res.success).toBe(true);
    expect(mockUsuarioModel.findOneAndUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ resetPasswordToken: '87654321' }),
      expect.objectContaining({
        $unset: { resetPasswordToken: 1, resetPasswordExpires: 1 },
        $inc: { tokenVersion: 1 },
      }),
      { new: true },
    );

    await expect(
      service.resetPassword({
        token: '87654321',
        nuevaContrasena: 'NewPassword123!',
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
