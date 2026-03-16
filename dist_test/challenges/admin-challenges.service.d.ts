import { PrismaService } from '../prisma/prisma.service';
export declare class AdminChallengesService {
    private prisma;
    constructor(prisma: PrismaService);
    resolveChallenge(challengeId: string, winnerId: string, score: string): Promise<{
        challenger: {
            id: string;
            email: string;
            created_at: Date;
            name: string;
            user_id: string;
            phone: string | null;
            position: number;
            wins: number;
            losses: number;
            total_matches: number;
            immune_until: Date | null;
            vulnerable_until: Date | null;
        };
        challenged: {
            id: string;
            email: string;
            created_at: Date;
            name: string;
            user_id: string;
            phone: string | null;
            position: number;
            wins: number;
            losses: number;
            total_matches: number;
            immune_until: Date | null;
            vulnerable_until: Date | null;
        };
    } & {
        id: string;
        created_at: Date;
        challenger_id: string;
        challenged_id: string;
        status: string;
        accept_deadline: Date;
        play_deadline: Date;
        accepted_at: Date | null;
        played_at: Date | null;
        resolved_at: Date | null;
        winner_id: string | null;
        final_score: string | null;
        challenger_result: import("@prisma/client/runtime/library").JsonValue | null;
        challenged_result: import("@prisma/client/runtime/library").JsonValue | null;
        results_match: boolean | null;
    }>;
    cancelChallenge(challengeId: string): Promise<{
        message: string;
        note: string;
    }>;
    extendDeadline(challengeId: string, hours: number, type: 'accept' | 'play'): Promise<{
        message: string;
        challenge: {
            challenger: {
                id: string;
                email: string;
                created_at: Date;
                name: string;
                user_id: string;
                phone: string | null;
                position: number;
                wins: number;
                losses: number;
                total_matches: number;
                immune_until: Date | null;
                vulnerable_until: Date | null;
            };
            challenged: {
                id: string;
                email: string;
                created_at: Date;
                name: string;
                user_id: string;
                phone: string | null;
                position: number;
                wins: number;
                losses: number;
                total_matches: number;
                immune_until: Date | null;
                vulnerable_until: Date | null;
            };
        } & {
            id: string;
            created_at: Date;
            challenger_id: string;
            challenged_id: string;
            status: string;
            accept_deadline: Date;
            play_deadline: Date;
            accepted_at: Date | null;
            played_at: Date | null;
            resolved_at: Date | null;
            winner_id: string | null;
            final_score: string | null;
            challenger_result: import("@prisma/client/runtime/library").JsonValue | null;
            challenged_result: import("@prisma/client/runtime/library").JsonValue | null;
            results_match: boolean | null;
        };
    }>;
}
