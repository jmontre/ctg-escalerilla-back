import { Injectable, BadRequestException, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { whatsappService } from '../notifications/whatsapp.service';

const HIGH_DEMAND_SLOTS: Record<string, string[]> = {
    verano:   ['07:45', '09:30', '18:15', '20:00'],
    invierno: ['09:30', '11:15', '16:30', '18:15'],
};

const ALL_SLOTS = [
    '06:00', '07:45', '09:30', '11:15',
    '13:00', '14:45', '16:30', '18:15', '20:00', '21:45',
];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function formatReservationDate(date: Date): string {
    const datePart = date.toISOString().split('T')[0];
    const d = new Date(`${datePart}T12:00:00`);
    return cap(d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' }));
}

@Injectable()
export class ReservationsService {
    constructor(private prisma: PrismaService) {}

    // ── Config ──────────────────────────────────────────────────────────────────

    async getSeason(): Promise<string> {
        const config = await this.prisma.systemConfig.findUnique({ where: { key: 'season' } });
        return config?.value || 'verano';
    }

    async setSeason(season: string) {
        if (!['verano', 'invierno'].includes(season)) {
            throw new BadRequestException('Temporada inválida. Usa verano o invierno.');
        }
        await this.prisma.systemConfig.upsert({
            where:  { key: 'season' },
            update: { value: season, updated_at: new Date() },
            create: { key: 'season', value: season },
        });
        return { message: `Temporada actualizada a ${season}` };
    }

    // ── Courts ──────────────────────────────────────────────────────────────────

    async getCourts() {
        return this.prisma.court.findMany({ where: { is_active: true }, orderBy: { name: 'asc' } });
    }

    // ── Availability ────────────────────────────────────────────────────────────

    async getAvailability(date: string) {
        const season = await this.getSeason();
        const highDemandSlots = HIGH_DEMAND_SLOTS[season];
        const courts = await this.getCourts();

        const reservations = await this.prisma.reservation.findMany({
            where: { date: new Date(date), status: 'active' },
            include: { player: { select: { id: true, name: true } }, court: true }
        });

        return {
            date,
            season,
            high_demand_slots: highDemandSlots,
            courts: courts.map(court => ({
                ...court,
                slots: ALL_SLOTS.map(slot => {
                    const existing = reservations.find(r => r.court_id === court.id && r.time_slot === slot);
                    return {
                        slot,
                        is_high_demand: highDemandSlots.includes(slot),
                        available: !existing,
                        reservation: existing ? {
                            player_name:  (existing as any).school_name
                                ? `Escuela ${(existing as any).school_name}`
                                : existing.player.name,
                            has_guest:    existing.has_guest,
                            guest_name:   existing.guest_name,
                            partner_name: (existing as any).partner_name || null,
                            is_challenge: (existing as any).is_challenge || false,
                            school_name:  (existing as any).school_name  || null,
                        } : null,
                    };
                }),
            })),
        };
    }

    // ── Reservations ────────────────────────────────────────────────────────────

    async getMyReservations(userId: string) {
        const player = await this.getPlayerByUserId(userId);
        return this.prisma.reservation.findMany({
            where: { player_id: player.id },
            include: { court: true },
            orderBy: [{ date: 'desc' }, { time_slot: 'desc' }],
        });
    }

    async getAllReservations(date?: string) {
        const where: any = {};
        if (date) where.date = new Date(date);
        return this.prisma.reservation.findMany({
            where,
            include: {
                player: { select: { id: true, name: true, member_type: true } },
                court: true,
            },
            orderBy: [{ date: 'asc' }, { time_slot: 'asc' }],
        });
    }

    async getPlayerReservations(playerId: string) {
        const player = await this.prisma.player.findUnique({ where: { id: playerId } });
        if (!player) throw new NotFoundException('Jugador no encontrado.');

        const reservations = await this.prisma.reservation.findMany({
            where: { player_id: playerId },
            include: { court: true },
            orderBy: [{ date: 'desc' }, { time_slot: 'asc' }],
        });

        const weekUsage = await this.getWeeklyUsageForPlayer(player);
        return { reservations, weekUsage };
    }

    // ── Stats ────────────────────────────────────────────────────────────────────

    async getStats(month?: string) {
        // Determinar rango del mes (default: mes actual)
        const now = new Date();
        const year  = month ? parseInt(month.split('-')[0]) : now.getFullYear();
        const mon   = month ? parseInt(month.split('-')[1]) - 1 : now.getMonth();

        const monthStart = new Date(year, mon, 1);
        const monthEnd   = new Date(year, mon + 1, 0, 23, 59, 59, 999);

        // Mes anterior para comparación
        const prevStart = new Date(year, mon - 1, 1);
        const prevEnd   = new Date(year, mon, 0, 23, 59, 59, 999);

        const where = { date: { gte: monthStart, lte: monthEnd } };
        const prevWhere = { date: { gte: prevStart, lte: prevEnd } };

        // ── Totales ──
        const totalActive    = await this.prisma.reservation.count({ where: { ...where, status: 'active' } });
        const totalCancelled = await this.prisma.reservation.count({ where: { ...where, status: 'cancelled' } });
        const totalAll       = totalActive + totalCancelled;
        const prevTotal      = await this.prisma.reservation.count({ where: { ...prevWhere, status: 'active' } });

        // ── Con visita ──
        const withGuest = await this.prisma.reservation.findMany({
            where: { ...where, has_guest: true },
            include: { player: { select: { id: true, name: true } }, court: true },
            orderBy: { date: 'desc' },
        });
        const guestRevenue = withGuest.reduce((sum, r) => sum + (r.guest_fee || 3000), 0);

        // ── Alta vs baja demanda ──
        const highDemand = await this.prisma.reservation.count({ where: { ...where, is_high_demand: true, status: 'active' } });
        const lowDemand  = await this.prisma.reservation.count({ where: { ...where, is_high_demand: false, status: 'active' } });

        // ── Desafíos vs normales ──
        const challenges = await (this.prisma.reservation as any).count({ where: { ...where, is_challenge: true, status: 'active' } });
        const normal     = totalActive - challenges;

        // ── Por cancha ──
        const courts = await this.getCourts();
        const byCourt = await Promise.all(courts.map(async court => {
            const count = await this.prisma.reservation.count({ where: { ...where, court_id: court.id, status: 'active' } });
            // Total slots disponibles en el mes
            const daysInMonth = monthEnd.getDate();
            const totalSlots  = daysInMonth * ALL_SLOTS.length;
            return { court: court.name, count, occupancy: Math.round((count / totalSlots) * 100) };
        }));

        // ── Por horario ──
        const allReservations = await this.prisma.reservation.findMany({
            where: { ...where, status: 'active' },
        });
        const bySlot: Record<string, number> = {};
        for (const slot of ALL_SLOTS) bySlot[slot] = 0;
        for (const r of allReservations) bySlot[r.time_slot] = (bySlot[r.time_slot] || 0) + 1;
        const bySlotArr = Object.entries(bySlot)
            .map(([slot, count]) => ({ slot, count }))
            .sort((a, b) => b.count - a.count);

        // ── Top socios ──
        const playerCount: Record<string, { name: string; count: number }> = {};
        for (const r of allReservations) {
            if (!playerCount[r.player_id]) {
                const p = await this.prisma.player.findUnique({ where: { id: r.player_id }, select: { name: true } });
                playerCount[r.player_id] = { name: p?.name || 'Desconocido', count: 0 };
            }
            playerCount[r.player_id].count++;
        }
        const topPlayers = Object.entries(playerCount)
            .map(([id, data]) => ({ player_id: id, name: data.name, count: data.count }))
            .sort((a, b) => b.count - a.count)
            .slice(0, 10);

        // ── Reservas por día del mes ──
        const byDay: Record<number, number> = {};
        for (const r of allReservations) {
            const day = new Date(r.date).getDate();
            byDay[day] = (byDay[day] || 0) + 1;
        }
        const byDayArr = Array.from({ length: monthEnd.getDate() }, (_, i) => ({
            day: i + 1,
            count: byDay[i + 1] || 0,
        }));

        return {
            month: `${year}-${String(mon + 1).padStart(2, '0')}`,
            month_label: new Date(year, mon, 1).toLocaleDateString('es-CL', { month: 'long', year: 'numeric' }),
            totals: {
                active:    totalActive,
                cancelled: totalCancelled,
                all:       totalAll,
                prev_month: prevTotal,
                growth: prevTotal > 0 ? Math.round(((totalActive - prevTotal) / prevTotal) * 100) : 0,
            },
            guest: {
                count:   withGuest.length,
                revenue: guestRevenue,
                list:    withGuest.map(r => ({
                    id:          r.id,
                    player_name: (r.player as any)?.name,
                    court:       (r.court as any)?.name,
                    date:        r.date,
                    time_slot:   r.time_slot,
                    guest_name:  r.guest_name,
                    guest_fee:   r.guest_fee,
                })),
            },
            demand: { high: highDemand, low: lowDemand },
            type:   { challenges, normal },
            by_court:  byCourt,
            by_slot:   bySlotArr,
            top_players: topPlayers,
            by_day:    byDayArr,
        };
    }

    // ── Create ───────────────────────────────────────────────────────────────────

    async create(userId: string, data: {
        court_id: string;
        date: string;
        time_slot: string;
        has_guest?: boolean;
        guest_name?: string;
        partner_name?: string;
        school_name?: string;
    }) {
        const player = await this.getPlayerByUserId(userId);

        if (player.has_debt) throw new ForbiddenException('No puedes reservar mientras tengas deuda pendiente.');

        const isProfe = (player as any).member_type === 'profe';

        const season = await this.getSeason();
        const highDemandSlots = HIGH_DEMAND_SLOTS[season];
        const isHighDemand = highDemandSlots.includes(data.time_slot);
        const reservationDate = new Date(data.date);

        if (!ALL_SLOTS.includes(data.time_slot)) throw new BadRequestException('Horario no válido.');

        // Validar fecha usando zona horaria Chile (UTC-3/UTC-4 según horario)
        const todayChile = new Date(new Date().toLocaleDateString('en-CA', { timeZone: 'America/Santiago' }) + 'T00:00:00');
        const dateChile  = new Date(data.date + 'T00:00:00');
        if (dateChile < todayChile) throw new BadRequestException('No puedes reservar en fechas pasadas.');

        const court = await this.prisma.court.findUnique({ where: { id: data.court_id } });
        if (!court || !court.is_active) throw new BadRequestException('Cancha no disponible.');

        const existing = await this.prisma.reservation.findFirst({
            where: { court_id: data.court_id, date: reservationDate, time_slot: data.time_slot, status: 'active' }
        });
        if (existing) throw new BadRequestException('Este turno ya está reservado en esa cancha.');

        // Socios normales: solo 1 reserva activa. Profes: sin límite.
        if (!isProfe) {
            const activeReservation = await this.prisma.reservation.findFirst({
                where: { player_id: player.id, status: 'active' }
            });
            if (activeReservation) throw new BadRequestException('Ya tienes una reserva activa. Debes cancelarla antes de hacer una nueva.');
        }

        // Alta demanda: solo aplica a socios normales. Profes sin límite.
        if (isHighDemand && !isProfe) await this.checkHighDemandLimit(player, reservationDate);

        const reservation = await this.prisma.reservation.create({
            data: {
                player_id:      player.id,
                court_id:       data.court_id,
                date:           reservationDate,
                time_slot:      data.time_slot,
                is_high_demand: isHighDemand,
                has_guest:      isProfe ? false : (data.has_guest || false),
                guest_name:     isProfe ? null  : (data.guest_name || null),
                guest_fee:      isProfe ? 0     : (data.has_guest ? 3000 : 0),
                partner_name:   isProfe ? null  : (data.partner_name || null),
                school_name:    isProfe ? (data.school_name || null) : null,
                status:         'active',
            },
            include: { court: true }
        });

        // Notificación solo para socios normales (no profes)
        if (!isProfe) {
            try {
                if (player.phone) {
                    const fechaFormateada = formatReservationDate(reservationDate);
                    await whatsappService.sendMessage(
                        player.phone,
                        `📅 *Club de Tenis Graneros*\n\n` +
                        `✅ Tu reserva está confirmada\n\n` +
                        `🎾 ${court.name}\n` +
                        `📆 ${fechaFormateada}\n` +
                        `🕐 ${data.time_slot} hrs` +
                        (isHighDemand ? `\n🔥 Turno de alta demanda` : '') +
                        (data.has_guest ? `\n👤 Visita: ${data.guest_name || 'Externa'}` : '') +
                        (data.partner_name ? `\n🤝 Con: ${data.partner_name}` : '')
                    );
                }
            } catch (e) {
                console.log(`📱 [LOG WSP → ${player.phone}] Reserva confirmada ${court.name} ${data.time_slot}`);
            }
        }

        return { message: 'Reserva creada correctamente.', reservation };
    }

    async cancel(userId: string, reservationId: string) {
        const player = await this.getPlayerByUserId(userId);

        const reservation = await this.prisma.reservation.findUnique({
            where: { id: reservationId }, include: { court: true }
        });

        if (!reservation)                          throw new NotFoundException('Reserva no encontrada.');
        if (reservation.player_id !== player.id)   throw new ForbiddenException('No puedes cancelar esta reserva.');
        if (reservation.status === 'cancelled')    throw new BadRequestException('Esta reserva ya está cancelada.');

        const datePart = reservation.date.toISOString().split('T')[0];
        const reservationDateTime = new Date(`${datePart}T${reservation.time_slot}:00`);
        const hoursUntil = (reservationDateTime.getTime() - new Date().getTime()) / (1000 * 60 * 60);

        if (hoursUntil < 4.5) {
            throw new BadRequestException('Debes cancelar con al menos 3 turnos de anticipación (4.5 horas antes).');
        }

        await this.prisma.reservation.update({
            where: { id: reservationId },
            data:  { status: 'cancelled', cancelled_at: new Date() }
        });

        if ((reservation as any).challenge_id) {
            await this.prisma.challenge.update({
                where: { id: (reservation as any).challenge_id },
                data:  { scheduled_date: null }
            });
        }

        if (!(reservation as any).is_challenge) {
            try {
                if (player.phone) {
                    const fechaFormateada = formatReservationDate(reservation.date);
                    await whatsappService.sendMessage(
                        player.phone,
                        `📅 *Club de Tenis Graneros*\n\n` +
                        `🚫 Tu reserva fue cancelada\n\n` +
                        `🎾 ${reservation.court?.name || 'Cancha'}\n` +
                        `📆 ${fechaFormateada}\n` +
                        `🕐 ${reservation.time_slot} hrs`
                    );
                }
            } catch (e) {
                console.log(`📱 [LOG WSP → ${player.phone}] Reserva cancelada`);
            }
        }

        return { message: 'Reserva cancelada correctamente.' };
    }

    async adminCancel(reservationId: string, reason?: string) {
        const reservation = await this.prisma.reservation.findUnique({
            where: { id: reservationId },
            include: { court: true }
        });
        if (!reservation) throw new NotFoundException('Reserva no encontrada.');

        await this.prisma.reservation.update({
            where: { id: reservationId },
            data:  { status: 'cancelled', cancelled_at: new Date(), cancel_reason: reason || 'Cancelada por administrador' }
        });

        if ((reservation as any).challenge_id) {
            await this.prisma.challenge.update({
                where: { id: (reservation as any).challenge_id },
                data:  { scheduled_date: null }
            });
        }

        if (!(reservation as any).is_challenge) {
            try {
                const player = await this.prisma.player.findUnique({ where: { id: reservation.player_id } });
                if (player?.phone) {
                    const fechaFormateada = formatReservationDate(reservation.date);
                    await whatsappService.sendMessage(
                        player.phone,
                        `📅 *Club de Tenis Graneros*\n\n` +
                        `🚫 Tu reserva fue cancelada por el administrador\n\n` +
                        `🎾 ${reservation.court?.name || 'Cancha'}\n` +
                        `📆 ${fechaFormateada}\n` +
                        `🕐 ${reservation.time_slot} hrs` +
                        (reason && reason !== 'Cancelada por administrador' ? `\n📝 Motivo: ${reason}` : '')
                    );
                }
            } catch (e) {
                console.log(`📱 [LOG WSP] Cancelación admin notificada`);
            }
        }

        return { message: 'Reserva cancelada correctamente.' };
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private async getPlayerByUserId(userId: string) {
        const player = await this.prisma.player.findUnique({
            where: { user_id: userId },
            include: { children: true }
        });
        if (!player) throw new NotFoundException('Jugador no encontrado.');
        return player;
    }

    private getWeekBounds(date: Date) {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        weekStart.setHours(0, 0, 0, 0);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);
        return { weekStart, weekEnd };
    }

    private async getWeeklyUsageForPlayer(player: any) {
        const { weekStart, weekEnd } = this.getWeekBounds(new Date());
        const playerIds = [player.id, ...(player.children?.map((c: any) => c.id) || [])];

        const used = await this.prisma.reservation.count({
            where: {
                player_id:      { in: playerIds },
                is_high_demand: true,
                status:         'active',
                date:           { gte: weekStart, lte: weekEnd },
            }
        });

        const extraSlots  = (player as any).extra_high_demand_slots ?? 0;
        const baseLimit   = player.member_type === 'hijo_socio' ? 1 : 2 + (player.children?.length || 0);
        const totalLimit  = baseLimit + extraSlots;

        return {
            used,
            base_limit:  baseLimit,
            extra_slots: extraSlots,
            total_limit: totalLimit,
            remaining:   Math.max(0, totalLimit - used),
            week_start:  weekStart,
            week_end:    weekEnd,
        };
    }

    private async checkHighDemandLimit(player: any, date: Date) {
        const { weekStart, weekEnd } = this.getWeekBounds(date);
        const playerIds = [player.id, ...(player.children?.map((c: any) => c.id) || [])];

        const familyHighDemandCount = await this.prisma.reservation.count({
            where: {
                player_id:      { in: playerIds },
                is_high_demand: true,
                status:         'active',
                date:           { gte: weekStart, lte: weekEnd },
            }
        });

        const extraSlots  = (player as any).extra_high_demand_slots ?? 0;
        const familyLimit = player.member_type === 'hijo_socio'
            ? 1
            : 2 + (player.children?.length || 0) + extraSlots;

        if (player.member_type === 'hijo_socio') {
            const myCount = await this.prisma.reservation.count({
                where: {
                    player_id:      player.id,
                    is_high_demand: true,
                    status:         'active',
                    date:           { gte: weekStart, lte: weekEnd },
                }
            });
            if (myCount >= 1) throw new BadRequestException('Ya usaste tu turno de alta demanda de esta semana.');
        }

        if (familyHighDemandCount >= familyLimit) {
            throw new BadRequestException(
                `Tu grupo familiar ya usó los ${familyLimit} turnos de alta demanda de esta semana.`
            );
        }
    }
}