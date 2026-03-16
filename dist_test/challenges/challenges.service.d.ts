import { PrismaService } from '../prisma/prisma.service';
import { ChallengeRulesService } from './challenge-rules.service';
export declare class ChallengesService {
    private prisma;
    private rules;
    constructor(prisma: PrismaService, rules: ChallengeRulesService);
    create(challengerId: string, challengedId: string): Promise<{
        message: string;
        challenge: {
            challenger: {
                id: string;
                email: string;
                name: string;
                phone: string;
                position: number;
            };
            challenged: {
                id: string;
                email: string;
                name: string;
                phone: string;
                position: number;
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
    findAll(): Promise<({
        challenger: {
            id: string;
            name: string;
            position: number;
        };
        challenged: {
            id: string;
            name: string;
            position: number;
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
    })[]>;
    findOne(id: string): Promise<{
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
    accept(challengeId: string, playerId: string): Promise<{
        message: string;
        challenge: {
            challenger: {
                id: string;
                email: string;
                name: string;
                phone: string;
            };
            challenged: {
                id: string;
                email: string;
                name: string;
                phone: string;
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
    reject(challengeId: string, playerId: string): Promise<{
        message: string;
        note: string;
    }>;
    submitResult(challengeId: string, submitterId: string, result: {
        winnerId: string;
        score: string;
    }): Promise<{
        message: string;
        winner: {
            name: string;
            new_position: number;
        };
        loser: {
            name: string;
            new_position: number;
        };
        score: any;
        status?: undefined;
        challenger_says?: undefined;
        challenged_says?: undefined;
    } | {
        message: string;
        status: string;
        challenger_says: any;
        challenged_says: any;
        winner?: undefined;
        loser?: undefined;
        score?: undefined;
    } | {
        message: string;
        challenge: {
            challenger: {
                id: string;
                email: string;
                name: string;
                phone: string;
            };
            challenged: {
                id: string;
                email: string;
                name: string;
                phone: string;
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
    private processDoubleConfirmation;
}
