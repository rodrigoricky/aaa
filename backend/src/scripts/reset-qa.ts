import { closeSqlPool } from '../shared/database/sql-server.js';
import {
  inspectResetQuantityAdjustments,
  resetQuantityAdjustments,
  resolveResetQaTargetFromCli,
} from '../modules/quantity-adjustments/reset-qa.service.js';

function printUsage() {
  console.log('Usage: npm run reset:qa all');
  console.log('   or: npm run reset:qa "QA-100"');
  console.log('   or: npm run reset:qa "ADJ-250"');
}

async function main() {
  const target = resolveResetQaTargetFromCli();
  if (!target) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const plan = await inspectResetQuantityAdjustments(target);
  console.log('[reset:qa] Preview');
  console.log(`  Mode: ${plan.mode}`);
  console.log(`  Target: ${plan.target}`);
  console.log(`  QA records found: ${plan.matchedQaCount}`);
  console.log(`  Posted records: ${plan.postedQaCount}`);
  console.log(`  Saved records: ${plan.savedQaCount}`);
  console.log(`  Affected items: ${plan.affectedItemCount}`);
  console.log(`  QA numbers: ${plan.qaNumbers.length > 0 ? plan.qaNumbers.join(', ') : '(none)'}`);

  const result = await resetQuantityAdjustments(target);
  console.log('[reset:qa] Success');
  console.log(`  Deleted QA records: ${result.deletedQaNumbers.join(', ') || '(none)'}`);
  console.log(`  Deleted inventory_adjustment rows: ${result.deletedInventoryRows}`);
  console.log(`  Restored items: ${result.restoredQuantities.length}`);

  for (const item of result.restoredQuantities) {
    console.log(`    ${item.itemcode} -> ${item.quantity}`);
  }

  if (result.numberingReset) {
    console.log(`  QA numbering reset to next value: ${result.nextQaValue}`);
  }
}

main()
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown reset:qa failure';
    console.error(`[reset:qa] Failed: ${message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await closeSqlPool().catch(() => undefined);
  });