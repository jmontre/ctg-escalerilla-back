export declare class WhatsAppService {
    private client;
    private ready;
    initialize(): Promise<void>;
    sendMessage(phone: string, message: string): Promise<boolean>;
    sendChallengeNotification(challengerName: string, challengedName: string, challengedPhone: string): Promise<boolean>;
    sendAcceptedNotification(challengerName: string, challengedName: string, challengerPhone: string): Promise<boolean>;
    sendRejectedNotification(challengerName: string, challengedName: string, challengerPhone: string): Promise<boolean>;
    sendDeadlineReminder(playerName: string, opponentName: string, playerPhone: string, hoursLeft: number): Promise<boolean>;
    isReady(): boolean;
}
export declare const whatsappService: WhatsAppService;
