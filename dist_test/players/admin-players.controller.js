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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AdminPlayersController = void 0;
const common_1 = require("@nestjs/common");
const admin_players_service_1 = require("./admin-players.service");
let AdminPlayersController = class AdminPlayersController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    async createPlayer(data) {
        return this.adminService.createPlayer(data);
    }
    async updatePlayer(id, data) {
        return this.adminService.updatePlayer(id, data);
    }
    async deletePlayer(id) {
        return this.adminService.deletePlayer(id);
    }
    async movePlayer(id, data) {
        return this.adminService.movePlayer(id, data.newPosition);
    }
    async resetImmunity(id) {
        return this.adminService.resetImmunity(id);
    }
    async resetVulnerability(id) {
        return this.adminService.resetVulnerability(id);
    }
};
exports.AdminPlayersController = AdminPlayersController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AdminPlayersController.prototype, "createPlayer", null);
__decorate([
    (0, common_1.Put)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminPlayersController.prototype, "updatePlayer", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminPlayersController.prototype, "deletePlayer", null);
__decorate([
    (0, common_1.Post)(':id/move'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminPlayersController.prototype, "movePlayer", null);
__decorate([
    (0, common_1.Post)(':id/reset-immunity'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminPlayersController.prototype, "resetImmunity", null);
__decorate([
    (0, common_1.Post)(':id/reset-vulnerability'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminPlayersController.prototype, "resetVulnerability", null);
exports.AdminPlayersController = AdminPlayersController = __decorate([
    (0, common_1.Controller)('admin/players'),
    __metadata("design:paramtypes", [admin_players_service_1.AdminPlayersService])
], AdminPlayersController);
//# sourceMappingURL=admin-players.controller.js.map