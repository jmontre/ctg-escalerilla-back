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
exports.AdminChallengesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
let AdminChallengesService = class AdminChallengesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async resolveChallenge(challengeId, winnerId, score) {
        const challenge = await this.prisma.challenge.findUnique({
            where: { id: challengeId },
            include: {
                challenger: true,
                challenged: true,
            },
        });
        if (!challenge) {
            throw new common_1.NotFoundException('Desafío no encontrado');
        }
        const loserId = winnerId === challenge.challenger_id
            ? challenge.challenged_id
            : challenge.challenger_id;
        const winner = await this.prisma.player.findUnique({
            where: { id: winnerId },
        });
        const loser = await this.prisma.player.findUnique({
            where: { id: loserId },
        });
        if (!winner || !loser) {
            throw new common_1.NotFoundException('Jugadores no encontrados');
        }
        if (winnerId === challenge.challenger_id && winner.position > loser.position) {
            const targetPosition = loser.position;
            const oldWinnerPosition = winner.position;
            await this.prisma.player.updateMany({
                where: {
                    position: {
                        gte: targetPosition,
                        lt: oldWinnerPosition,
                    },
                },
                data: {
                    position: {
                        increment: 1,
                    },
                },
            });
            await this.prisma.player.update({
                where: { id: winnerId },
                data: { position: targetPosition },
            });
            await this.prisma.rankingHistory.create({
                data: {
                    player_id: winnerId,
                    position: targetPosition,
                    old_position: oldWinnerPosition,
                    reason: `Ganó desafío vs ${loser.name} - Resuelto por admin`,
                },
            });
        }
        const updated = await this.prisma.challenge.update({
            where: { id: challengeId },
            data: {
                status: 'completed',
                winner_id: winnerId,
                final_score: score,
                resolved_at: new Date(),
                played_at: challenge.played_at || new Date(),
            },
            include: {
                challenger: true,
                challenged: true,
            },
        });
        await this.prisma.player.update({
            where: { id: winnerId },
            data: {
                wins: { increment: 1 },
                total_matches: { increment: 1 },
                immune_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
        await this.prisma.player.update({
            where: { id: loserId },
            data: {
                losses: { increment: 1 },
                total_matches: { increment: 1 },
                vulnerable_until: new Date(Date.now() + 24 * 60 * 60 * 1000),
            },
        });
        return updated;
    }
    async cancelChallenge(challengeId) {
        const challenge = await this.prisma.challenge.findUnique({
            where: { id: challengeId },
            include: {
                challenger: true,
                challenged: true,
            },
        });
        if (!challenge) {
            throw new common_1.NotFoundException('Desafío no encontrado');
        }
        if (challenge.status === 'completed' && challenge.winner_id) {
            const winnerId = challenge.winner_id;
            const loserId = winnerId === challenge.challenger_id
                ? challenge.challenged_id
                : challenge.challenger_id;
            const winner = await this.prisma.player.findUnique({
                where: { id: winnerId },
            });
            if (winner && winner.wins > 0 && winner.total_matches > 0) {
                await this.prisma.player.update({
                    where: { id: winnerId },
                    data: {
                        wins: { decrement: 1 },
                        total_matches: { decrement: 1 },
                    },
                });
            }
            const loser = await this.prisma.player.findUnique({
                where: { id: loserId },
            });
            if (loser && loser.losses > 0 && loser.total_matches > 0) {
                await this.prisma.player.update({
                    where: { id: loserId },
                    data: {
                        losses: { decrement: 1 },
                        total_matches: { decrement: 1 },
                    },
                });
            }
        }
        await this.prisma.challenge.update({
            where: { id: challengeId },
            data: {
                status: 'cancelled',
                resolved_at: new Date(),
            },
        });
        return {
            message: 'Desafío cancelado correctamente',
            note: challenge.status === 'completed'
                ? 'Estadísticas revertidas. NOTA: Los cambios de ranking NO fueron revertidos automáticamente.'
                : null
        };
    }
    async extendDeadline(challengeId, hours, type) {
        const challenge = await this.prisma.challenge.findUnique({
            where: { id: challengeId },
        });
        if (!challenge) {
            throw new common_1.NotFoundException('Desafío no encontrado');
        }
        const updateData = {};
        if (type === 'accept') {
            const newDeadline = new Date(challenge.accept_deadline);
            newDeadline.setHours(newDeadline.getHours() + hours);
            updateData.accept_deadline = newDeadline;
        }
        else if (type === 'play') {
            const newDeadline = new Date(challenge.play_deadline);
            newDeadline.setHours(newDeadline.getHours() + hours);
            updateData.play_deadline = newDeadline;
        }
        const updated = await this.prisma.challenge.update({
            where: { id: challengeId },
            data: updateData,
            include: {
                challenger: true,
                challenged: true,
            },
        });
        return {
            message: `Plazo ${type === 'accept' ? 'para aceptar' : 'para jugar'} extendido ${hours} horas`,
            challenge: updated,
        };
    }
};
exports.AdminChallengesService = AdminChallengesService;
exports.AdminChallengesService = AdminChallengesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminChallengesService);
//# sourceMappingURL=admin-challenges.service.js.map