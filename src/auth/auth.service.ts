import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    // Verificar si el usuario ya existe
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

    // Hash del password
    const password_hash = await bcrypt.hash(dto.password, 10);

    // Crear usuario
    const user = await this.prisma.user.create({
      data: {
        username: dto.username,
        email: dto.email,
        password_hash,
      },
    });

    // Obtener siguiente posición disponible
    const lastPlayer = await this.prisma.player.findFirst({
      orderBy: { position: 'desc' },
    });
    const nextPosition = (lastPlayer?.position || 0) + 1;

    // Crear jugador
    const player = await this.prisma.player.create({
      data: {
        user_id: user.id,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        position: nextPosition,
      },
    });

    // Generar JWT
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
        is_admin: user.is_admin, // 👈 AGREGAR AQUÍ
      },
    };
  }

  async login(dto: LoginDto) {
    // Buscar usuario
    const user = await this.prisma.user.findUnique({
      where: { username: dto.username },
      include: { player: true },
    });

    if (!user) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Verificar password
    const isPasswordValid = await bcrypt.compare(dto.password, user.password_hash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Credenciales incorrectas');
    }

    // Generar JWT
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
        is_admin: user.is_admin, // 👈 AGREGAR AQUÍ
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
          is_admin: user.is_admin, // 👈 AGREGAR AQUÍ
        },
      };
    } catch {
      throw new UnauthorizedException('Token inválido');
    }
  }

  private generateToken(userId: string, isAdmin: boolean): string {
    const payload = { sub: userId, is_admin: isAdmin };
    return this.jwtService.sign(payload);
  }
}
