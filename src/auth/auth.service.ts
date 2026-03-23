import { Injectable, UnauthorizedException, ConflictException, BadRequestException, NotFoundException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { randomUUID } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { whatsappService } from '../notifications/whatsapp.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existingUser = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: dto.username },
          { email: dto.email },
        ],
      },
    });

    if (existingUser) {
      throw new ConflictException('Username o email ya existe');
    }

    const password_hash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password_hash,
      },
    });

    const lastPlayer = await this.prisma.player.findFirst({
      orderBy: { position: 'desc' },
    });
    const nextPosition = (lastPlayer?.position || 0) + 1;

    const player = await this.prisma.player.create({
      data: {
        user_id: user.id,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        position: nextPosition,
      },
    });

    const token = this.generateToken(user.id, user.is_admin);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
      },
      player: {
        ...player,
        is_admin: user.is_admin,
      },
    };
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { player: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    const token = this.generateToken(user.id, user.is_admin);

    return {
      token,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        is_admin: user.is_admin,
      },
      player: {
        ...user.player,
        is_admin: user.is_admin,
      },
    };
  }

  async validateToken(token: string) {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        include: { player: true },
      });

      if (!user) {
        throw new UnauthorizedException('Usuario no encontrado');
      }

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          is_admin: user.is_admin,
        },
        player: {
          ...user.player,
          is_admin: user.is_admin,
        },
      };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  // ─── Forgot Password ───────────────────────────────────────────────────────
  async forgotPassword(username: string) {
    // Buscar usuario por username
    const user = await this.prisma.user.findUnique({
      where: { username },
      include: { player: true },
    });

    // Respuesta genérica siempre para no revelar si el usuario existe
    const genericResponse = {
      message: 'Si el usuario existe, se enviará un mensaje de WhatsApp con el enlace.',
    };

    if (!user || !user.player) return genericResponse;
    if (!user.player.phone) {
      throw new BadRequestException(
        'Tu cuenta no tiene un número de teléfono registrado. Contacta al administrador.',
      );
    }

    // Invalidar tokens anteriores no usados
    await this.prisma.passwordResetToken.updateMany({
      where: { user_id: user.id, used: false },
      data: { used: true },
    });

    // Crear nuevo token con expiración de 1 hora
    const token = randomUUID();
    const expires_at = new Date(Date.now() + 60 * 60 * 1000);

    await this.prisma.passwordResetToken.create({
      data: {
        user_id: user.id,
        token,
        expires_at,
      },
    });

    const frontendUrl = process.env.FRONTEND_URL || 'https://escalerilla.clubdetenisgraneros.cl';
    const resetLink = `${frontendUrl}/reset-password?token=${token}`;

    // Enviar por WhatsApp (no bloqueamos la respuesta si falla)
    whatsappService
      .sendPasswordResetLink(user.player.name, user.player.phone, resetLink)
      .catch((err) => console.error('Error enviando WhatsApp reset:', err));

    return genericResponse;
  }

  // ─── Reset Password ────────────────────────────────────────────────────────
  async resetPassword(token: string, newPassword: string) {
    const resetToken = await this.prisma.passwordResetToken.findUnique({
      where: { token },
    });

    if (!resetToken) {
      throw new BadRequestException('El enlace no es válido.');
    }

    if (resetToken.used) {
      throw new BadRequestException('Este enlace ya fue utilizado.');
    }

    if (new Date() > resetToken.expires_at) {
      throw new BadRequestException('El enlace ha expirado. Solicita uno nuevo.');
    }

    if (newPassword.length < 6) {
      throw new BadRequestException('La contraseña debe tener al menos 6 caracteres.');
    }

    const password_hash = await bcrypt.hash(newPassword, 10);

    // Actualizar contraseña y marcar token como usado en una transacción
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: resetToken.user_id },
        data: { password_hash },
      }),
      this.prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true },
      }),
    ]);

    return { message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' };
  }

  private generateToken(userId: string, isAdmin: boolean): string {
    const payload = { sub: userId, is_admin: isAdmin };
    return this.jwtService.sign(payload);
  }
}