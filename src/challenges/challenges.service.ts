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

  /**
   * Crear nuevo desafío
   */
  async create(challengerId: string, challengedId: string) {
    // Validar que el desafío es válido (todas las reglas)
    const { challenger, challenged } = await this.rules.validateChallenge(
      challengerId,
      challengedId
    );

    const now = new Date();

    // Crear desafío
    const challenge = await this.prisma.challenge.create({
      data: {
        challenger_id: challengerId,
        challenged_id: challengedId,
        status: 'pending',
        accept_deadline: add(now, { hours: 24 }), // 24 hrs para aceptar
        play_deadline: add(now, { days: 5 }),      // 5 días para jugar
      },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            position: true,
            email: true,
            phone: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            position: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // 🚀 ENVIAR NOTIFICACIONES
    try {
      await Promise.all([
        // WhatsApp
        challenged.phone
          ? whatsappService.sendChallengeNotification(
            challenger.name,
            challenged.name,
            challenged.phone
          )
          : Promise.resolve(),

        // Email
        emailService.sendChallengeNotification(
          challenger.name,
          challenged.name,
          challenged.email
        )
      ]);

      console.log('✅ Notificaciones enviadas');
    } catch (error) {
      console.error('⚠️ Error al enviar notificaciones:', error);
      // No fallar el desafío si falla la notificación
    }

    return {
      message: 'Desafío creado exitosamente',
      challenge
    };
  }

  /**
   * Listar todos los desafíos
   */
  async findAll() {
    return this.prisma.challenge.findMany({
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            position: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            position: true
          }
        }
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
      include: {
        challenger: true,
        challenged: true
      }
    });
  }

  /**
   * Aceptar desafío
   */
  async accept(challengeId: string, playerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!challenge) {
      throw new BadRequestException('Desafío no encontrado');
    }

    // Validar que quien acepta es el desafiado
    if (challenge.challenged_id !== playerId) {
      throw new BadRequestException('Solo el desafiado puede aceptar el desafío');
    }

    // Validar que está en estado pending
    if (challenge.status !== 'pending') {
      throw new BadRequestException('Este desafío ya no está pendiente');
    }

    // Validar que no expiró el plazo
    if (new Date() > challenge.accept_deadline) {
      throw new BadRequestException('El plazo para aceptar ya expiró');
    }

    // Actualizar a accepted
    const updated = await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status: 'accepted',
        accepted_at: new Date()
      },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    // 🚀 NOTIFICAR AL DESAFIANTE QUE ACEPTARON
    try {
      await Promise.all([
        // WhatsApp
        updated.challenger.phone
          ? whatsappService.sendAcceptedNotification(
            updated.challenger.name,
            updated.challenged.name,
            updated.challenger.phone
          )
          : Promise.resolve(),

        // Email
        emailService.sendAcceptedNotification(
          updated.challenger.name,
          updated.challenged.name,
          updated.challenger.email
        )
      ]);

      console.log('✅ Notificaciones de aceptación enviadas');
    } catch (error) {
      console.error('⚠️ Error al enviar notificaciones:', error);
    }

    return {
      message: 'Desafío aceptado exitosamente',
      challenge: updated
    };
  }

  /**
   * Rechazar desafío = Intercambio automático de posiciones
   */
  async reject(challengeId: string, playerId: string) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!challenge) {
      throw new BadRequestException('Desafío no encontrado');
    }

    if (challenge.challenged_id !== playerId) {
      throw new BadRequestException('Solo el desafiado puede rechazar el desafío');
    }

    if (challenge.status !== 'pending') {
      throw new BadRequestException('Este desafío ya no está pendiente');
    }

    // REGLA: Rechazar = el desafiante gana (corrimiento)
    await this.rules.processWin(
      challengeId,
      challenge.challenger_id,
      challenge.challenged_id
    );

    // Marcar desafío como rechazado
    await this.prisma.challenge.update({
      where: { id: challengeId },
      data: {
        status: 'rejected',
        resolved_at: new Date()
      }
    });

    // 🚀 NOTIFICAR AL DESAFIANTE QUE RECHAZARON (y ganó por W.O.)
    try {
      const message = `🎾 *Club de Tenis Graneros*\n\n` +
        `${challenge.challenged.name} rechazó tu desafío.\n\n` +
        `✅ Ganas por W.O. y subes en la escalerilla!`;

      await Promise.all([
        challenge.challenger.phone
          ? whatsappService.sendMessage(challenge.challenger.phone, message)
          : Promise.resolve(),

        emailService.sendRejectedNotification(
          challenge.challenger.name,
          challenge.challenged.name,
          challenge.challenger.email
        )
      ]);
    } catch (error) {
      console.error('⚠️ Error al enviar notificaciones:', error);
    }

    return {
      message: 'Desafío rechazado. Las posiciones han sido intercambiadas.',
      note: `${challenge.challenger.name} sube, ${challenge.challenged.name} baja`
    };
  }

  /**
  * Ingresar resultado (confirmación dual)
  */
  async submitResult(
    challengeId: string,
    submitterId: string,
    result: { winnerId: string; score: string }
  ) {
    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!challenge) {
      throw new BadRequestException('Desafío no encontrado');
    }

    if (challenge.status !== 'accepted') {
      throw new BadRequestException('Solo puedes ingresar resultado de desafíos aceptados');
    }

    const isChallenger = submitterId === challenge.challenger_id;
    const isChallenged = submitterId === challenge.challenged_id;

    if (!isChallenger && !isChallenged) {
      throw new BadRequestException('Solo los jugadores del desafío pueden ingresar resultado');
    }

    // Validar que el winnerId sea uno de los dos jugadores
    if (result.winnerId !== challenge.challenger_id &&
      result.winnerId !== challenge.challenged_id) {
      throw new BadRequestException('El ganador debe ser uno de los jugadores del desafío');
    }

    // Guardar resultado
    const updateData = isChallenger
      ? { challenger_result: result }
      : { challenged_result: result };

    await this.prisma.challenge.update({
      where: { id: challengeId },
      data: updateData
    });

    // Verificar si ambos ya ingresaron
    const updated = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true
          }
        }
      }
    });

    if (!updated) {
      throw new BadRequestException('Error al actualizar desafío');
    }

    // 🚀 NOTIFICAR AL OTRO JUGADOR QUE YA INGRESARON RESULTADO
    if (!updated.challenger_result || !updated.challenged_result) {
      // Solo uno ingresó, notificar al otro
      const otherPlayer = isChallenger ? updated.challenged : updated.challenger;
      const currentPlayer = isChallenger ? updated.challenger : updated.challenged;

      try {
        const message = `🎾 *Club de Tenis Graneros*\n\n` +
          `${currentPlayer.name} ya ingresó el resultado del partido.\n\n` +
          `¡No olvides ingresar tu resultado también!`;

        await Promise.all([
          otherPlayer.phone
            ? whatsappService.sendMessage(otherPlayer.phone, message)
            : Promise.resolve()
        ]);
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
   * Procesar cuando ambos confirmaron el resultado
   */
  private async processDoubleConfirmation(challengeId: string) {
    console.log('🔍 Iniciando processDoubleConfirmation para:', challengeId);

    const challenge = await this.prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        challenger: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            position: true
          }
        },
        challenged: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            position: true
          }
        }
      }
    });

    if (!challenge) {
      throw new BadRequestException('Desafío no encontrado');
    }

    console.log('✅ Desafío encontrado:', challenge.id);
    console.log('📊 Resultado challenger:', challenge.challenger_result);
    console.log('📊 Resultado challenged:', challenge.challenged_result);

    const result1 = challenge.challenger_result as any;
    const result2 = challenge.challenged_result as any;

    // Verificar si coinciden
    if (result1.winnerId === result2.winnerId) {
      console.log('✅ Resultados coinciden. Procesando...');

      const winnerId = result1.winnerId;
      const loserId = winnerId === challenge.challenger_id
        ? challenge.challenged_id
        : challenge.challenger_id;

      console.log('🏆 Winner ID:', winnerId);
      console.log('😢 Loser ID:', loserId);

      try {
        // Procesar corrimiento de posiciones
        console.log('📍 Procesando corrimiento...');
        await this.rules.processWin(challengeId, winnerId, loserId);

        // Aplicar inmunidad/vulnerabilidad
        console.log('🛡️  Aplicando inmunidad/vulnerabilidad...');
        await this.rules.applyPostMatchStatus(winnerId, loserId);

        // Actualizar stats
        console.log('📈 Actualizando estadísticas...');
        await this.rules.updateStats(winnerId, loserId);

        // Marcar como completado
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

        // Obtener jugadores actualizados
        console.log('👥 Obteniendo jugadores actualizados...');
        const winner = await this.prisma.player.findUnique({
          where: { id: winnerId },
          select: { id: true, name: true, position: true, email: true, phone: true }
        });
        const loser = await this.prisma.player.findUnique({
          where: { id: loserId },
          select: { id: true, name: true, position: true, email: true, phone: true }
        });

        if (!winner || !loser) {
          throw new BadRequestException('Jugador no encontrado después de actualizar');
        }

        // 🚀 NOTIFICAR A AMBOS JUGADORES EL RESULTADO FINAL
        try {
          await Promise.all([
            // Notificar al ganador
            winner.phone
              ? whatsappService.sendMessage(
                winner.phone,
                `🎾 *Club de Tenis Graneros*\n\n` +
                `🏆 ¡FELICIDADES!\n\n` +
                `Ganaste el partido contra ${loser.name}\n` +
                `Score: ${result1.score}\n\n` +
                `Nueva posición: #${winner.position}`
              )
              : Promise.resolve(),

            // Notificar al perdedor
            loser.phone
              ? whatsappService.sendMessage(
                loser.phone,
                `🎾 *Club de Tenis Graneros*\n\n` +
                `Resultado confirmado\n\n` +
                `Partido vs ${winner.name}\n` +
                `Score: ${result1.score}\n\n` +
                `Nueva posición: #${loser.position}`
              )
              : Promise.resolve()
          ]);

          console.log('✅ Notificaciones de resultado enviadas');
        } catch (error) {
          console.error('⚠️ Error al enviar notificaciones de resultado:', error);
        }

        console.log('🎉 Proceso completado exitosamente');

        return {
          message: 'Resultado confirmado. Posiciones actualizadas.',
          winner: {
            name: winner.name,
            new_position: winner.position
          },
          loser: {
            name: loser.name,
            new_position: loser.position
          },
          score: result1.score
        };
      } catch (error) {
        console.error('❌ Error en processDoubleConfirmation:', error);
        throw error;
      }
    } else {
      console.log('⚠️  Resultados NO coinciden');

      // NO coinciden → Marcar como disputado
      await this.prisma.challenge.update({
        where: { id: challengeId },
        data: { status: 'disputed' }
      });

      // 🚀 NOTIFICAR A AMBOS QUE HAY DISPUTA
      try {
        const message = `🎾 *Club de Tenis Graneros*\n\n` +
          `⚠️ Los resultados ingresados no coinciden.\n\n` +
          `Un administrador revisará el caso.\n\n` +
          `${challenge.challenger.name} dice: ${result1.score}\n` +
          `${challenge.challenged.name} dice: ${result2.score}`;

        await Promise.all([
          challenge.challenger.phone
            ? whatsappService.sendMessage(challenge.challenger.phone, message)
            : Promise.resolve(),
          challenge.challenged.phone
            ? whatsappService.sendMessage(challenge.challenged.phone, message)
            : Promise.resolve()
        ]);
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