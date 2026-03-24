import { Injectable, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';
import { uploadAvatar } from './cloudinary.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class PlayersService {
  constructor(
    private prisma: PrismaService,
    private challengeRules: ChallengeRulesService
  ) {}

  async findAll() {
    const players = await this.prisma.player.findMany({
      orderBy: { position: 'asc' },
      include: {
        user: {
          select: { username: true, is_admin: true }
        },
        challenges_made: {
          where: { status: { in: ['pending', 'accepted'] } },
          orderBy: { created_at: 'desc' },
          take: 1,
          include: {
            challenged: { select: { id: true, name: true, position: true } }
          }
        },
        challenges_received: {
          where: { status: { in: ['pending', 'accepted'] } },
          orderBy: { created_at: 'desc' },
          take: 1,
          include: {
            challenger: { select: { id: true, name: true, position: true } }
          }
        }
      }
    });

    return players.map(p => ({
      ...p,
      is_admin: p.user?.is_admin || false,
      challenger_challenge: p.challenges_made[0] || null,
      challenged_challenge: p.challenges_received[0] || null,
    }));
  }

  async findOne(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        user: { select: { username: true, email: true, is_admin: true } },
        challenges_made: {
          orderBy: { created_at: 'desc' },
          take: 10,
          include: { challenged: { select: { name: true, position: true } } }
        },
        challenges_received: {
          orderBy: { created_at: 'desc' },
          take: 10,
          include: { challenger: { select: { name: true, position: true } } }
        },
        ranking_history: {
          orderBy: { created_at: 'desc' },
          take: 20
        }
      }
    });

    if (!player) throw new NotFoundException('Jugador no encontrado');

    return { ...player, is_admin: player.user?.is_admin || false };
  }

  async findByUserId(userId: string) {
    const player = await this.prisma.player.findUnique({
      where: { user_id: userId },
      include: {
        user: { select: { username: true, email: true, is_admin: true } }
      }
    });

    if (!player) throw new NotFoundException(`Jugador con user_id ${userId} no encontrado`);

    return { ...player, is_admin: player.user?.is_admin || false };
  }

  async getAvailableChallenges(id: string) {
    const availablePlayers = await this.challengeRules.getAvailableChallenges(id);

    return {
      player_id: id,
      available_challenges: availablePlayers.map(p => ({
        id: p.id,
        name: p.name,
        position: p.position,
        level: this.challengeRules.getLevel(p.position),
        wins: p.wins,
        losses: p.losses
      }))
    };
  }

  /**
   * Actualizar perfil del jugador autenticado
   */
  async updateMe(
    userId: string,
    data: {
      name?: string;
      phone?: string;
      current_password?: string;
      new_password?: string;
    }
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { player: true }
    });

    if (!user || !user.player) throw new NotFoundException('Jugador no encontrado');

    const playerUpdate: any = {};
    const userUpdate: any = {};

    if (data.name?.trim()) playerUpdate.name = data.name.trim();
    if (data.phone !== undefined) playerUpdate.phone = data.phone || null;

    // Cambio de contraseña
    if (data.new_password) {
      if (!data.current_password) {
        throw new BadRequestException('Debes ingresar tu contraseña actual para cambiarla.');
      }
      const isValid = await bcrypt.compare(data.current_password, user.password_hash);
      if (!isValid) {
        throw new BadRequestException('La contraseña actual es incorrecta.');
      }
      if (data.new_password.length < 6) {
        throw new BadRequestException('La nueva contraseña debe tener al menos 6 caracteres.');
      }
      userUpdate.password_hash = await bcrypt.hash(data.new_password, 10);
    }

    if (Object.keys(playerUpdate).length > 0) {
      await this.prisma.player.update({
        where: { id: user.player.id },
        data: playerUpdate,
      });
    }

    if (Object.keys(userUpdate).length > 0) {
      await this.prisma.user.update({
        where: { id: userId },
        data: userUpdate,
      });
    }

    // Retornar player actualizado
    const updated = await this.prisma.player.findUnique({
      where: { id: user.player.id },
      include: { user: { select: { username: true, email: true, is_admin: true } } }
    });

    return {
      message: 'Perfil actualizado correctamente.',
      player: { ...updated, is_admin: updated?.user?.is_admin || false }
    };
  }

  /**
   * Subir avatar a Cloudinary
   */
  async uploadAvatar(userId: string, base64Image: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { player: true }
    });

    if (!user || !user.player) throw new NotFoundException('Jugador no encontrado');

    const avatarUrl = await uploadAvatar(base64Image, user.player.id);

    await this.prisma.player.update({
      where: { id: user.player.id },
      data: { avatar_url: avatarUrl }
    });

    return { message: 'Avatar actualizado correctamente.', avatar_url: avatarUrl };
  }
}