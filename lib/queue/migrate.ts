import { databasePath, ScanQueue } from './scan-queue';

const filename = databasePath();
const database = new ScanQueue(filename);
database.close();
console.info(`Scan database schema is up to date: ${filename}`);
