export declare class TestController {
    testWhatsapp(body: {
        phone: string;
        message: string;
    }): Promise<{
        success: boolean;
        phone: string;
    }>;
}
