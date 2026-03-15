import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Player } from '@prisma/client';
import { add } from 'date-fns';

@Injectable()
export class ChallengeRulesService {
  constructor(private prisma: PrismaService) { }

  /**
   * HELPER: Calcular nivel según posición
   */
  getLevel(position: number): number {
    if (position === 1) return 1;
    if (position <= 4) return 2;
    if (position <= 8) return 3;
    if (position <= 12) return 4;
    if (position <= 17) return 5;
    if (position <= 22) return 6;
    if (position <= 28) return 7;
    if (position <= 34) return 8;
    return Math.ceil(position / 6);
  }

  /**
 * REGLA 1: Puede desafiar mismo nivel (si está adelante) O 1 nivel arriba
 */
  private validateLevel(challenger: Player, challenged: Player): void {
    const challengerLevel = this.getLevel(challenger.position);
    const challengedLevel = this.getLevel(challenged.position);

    // Mismo nivel: solo si el desafiado está adelante (posición menor)
    if (challengerLevel === challengedLevel) {
      if (challenged.position >= challenger.position) {
        throw new BadRequestException(
          `No puedes desafiar a ${challenged.name}. Solo puedes desafiar jugadores adelante tuyo en el mismo nivel.`
        );
      }
      // Válido: mismo nivel y desafiado está adelante
      return;
    }

    // Diferente nivel: solo 1 nivel arriba
    if (challengedLevel !== challengerLevel - 1) {
      throw new BadRequestException(
        `Solo puedes desafiar jugadores del nivel inmediatamente superior. ` +
        `Tú estás en nivel ${challengerLevel}, ${challenged.name} está en nivel ${challengedLevel}.`
      );
    }
  }

  /**
   * REGLA 2: Verificar que un jugador NO esté "ocupado"
   * (tiene desafío pendiente como challenger O challenged)
   */
  private async validateNotOccupied(playerId: string, playerName: string): Promise<void> {
    const occupiedChallenge = await this.prisma.challenge.findFirst({
      where: {
        OR: [
          { challenger_id: playerId },
          { challenged_id: playerId }
        ],
        status: { in: ['pending', 'accepted'] }
      },
      include: {
        challenger: true,
        challenged: true
      }
    });

    if (occupiedChallenge) {
      const otherPlayer = occupiedChallenge.challenger_id === playerId
        ? occupiedChallenge.challenged.name
        : occupiedChallenge.challenger.name;

      throw new BadRequestException(
        `${playerName} ya tiene un desafío pendiente con ${otherPlayer}`
      );
    }
  }

  /**
   * REGLA 4: Verificar inmunidad (solo para RECIBIR desafíos)
   */
  private validateImmunity(challenged: Player): void {
    if (challenged.immune_until && challenged.immune_until > new Date()) {
      const hoursLeft = Math.ceil(
        (challenged.immune_until.getTime() - Date.now()) / (1000 * 60 * 60)
      );

      throw new BadRequestException(
        `${challenged.name} tiene inmunidad por ${hoursLeft} hora(s) más`
      );
    }
  }

  /**
   * VALIDACIÓN COMPLETA antes de crear desafío
   */
  async validateChallenge(
    challengerId: string,
    challengedId: string
  ): Promise<{ challenger: Player; challenged: Player }> {
    // Obtener jugadores
    const [challenger, challenged] = await Promise.all([
      this.prisma.player.findUnique({ where: { id: challengerId } }),
      this.prisma.player.findUnique({ where: { id: challengedId } })
    ]);

    if (!challenger || !challenged) {
      throw new BadRequestException('Jugador no encontrado');
    }

    // No puede desafiarse a sí mismo
    if (challengerId === challengedId) {
      throw new BadRequestException('No puedes desafiarte a ti mismo');
    }

    // NUEVA REGLA: Verificar vulnerabilidad del challenger
    this.validateNotVulnerable(challenger);

    // REGLA 1: Verificar niveles
    this.validateLevel(challenger, challenged);

    // REGLA 2: Verificar que ninguno esté ocupado
    await this.validateNotOccupied(challengerId, challenger.name);
    await this.validateNotOccupied(challengedId, challenged.name);

    // REGLA 4: Verificar inmunidad del desafiado
    this.validateImmunity(challenged);

    return { challenger, challenged };
  }

  /**
    * Obtener jugadores que un jugador puede desafiar
    */
  async getAvailableChallenges(playerId: string): Promise<Player[]> {
    const player = await this.prisma.player.findUnique({
      where: { id: playerId }
    });

    if (!player) {
      throw new BadRequestException('Jugador no encontrado');
    }

    // Verificar que el jugador no esté ocupado
    const isOccupied = await this.prisma.challenge.findFirst({
      where: {
        OR: [
          { challenger_id: playerId },
          { challenged_id: playerId }
        ],
        status: { in: ['pending', 'accepted'] }
      }
    });

    if (isOccupied) {
      return []; // No puede desafiar a nadie si está ocupado
    }

    const playerLevel = this.getLevel(player.position);
    const targetLevel = playerLevel - 1;

    if (targetLevel < 1) {
      return []; // Está en nivel 1, no puede desafiar a nadie
    }

    // Obtener todos los jugadores del nivel superior
    const allPlayers = await this.prisma.player.findMany({
      orderBy: { position: 'asc' }
    });

    // Tipar correctamente el array
    const availablePlayers: Player[] = [];

    for (const p of allPlayers) {
      if (this.getLevel(p.position) === targetLevel) {
        // Verificar que no esté ocupado
        const occupied = await this.prisma.challenge.findFirst({
          where: {
            OR: [
              { challenger_id: p.id },
              { challenged_id: p.id }
            ],
            status: { in: ['pending', 'accepted'] }
          }
        });

        // Verificar que no tenga inmunidad
        const hasImmunity = p.immune_until && p.immune_until > new Date();

        if (!occupied && !hasImmunity) {
          availablePlayers.push(p);
        }
      }
    }

    return availablePlayers;
  }

