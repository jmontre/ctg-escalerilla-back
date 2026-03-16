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
exports.PlayersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const challenge_rules_service_1 = require("../challenges/challenge-rules.service");
let PlayersService = class PlayersService {
    constructor(prisma, challengeRules) {
        this.prisma = prisma;
        this.challengeRules = challengeRules;
    }
    async findAll() {
        const players = await this.prisma.player.findMany({
            orderBy: { position: 'asc' },
            include: {
                user: {
                    select: {
                        username: true,
                        is_admin: true,
                    }
                }
            }
        });
        return players.map(p => ({
            ...p,
            is_admin: p.user?.is_admin || false,
        }));
    }
    async findOne(id) {
        const player = await this.prisma.player.findUnique({
            where: { id },
            include: {
                user: {
                    select: {
                        username: true,
                        email: true,
                        is_admin: true,
                    }
                },
                challenges_made: {
                    orderBy: { created_at: 'desc' },
                    take: 10,
                    include: {
                        challenged: {
                            select: { name: true, position: true }
                        }
                    }
                },
                challenges_received: {
                    orderBy: { created_at: 'desc' },
                    take: 10,
                    include: {
                        challenger: {
                            select: { name: true, position: true }
                        }
                    }
                },
                ranking_history: {
                    orderBy: { created_at: 'desc' },
                    take: 20
                }
            }
        });
        if (!player) {
            throw new common_1.NotFoundException('Jugador no encontrado');
        }
        return {
            ...player,
            is_admin: player.user?.is_admin || false,
        };
    }
    async findByUserId(userId) {
        const player = await this.prisma.player.findUnique({
            where: { user_id: userId },
            include: {
                user: {
                    select: {
                        username: true,
                        email: true,
                        is_admin: true,
                    }
                }
            }
        });
        if (!player) {
            throw new common_1.NotFoundException(`Jugador con user_id ${userId} no encontrado`);
        }
        return {
            ...player,
            is_admin: player.user?.is_admin || false,
        };
    }
    async getAvailableChallenges(id) {
        const availablePlayers = await this.challengeRules.getAvailableChallenges(id);
        return {
            player_id: id,
            available_challenges: availablePlayers.map(p => ({
                id: p.id,
                name: p.name,
                position: p.position,
                level: this.challengeRules.getLevel(p.position),
                wins: p.wins,
                losses: p.losses
            }))
        };
    }
};
exports.PlayersService = PlayersService;
exports.PlayersService = PlayersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        challenge_rules_service_1.ChallengeRulesService])
], PlayersService);
//# sourceMappingURL=players.service.js.map