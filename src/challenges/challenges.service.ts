import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from './challenge-rules.service';
import { whatsappService } from '../notifications/whatsapp.service';
import { emailService } from '../notifications/email.service';
import { AppLogger } from '../common/app.logger';
import { add } from 'date-fns';
import { toChileDateStr, chileWeekBoundsFromStr } from '../common/dates';

const HIGH_DEMAND: Record<string, string[]> = {
  verano:   ['07:45', '09:30', '18:15', '20:00'],
  invierno: ['09:30', '11:15', '16:30', '18:15'],
};

@Injectable()
export class ChallengesService {
  constructor(
    private prisma: PrismaService,
    private rules: ChallengeRulesService,
    private appLogger: AppLogger,
  ) {}

  private sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

  async create(challengerId: string, challengedId: string) {
    const { challenger, challenged } = await this.rules.validateChallenge(challengerId, challengedId);
    const now = new Date();
    const challenge = await this.prisma.challenge.create({
      data: { challenger_id: challengerId, challenged_id: challengedId, status: 'pending', accept_deadline: add(now, { hours: 24 }), play_deadline: add(now, { days: 5 }) },
      include: {
        challenger: { select: { id: true, name: true, position: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, position: true, email: true, phone: true } }
      }
    });
    try {
      if (challenged.phone) { await whatsappService.sendChallengeNotification(challenger.name, challenged.name, challenged.phone); await this.sleep(500); }
      await emailService.sendChallengeNotification(challenger.name, challenged.name, challenged.email);
    } catch (e) { console.error('⚠️ Error notificaciones:', e); }
    this.appLogger.challengeCreated(challenger.name, challenged.name, challenger.position, challenged.position);
    return { message: 'Desafío creado exitosamente', challenge };
  }

