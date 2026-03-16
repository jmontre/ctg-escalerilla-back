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
exports.ChallengeRulesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const date_fns_1 = require("date-fns");
let ChallengeRulesService = class ChallengeRulesService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    getLevel(position) {
        if (position === 1)
            return 1;
        if (position <= 4)
            return 2;
        if (position <= 8)
            return 3;
        if (position <= 12)
            return 4;
        if (position <= 17)
            return 5;
        if (position <= 22)
            return 6;
        if (position <= 28)
            return 7;
        if (position <= 34)
            return 8;
        return Math.ceil(position / 6);
    }
    validateLevel(challenger, challenged) {
        const challengerLevel = this.getLevel(challenger.position);
        const challengedLevel = this.getLevel(challenged.position);
        if (challengerLevel === challengedLevel) {
            if (challenged.position >= challenger.position) {
                throw new common_1.BadRequestException(`No puedes desafiar a ${challenged.name}. Solo puedes desafiar jugadores adelante tuyo en el mismo nivel.`);
            }
            return;
        }
        if (challengedLevel !== challengerLevel - 1) {
            throw new common_1.BadRequestException(`Solo puedes desafiar jugadores del nivel inmediatamente superior. ` +
                `Tú estás en nivel ${challengerLevel}, ${challenged.name} está en nivel ${challengedLevel}.`);
        }
    }
    async validateNotOccupied(playerId, playerName) {
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
            throw new common_1.BadRequestException(`${playerName} ya tiene un desafío pendiente con ${otherPlayer}`);
        }
    }
    validateImmunity(challenged) {
        if (challenged.immune_until && challenged.immune_until > new Date()) {
            const hoursLeft = Math.ceil((challenged.immune_until.getTime() - Date.now()) / (1000 * 60 * 60));
            throw new common_1.BadRequestException(`${challenged.name} tiene inmunidad por ${hoursLeft} hora(s) más`);
        }
    }
    async validateChallenge(challengerId, challengedId) {
        const [challenger, challenged] = await Promise.all([
            this.prisma.player.findUnique({ where: { id: challengerId } }),
            this.prisma.player.findUnique({ where: { id: challengedId } })
        ]);
        if (!challenger || !challenged) {
            throw new common_1.BadRequestException('Jugador no encontrado');
        }
        if (challengerId === challengedId) {
            throw new common_1.BadRequestException('No puedes desafiarte a ti mismo');
        }
        this.validateNotVulnerable(challenger);
        this.validateLevel(challenger, challenged);
        await this.validateNotOccupied(challengerId, challenger.name);
        await this.validateNotOccupied(challengedId, challenged.name);
        this.validateImmunity(challenged);
        return { challenger, challenged };
    }
    async getAvailableChallenges(playerId) {
        const player = await this.prisma.player.findUnique({
            where: { id: playerId }
        });
        if (!player) {
            throw new common_1.BadRequestException('Jugador no encontrado');
        }
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
            return [];
        }
        const playerLevel = this.getLevel(player.position);
        const targetLevel = playerLevel - 1;
        if (targetLevel < 1) {
            return [];
        }
        const allPlayers = await this.prisma.player.findMany({
            orderBy: { position: 'asc' }
        });
        const availablePlayers = [];
        for (const p of allPlayers) {
            if (this.getLevel(p.position) === targetLevel) {
                const occupied = await this.prisma.challenge.findFirst({
                    where: {
                        OR: [
                            { challenger_id: p.id },
                            { challenged_id: p.id }
                        ],
                        status: { in: ['pending', 'accepted'] }
                    }
                });
                const hasImmunity = p.immune_until && p.immune_until > new Date();
                if (!occupied && !hasImmunity) {
                    availablePlayers.push(p);
                }
            }
        }
        return availablePlayers;
    }
    async processWin(challengeId, winnerId, loserId) {
        const winner = await this.prisma.player.findUnique({ where: { id: winnerId } });
        const loser = await this.prisma.player.findUnique({ where: { id: loserId } });
        if (!winner || !loser) {
            throw new common_1.BadRequestException('Jugador no encontrado');
        }
        if (winner.position < loser.position) {
            console.log(`ℹ️  ${winner.name} ya estaba adelante, sin cambios`);
            return;
        }
        const targetPosition = loser.position;
        const oldWinnerPosition = winner.position;
        console.log(`📍 Moviendo ${winner.name}: ${oldWinnerPosition} → ${targetPosition}`);
        const affectedPlayers = await this.prisma.player.findMany({
            where: {
                position: {
                    gte: targetPosition,
                    lt: oldWinnerPosition
                }
            },
            orderBy: { position: 'desc' }
        });
        console.log(`📍 Jugadores afectados: ${affectedPlayers.length}`);
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
        await this.prisma.player.update({
            where: { id: winner.id },
            data: { position: 9999 }
        });
        for (const player of affectedPlayers) {
            await this.prisma.player.update({
                where: { id: player.id },
                data: { position: player.position + 1 }
            });
        }
        await this.prisma.player.update({
            where: { id: winner.id },
            data: { position: targetPosition }
        });
        console.log(`✅ Corrimiento: ${winner.name} (${oldWinnerPosition} → ${targetPosition})`);
    }
    async applyPostMatchStatus(winnerId, loserId) {
        const winner = await this.prisma.player.findUnique({ where: { id: winnerId } });
        const loser = await this.prisma.player.findUnique({ where: { id: loserId } });
        if (!winner || !loser) {
            throw new common_1.BadRequestException('Jugador no encontrado');
        }
        if (winner.position !== 1) {
            await this.prisma.player.update({
                where: { id: winnerId },
                data: {
                    immune_until: (0, date_fns_1.add)(new Date(), { hours: 24 })
                }
            });
            console.log(`🛡️  ${winner.name} tiene inmunidad por 24 hrs (pos ${winner.position})`);
        }
        else {
            console.log(`👑 ${winner.name} es #1 - SIN inmunidad`);
        }
        await this.prisma.player.update({
            where: { id: loserId },
            data: {
                vulnerable_until: new Date(new Date().setHours(23, 59, 59, 999))
            }
        });
        console.log(`⚠️  ${loser.name} vulnerable hasta medianoche`);
    }
    validateNotVulnerable(challenger) {
        if (challenger.vulnerable_until && challenger.vulnerable_until > new Date()) {
            const hoursLeft = Math.ceil((challenger.vulnerable_until.getTime() - Date.now()) / (1000 * 60 * 60));
            throw new common_1.BadRequestException(`No puedes desafiar mientras estés vulnerable. Podrás desafiar de nuevo en ${hoursLeft} hora(s).`);
        }
    }
    async updateStats(winnerId, loserId) {
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
};
exports.ChallengeRulesService = ChallengeRulesService;
exports.ChallengeRulesService = ChallengeRulesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ChallengeRulesService);
//# sourceMappingURL=challenge-rules.service.js.map