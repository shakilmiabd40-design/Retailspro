import { defineConfig } from '@prisma/orm-postgres/config';

export default defineConfig({
  orm: {
    target: 'postgres',
    family: 'sql',
    adapter: {},
    contract: {
      output: './db/contract.json'
    }
  },
  db: {
    connection: process.env.DATABASE_URL
  }
});
