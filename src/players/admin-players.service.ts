import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminPlayersService {
  constructor(private prisma: PrismaService) {}

  async createPlayer(data: {
    username: string;
    email: string;
    password: string;
    name: string;
    phone?: string;
    position?: number;
  }) {
    const existing = await this.prisma.user.findFirst({
      where: {
        OR: [
          { username: data.username },
          { email: data.email },
        ],
      },
    });

    if (existing) {
      throw new ConflictException('Username o email ya existe');
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    let position = data.position;
    if (!position) {
      const lastPlayer = await this.prisma.player.findFirst({
        orderBy: { position: 'desc' },
      });
      position = (lastPlayer?.position || 0) + 1;
    }

    const user = await this.prisma.user.create({
      data: {
        username: data.username,
        email: data.email,
        password_hash,
      },
    });

    const player = await this.prisma.player.create({
      data: {
        user_id: user.id,
        name: data.name,
        email: data.email,
        phone: data.phone,
        position,
      },
      include: {
        user: {
          select: {
            username: true,
            is_admin: true,
          },
        },
      },
    });

    return player;
  }

  async updatePlayer(
    id: string,
    data: {
      name?: string;
      email?: string;
      phone?: string;
      position?: number;
      wins?: number;
      losses?: number;
      total_matches?: number;
      immune_until?: string | null;
      vulnerable_until?: string | null;
    }
  ) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const updateData: any = {};

    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.position !== undefined) updateData.position = data.position;
    if (data.wins !== undefined) updateData.wins = data.wins;
    if (data.losses !== undefined) updateData.losses = data.losses;
    if (data.total_matches !== undefined) updateData.total_matches = data.total_matches;
    
    // Manejar fechas
    if (data.immune_until !== undefined) {
      updateData.immune_until = data.immune_until ? new Date(data.immune_until) : null;
    }
    if (data.vulnerable_until !== undefined) {
      updateData.vulnerable_until = data.vulnerable_until ? new Date(data.vulnerable_until) : null;
    }

    return this.prisma.player.update({
      where: { id },
      data: updateData,
      include: {
        user: {
          select: {
            username: true,
            is_admin: true,
          },
        },
      },
    });
  }

  async deletePlayer(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: { user: true },
    });

    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    await this.prisma.user.delete({
      where: { id: player.user_id },
    });

    return { message: 'Jugador eliminado correctamente' };
  }

  async movePlayer(id: string, newPosition: number) {
    const player = await this.prisma.player.findUnique({ where: { id } });
    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    const oldPosition = player.position;

    if (newPosition < oldPosition) {
      await this.prisma.player.updateMany({
        where: {
          position: {
            gte: newPosition,
            lt: oldPosition,
          },
        },
        data: {
          position: {
            increment: 1,
          },
        },
      });
    } else if (newPosition > oldPosition) {
      await this.prisma.player.updateMany({
        where: {
          position: {
            gt: oldPosition,
            lte: newPosition,
          },
        },
        data: {
          position: {
            decrement: 1,
          },
        },
      });
    }

    const updated = await this.prisma.player.update({
      where: { id },
      data: { position: newPosition },
      include: {
        user: {
          select: {
            username: true,
            is_admin: true,
          },
        },
      },
    });

    await this.prisma.rankingHistory.create({
      data: {
        player_id: id,
        position: newPosition,
        old_position: oldPosition,
        reason: 'Movimiento manual por administrador',
      },
    });

    return updated;
  }

  async resetImmunity(id: string) {
    return this.prisma.player.update({
      where: { id },
      data: { immune_until: null },
    });
  }

  async resetVulnerability(id: string) {
    return this.prisma.player.update({
      where: { id },
      data: { vulnerable_until: null },
    });
  }
}
