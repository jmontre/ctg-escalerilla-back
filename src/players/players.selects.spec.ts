import { PUBLIC_PLAYER_SELECT, FULL_PLAYER_SELECT } from './players.service';

describe('Player select allowlists', () => {
  const PII_FIELDS = ['email', 'phone', 'has_debt', 'user_id', 'parent_id', 'extra_high_demand_slots'];

  describe('PUBLIC_PLAYER_SELECT', () => {
    it('no expone campos PII a terceros autenticados', () => {
      for (const field of PII_FIELDS) {
        expect(PUBLIC_PLAYER_SELECT).not.toHaveProperty(field);
      }
    });

    it('no incluye email en el select anidado de user', () => {
      expect(PUBLIC_PLAYER_SELECT.user.select).not.toHaveProperty('email');
    });
  });

  describe('FULL_PLAYER_SELECT', () => {
    it('expone todos los campos PII al propietario y admin', () => {
      for (const field of PII_FIELDS) {
        expect(FULL_PLAYER_SELECT).toHaveProperty(field, true);
      }
    });

    it('incluye email en el select anidado de user (override correcto sobre PUBLIC)', () => {
      expect((FULL_PLAYER_SELECT.user as any).select).toHaveProperty('email', true);
    });

    it('no filtra los campos públicos al extender PUBLIC', () => {
      const publicOnlyFields = ['id', 'name', 'position', 'wins', 'losses', 'avatar_url'];
      for (const field of publicOnlyFields) {
        expect(FULL_PLAYER_SELECT).toHaveProperty(field, true);
      }
    });
  });
});
