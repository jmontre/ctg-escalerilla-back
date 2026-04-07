import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';
import { whatsappService } from '../notifications/whatsapp.service';
import { AppLogger } from '../common/app.logger';

// Cada 6 horas: 00:00, 06:00, 12:00, 18:00
const EVERY_6_HOURS = '0 0,6,12,18 * * *';

// Cada hora en punto
const EVERY_HOUR = '0 * * * *';

// Horas de gracia para que el segundo jugador confirme su resultado
const HOURS_TO_CONFIRM_RESULT = 4;

@Injectable()
export class ChallengesCronService {
  private readonly logger = new Logger(ChallengesCronService.name);

  constructor(
    private prisma: PrismaService,
    private rules: ChallengeRulesService,
    private appLogger: AppLogger,
  ) { }

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

      // Notificar al grupo
      try {
        const winner = await this.prisma.player.findUnique({ where: { id: challenge.challenger_id } });
        const loser  = await this.prisma.player.findUnique({ where: { id: challenge.challenged_id } });
        const groupId = process.env.WHATSAPP_GROUP_ID;

        if (groupId && winner && loser) {
          await whatsappService.sendGroupMessage(
            groupId,
            `🎾 *Escalerilla CTG — W.O. automático*\n\n` +
            `🏆 *${winner.name}* gana por W.O.\n` +
            `${loser.name} no respondió el desafío a tiempo.\n\n` +
            `📈 ${winner.name}: #${winner.position}`
          );
        }
      } catch (err) {
        this.logger.error('⚠️ Error notificando grupo:', err);
      }

