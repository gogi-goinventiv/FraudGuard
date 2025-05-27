import { promises as fs } from 'fs';
import path from 'path';

let cachedConfig: any = null;
let lastReadTime = 0;
const CACHE_DURATION = 5000; // Cache for 5 seconds

export async function loadRiskConfig() {
  const now = Date.now();
  if (cachedConfig && now - lastReadTime < CACHE_DURATION) {
    return cachedConfig;
  }
  
  const filePath = path.join(process.cwd(), 'fraudguard-app/config/risk-settings.json');
  try {
    const data = await fs.readFile(filePath, 'utf-8');
    cachedConfig = JSON.parse(data);
    lastReadTime = now;
    return cachedConfig;
  } catch (error) {
    console.error("Error loading risk config:", error);
    throw error;
  }
}
