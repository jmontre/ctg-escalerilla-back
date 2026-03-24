import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from './challenge-rules.service';
import { whatsappService } from '../notifications/whatsapp.service';
import { emailService } from '../notifications/email.service';
import { add } from 'date-fns';

@Injectable()
export class ChallengesService {
  constructor(
    private prisma: PrismaService,
    private rules: ChallengeRulesService
  ) { }

  // Delay entre mensajes WhatsApp para evitar errores de Puppeteer
  private sleep(ms: number) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Crear nuevo desafío
   */
  async create(challengerId: string, challengedId: string) {
    const { challenger, challenged } = await this.rules.validateChallenge(
      challengerId,
      challengedId
    );

    const now = new Date();

    const challenge = await this.prisma.challenge.create({
      data: {
        challenger_id: challengerId,
        challenged_id: challengedId,
        status: 'pending',
        accept_deadline: add(now, { hours: 24 }),
        play_deadline: add(now, { days: 5 }),
      },
      include: {
        challenger: { select: { id: true, name: true, position: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, position: true, email: true, phone: true } }
      }
    });

    try {
      if (challenged.phone) {
        await whatsappService.sendChallengeNotification(challenger.name, challenged.name, challenged.phone);
        await this.sleep(500);
      }
      await emailService.sendChallengeNotification(challenger.name, challenged.name, challenged.email);
      console.log('✅ Notificaciones enviadas');
    } catch (error) {
      console.error('⚠️ Error al enviar notificaciones:', error);
    }

    return { message: 'Desafío creado exitosamente', challenge };
  }

  /**
   * Listar todos los desafíos
   */
  async findAll() {
    return this.prisma.challenge.findMany({
      include: {
        challenger: { select: { id: true, name: true, position: true } },
        challenged: { select: { id: true, name: true, position: true } }
      },
      orderBy: { created_at: 'desc' }
    });
  }

  /**
   * Obtener un desafío específico
   */
  async findOne(id: string) {
    return this.prisma.challenge.findUnique({
      where: { id },
      include: { challenger: true, challenged: true }
    });
  }