  /**
   * REGLA 3: Corrimiento en cadena al ganar desafío
   * El ganador sube a la posición del perdedor, todos entre ellos bajan 1
   */
  async processWin(challengeId: string, winnerId: string, loserId: string) {
    const winner = await this.prisma.player.findUnique({ where: { id: winnerId } });
    const loser = await this.prisma.player.findUnique({ where: { id: loserId } });

    if (!winner || !loser) {
      throw new BadRequestException('Jugador no encontrado');
    }

    // Si el ganador ya está adelante del perdedor, no hay cambio de posiciones
    if (winner.position < loser.position) {
      console.log(`ℹ️  ${winner.name} ya estaba adelante, sin cambios`);
      return;
    }

    const targetPosition = loser.position;
    const oldWinnerPosition = winner.position;

    console.log(`📍 Moviendo ${winner.name}: ${oldWinnerPosition} → ${targetPosition}`);

    // Obtener todos los jugadores entre las posiciones (inclusive)
    const affectedPlayers = await this.prisma.player.findMany({
      where: {
        position: {
          gte: targetPosition,    // Desde la posición del perdedor
          lt: oldWinnerPosition   // Hasta antes de la posición del ganador
        }
      },
      orderBy: { position: 'desc' }  // ← IMPORTANTE: Orden descendente
    });

    console.log(`📍 Jugadores afectados: ${affectedPlayers.length}`);

    // Guardar historial ANTES de hacer cambios
    for (const player of affectedPlayers) {
      await this.prisma.rankingHistory.create({
        data: {
          player_id: player.id,
          old_position: player.position,
          position: player.position + 1,
          reason: 'challenge_lost',
        }
      });
    }

    await this.prisma.rankingHistory.create({
      data: {
        player_id: winner.id,
        old_position: oldWinnerPosition,
        position: targetPosition,
        reason: 'challenge_won',
      }
    });

    // Ejecutar cambios SIN transacción para evitar conflictos
    // Movemos en orden descendente para no pisar posiciones

    // 1. Mover ganador a posición temporal muy alta
    await this.prisma.player.update({
      where: { id: winner.id },
      data: { position: 9999 }
    });

    // 2. Bajar todos los afectados 1 posición (de atrás hacia adelante)
    for (const player of affectedPlayers) {
      await this.prisma.player.update({
        where: { id: player.id },
        data: { position: player.position + 1 }
      });
    }

    // 3. Colocar ganador en su posición final
    await this.prisma.player.update({
      where: { id: winner.id },
      data: { position: targetPosition }
    });

    console.log(`✅ Corrimiento: ${winner.name} (${oldWinnerPosition} → ${targetPosition})`);
  }

  /**
    * REGLA 4: Aplicar inmunidad y vulnerabilidad post-partido
    */
  async applyPostMatchStatus(winnerId: string, loserId: string) {
    const winner = await this.prisma.player.findUnique({ where: { id: winnerId } });
    const loser = await this.prisma.player.findUnique({ where: { id: loserId } });

    if (!winner || !loser) {
      throw new BadRequestException('Jugador no encontrado');
    }

    // Ganador obtiene inmunidad 24 hrs (EXCEPTO si es pos 1)
    if (winner.position !== 1) {
      await this.prisma.player.update({
        where: { id: winnerId },
        data: {
          immune_until: add(new Date(), { hours: 24 })
        }
      });
      console.log(`🛡️  ${winner.name} tiene inmunidad por 24 hrs (pos ${winner.position})`);
    } else {
      console.log(`👑 ${winner.name} es #1 - SIN inmunidad`);
    }

    // Perdedor queda vulnerable hasta fin del día
    await this.prisma.player.update({
      where: { id: loserId },
      data: {
        vulnerable_until: new Date(new Date().setHours(23, 59, 59, 999))
      }
    });
    console.log(`⚠️  ${loser.name} vulnerable hasta medianoche`);
  }

  /**
   * REGLA 5: Verificar que el challenger NO esté vulnerable
   * (solo puede RECIBIR desafíos, no crear)
   */
  private validateNotVulnerable(challenger: Player): void {
    if (challenger.vulnerable_until && challenger.vulnerable_until > new Date()) {
      const hoursLeft = Math.ceil(
        (challenger.vulnerable_until.getTime() - Date.now()) / (1000 * 60 * 60)
      );

      throw new BadRequestException(
        `No puedes desafiar mientras estés vulnerable. Podrás desafiar de nuevo en ${hoursLeft} hora(s).`
      );
    }
  }

  /**
   * Actualizar estadísticas de ambos jugadores
   */
  async updateStats(winnerId: string, loserId: string) {
    await this.prisma.player.update({
      where: { id: winnerId },
      data: {
        total_matches: { increment: 1 },
        wins: { increment: 1 }
      }
    });

    await this.prisma.player.update({
      where: { id: loserId },
      data: {
        total_matches: { increment: 1 },
        losses: { increment: 1 }
      }
    });
  }
}
