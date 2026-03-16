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
exports.ChallengesController = void 0;
const common_1 = require("@nestjs/common");
const challenges_service_1 = require("./challenges.service");
class CreateChallengeDto {
}
let ChallengesController = class ChallengesController {
    constructor(challengesService) {
        this.challengesService = challengesService;
    }
    create(dto) {
        if (!dto.challenger_id || !dto.challenged_id) {
            throw new common_1.BadRequestException('challenger_id y challenged_id son requeridos');
        }
        return this.challengesService.create(dto.challenger_id, dto.challenged_id);
    }
    findAll() {
        return this.challengesService.findAll();
    }
    findOne(id) {
        return this.challengesService.findOne(id);
    }
    accept(id, body) {
        if (!body.player_id) {
            throw new common_1.BadRequestException('player_id es requerido');
        }
        return this.challengesService.accept(id, body.player_id);
    }
    reject(id, body) {
        if (!body.player_id) {
            throw new common_1.BadRequestException('player_id es requerido');
        }
        return this.challengesService.reject(id, body.player_id);
    }
    submitResult(id, body) {
        if (!body.player_id || !body.winner_id || !body.score) {
            throw new common_1.BadRequestException('player_id, winner_id y score son requeridos');
        }
        return this.challengesService.submitResult(id, body.player_id, {
            winnerId: body.winner_id,
            score: body.score
        });
    }
};
exports.ChallengesController = ChallengesController;
__decorate([
    (0, common_1.Post)(),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [CreateChallengeDto]),
    __metadata("design:returntype", void 0)
], ChallengesController.prototype, "create", null);
__decorate([
    (0, common_1.Get)(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], ChallengesController.prototype, "findAll", null);
__decorate([
    (0, common_1.Get)(':id'),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], ChallengesController.prototype, "findOne", null);
__decorate([
    (0, common_1.Post)(':id/accept'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChallengesController.prototype, "accept", null);
__decorate([
    (0, common_1.Post)(':id/reject'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChallengesController.prototype, "reject", null);
__decorate([
    (0, common_1.Post)(':id/result'),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], ChallengesController.prototype, "submitResult", null);
exports.ChallengesController = ChallengesController = __decorate([
    (0, common_1.Controller)('challenges'),
    __metadata("design:paramtypes", [challenges_service_1.ChallengesService])
], ChallengesController);
//# sourceMappingURL=challenges.controller.js.map