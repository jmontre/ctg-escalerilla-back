import { PrismaService } from '../prisma/prisma.service';
import { Player } from '@prisma/client';
export declare class ChallengeRulesService {
    private prisma;
    constructor(prisma: PrismaService);
    getLevel(position: number): number;
    private validateLevel;
    private validateNotOccupied;
    private validateImmunity;
    validateChallenge(challengerId: string, challengedId: string): Promise<{
        challenger: Player;
        challenged: Player;
    }>;
    getAvailableChallenges(playerId: string): Promise<Player[]>;
    processWin(challengeId: string, winnerId: string, loserId: string): Promise<void>;
    applyPostMatchStatus(winnerId: string, loserId: string): Promise<void>;
    private validateNotVulnerable;
    updateStats(winnerId: string, loserId: string): Promise<void>;
}
