import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from '../challenges/challenge-rules.service';
export declare class ChallengesCronService {
    private prisma;
    private rules;
    private readonly logger;
    constructor(prisma: PrismaService, rules: ChallengeRulesService);
    handleExpiredChallenges(): Promise<void>;
    private handleNotAccepted;
    private handleNotPlayed;
    private handleNotConfirmed;
    private penalizeBothPlayers;
    runManually(): Promise<void>;
}