      this.logger.log(`✅ W.O. aplicado: ${challenge.challenger.name} sube`);
      this.appLogger.challengeExpiredNotAccepted(challenge.challenger.name, challenge.challenged.name);
    }

    return expired.length;
  }

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

      // Notificar al grupo
      try {
        const groupId = process.env.WHATSAPP_GROUP_ID;
        if (groupId) {
          await whatsappService.sendGroupMessage(
            groupId,
            `🎾 *Escalerilla CTG — Partido no jugado*\n\n` +
            `⏰ ${challenge.challenger.name} vs ${challenge.challenged.name}\n` +
            `El partido venció sin jugarse. Se aplicó penalización.`
          );
        }
      } catch (err) {
        this.logger.error('⚠️ Error notificando grupo:', err);
      }

      this.logger.log(`✅ Penalización aplicada`);
      this.appLogger.challengeExpiredNotPlayed(challenge.challenger.name, challenge.challenged.name);
    }

    return expired.length;
  }

  private async handleNotConfirmed(now: Date): Promise<number> {
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
      const referenceTime = (challenge as any).first_result_at ?? challenge.accepted_at;
      if (!referenceTime) continue;

      const hoursSinceFirstResult = (now.getTime() - new Date(referenceTime).getTime()) / (1000 * 60 * 60);

      if (hoursSinceFirstResult < HOURS_TO_CONFIRM_RESULT) {
        this.logger.log(
          `⏳ ${challenge.challenger.name} vs ${challenge.challenged.name}: ` +
          `${hoursSinceFirstResult.toFixed(1)}h desde primer resultado (mínimo ${HOURS_TO_CONFIRM_RESULT}h)`
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

      // Notificar al grupo
      try {
        const winner = await this.prisma.player.findUnique({ where: { id: winnerId } });
        const loser  = await this.prisma.player.findUnique({ where: { id: loserId }  });
        const groupId = process.env.WHATSAPP_GROUP_ID;

        if (groupId && winner && loser) {
          await whatsappService.sendGroupMessage(
            groupId,
            `🎾 *Escalerilla CTG — Resultado auto-validado*\n\n` +
            `🏆 *${winner.name}* venció a *${loser.name}*\n` +
            `📊 Score: *${confirmedResult.score}*\n\n` +
            `📈 Nuevas posiciones:\n` +
            `  • ${winner.name}: #${winner.position}\n` +
            `  • ${loser.name}: #${loser.position}\n\n` +
            `_(Solo un jugador confirmó el resultado)_`
          );
        }

        // Notificar al jugador que no confirmó
        const nonConfirmer = challenge.challenger_result ? challenge.challenged : challenge.challenger;
        if (nonConfirmer.phone) {
          await whatsappService.sendMessage(
            nonConfirmer.phone,
            `🎾 *Club de Tenis Graneros*\n\n` +
            `⏰ El resultado del partido vs ${challenge.challenger_result ? challenge.challenger.name : challenge.challenged.name} fue auto-validado porque no ingresaste tu resultado a tiempo.\n\n` +
            `Score registrado: ${confirmedResult.score}`
          );
        }
      } catch (err) {
        this.logger.error('⚠️ Error notificando resultado auto-validado:', err);
      }

      this.logger.log(`✅ Resultado auto-validado (${HOURS_TO_CONFIRM_RESULT}h sin confirmación)`);
      this.appLogger.challengeAutoValidated(
        winnerId === challenge.challenger_id ? challenge.challenger.name : challenge.challenged.name,
        winnerId === challenge.challenger_id ? challenge.challenged.name : challenge.challenger.name,
        confirmedResult.score
      );
      processed++;
    }

    return processed;
  }

  private async penalizeBothPlayers(challenge: any) {
    const challenger = await this.prisma.player.findUnique({
      where: { id: challenge.challenger_id }
    });

    if (!challenger) { console.log('⚠️  Challenger no existe'); return; }

    console.log(`⚠️  Penalizando solo al challenger: ${challenger.name} (pos ${challenger.position})`);

    const playerBelow = await this.prisma.player.findFirst({
      where: { position: challenger.position + 1 }
    });

    await this.prisma.rankingHistory.create({
      data: { player_id: challenger.id, old_position: challenger.position, position: challenger.position + 1, reason: 'penalty' }
    });

    if (playerBelow) {
      await this.prisma.rankingHistory.create({
        data: { player_id: playerBelow.id, old_position: playerBelow.position, position: playerBelow.position - 1, reason: 'opponent_penalty' }
      });
    }

    await this.prisma.player.update({ where: { id: challenger.id }, data: { position: 9999 } });

    if (playerBelow) {
      await this.prisma.player.update({ where: { id: playerBelow.id }, data: { position: challenger.position } });
    }

    await this.prisma.player.update({ where: { id: challenger.id }, data: { position: challenger.position + 1 } });

    console.log(`✅ Penalización aplicada: ${challenger.name} baja 1 posición`);
  }

  @Cron(EVERY_HOUR)
  async handleExpiredReservations() {
    this.logger.log('⏰ Verificando reservas expiradas...');
    const now = new Date();

    try {
      const active = await (this.prisma.reservation as any).findMany({
        where: { status: 'active' },
      });

      let completed = 0;

      for (const reservation of active) {
        const datePart = reservation.date.toISOString().split('T')[0];
        const [h, m]   = reservation.time_slot.split(':').map(Number);

        // Hora de término en zona Chile = inicio + 90 minutos
        const endTime = new Date(`${datePart}T${reservation.time_slot}:00`);
        endTime.setMinutes(endTime.getMinutes() + 90);

        if (endTime < now) {
          await (this.prisma.reservation as any).update({
            where: { id: reservation.id },
            data:  { status: 'completed', cancelled_at: endTime }
          });
          completed++;
        }
      }

      this.logger.log(`✅ Reservas completadas automáticamente: ${completed}`);
      this.appLogger.reservationCompleted(completed);
    } catch (error) {
      this.logger.error('❌ Error procesando reservas expiradas:', error);
    }
  }

  async runManually() {
    this.logger.log('🔧 Ejecución manual del cron job');
    await this.handleExpiredChallenges();
    await this.handleExpiredReservations();
  }
}