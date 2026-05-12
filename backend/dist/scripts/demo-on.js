"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("../config/env.js");
const demo_mode_js_1 = require("./demo-mode.js");
(0, demo_mode_js_1.enableDemoMode)()
    .catch((error) => {
    console.error('Failed to turn demo mode on.');
    console.error(error);
    process.exit(1);
});
