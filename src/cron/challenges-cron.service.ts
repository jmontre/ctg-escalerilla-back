import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';

@Injectable()
export class ChallengesCronService {
  private readonly logger = new Logger(ChallengesCronService.name);

  constructor(
    private prisma: PrismaService,
    private rules: ChallengeRulesService
  ) { }

  /**
   * CRON JOB: Se ejecuta cada hora
   * Verifica y procesa desafíos expirados
   */
  @Cron(CronExpression.EVERY_HOUR)
  async handleExpiredChallenges() {
    this.logger.log('⏰ Iniciando verificación de desafíos expirados...');

    const now = new Date();

    // Contadores
    let notAccepted = 0;
    let notPlayed = 0;
    let notConfirmed = 0;

    try {
      // TIPO 1: No aceptados a tiempo (24 hrs)
      notAccepted = await this.handleNotAccepted(now);

      // TIPO 2: Aceptados pero no jugados (5 días)
      notPlayed = await this.handleNotPlayed(now);

      // TIPO 3: Un jugador no confirmó resultado (24 hrs después de jugado)
      notConfirmed = await this.handleNotConfirmed(now);

      this.logger.log(`✅ Procesamiento completo:`);
      this.logger.log(`   - No aceptados: ${notAccepted}`);
      this.logger.log(`   - No jugados: ${notPlayed}`);
      this.logger.log(`   - No confirmados: ${notConfirmed}`);

    } catch (error) {
      this.logger.error('❌ Error en cron job:', error);
    }
  }

  /**
   * TIPO 1: Desafíos no aceptados a tiempo
   * Resultado: Intercambio automático (el desafiante sube)
   */
  private async handleNotAccepted(now: Date): Promise<number> {
    const expiredChallenges = await this.prisma.challenge.findMany({
      where: {
        status: 'pending',
        accept_deadline: { lt: now }
      },
      include: {
        challenger: true,
        challenged: true
      }
    });

    for (const challenge of expiredChallenges) {
      this.logger.warn(
        `⏱️  Desafío expirado (no aceptado): ${challenge.challenger.name} vs ${challenge.challenged.name}`
      );

      // Intercambio automático: el desafiante gana
      await this.rules.processWin(
        challenge.id,
        challenge.challenger_id,
        challenge.challenged_id
      );

      // Marcar como expirado
      await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: {
          status: 'expired_not_accepted',
          resolved_at: now
        }
      });

