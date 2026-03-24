import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminChallengesService {
  constructor(private prisma: PrismaService) {}

  async resolveChallenge(challengeId: string, winnerId: string, score: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: true,
        challenged: true,
      },
    });

    if (!challenge) {
      throw new NotFoundException('Desafío no encontrado');
    }

    const loserId =
      winnerId === challenge.challenger_id
        ? challenge.challenged_id
        : challenge.challenger_id;

    const winner = await this.prisma.player.findUnique({ where: { id: winnerId } });
    const loser  = await this.prisma.player.findUnique({ where: { id: loserId } });

    if (!winner || !loser) {
      throw new NotFoundException('Jugadores no encontrados');
    }

    if (winnerId === challenge.challenger_id && winner.position > loser.position) {
      const targetPosition  = loser.position;
      const oldWinnerPosition = winner.position;

      await this.prisma.player.updateMany({
        where: { position: { gte: targetPosition, lt: oldWinnerPosition } },
        data:  { position: { increment: 1 } },
      });

      await this.prisma.player.update({
        where: { id: winnerId },
        data:  { position: targetPosition },
      });

      await this.prisma.rankingHistory.create({
        data: {
          player_id:    winnerId,
          position:     targetPosition,
          old_position: oldWinnerPosition,
          reason:       `Ganó desafío vs ${loser.name} - Resuelto por admin`,
        },
      });
    }

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status:      'completed',
        winner_id:   winnerId,
        final_score: score,
        resolved_at: new Date(),
        played_at:   challenge.played_at || new Date(),
      },
      include: { challenger: true, challenged: true },
    });

    await this.prisma.player.update({
      where: { id: winnerId },
      data: {
        wins:          { increment: 1 },
        total_matches: { increment: 1 },
        immune_until:  new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await this.prisma.player.update({
      where: { id: loserId },
      data: {
        losses:           { increment: 1 },
        total_matches:    { increment: 1 },
        vulnerable_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    return updated;
  }

  async cancelChallenge(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: { challenger: true, challenged: true },
    });

    if (!challenge) {
      throw new NotFoundException('Desafío no encontrado');
    }

    // Si estaba completado, revertir estadísticas
    if (challenge.status === 'completed' && challenge.winner_id) {
      const winnerId = challenge.winner_id;
      const loserId  = winnerId === challenge.challenger_id
        ? challenge.challenged_id
        : challenge.challenger_id;

      const winner = await this.prisma.player.findUnique({ where: { id: winnerId } });
      if (winner && winner.wins > 0 && winner.total_matches > 0) {
        await this.prisma.player.update({
          where: { id: winnerId },
          data:  { wins: { decrement: 1 }, total_matches: { decrement: 1 } },
        });
      }

      const loser = await this.prisma.player.findUnique({ where: { id: loserId } });
      if (loser && loser.losses > 0 && loser.total_matches > 0) {
        await this.prisma.player.update({
          where: { id: loserId },
          data:  { losses: { decrement: 1 }, total_matches: { decrement: 1 } },
        });
      }
    }

    await this.prisma.challenge.update({
      where: { id: challengeId },
      data:  { status: 'cancelled', resolved_at: new Date() },
    });

    return {
      message: 'Desafío cancelado correctamente',
      note: challenge.status === 'completed'
        ? 'Estadísticas revertidas. NOTA: Los cambios de ranking NO fueron revertidos automáticamente.'
        : null,
    };
  }

  /**
   * Eliminar el registro del desafío completamente de la DB.
   * Usar solo para datos de prueba o errores administrativos.
   */
  async forceDelete(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new NotFoundException('Desafío no encontrado');
    }

    await this.prisma.challenge.delete({
      where: { id: challengeId },
    });

    return { message: 'Desafío eliminado permanentemente' };
  }

  async extendDeadline(challengeId: string, hours: number, type: 'accept' | 'play') {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
    });

    if (!challenge) {
      throw new NotFoundException('Desafío no encontrado');
    }

    const updateData: any = {};

    if (type === 'accept') {
      const newDeadline = new Date(challenge.accept_deadline);
      newDeadline.setHours(newDeadline.getHours() + hours);
      updateData.accept_deadline = newDeadline;
    } else if (type === 'play') {
      const newDeadline = new Date(challenge.play_deadline);
      newDeadline.setHours(newDeadline.getHours() + hours);
      updateData.play_deadline = newDeadline;
    }

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data:  updateData,
      include: { challenger: true, challenged: true },
    });

    return {
      message: `Plazo ${type === 'accept' ? 'para aceptar' : 'para jugar'} extendido ${hours} horas`,
      challenge: updated,
    };
  }
}