"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.whatsappService = exports.WhatsAppService = void 0;
const whatsapp_web_js_1 = require("whatsapp-web.js");
const wwebjs_mongo_1 = require("wwebjs-mongo");
const mongoose_1 = __importDefault(require("mongoose"));
const qrcode = __importStar(require("qrcode-terminal"));
class WhatsAppService {
    constructor() {
        this.ready = false;
    }
    async initialize() {
        console.log('🔄 Conectando a MongoDB para sesión WhatsApp...');
        await mongoose_1.default.connect(process.env.MONGODB_URI);
        console.log('✅ MongoDB conectado');
        const store = new wwebjs_mongo_1.MongoStore({ mongoose: mongoose_1.default });
        this.client = new whatsapp_web_js_1.Client({
            authStrategy: new whatsapp_web_js_1.RemoteAuth({
                store,
                backupSyncIntervalMs: 300000,
            }),
            puppeteer: {
                headless: true,
                executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
            },
        });
        this.client.on('qr', (qr) => {
            console.log('\n╔════════════════════════════════════════╗');
            console.log('║   ESCANEA CON WHATSAPP BUSINESS        ║');
            console.log('╚════════════════════════════════════════╝\n');
            qrcode.generate(qr, { small: true });
            console.log('\n📱 Escanea el QR de arriba con WhatsApp\n');
        });
        this.client.on('remote_session_saved', () => {
            console.log('💾 Sesión guardada en MongoDB');
        });
        this.client.on('ready', () => {
            console.log('✅ WhatsApp conectado! 🎉');
            this.ready = true;
        });
        this.client.on('authenticated', () => {
            console.log('✅ Autenticado correctamente');
        });
        this.client.on('auth_failure', () => {
            console.log('❌ Error de autenticación');
            this.ready = false;
        });
        this.client.on('disconnected', (reason) => {
            console.log('❌ Desconectado:', reason);
            this.ready = false;
        });
        await this.client.initialize();
    }
    async sendMessage(phone, message) {
        if (!this.ready) {
            console.log('⚠️ WhatsApp no está listo');
            return false;
        }
        try {
            const chatId = phone.includes('@') ? phone : `${phone}@c.us`;
            await this.client.sendMessage(chatId, message);
            return true;
        }
        catch (error) {
            console.error('❌ Error enviando mensaje:', error);
            return false;
        }
    }
    async sendChallengeNotification(challengerName, challengedName, challengedPhone) {
        return this.sendMessage(challengedPhone, `🎾 *Club de Tenis Graneros*\n\n` +
            `¡Tienes un nuevo desafío!\n\n` +
            `*${challengerName}* te ha desafiado.\n\n` +
            `⏰ Tienes *24 horas* para aceptar o rechazar.\n\n` +
            `Ingresa a la app para responder.`);
    }
    async sendAcceptedNotification(challengerName, challengedName, challengerPhone) {
        return this.sendMessage(challengerPhone, `🎾 *Club de Tenis Graneros*\n\n` +
            `✅ *${challengedName}* aceptó tu desafío!\n\n` +
            `⏰ Tienen *5 días* para jugar el partido.\n\n` +
            `Coordinen y no olviden registrar el resultado.`);
    }
    async sendRejectedNotification(challengerName, challengedName, challengerPhone) {
        return this.sendMessage(challengerPhone, `🎾 *Club de Tenis Graneros*\n\n` +
            `${challengedName} rechazó tu desafío.\n\n` +
            `🏆 ¡Ganas por W.O. y subes en la escalerilla!`);
    }
    async sendDeadlineReminder(playerName, opponentName, playerPhone, hoursLeft) {
        return this.sendMessage(playerPhone, `🎾 *Club de Tenis Graneros*\n\n` +
            `⏰ *RECORDATORIO*\n\n` +
            `Tu partido contra *${opponentName}* vence en *${hoursLeft} horas*.\n\n` +
            `No olvides jugar y registrar el resultado.`);
    }
    isReady() {
        return this.ready;
    }
}
exports.WhatsAppService = WhatsAppService;
exports.whatsappService = new WhatsAppService();
//# sourceMappingURL=whatsapp.service.js.map