import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
export declare class AuthController {
    private authService;
    constructor(authService: AuthService);
    register(dto: RegisterDto): Promise<{
        token: string;
        user: {
            id: string;
            username: string;
            email: string;
            is_admin: boolean;
        };
        player: {
            is_admin: boolean;
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
    }>;
    login(dto: LoginDto): Promise<{
        token: string;
        user: {
            id: string;
            username: string;
            email: string;
            is_admin: boolean;
        };
        player: {
            is_admin: boolean;
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
    }>;
    me(auth: string): Promise<{
        user: {
            id: string;
            username: string;
            email: string;
            is_admin: boolean;
        };
        player: {
            is_admin: boolean;
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
    }>;
}
