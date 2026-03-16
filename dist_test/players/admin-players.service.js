"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminPlayersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const bcrypt = __importStar(require("bcryptjs"));
let AdminPlayersService = class AdminPlayersService {
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createPlayer(data) {
        const existing = await this.prisma.user.findFirst({
            where: {
                OR: [
                    { username: data.username },
                    { email: data.email },
                ],
            },
        });
        if (existing) {
            throw new common_1.ConflictException('Username o email ya existe');
        }
        const password_hash = await bcrypt.hash(data.password, 10);
        let position = data.position;
        if (!position) {
            const lastPlayer = await this.prisma.player.findFirst({
                orderBy: { position: 'desc' },
            });
            position = (lastPlayer?.position || 0) + 1;
        }
        const user = await this.prisma.user.create({
            data: {
                username: data.username,
                email: data.email,
                password_hash,
            },
        });
        const player = await this.prisma.player.create({
            data: {
                user_id: user.id,
                name: data.name,
                email: data.email,
                phone: data.phone,
                position,
            },
            include: {
                user: {
                    select: {
                        username: true,
                        is_admin: true,
                    },
                },
            },
        });
        return player;
    }
    async updatePlayer(id, data) {
        const player = await this.prisma.player.findUnique({ where: { id } });
        if (!player) {
            throw new common_1.NotFoundException('Jugador no encontrado');
        }
        const updateData = {};
        if (data.name !== undefined)
            updateData.name = data.name;
        if (data.email !== undefined)
            updateData.email = data.email;
        if (data.phone !== undefined)
            updateData.phone = data.phone;
        if (data.position !== undefined)
            updateData.position = data.position;
        if (data.wins !== undefined)
            updateData.wins = data.wins;
        if (data.losses !== undefined)
            updateData.losses = data.losses;
        if (data.total_matches !== undefined)
            updateData.total_matches = data.total_matches;
        if (data.immune_until !== undefined) {
            updateData.immune_until = data.immune_until ? new Date(data.immune_until) : null;
        }
        if (data.vulnerable_until !== undefined) {
            updateData.vulnerable_until = data.vulnerable_until ? new Date(data.vulnerable_until) : null;
        }
        return this.prisma.player.update({
            where: { id },
            data: updateData,
            include: {
                user: {
                    select: {
                        username: true,
                        is_admin: true,
                    },
                },
            },
        });
    }
    async deletePlayer(id) {
        const player = await this.prisma.player.findUnique({
            where: { id },
            include: { user: true },
        });
        if (!player) {
            throw new common_1.NotFoundException('Jugador no encontrado');
        }
        await this.prisma.user.delete({
            where: { id: player.user_id },
        });
        return { message: 'Jugador eliminado correctamente' };
    }
    async movePlayer(id, newPosition) {
        const player = await this.prisma.player.findUnique({ where: { id } });
        if (!player) {
            throw new common_1.NotFoundException('Jugador no encontrado');
        }
        const oldPosition = player.position;
        if (newPosition < oldPosition) {
            await this.prisma.player.updateMany({
                where: {
                    position: {
                        gte: newPosition,
                        lt: oldPosition,
                    },
                },
                data: {
                    position: {
                        increment: 1,
                    },
                },
            });
        }
        else if (newPosition > oldPosition) {
            await this.prisma.player.updateMany({
                where: {
                    position: {
                        gt: oldPosition,
                        lte: newPosition,
                    },
                },
                data: {
                    position: {
                        decrement: 1,
                    },
                },
            });
        }
        const updated = await this.prisma.player.update({
            where: { id },
            data: { position: newPosition },
            include: {
                user: {
                    select: {
                        username: true,
                        is_admin: true,
                    },
                },
            },
        });
        await this.prisma.rankingHistory.create({
            data: {
                player_id: id,
                position: newPosition,
                old_position: oldPosition,
                reason: 'Movimiento manual por administrador',
            },
        });
        return updated;
    }
    async resetImmunity(id) {
        return this.prisma.player.update({
            where: { id },
            data: { immune_until: null },
        });
    }
    async resetVulnerability(id) {
        return this.prisma.player.update({
            where: { id },
            data: { vulnerable_until: null },
        });
    }
};
exports.AdminPlayersService = AdminPlayersService;
exports.AdminPlayersService = AdminPlayersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], AdminPlayersService);
//# sourceMappingURL=admin-players.service.js.map