  /**
   * Aceptar desafío
   */
  async accept(challengeId: string, playerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });

    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.challenged_id !== playerId) throw new BadRequestException('Solo el desafiado puede aceptar el desafío');
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
      if (updated.challenger.phone) {
        await whatsappService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.phone);
        await this.sleep(500);
      }
      await emailService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.email);
      console.log('✅ Notificaciones de aceptación enviadas');
    } catch (error) {
      console.error('⚠️ Error al enviar notificaciones:', error);
    }

    return { message: 'Desafío aceptado exitosamente', challenge: updated };
  }

  /**
   * Rechazar desafío = Intercambio automático de posiciones
   */
  async reject(challengeId: string, playerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });

    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.challenged_id !== playerId) throw new BadRequestException('Solo el desafiado puede rechazar el desafío');
    if (challenge.status !== 'pending') throw new BadRequestException('Este desafío ya no está pendiente');

    await this.rules.processWin(challengeId, challenge.challenger_id, challenge.challenged_id);

    await this.prisma.challenge.update({
      where: { id: challengeId },
      data: { status: 'rejected', resolved_at: new Date() }
    });

    try {
      if (challenge.challenger.phone) {
        await whatsappService.sendMessage(
          challenge.challenger.phone,
          `🎾 *Club de Tenis Graneros*\n\n` +
          `${challenge.challenged.name} rechazó tu desafío.\n\n` +
          `🏆 ¡Ganas por W.O. y subes en la escalerilla!`
        );
      }
    } catch (error) {
      console.error('⚠️ Error al enviar notificaciones:', error);
    }

    return { message: 'Desafío rechazado. El desafiante gana por W.O.' };
  }

  /**
   * Ingresar resultado del partido
   */
  async submitResult(
    challengeId: string,
    submitterId: string,
    result: { winnerId: string; score: string }
  ) {
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
    if (result.winnerId !== challenge.challenger_id && result.winnerId !== challenge.challenged_id) {
      throw new BadRequestException('El ganador debe ser uno de los jugadores del desafío');
    }

    // Guardar first_result_at solo si es el primer resultado ingresado
    const isFirstResult = !challenge.challenger_result && !challenge.challenged_result;
    const updateData = {
      ...(isChallenger ? { challenger_result: result } : { challenged_result: result }),
      ...(isFirstResult ? { first_result_at: new Date() } : {}),
    };
    await this.prisma.challenge.update({ where: { id: challengeId }, data: updateData });

    const updated = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true } }
      }
    });

    if (!updated) throw new BadRequestException('Error al actualizar desafío');

    if (!updated.challenger_result || !updated.challenged_result) {
      const otherPlayer = isChallenger ? updated.challenged : updated.challenger;
      const currentPlayer = isChallenger ? updated.challenger : updated.challenged;

      try {
        if (otherPlayer.phone) {
          await whatsappService.sendMessage(
            otherPlayer.phone,
            `🎾 *Club de Tenis Graneros*\n\n` +
            `${currentPlayer.name} ya ingresó el resultado del partido.\n\n` +
            `¡No olvides ingresar tu resultado también!`
          );
        }
      } catch (error) {
        console.error('⚠️ Error al enviar notificación:', error);
      }
    }

    if (updated.challenger_result && updated.challenged_result) {
      return this.processDoubleConfirmation(challengeId);
    }

    return {
      message: 'Resultado registrado. Esperando confirmación del otro jugador.',
      challenge: updated
    };
  }

  /**
   * Fijar o actualizar la fecha acordada del partido
   */
  async scheduleMatch(challengeId: string, playerId: string, scheduledDate: Date) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, phone: true } },
        challenged: { select: { id: true, name: true, phone: true } }
      }
    });

    if (!challenge) throw new BadRequestException('Desafío no encontrado');
    if (challenge.status !== 'accepted') throw new BadRequestException('Solo puedes fijar fecha en desafíos aceptados');

    const isParticipant = challenge.challenger_id === playerId || challenge.challenged_id === playerId;
    if (!isParticipant) throw new BadRequestException('Solo los jugadores del desafío pueden fijar la fecha');
    if (scheduledDate <= new Date()) throw new BadRequestException('La fecha debe ser en el futuro');
    if (scheduledDate > challenge.play_deadline) throw new BadRequestException('La fecha no puede ser posterior al plazo límite del partido');

    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: { scheduled_date: scheduledDate },
      include: {
        challenger: { select: { id: true, name: true, phone: true } },
        challenged: { select: { id: true, name: true, phone: true } }
      }
    });

    const isChallenger = challenge.challenger_id === playerId;
    const setter = isChallenger ? updated.challenger : updated.challenged;
    const other = isChallenger ? updated.challenged : updated.challenger;

    const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    const weekday = scheduledDate.toLocaleDateString('es-CL', { weekday: 'long', timeZone: 'America/Santiago' });
    const day = scheduledDate.toLocaleDateString('es-CL', { day: 'numeric', month: 'long', timeZone: 'America/Santiago' });
    const hour = scheduledDate.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Santiago' });
    const formattedDate = `${cap(weekday)} ${day} — ${hour} hrs`;

    // Notificar al otro jugador
    try {
      if (other.phone) {
        await whatsappService.sendMessage(
          other.phone,
          `🎾 *Club de Tenis Graneros*\n\n` +
          `📅 *${setter.name}* fijó la fecha del partido:\n\n` +
          `*${formattedDate}*\n\n` +
          `Si no puedes en esa fecha, coordina con tu rival.`
        );
        await this.sleep(500);
      }
    } catch (error) {
      console.error('⚠️ Error al enviar notificación de fecha:', error);
    }

    // 🚀 NOTIFICAR AL GRUPO
    try {
      const groupId = process.env.WHATSAPP_GROUP_ID;
      if (groupId) {
        await whatsappService.sendGroupMessage(
          groupId,
          `🎾 *Escalerilla CTG — Partido Agendado*\n\n` +
          `⚔️ *${updated.challenger.name}* vs *${updated.challenged.name}*\n` +
          `📅 ${formattedDate}`
        );
      }
    } catch (error) {
      console.error('⚠️ Error al notificar fecha al grupo:', error);
    }

    return { message: 'Fecha del partido fijada correctamente', challenge: updated };
  }

  /**
   * Procesar cuando ambos confirmaron el resultado
   */
  private async processDoubleConfirmation(challengeId: string) {
    console.log('🔍 Iniciando processDoubleConfirmation para:', challengeId);

    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: { select: { id: true, name: true, email: true, phone: true, position: true } },
        challenged: { select: { id: true, name: true, email: true, phone: true, position: true } }
      }
    });

    if (!challenge) throw new BadRequestException('Desafío no encontrado');

    console.log('✅ Desafío encontrado:', challenge.id);
    console.log('📊 Resultado challenger:', challenge.challenger_result);
    console.log('📊 Resultado challenged:', challenge.challenged_result);

    const result1 = challenge.challenger_result as any;
    const result2 = challenge.challenged_result as any;

    if (result1.winnerId === result2.winnerId) {
      console.log('✅ Resultados coinciden. Procesando...');

      const winnerId = result1.winnerId;
      const loserId = winnerId === challenge.challenger_id ? challenge.challenged_id : challenge.challenger_id;

      console.log('🏆 Winner ID:', winnerId);
      console.log('😢 Loser ID:', loserId);

      try {
        console.log('📍 Procesando corrimiento...');
        await this.rules.processWin(challengeId, winnerId, loserId);

        console.log('🛡️  Aplicando inmunidad/vulnerabilidad...');
        await this.rules.applyPostMatchStatus(winnerId, loserId);

        console.log('📈 Actualizando estadísticas...');
        await this.rules.updateStats(winnerId, loserId);

        console.log('✔️  Marcando como completado...');
        await this.prisma.challenge.update({
          where: { id: challengeId },
          data: {
            status: 'completed',
            winner_id: winnerId,
            final_score: result1.score,
            results_match: true,
            played_at: new Date(),
            resolved_at: new Date()
          }
        });

        console.log('👥 Obteniendo jugadores actualizados...');
        const winner = await this.prisma.player.findUnique({
          where: { id: winnerId },
          select: { id: true, name: true, position: true, email: true, phone: true }
        });
        const loser = await this.prisma.player.findUnique({
          where: { id: loserId },
          select: { id: true, name: true, position: true, email: true, phone: true }
        });

        if (!winner || !loser) throw new BadRequestException('Jugador no encontrado después de actualizar');

        // 🚀 NOTIFICAR A AMBOS JUGADORES — secuencial con delay
        try {
          if (winner.phone) {
            await whatsappService.sendMessage(
              winner.phone,
              `🎾 *Club de Tenis Graneros*\n\n` +
              `🏆 ¡FELICIDADES!\n\n` +
              `Ganaste el partido contra ${loser.name}\n` +
              `Score: ${result1.score}\n\n` +
              `Nueva posición: #${winner.position}`
            );
            await this.sleep(600);
          }
          if (loser.phone) {
            await whatsappService.sendMessage(
              loser.phone,
              `🎾 *Club de Tenis Graneros*\n\n` +
              `Resultado confirmado\n\n` +
              `Partido vs ${winner.name}\n` +
              `Score: ${result1.score}\n\n` +
              `Nueva posición: #${loser.position}`
            );
            await this.sleep(600);
          }
          console.log('✅ Notificaciones de resultado enviadas');
        } catch (error) {
          console.error('⚠️ Error al enviar notificaciones de resultado:', error);
        }

        // 🚀 NOTIFICAR AL GRUPO
        try {
          await whatsappService.sendResultToGroup(
            challenge.challenger.name,
            challenge.challenged.name,
            winnerId === challenge.challenger_id ? challenge.challenger.name : challenge.challenged.name,
            result1.score,
            winner.position,
            loser.position,
          );
        } catch (error) {
          console.error('⚠️ Error al enviar resultado al grupo:', error);
        }

        console.log('🎉 Proceso completado exitosamente');

        return {
          message: 'Resultado confirmado. Posiciones actualizadas.',
          winner: { name: winner.name, new_position: winner.position },
          loser: { name: loser.name, new_position: loser.position },
          score: result1.score
        };
      } catch (error) {
        console.error('❌ Error en processDoubleConfirmation:', error);
        throw error;
      }
    } else {
      console.log('⚠️  Resultados NO coinciden');

      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: { status: 'disputed' }
      });

      try {
        const message =
          `🎾 *Club de Tenis Graneros*\n\n` +
          `⚠️ Los resultados ingresados no coinciden.\n\n` +
          `Un administrador revisará el caso.\n\n` +
          `${challenge.challenger.name} dice: ${result1.score}\n` +
          `${challenge.challenged.name} dice: ${result2.score}`;

        if (challenge.challenger.phone) {
          await whatsappService.sendMessage(challenge.challenger.phone, message);
          await this.sleep(600);
        }
        if (challenge.challenged.phone) {
          await whatsappService.sendMessage(challenge.challenged.phone, message);
        }
      } catch (error) {
        console.error('⚠️ Error al enviar notificaciones de disputa:', error);
      }

      return {
        message: 'Los resultados no coinciden. Un administrador debe revisar el caso.',
        status: 'disputed',
        challenger_says: result1,
        challenged_says: result2
      };
    }
  }
}