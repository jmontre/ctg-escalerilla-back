import { CanActivate, ExecutionContext } from '@nestjs/common';
import { WordPressAuthService } from './wordpress-auth.service';
export declare class WordPressAuthGuard implements CanActivate {
    private wpAuthService;
    constructor(wpAuthService: WordPressAuthService);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
