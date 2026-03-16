import { PlayersService } from './players.service';
export declare class PlayersController {
    private playersService;
    constructor(playersService: PlayersService);
    findAll(): Promise<{
        is_admin: boolean;
        user: {
            username: string;
            is_admin: boolean;
        };
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
    }[]>;
    findByUserId(userId: string): Promise<{
        is_admin: boolean;
        user: {
            username: string;
            email: string;
            is_admin: boolean;
        };
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
    }>;
    findOne(id: string): Promise<{
        is_admin: boolean;
        user: {
            username: string;
            email: string;
            is_admin: boolean;
        };
        challenges_made: ({
            challenged: {
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
        })[];
        challenges_received: ({
            challenger: {
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
        })[];
        ranking_history: {
            id: string;
            created_at: Date;
            position: number;
            old_position: number | null;
            reason: string | null;
            player_id: string;
        }[];
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
    }>;
    getAvailableChallenges(id: string): Promise<{
        player_id: string;
        available_challenges: {
            id: string;
            name: string;
            position: number;
            level: number;
            wins: number;
            losses: number;
        }[];
    }>;
}
