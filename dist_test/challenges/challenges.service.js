"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChallengesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const challenge_rules_service_1 = require("./challenge-rules.service");
const whatsapp_service_1 = require("../notifications/whatsapp.service");
const email_service_1 = require("../notifications/email.service");
const date_fns_1 = require("date-fns");
let ChallengesService = class ChallengesService {
    constructor(prisma, rules) {
        this.prisma = prisma;
        this.rules = rules;
    }
    async create(challengerId, challengedId) {
        const { challenger, challenged } = await this.rules.validateChallenge(challengerId, challengedId);
        const now = new Date();
        const challenge = await this.prisma.challenge.create({
            data: {
                challenger_id: challengerId,
                challenged_id: challengedId,
                status: 'pending',
                accept_deadline: (0, date_fns_1.add)(now, { hours: 24 }),
                play_deadline: (0, date_fns_1.add)(now, { days: 5 }),
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
        try {
            await Promise.all([
                challenged.phone
                    ? whatsapp_service_1.whatsappService.sendChallengeNotification(challenger.name, challenged.name, challenged.phone)
                    : Promise.resolve(),
                email_service_1.emailService.sendChallengeNotification(challenger.name, challenged.name, challenged.email)
            ]);
            console.log('✅ Notificaciones enviadas');
        }
        catch (error) {
            console.error('⚠️ Error al enviar notificaciones:', error);
        }
        return {
            message: 'Desafío creado exitosamente',
            challenge
        };
    }
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
    async findOne(id) {
        return this.prisma.challenge.findUnique({
            where: { id },
            include: {
                challenger: true,
                challenged: true
            }
        });
    }
    async accept(challengeId, playerId) {
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
            throw new common_1.BadRequestException('Desafío no encontrado');
        }
        if (challenge.challenged_id !== playerId) {
            throw new common_1.BadRequestException('Solo el desafiado puede aceptar el desafío');
        }
        if (challenge.status !== 'pending') {
            throw new common_1.BadRequestException('Este desafío ya no está pendiente');
        }
        if (new Date() > challenge.accept_deadline) {
            throw new common_1.BadRequestException('El plazo para aceptar ya expiró');
        }
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
        try {
            await Promise.all([
                updated.challenger.phone
                    ? whatsapp_service_1.whatsappService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.phone)
                    : Promise.resolve(),
                email_service_1.emailService.sendAcceptedNotification(updated.challenger.name, updated.challenged.name, updated.challenger.email)
            ]);
            console.log('✅ Notificaciones de aceptación enviadas');
        }
        catch (error) {
            console.error('⚠️ Error al enviar notificaciones:', error);
        }
        return {
            message: 'Desafío aceptado exitosamente',
            challenge: updated
        };
    }
    async reject(challengeId, playerId) {
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
            throw new common_1.BadRequestException('Desafío no encontrado');
        }
        if (challenge.challenged_id !== playerId) {
            throw new common_1.BadRequestException('Solo el desafiado puede rechazar el desafío');
        }
        if (challenge.status !== 'pending') {
            throw new common_1.BadRequestException('Este desafío ya no está pendiente');
        }
        await this.rules.processWin(challengeId, challenge.challenger_id, challenge.challenged_id);
        await this.prisma.challenge.update({
            where: { id: challengeId },
            data: {
                status: 'rejected',
                resolved_at: new Date()
            }
        });
        try {
            const message = `🎾 *Club de Tenis Graneros*\n\n` +
                `${challenge.challenged.name} rechazó tu desafío.\n\n` +
                `✅ Ganas por W.O. y subes en la escalerilla!`;
            await Promise.all([
                challenge.challenger.phone
                    ? whatsapp_service_1.whatsappService.sendMessage(challenge.challenger.phone, message)
                    : Promise.resolve(),
                email_service_1.emailService.sendRejectedNotification(challenge.challenger.name, challenge.challenged.name, challenge.challenger.email)
            ]);
        }
        catch (error) {
            console.error('⚠️ Error al enviar notificaciones:', error);
        }
        return {
            message: 'Desafío rechazado. Las posiciones han sido intercambiadas.',
            note: `${challenge.challenger.name} sube, ${challenge.challenged.name} baja`
        };
    }
    async submitResult(challengeId, submitterId, result) {
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
            throw new common_1.BadRequestException('Desafío no encontrado');
        }
        if (challenge.status !== 'accepted') {
            throw new common_1.BadRequestException('Solo puedes ingresar resultado de desafíos aceptados');
        }
        const isChallenger = submitterId === challenge.challenger_id;
        const isChallenged = submitterId === challenge.challenged_id;
        if (!isChallenger && !isChallenged) {
            throw new common_1.BadRequestException('Solo los jugadores del desafío pueden ingresar resultado');
        }
        if (result.winnerId !== challenge.challenger_id &&
            result.winnerId !== challenge.challenged_id) {
            throw new common_1.BadRequestException('El ganador debe ser uno de los jugadores del desafío');
        }
        const updateData = isChallenger
            ? { challenger_result: result }
            : { challenged_result: result };
        await this.prisma.challenge.update({
            where: { id: challengeId },
            data: updateData
        });
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
            throw new common_1.BadRequestException('Error al actualizar desafío');
        }
        if (!updated.challenger_result || !updated.challenged_result) {
            const otherPlayer = isChallenger ? updated.challenged : updated.challenger;
            const currentPlayer = isChallenger ? updated.challenger : updated.challenged;
            try {
                const message = `🎾 *Club de Tenis Graneros*\n\n` +
                    `${currentPlayer.name} ya ingresó el resultado del partido.\n\n` +
                    `¡No olvides ingresar tu resultado también!`;
                await Promise.all([
                    otherPlayer.phone
                        ? whatsapp_service_1.whatsappService.sendMessage(otherPlayer.phone, message)
                        : Promise.resolve()
                ]);
            }
            catch (error) {
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
    async processDoubleConfirmation(challengeId) {
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
            throw new common_1.BadRequestException('Desafío no encontrado');
        }
        console.log('✅ Desafío encontrado:', challenge.id);
        console.log('📊 Resultado challenger:', challenge.challenger_result);
        console.log('📊 Resultado challenged:', challenge.challenged_result);
        const result1 = challenge.challenger_result;
        const result2 = challenge.challenged_result;
        if (result1.winnerId === result2.winnerId) {
            console.log('✅ Resultados coinciden. Procesando...');
            const winnerId = result1.winnerId;
            const loserId = winnerId === challenge.challenger_id
                ? challenge.challenged_id
                : challenge.challenger_id;
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
                if (!winner || !loser) {
                    throw new common_1.BadRequestException('Jugador no encontrado después de actualizar');
                }
                try {
                    await Promise.all([
                        winner.phone
                            ? whatsapp_service_1.whatsappService.sendMessage(winner.phone, `🎾 *Club de Tenis Graneros*\n\n` +
                                `🏆 ¡FELICIDADES!\n\n` +
                                `Ganaste el partido contra ${loser.name}\n` +
                                `Score: ${result1.score}\n\n` +
                                `Nueva posición: #${winner.position}`)
                            : Promise.resolve(),
                        loser.phone
                            ? whatsapp_service_1.whatsappService.sendMessage(loser.phone, `🎾 *Club de Tenis Graneros*\n\n` +
                                `Resultado confirmado\n\n` +
                                `Partido vs ${winner.name}\n` +
                                `Score: ${result1.score}\n\n` +
                                `Nueva posición: #${loser.position}`)
                            : Promise.resolve()
                    ]);
                    console.log('✅ Notificaciones de resultado enviadas');
                }
                catch (error) {
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
            }
            catch (error) {
                console.error('❌ Error en processDoubleConfirmation:', error);
                throw error;
            }
        }
        else {
            console.log('⚠️  Resultados NO coinciden');
            await this.prisma.challenge.update({
                where: { id: challengeId },
                data: { status: 'disputed' }
            });
            try {
                const message = `🎾 *Club de Tenis Graneros*\n\n` +
                    `⚠️ Los resultados ingresados no coinciden.\n\n` +
                    `Un administrador revisará el caso.\n\n` +
                    `${challenge.challenger.name} dice: ${result1.score}\n` +
                    `${challenge.challenged.name} dice: ${result2.score}`;
                await Promise.all([
                    challenge.challenger.phone
                        ? whatsapp_service_1.whatsappService.sendMessage(challenge.challenger.phone, message)
                        : Promise.resolve(),
                    challenge.challenged.phone
                        ? whatsapp_service_1.whatsappService.sendMessage(challenge.challenged.phone, message)
                        : Promise.resolve()
                ]);
            }
            catch (error) {
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
};
exports.ChallengesService = ChallengesService;
exports.ChallengesService = ChallengesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        challenge_rules_service_1.ChallengeRulesService])
], ChallengesService);
//# sourceMappingURL=challenges.service.js.map