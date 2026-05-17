import { writeFileSync } from 'fs';
import {
  generateRlsMigrationSql,
  InvalidTableNameError,
} from '../src/scripts/generate-rls-migration';

function main(): void {
  const args = process.argv.slice(2);
  let outputPath: string | undefined;
  let tableName: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--output' && args[i + 1]) {
      outputPath = args[++i];
    } else if (!args[i].startsWith('-')) {
      tableName = args[i];
    }
  }

  if (!tableName) {
    process.stderr.write('Usage: ts-node scripts/generate-rls-migration.ts <table_name> [--output <path>]\n');
    process.exit(1);
  }

  try {
    const sql = generateRlsMigrationSql(tableName);

    if (outputPath) {
      writeFileSync(outputPath, sql, 'utf-8');
      process.stderr.write(`Written to ${outputPath}\n`);
    } else {
      process.stdout.write(sql);
    }
  } catch (error) {
    if (error instanceof InvalidTableNameError) {
      process.stderr.write(`Error: ${error.message}\n`);
      process.exit(1);
    }
    throw error;
  }
}

main();
