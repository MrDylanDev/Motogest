import { generateRlsMigrationSql } from './generate-rls-migration';

describe('generateRlsMigrationSql', () => {
  it('includes ENABLE ROW LEVEL SECURITY for the given table', () => {
    const sql = generateRlsMigrationSql('vehicles');
    expect(sql).toContain('ALTER TABLE vehicles ENABLE ROW LEVEL SECURITY;');
  });

  it('includes FORCE ROW LEVEL SECURITY', () => {
    const sql = generateRlsMigrationSql('vehicles');
    expect(sql).toContain('ALTER TABLE vehicles FORCE ROW LEVEL SECURITY;');
  });

  it('includes CREATE POLICY tenant_isolation on the table', () => {
    const sql = generateRlsMigrationSql('vehicles');
    expect(sql).toContain('CREATE POLICY tenant_isolation ON vehicles');
  });

  it('uses current_setting with app.tenant_id and true flag', () => {
    const sql = generateRlsMigrationSql('vehicles');
    expect(sql).toContain("current_setting('app.tenant_id', true)::uuid");
  });

  it('includes GRANT SELECT, INSERT, UPDATE, DELETE to taller_app', () => {
    const sql = generateRlsMigrationSql('vehicles');
    expect(sql).toContain(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON vehicles TO taller_app;',
    );
  });

  describe('table name validation', () => {
    it('throws on SQL injection attempt', () => {
      expect(() => generateRlsMigrationSql('foo; DROP TABLE x')).toThrow();
    });

    it('throws on empty string', () => {
      expect(() => generateRlsMigrationSql('')).toThrow();
    });

    it('throws on name starting with a digit', () => {
      expect(() => generateRlsMigrationSql('1bad')).toThrow();
    });
  });
});