      this.logger.log(
        `✅ Intercambio aplicado: ${challenge.challenger.name} sube, ${challenge.challenged.name} baja`
      );
    }

    return expiredChallenges.length;
  }

  /**
   * TIPO 2: Desafíos aceptados pero no jugados a tiempo
   * Resultado: Ambos jugadores bajan 1 posición
   */
  private async handleNotPlayed(now: Date): Promise<number> {
    const expiredChallenges = await this.prisma.challenge.findMany({
      where: {
        status: 'accepted',
        play_deadline: { lt: now }
      },
      include: {
        challenger: true,
        challenged: true
      }
    });

    for (const challenge of expiredChallenges) {
      this.logger.warn(
        `⏱️  Desafío expirado (no jugado): ${challenge.challenger.name} vs ${challenge.challenged.name}`
      );

      // Penalizar a ambos: bajar 1 posición
      await this.penalizeBothPlayers(challenge);

      // Marcar como expirado
      await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: {
          status: 'expired_not_played',
          resolved_at: now
        }
      });

      this.logger.log(
        `✅ Penalización aplicada: Ambos jugadores bajan 1 posición`
      );
    }

    return expiredChallenges.length;
  }

 /**
   * TIPO 3: Un jugador no confirmó el resultado a tiempo
   * Resultado: Auto-validar el resultado del que sí confirmó
   */
  private async handleNotConfirmed(now: Date): Promise<number> {
    // Buscar desafíos aceptados (sin importar si tienen played_at)
    const allAccepted = await this.prisma.challenge.findMany({
      where: {
        status: 'accepted'
      },
      include: {
        challenger: true,
        challenged: true
      }
    });

    // Filtrar los que tienen exactamente un resultado
    const pendingConfirmation = allAccepted.filter(challenge => {
      const hasChallenger = challenge.challenger_result !== null;
      const hasChallenged = challenge.challenged_result !== null;
      
      // Tiene exactamente uno (XOR)
      return (hasChallenger && !hasChallenged) || (!hasChallenger && hasChallenged);
    });

    let processed = 0;

    for (const challenge of pendingConfirmation) {
      // Verificar que hayan pasado 24 hrs desde que se aceptó
      if (!challenge.accepted_at) {
        continue;
      }
      
      const hoursSinceAccepted = (now.getTime() - challenge.accepted_at.getTime()) / (1000 * 60 * 60);

      if (hoursSinceAccepted >= 24) {
        this.logger.warn(
          `⏱️  Resultado sin doble confirmación: ${challenge.challenger.name} vs ${challenge.challenged.name}`
        );

        // Auto-validar el resultado del que sí confirmó
        const confirmedResult: any = challenge.challenger_result || challenge.challenged_result;
        const winnerId = confirmedResult.winnerId;
        const loserId = winnerId === challenge.challenger_id 
          ? challenge.challenged_id 
          : challenge.challenger_id;

        // Procesar victoria
        await this.rules.processWin(challenge.id, winnerId, loserId);
        await this.rules.applyPostMatchStatus(winnerId, loserId);
        await this.rules.updateStats(winnerId, loserId);

        // Marcar como completado
        await this.prisma.challenge.update({
          where: { id: challenge.id },
          data: {
            status: 'completed',
            winner_id: winnerId,
            final_score: confirmedResult.score,
            results_match: false, // No coincidieron porque solo uno confirmó
            played_at: now,
            resolved_at: now
          }
        });

        this.logger.log(
          `✅ Resultado auto-validado (solo uno confirmó)`
        );

        processed++;
      }
    }

    return processed;
  }

/**
   * Penalizar solo al challenger (quien desafió y no jugó)
   */
  private async penalizeBothPlayers(challenge: any) {
    // Obtener challenger con posición ACTUAL
    const challenger = await this.prisma.player.findUnique({
      where: { id: challenge.challenger_id }
    });

    if (!challenger) {
      console.log('⚠️  Challenger no existe');
      return;
    }

    console.log(`⚠️  Penalizando solo al challenger: ${challenger.name} (pos ${challenger.position})`);

    // Obtener el jugador que está justo debajo
    const playerBelow = await this.prisma.player.findFirst({
      where: { position: challenger.position + 1 }
    });

    // Registrar historial
    await this.prisma.rankingHistory.create({
      data: {
        player_id: challenger.id,
        old_position: challenger.position,
        position: challenger.position + 1,
        reason: 'penalty',
      }
    });

    if (playerBelow) {
      await this.prisma.rankingHistory.create({
        data: {
          player_id: playerBelow.id,
          old_position: playerBelow.position,
          position: playerBelow.position - 1,
          reason: 'opponent_penalty',
        }
      });
    }

    // Intercambio simple (igual que processWin pero al revés)
    
    // 1. Mover challenger a temporal
    await this.prisma.player.update({
      where: { id: challenger.id },
      data: { position: 9999 }
    });

    // 2. Subir al que estaba debajo
    if (playerBelow) {
      await this.prisma.player.update({
        where: { id: playerBelow.id },
        data: { position: challenger.position }
      });
    }

    // 3. Bajar al challenger
    await this.prisma.player.update({
      where: { id: challenger.id },
      data: { position: challenger.position + 1 }
    });

    console.log(`✅ Penalización aplicada: ${challenger.name} baja 1 posición`);
  }

  /**
   * Ejecutar manualmente (para testing)
   */
  async runManually() {
    this.logger.log('🔧 Ejecución manual del cron job');
    await this.handleExpiredChallenges();
  }
}
