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
var ChallengesCronService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChallengesCronService = void 0;
const common_1 = require("@nestjs/common");
const schedule_1 = require("@nestjs/schedule");
const prisma_service_1 = require("../prisma/prisma.service");
const challenge_rules_service_1 = require("../challenges/challenge-rules.service");
let ChallengesCronService = ChallengesCronService_1 = class ChallengesCronService {
    constructor(prisma, rules) {
        this.prisma = prisma;
        this.rules = rules;
        this.logger = new common_1.Logger(ChallengesCronService_1.name);
    }
    async handleExpiredChallenges() {
        this.logger.log('⏰ Iniciando verificación de desafíos expirados...');
        const now = new Date();
        let notAccepted = 0;
        let notPlayed = 0;
        let notConfirmed = 0;
        try {
            notAccepted = await this.handleNotAccepted(now);
            notPlayed = await this.handleNotPlayed(now);
            notConfirmed = await this.handleNotConfirmed(now);
            this.logger.log(`✅ Procesamiento completo:`);
            this.logger.log(`   - No aceptados: ${notAccepted}`);
            this.logger.log(`   - No jugados: ${notPlayed}`);
            this.logger.log(`   - No confirmados: ${notConfirmed}`);
        }
        catch (error) {
            this.logger.error('❌ Error en cron job:', error);
        }
    }
    async handleNotAccepted(now) {
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
            this.logger.warn(`⏱️  Desafío expirado (no aceptado): ${challenge.challenger.name} vs ${challenge.challenged.name}`);
            await this.rules.processWin(challenge.id, challenge.challenger_id, challenge.challenged_id);
            await this.prisma.challenge.update({
                where: { id: challenge.id },
                data: {
                    status: 'expired_not_accepted',
                    resolved_at: now
                }
            });
            this.logger.log(`✅ Intercambio aplicado: ${challenge.challenger.name} sube, ${challenge.challenged.name} baja`);
        }
        return expiredChallenges.length;
    }
    async handleNotPlayed(now) {
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
            this.logger.warn(`⏱️  Desafío expirado (no jugado): ${challenge.challenger.name} vs ${challenge.challenged.name}`);
            await this.penalizeBothPlayers(challenge);
            await this.prisma.challenge.update({
                where: { id: challenge.id },
                data: {
                    status: 'expired_not_played',
                    resolved_at: now
                }
            });
            this.logger.log(`✅ Penalización aplicada: Ambos jugadores bajan 1 posición`);
        }
        return expiredChallenges.length;
    }
    async handleNotConfirmed(now) {
        const allAccepted = await this.prisma.challenge.findMany({
            where: {
                status: 'accepted'
            },
            include: {
                challenger: true,
                challenged: true
            }
        });
        const pendingConfirmation = allAccepted.filter(challenge => {
            const hasChallenger = challenge.challenger_result !== null;
            const hasChallenged = challenge.challenged_result !== null;
            return (hasChallenger && !hasChallenged) || (!hasChallenger && hasChallenged);
        });
        let processed = 0;
        for (const challenge of pendingConfirmation) {
            if (!challenge.accepted_at) {
                continue;
            }
            const hoursSinceAccepted = (now.getTime() - challenge.accepted_at.getTime()) / (1000 * 60 * 60);
            if (hoursSinceAccepted >= 24) {
                this.logger.warn(`⏱️  Resultado sin doble confirmación: ${challenge.challenger.name} vs ${challenge.challenged.name}`);
                const confirmedResult = challenge.challenger_result || challenge.challenged_result;
                const winnerId = confirmedResult.winnerId;
                const loserId = winnerId === challenge.challenger_id
                    ? challenge.challenged_id
                    : challenge.challenger_id;
                await this.rules.processWin(challenge.id, winnerId, loserId);
                await this.rules.applyPostMatchStatus(winnerId, loserId);
                await this.rules.updateStats(winnerId, loserId);
                await this.prisma.challenge.update({
                    where: { id: challenge.id },
                    data: {
                        status: 'completed',
                        winner_id: winnerId,
                        final_score: confirmedResult.score,
                        results_match: false,
                        played_at: now,
                        resolved_at: now
                    }
                });
                this.logger.log(`✅ Resultado auto-validado (solo uno confirmó)`);
                processed++;
            }
        }
        return processed;
    }
    async penalizeBothPlayers(challenge) {
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
    async runManually() {
        this.logger.log('🔧 Ejecución manual del cron job');
        await this.handleExpiredChallenges();
    }
};
exports.ChallengesCronService = ChallengesCronService;
__decorate([
    (0, schedule_1.Cron)(schedule_1.CronExpression.EVERY_HOUR),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ChallengesCronService.prototype, "handleExpiredChallenges", null);
exports.ChallengesCronService = ChallengesCronService = ChallengesCronService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        challenge_rules_service_1.ChallengeRulesService])
], ChallengesCronService);
//# sourceMappingURL=challenges-cron.service.js.map