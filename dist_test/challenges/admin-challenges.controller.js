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
exports.AdminChallengesController = void 0;
const common_1 = require("@nestjs/common");
const admin_challenges_service_1 = require("./admin-challenges.service");
let AdminChallengesController = class AdminChallengesController {
    constructor(adminService) {
        this.adminService = adminService;
    }
    async resolveChallenge(id, data) {
        return this.adminService.resolveChallenge(id, data.winnerId, data.score);
    }
    async cancelChallenge(id) {
        return this.adminService.cancelChallenge(id);
    }
    async extendDeadline(id, data) {
        return this.adminService.extendDeadline(id, data.hours, data.type);
    }
};
exports.AdminChallengesController = AdminChallengesController;
__decorate([
    (0, common_1.Post)(':id/resolve'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminChallengesController.prototype, "resolveChallenge", null);
__decorate([
    (0, common_1.Delete)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AdminChallengesController.prototype, "cancelChallenge", null);
__decorate([
    (0, common_1.Post)(':id/extend'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminChallengesController.prototype, "extendDeadline", null);
exports.AdminChallengesController = AdminChallengesController = __decorate([
    (0, common_1.Controller)('admin/challenges'),
    __metadata("design:paramtypes", [admin_challenges_service_1.AdminChallengesService])
], AdminChallengesController);
//# sourceMappingURL=admin-challenges.controller.js.map