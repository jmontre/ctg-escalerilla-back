import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';

// Cada 6 horas: 00:00, 06:00, 12:00, 18:00
const EVERY_6_HOURS = '0 0,6,12,18 * * *';

// Horas de gracia para que el segundo jugador confirme su resultado
const HOURS_TO_CONFIRM_RESULT = 4;

@Injectable()
export class ChallengesCronService {
  private readonly logger = new Logger(ChallengesCronService.name);

  constructor(
    private prisma: PrismaService,
    private rules: ChallengeRulesService
  ) { }

  /**
   * CRON JOB: Se ejecuta cada 6 horas
   * Verifica y procesa desafíos expirados
   */
  @Cron(EVERY_6_HOURS)
  async handleExpiredChallenges() {
    this.logger.log('⏰ Iniciando verificación de desafíos expirados...');

    const now = new Date();
    let notAccepted = 0;
    let notPlayed = 0;
    let notConfirmed = 0;

    try {
      notAccepted  = await this.handleNotAccepted(now);
      notPlayed    = await this.handleNotPlayed(now);
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
   * TIPO 1: Desafíos no aceptados a tiempo (24 hrs)
   * Resultado: el desafiante gana por W.O.
   */
  private async handleNotAccepted(now: Date): Promise<number> {
    const expired = await this.prisma.challenge.findMany({
      where: { status: 'pending', accept_deadline: { lt: now } },
      include: { challenger: true, challenged: true }
    });

    for (const challenge of expired) {
      this.logger.warn(`⏱️  Desafío expirado (no aceptado): ${challenge.challenger.name} vs ${challenge.challenged.name}`);

      await this.rules.processWin(challenge.id, challenge.challenger_id, challenge.challenged_id);

      await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: 'expired_not_accepted', resolved_at: now }
      });

      this.logger.log(`✅ W.O. aplicado: ${challenge.challenger.name} sube`);
    }

    return expired.length;
  }

  /**
   * TIPO 2: Aceptados pero no jugados (5 días)
   * Resultado: el challenger baja 1 posición
   */
  private async handleNotPlayed(now: Date): Promise<number> {
    const expired = await this.prisma.challenge.findMany({
      where: { status: 'accepted', play_deadline: { lt: now } },
      include: { challenger: true, challenged: true }
    });

    for (const challenge of expired) {
      this.logger.warn(`⏱️  Desafío expirado (no jugado): ${challenge.challenger.name} vs ${challenge.challenged.name}`);

      await this.penalizeBothPlayers(challenge);

      await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: { status: 'expired_not_played', resolved_at: now }
      });

      this.logger.log(`✅ Penalización aplicada`);
    }

    return expired.length;
  }

  /**
   * TIPO 3: Un jugador ingresó resultado pero el otro no confirmó
   * Espera HOURS_TO_CONFIRM_RESULT horas desde el primer resultado
   * antes de auto-validar
   */
  private async handleNotConfirmed(now: Date): Promise<number> {
    // Buscar desafíos aceptados con exactamente un resultado ingresado
    const allAccepted = await this.prisma.challenge.findMany({
      where: { status: 'accepted' },
      include: { challenger: true, challenged: true }
    });

    const pending = allAccepted.filter(c => {
      const hasChallenger = c.challenger_result !== null;
      const hasChallenged = c.challenged_result !== null;
      return (hasChallenger && !hasChallenged) || (!hasChallenger && hasChallenged);
    });

    let processed = 0;

    for (const challenge of pending) {
      // Usar first_result_at si existe, si no usar accepted_at como fallback
      const referenceTime = (challenge as any).first_result_at ?? challenge.accepted_at;

      if (!referenceTime) continue;

      const hoursSinceFirstResult = (now.getTime() - new Date(referenceTime).getTime()) / (1000 * 60 * 60);

      if (hoursSinceFirstResult < HOURS_TO_CONFIRM_RESULT) {
        this.logger.log(
          `⏳ ${challenge.challenger.name} vs ${challenge.challenged.name}: ` +
          `${hoursSinceFirstResult.toFixed(1)}h desde primer resultado ` +
          `(mínimo ${HOURS_TO_CONFIRM_RESULT}h)`
        );
        continue;
      }

      this.logger.warn(`⏱️  Resultado sin doble confirmación: ${challenge.challenger.name} vs ${challenge.challenged.name}`);

      const confirmedResult: any = challenge.challenger_result || challenge.challenged_result;
      const winnerId = confirmedResult.winnerId;
      const loserId  = winnerId === challenge.challenger_id
        ? challenge.challenged_id
        : challenge.challenger_id;

      await this.rules.processWin(challenge.id, winnerId, loserId);
      await this.rules.applyPostMatchStatus(winnerId, loserId);
      await this.rules.updateStats(winnerId, loserId);

      await this.prisma.challenge.update({
        where: { id: challenge.id },
        data: {
          status:        'completed',
          winner_id:     winnerId,
          final_score:   confirmedResult.score,
          results_match: false,
          played_at:     now,
          resolved_at:   now
        }
      });

      this.logger.log(`✅ Resultado auto-validado (${HOURS_TO_CONFIRM_RESULT}h sin confirmación)`);
      processed++;
    }

    return processed;
  }

  /**
   * Penalizar solo al challenger (quien desafió y no jugó)
   */
  private async penalizeBothPlayers(challenge: any) {
    const challenger = await this.prisma.player.findUnique({
      where: { id: challenge.challenger_id }
    });

    if (!challenger) {
      console.log('⚠️  Challenger no existe');
      return;
    }

    console.log(`⚠️  Penalizando solo al challenger: ${challenger.name} (pos ${challenger.position})`);

    const playerBelow = await this.prisma.player.findFirst({
      where: { position: challenger.position + 1 }
    });

    await this.prisma.rankingHistory.create({
      data: {
        player_id:    challenger.id,
        old_position: challenger.position,
        position:     challenger.position + 1,
        reason:       'penalty',
      }
    });

    if (playerBelow) {
      await this.prisma.rankingHistory.create({
        data: {
          player_id:    playerBelow.id,
          old_position: playerBelow.position,
          position:     playerBelow.position - 1,
          reason:       'opponent_penalty',
        }
      });
    }

    await this.prisma.player.update({
      where: { id: challenger.id },
      data: { position: 9999 }
    });

    if (playerBelow) {
      await this.prisma.player.update({
        where: { id: playerBelow.id },
        data: { position: challenger.position }
      });
    }

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