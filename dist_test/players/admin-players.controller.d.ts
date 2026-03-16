import { AdminPlayersService } from './admin-players.service';
export declare class AdminPlayersController {
    private adminService;
    constructor(adminService: AdminPlayersService);
    createPlayer(data: {
        username: string;
        email: string;
        password: string;
        name: string;
        phone?: string;
        position?: number;
    }): Promise<{
        user: {
            username: string;
            is_admin: boolean;
        };
    } & {
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
    updatePlayer(id: string, data: {
        name?: string;
        email?: string;
        phone?: string;
        position?: number;
    }): Promise<{
        user: {
            username: string;
            is_admin: boolean;
        };
    } & {
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
    deletePlayer(id: string): Promise<{
        message: string;
    }>;
    movePlayer(id: string, data: {
        newPosition: number;
    }): Promise<{
        user: {
            username: string;
            is_admin: boolean;
        };
    } & {
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
    resetImmunity(id: string): Promise<{
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
    resetVulnerability(id: string): Promise<{
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
}
