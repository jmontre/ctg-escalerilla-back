export declare class EmailService {
    private fromEmail;
    sendChallengeNotification(challengerName: string, challengedName: string, challengedEmail: string): Promise<boolean>;
    sendAcceptedNotification(challengerName: string, challengedName: string, challengerEmail: string): Promise<boolean>;
    sendRejectedNotification(challengerName: string, challengedName: string, challengerEmail: string): Promise<boolean>;
    sendResultConfirmedNotification(playerName: string, opponentName: string, playerEmail: string, score: string, won: boolean, newPosition: number): Promise<boolean>;
}
export declare const emailService: EmailService;
