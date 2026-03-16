"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.WordPressAuthService = void 0;
const common_1 = require("@nestjs/common");
let WordPressAuthService = class WordPressAuthService {
    constructor() {
        this.wpUrl = process.env.WORDPRESS_URL || 'https://clubdetenisgraneros.cl';
    }
    async verifySession(cookies) {
        console.log('🌐 WordPress URL:', this.wpUrl);
        console.log('🍪 Cookies a enviar:', cookies.substring(0, 100) + '...');
        try {
            const url = `${this.wpUrl}/wp-json/ctg/v1/me`;
            console.log('📡 Haciendo request a:', url);
            const response = await fetch(url, {
                method: 'GET',
                headers: {
                    'Cookie': cookies,
                    'User-Agent': 'NestJS-WordPress-Auth/1.0'
                }
            });
            console.log('📊 Response status:', response.status);
            console.log('📋 Response headers:', Object.fromEntries(response.headers.entries()));
            const responseText = await response.text();
            console.log('📄 Response body:', responseText.substring(0, 200));
            if (!response.ok) {
                console.log('❌ Response no OK');
                throw new common_1.UnauthorizedException('Sesión de WordPress inválida');
            }
            const data = JSON.parse(responseText);
            console.log('✅ Data parseada:', data);
            return {
                id: data.id,
                username: data.username,
                name: data.name,
                email: data.email,
                roles: data.roles
            };
        }
        catch (error) {
            console.error('💥 Error completo:', error);
            throw new common_1.UnauthorizedException('No se pudo verificar la sesión de WordPress');
        }
    }
};
exports.WordPressAuthService = WordPressAuthService;
exports.WordPressAuthService = WordPressAuthService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [])
], WordPressAuthService);
//# sourceMappingURL=wordpress-auth.service.js.map