  async findAll() {
    return this.prisma.challenge.findMany({
      include: {
        challenger: { select: { id: true, name: true, position: true } },
        challenged: { select: { id: true, name: true, position: true } }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  async findOne(id: string) {
    return this.prisma.challenge.findUnique({ where: { id }, include: { challenger: true, challenged: true } });
  }

  async accept(challengeId: string, playerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });
    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.challenged_id !== playerId) throw new BadRequestException('Solo el desafiado puede aceptar');
    if (challenge.status !== 'pending') throw new BadRequestException('Este desafío ya no está pendiente');
    if (new Date() > challenge.accept_deadline) throw new BadRequestException('El plazo para aceptar ya expiró');

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: { status: 'accepted', accepted_at: new Date() },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });
    try {
      if (updated.challenger.phone) { await whatsappService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.phone); await this.sleep(500); }
      await emailService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.email);
    } catch (e) { console.error('⚠️ Error notificaciones aceptación:', e); }
    this.appLogger.challengeAccepted(updated.challenger.name, updated.challenged.name);
    return { message: 'Desafío aceptado exitosamente', challenge: updated };
  }

  async reject(challengeId: string, playerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });
    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.challenged_id !== playerId) throw new BadRequestException('Solo el desafiado puede rechazar');
    if (challenge.status !== 'pending') throw new BadRequestException('Este desafío ya no está pendiente');

    await this.rules.processWin(challengeId, challenge.challenger_id, challenge.challenged_id);
    await this.rules.applyPostMatchStatus(challenge.challenger_id, challenge.challenged_id);
    await this.prisma.challenge.update({ where: { id: challengeId }, data: { status: 'rejected', resolved_at: new Date() } });
    this.appLogger.challengeRejected(challenge.challenger.name, challenge.challenged.name);

    try {
      if (challenge.challenger.phone) {
        await whatsappService.sendMessage(challenge.challenger.phone, `🎾 *Club de Tenis Graneros*\n\n${challenge.challenged.name} rechazó tu desafío.\n\n🏆 ¡Ganas por W.O. y subes en la escalerilla!`);
        await this.sleep(500);
      }
    } catch (e) { console.error('⚠️ Error notificación personal:', e); }

    try {
      const groupId = process.env.WHATSAPP_GROUP_ID;
      const winner = await this.prisma.player.findUnique({ where: { id: challenge.challenger_id } });
      const loser  = await this.prisma.player.findUnique({ where: { id: challenge.challenged_id } });
      if (groupId && winner && loser) {
        await whatsappService.sendGroupMessage(groupId, `🎾 *Escalerilla CTG — W.O.*\n\n🏆 *${winner.name}* gana por W.O.\n${loser.name} rechazó el desafío.\n\n📈 Nuevas posiciones:\n  • ${winner.name}: #${winner.position}\n  • ${loser.name}: #${loser.position}`);
      }
    } catch (e) { console.error('⚠️ Error notificación WO grupo:', e); }

    return { message: 'Desafío rechazado. El desafiante gana por W.O.' };
  }

  async submitResult(challengeId: string, submitterId: string, result: { winnerId: string; score: string }) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });
    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.status !== 'accepted') throw new BadRequestException('Solo puedes ingresar resultado de desafíos aceptados');

    const isChallenger = submitterId === challenge.challenger_id;
    const isChallenged = submitterId === challenge.challenged_id;
    if (!isChallenger && !isChallenged) throw new BadRequestException('Solo los jugadores del desafío pueden ingresar resultado');
    if (result.winnerId !== challenge.challenger_id && result.winnerId !== challenge.challenged_id) throw new BadRequestException('El ganador debe ser uno de los jugadores');

    const isFirstResult = !challenge.challenger_result && !challenge.challenged_result;
    await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        ...(isChallenger ? { challenger_result: result } : { challenged_result: result }),
        ...(isFirstResult ? { first_result_at: new Date() } : {}),
      }
    });

    const updated = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });
    if (!updated) throw new BadRequestException('Error al actualizar desafío');

    if (!updated.challenger_result || !updated.challenged_result) {
      const other   = isChallenger ? updated.challenged : updated.challenger;
      const current = isChallenger ? updated.challenger : updated.challenged;
      try {
        if (other.phone) await whatsappService.sendMessage(other.phone, `🎾 *Club de Tenis Graneros*\n\n${current.name} ya ingresó el resultado.\n\n¡No olvides ingresar el tuyo también!`);
      } catch (e) { console.error('⚠️ Error notificación:', e); }
    }

    if (updated.challenger_result && updated.challenged_result) return this.processDoubleConfirmation(challengeId);
    return { message: 'Resultado registrado. Esperando confirmación del otro jugador.', challenge: updated };
  }

  /**
   * Fijar fecha + cancha → crea reserva automática descontando cupo de alta demanda
   */
  async scheduleMatch(challengeId: string, playerId: string, scheduledDate: Date, courtId?: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, phone: true } },
        challenged: { select: { id: true, name: true, phone: true } }
      }
    });

    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.status !== 'accepted') throw new BadRequestException('Solo puedes fijar fecha en desafíos aceptados');
    if (challenge.challenger_id !== playerId && challenge.challenged_id !== playerId) throw new BadRequestException('Solo los jugadores pueden fijar la fecha');
    if (scheduledDate <= new Date()) throw new BadRequestException('La fecha debe ser en el futuro');
    if (scheduledDate > challenge.play_deadline) throw new BadRequestException('La fecha supera el plazo límite del partido');

    // ── Reserva automática ────────────────────────────────────────────────────
    if (courtId) {
      const court = await this.prisma.court.findUnique({ where: { id: courtId } });
      if (!court || !court.is_active) throw new BadRequestException('Cancha no disponible.');

      const dateOnly = new Date(scheduledDate); dateOnly.setHours(0,0,0,0);

      // Extraer hora en zona Chile para evitar desfase UTC
      const timeStr = scheduledDate.toLocaleTimeString('es-CL', {
        hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago'
      });
      const [h, m] = timeStr.split(':');
      const slot = `${h.padStart(2,'0')}:${m.padStart(2,'0')}`;

      // Fecha en zona Chile
      const chileDate = toChileDateStr(scheduledDate);
      const dateChile = new Date(`${chileDate}T00:00:00`);

      // Slot ocupado por otro partido
      const slotBusy = await (this.prisma as any).reservation.findFirst({
        where: { court_id: courtId, date: dateChile, time_slot: slot, status: 'active', NOT: { challenge_id: challengeId } }
      });
      if (slotBusy) throw new BadRequestException('Ese horario ya está ocupado en esa cancha.');

      // Otra reserva activa del jugador (que no sea de este desafío)
      const otherActive = await (this.prisma as any).reservation.findFirst({
        where: { player_id: playerId, status: 'active', NOT: { challenge_id: challengeId } }
      });
      if (otherActive) throw new BadRequestException('Ya tienes una reserva activa. Cancélala antes de fijar fecha.');

      // Cupos alta demanda
      const config = await this.prisma.systemConfig.findUnique({ where: { key: 'season' } });
      const season = config?.value || 'verano';
      const isHighDemand = HIGH_DEMAND[season]?.includes(slot) ?? false;

      if (isHighDemand) {
        const player = await this.prisma.player.findUnique({ where: { id: playerId }, include: { children: true } });
        if (player) {
          const { weekStart, weekEnd } = chileWeekBoundsFromStr(chileDate);

          const playerIds   = [playerId, ...(player.children?.map((c:any) => c.id) || [])];
          const extraSlots  = (player as any).extra_high_demand_slots ?? 0;
          const familyLimit = player.member_type === 'hijo_socio' ? 1 : 2 + (player.children?.length||0) + extraSlots;

          const used = await (this.prisma as any).reservation.count({
            where: { player_id: { in: playerIds }, is_high_demand: true, status: 'active', date: { gte: weekStart, lte: weekEnd }, NOT: { challenge_id: challengeId } }
          });
          if (used >= familyLimit) throw new BadRequestException(`Ya usaste los ${familyLimit} turnos de alta demanda de esta semana.`);
        }
      }

      // Cancelar reserva anterior de este desafío
      await (this.prisma as any).reservation.updateMany({
        where: { challenge_id: challengeId, status: 'active' },
        data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Fecha reprogramada' }
      });

      // Nombre del rival para partner_name
      const other = challenge.challenger_id === playerId ? challenge.challenged : challenge.challenger;

      // Crear nueva reserva
      await (this.prisma as any).reservation.create({
        data: {
          player_id:      playerId,
          court_id:       courtId,
          date:           dateChile,
          time_slot:      slot,
          is_high_demand: isHighDemand,
          has_guest:      false,
          partner_name:   other.name,
          is_challenge:   true,
          challenge_id:   challengeId,
          status:         'active',
        }
      });
    }

    // ── Actualizar challenge ───────────────────────────────────────────────────
    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data:  { scheduled_date: scheduledDate },
      include: {
        challenger: { select: { id: true, name: true, phone: true } },
        challenged: { select: { id: true, name: true, phone: true } }
      }
    });

    const isChallenger  = challenge.challenger_id === playerId;
    const setter = isChallenger ? updated.challenger : updated.challenged;
    const other  = isChallenger ? updated.challenged : updated.challenger;

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const weekday = scheduledDate.toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' });
    const day     = scheduledDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
    const hour    = scheduledDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
    const formattedDate = `${cap(weekday)} ${day} — ${hour} hrs`;

    let courtName = '';
    if (courtId) {
      const court = await this.prisma.court.findUnique({ where: { id: courtId } });
      if (court) courtName = ` · ${court.name}`;
    }

    try {
      if (other.phone) {
        await whatsappService.sendMessage(other.phone,
          `🎾 *Club de Tenis Graneros*\n\n📅 *${setter.name}* fijó la fecha del partido:\n\n*${formattedDate}*${courtName}\n\nSi no puedes, coordina con tu rival.`
        );
        await this.sleep(500);
      }
    } catch (e) { console.error('⚠️ Error notificación fecha:', e); }

    try {
      const groupId = process.env.WHATSAPP_GROUP_ID;
      if (groupId) {
        await whatsappService.sendGroupMessage(groupId,
          `🎾 *Escalerilla CTG — Partido Agendado*\n\n⚔️ *${updated.challenger.name}* vs *${updated.challenged.name}*\n📅 ${formattedDate}${courtName}`
        );
      }
    } catch (e) { console.error('⚠️ Error notificación fecha grupo:', e); }

    this.appLogger.challengeScheduled(updated.challenger.name, updated.challenged.name, formattedDate, courtName.replace(' · ', ''));
    return { message: 'Fecha del partido fijada correctamente', challenge: updated };
  }

  private async processDoubleConfirmation(challengeId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true, position: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true, position: true } }
      }
    });
    if (!challenge) throw new BadRequestException('Desafío no encontrado');

    const result1 = challenge.challenger_result as any;
    const result2 = challenge.challenged_result as any;

    if (result1.winnerId === result2.winnerId) {
      const winnerId = result1.winnerId;
      const loserId  = winnerId === challenge.challenger_id ? challenge.challenged_id : challenge.challenger_id;

      try {
        await this.rules.processWin(challengeId, winnerId, loserId);
        await this.rules.applyPostMatchStatus(winnerId, loserId);
        await this.rules.updateStats(winnerId, loserId);

        await this.prisma.challenge.update({
          where: { id: challengeId },
          data: { status: 'completed', winner_id: winnerId, final_score: result1.score, results_match: true, played_at: new Date(), resolved_at: new Date() }
        });

        // Liberar la reserva del desafío
        await (this.prisma as any).reservation.updateMany({
          where: { challenge_id: challengeId, status: 'active' },
          data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: 'Partido completado' }
        });

        const winner = await this.prisma.player.findUnique({ where: { id: winnerId }, select: { id: true, name: true, position: true, email: true, phone: true } });
        const loser  = await this.prisma.player.findUnique({ where: { id: loserId  }, select: { id: true, name: true, position: true, email: true, phone: true } });
        if (!winner || !loser) throw new BadRequestException('Jugador no encontrado');

        try {
          if (winner.phone) { await whatsappService.sendMessage(winner.phone, `🎾 *Club de Tenis Graneros*\n\n🏆 ¡FELICIDADES!\n\nGanaste el partido contra ${loser.name}\nScore: ${result1.score}\n\nNueva posición: #${winner.position}`); await this.sleep(600); }
          if (loser.phone)  { await whatsappService.sendMessage(loser.phone,  `🎾 *Club de Tenis Graneros*\n\nResultado confirmado\n\nPartido vs ${winner.name}\nScore: ${result1.score}\n\nNueva posición: #${loser.position}`); await this.sleep(600); }
        } catch (e) { console.error('⚠️ Error notificaciones resultado:', e); }

        try {
          const groupId = process.env.WHATSAPP_GROUP_ID;
          if (groupId) {
            const isRetirement = result1.score?.includes('Retiro') || result1.score === 'W.O.';
            const loserName = winnerId === challenge.challenger_id ? challenge.challenged.name : challenge.challenger.name;
            let msg = `🎾 *Escalerilla CTG — Resultado*\n\n🏆 *${winner.name}* venció a *${loserName}*\n📊 Score: *${result1.score}*\n\n📈 Nuevas posiciones:\n  • ${winner.name}: #${winner.position}\n  • ${loserName}: #${loser.position}`;
            if (isRetirement) msg += `\n\n_(Partido finalizado por retiro/lesión)_`;
            await whatsappService.sendGroupMessage(groupId, msg);
          }
        } catch (e) { console.error('⚠️ Error resultado grupo:', e); }

        this.appLogger.challengeResult(winner.name, loser.name, result1.score, winner.position, loser.position);
        return { message: 'Resultado confirmado. Posiciones actualizadas.', winner: { name: winner.name, new_position: winner.position }, loser: { name: loser.name, new_position: loser.position }, score: result1.score };
      } catch (error) {
        console.error('❌ Error en processDoubleConfirmation:', error);
        throw error;
      }
    } else {
      await this.prisma.challenge.update({ where: { id: challengeId }, data: { status: 'disputed' } });
      try {
        const message = `🎾 *Club de Tenis Graneros*\n\n⚠️ Los resultados no coinciden.\n\nUn administrador revisará el caso.\n\n${challenge.challenger.name} dice: ${result1.score}\n${challenge.challenged.name} dice: ${result2.score}`;
        if (challenge.challenger.phone) { await whatsappService.sendMessage(challenge.challenger.phone, message); await this.sleep(600); }
        if (challenge.challenged.phone) { await whatsappService.sendMessage(challenge.challenged.phone, message); }
      } catch (e) { console.error('⚠️ Error notificaciones disputa:', e); }
      this.appLogger.challengeDisputed(challenge.challenger.name, challenge.challenged.name, result1.score, result2.score);
      return { message: 'Los resultados no coinciden. Un administrador debe revisar el caso.', status: 'disputed', challenger_says: result1, challenged_says: result2 };
    }
  }
}