import '../config/env.js';
import { disableDemoMode } from './demo-mode.js';

disableDemoMode()
  .catch((error) => {
    console.error('Failed to turn demo mode off.');
    console.error(error);
    process.exit(1);
  });
