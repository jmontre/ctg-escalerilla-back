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
exports.WordPressAuthGuard = void 0;
const common_1 = require("@nestjs/common");
const wordpress_auth_service_1 = require("./wordpress-auth.service");
let WordPressAuthGuard = class WordPressAuthGuard {
    constructor(wpAuthService) {
        this.wpAuthService = wpAuthService;
    }
    async canActivate(context) {
        const request = context.switchToHttp().getRequest();
        const cookieHeader = request.headers.cookie;
        console.log('🔍 WordPress Auth Guard');
        console.log('📋 Cookie header completo:', cookieHeader);
        if (!cookieHeader) {
            console.log('❌ No hay cookies');
            throw new common_1.UnauthorizedException('No se encontraron cookies de sesión');
        }
        try {
            console.log('🔐 Verificando con WordPress...');
            const wpUser = await this.wpAuthService.verifySession(cookieHeader);
            console.log('✅ Usuario verificado:', wpUser);
            request.wpUser = wpUser;
            return true;
        }
        catch (error) {
            console.log('❌ Error de verificación:', error.message);
            throw new common_1.UnauthorizedException('Sesión de WordPress inválida o expirada');
        }
    }
};
exports.WordPressAuthGuard = WordPressAuthGuard;
exports.WordPressAuthGuard = WordPressAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [wordpress_auth_service_1.WordPressAuthService])
], WordPressAuthGuard);
//# sourceMappingURL=wordpress-auth.guard.js.map