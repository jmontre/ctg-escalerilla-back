import { ChallengesCronService } from './challenges-cron.service';
export declare class CronController {
    private cronService;
    constructor(cronService: ChallengesCronService);
    runCronManually(): Promise<{
        message: string;
        timestamp: Date;
    }>;
}
