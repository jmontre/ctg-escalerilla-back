export declare class WordPressAuthService {
    private readonly wpUrl;
    constructor();
    verifySession(cookies: string): Promise<WordPressUser>;
}
export interface WordPressUser {
    id: number;
    username: string;
    name: string;
    email: string;
    roles: string[];
}
