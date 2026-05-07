import '../config/env.js';
import { enableDemoMode } from './demo-mode.js';

enableDemoMode()
  .catch((error) => {
    console.error('Failed to turn demo mode on.');
    console.error(error);
    process.exit(1);
  });
