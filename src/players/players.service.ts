import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';

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
          select: {
            username: true,
            is_admin: true,
          }
        }
      }
    });

    // Flatten para incluir is_admin directamente en player
    return players.map(p => ({
      ...p,
      is_admin: p.user?.is_admin || false,
    }));
  }

  async findOne(id: string) {
    const player = await this.prisma.player.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            username: true,
            email: true,
            is_admin: true,
          }
        },
        challenges_made: {
          orderBy: { created_at: 'desc' },
          take: 10,
          include: {
            challenged: {
              select: { name: true, position: true }
            }
          }
        },
        challenges_received: {
          orderBy: { created_at: 'desc' },
          take: 10,
          include: {
            challenger: {
              select: { name: true, position: true }
            }
          }
        },
        ranking_history: {
          orderBy: { created_at: 'desc' },
          take: 20
        }
      }
    });

    if (!player) {
      throw new NotFoundException('Jugador no encontrado');
    }

    return {
      ...player,
      is_admin: player.user?.is_admin || false,
    };
  }

  async findByUserId(userId: string) {
    const player = await this.prisma.player.findUnique({
      where: { user_id: userId },
      include: {
        user: {
          select: {
            username: true,
            email: true,
            is_admin: true,
          }
        }
      }
    });

    if (!player) {
      throw new NotFoundException(`Jugador con user_id ${userId} no encontrado`);
    }

    return {
      ...player,
      is_admin: player.user?.is_admin || false,
    };
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
}
