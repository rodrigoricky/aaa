import 'dotenv/config';
import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NODE_ENV ??= 'test';

const hasRequiredDbEnv = Boolean(
  process.env.SQLSERVER_PASSWORD &&
    (process.env.SQLSERVER_URL ||
      (process.env.SQLSERVER_HOST && process.env.SQLSERVER_DATABASE))
);

if (!hasRequiredDbEnv) {
  test.skip('Backend integration tests require SQL Server environment variables', () => {});
} else {
  const ADMIN = { username: 'test_admin_backend', password: 'AdminPass1' };
  const PLAIN_ADMIN = { username: 'test_plain_admin_backend', password: 'AdminPass1' };
  const OFFICER = { username: 'test_officer_backend', password: 'OfficerPass1' };
  const SHORT_PASSWORD_USER = { username: 'test_short_pw_backend', password: 'abc' };
  const TEST_ITEMCODE = '0000001';

  let app: Awaited<ReturnType<typeof import('../app.js').buildApp>>;
  let getSqlPool: typeof import('../shared/database/sql-server.js').getSqlPool;
  let closeSqlPool: typeof import('../shared/database/sql-server.js').closeSqlPool;
  let sql: typeof import('../shared/database/sql-server.js').sql;
  let ensureUtilitySchema: typeof import('../shared/database/bootstrap.js').ensureUtilitySchema;
  let hashPassword: typeof import('../shared/utils/password.js').hashPassword;
  let resetQuantityAdjustments: typeof import('../modules/quantity-adjustments/reset-qa.service.js').resetQuantityAdjustments;
  let utilitySchema: string;
  let securityLevel2LegacyUser: string;
  let qaNumberStartDefault: number;
  let originalItemState: {
    quantity: number;
    tempQuantity: number;
    assemblyQuantity: number;
    adjustment: number;
  };
  let originalQaNumbering: { nextValue: number; format: string };

  async function cleanupTestData() {
    const pool = await getSqlPool();
    const headerResult = await pool
      .request()
      .input('adminUsername', ADMIN.username)
      .input('plainAdminUsername', PLAIN_ADMIN.username)
      .input('officerUsername', OFFICER.username)
      .input('shortPasswordUsername', SHORT_PASSWORD_USER.username)
      .query(`
        SELECT qa_id AS qaId, qa_no AS qaNo
        FROM [${utilitySchema}].[qa_header]
        WHERE created_by_username IN (
          @adminUsername,
          @plainAdminUsername,
          @officerUsername,
          @shortPasswordUsername
        )
      `);

    const qaIds = headerResult.recordset.map((row: Record<string, unknown>) => Number(row.qaId));
    const qaBatchNos = headerResult.recordset.map((row: Record<string, unknown>) => String(row.qaNo).slice(-10));

    if (qaBatchNos.length > 0) {
      const request = pool.request();
      const placeholders = qaBatchNos.map((qaNo: string, index: number) => {
        const key = `qaNo${index}`;
        request.input(key, qaNo);
        return `@${key}`;
      });

      await request.query(`
        DELETE FROM inventory_adjustment
        WHERE machine_id = 'UTILITY'
          AND BATCH_NO IN (${placeholders.join(', ')})
      `);
    }

    if (qaIds.length > 0) {
      const request = pool.request();
      const placeholders = qaIds.map((qaId: number, index: number) => {
        const key = `qaId${index}`;
        request.input(key, qaId);
        return `@${key}`;
      });

      await request.query(`
        DELETE FROM [${utilitySchema}].[qa_print_log]
        WHERE qa_id IN (${placeholders.join(', ')});
        DELETE FROM [${utilitySchema}].[qa_posting_log]
        WHERE qa_id IN (${placeholders.join(', ')});
        DELETE FROM [${utilitySchema}].[qa_header]
        WHERE qa_id IN (${placeholders.join(', ')});
      `);
    }

    await pool
      .request()
      .input('adminUsername', ADMIN.username)
      .input('plainAdminUsername', PLAIN_ADMIN.username)
      .input('officerUsername', OFFICER.username)
      .input('shortPasswordUsername', SHORT_PASSWORD_USER.username)
      .query(`
        DELETE FROM [${utilitySchema}].[audit_log]
        WHERE actor_username IN (
              @adminUsername,
              @plainAdminUsername,
              @officerUsername,
              @shortPasswordUsername
            )
           OR entity_id IN (
              @adminUsername,
              @plainAdminUsername,
              @officerUsername,
              @shortPasswordUsername
            );

        DELETE FROM [${utilitySchema}].[app_users]
        WHERE username IN (
          @adminUsername,
          @plainAdminUsername,
          @officerUsername,
          @shortPasswordUsername
        );
      `);
  }

  async function createTestUsers() {
    const pool = await getSqlPool();
    const adminHash = await hashPassword(ADMIN.password);
    const officerHash = await hashPassword(OFFICER.password);

    await pool
      .request()
      .input('adminUsername', ADMIN.username)
      .input('adminHash', adminHash)
      .input('adminLegacyUserId', securityLevel2LegacyUser)
      .input('plainAdminUsername', PLAIN_ADMIN.username)
      .input('plainAdminHash', adminHash)
      .input('officerUsername', OFFICER.username)
      .input('officerHash', officerHash)
      .query(`
        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, legacy_user_id, is_active)
        VALUES (@adminUsername, @adminHash, 1, @adminLegacyUserId, 1);

        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, is_active)
        VALUES (@plainAdminUsername, @plainAdminHash, 1, 1);

        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, is_active)
        VALUES (@officerUsername, @officerHash, 3, 1);
      `);
  }

  async function getAvailableSecurityLevel2LegacyUser() {
    const pool = await getSqlPool();
    const result = await pool.request().query(`
      SELECT TOP 1
        ua.user_id AS legacyUserId
      FROM user_access ua
      WHERE EXISTS (
        SELECT 1
        FROM node_user_group_map gm
        INNER JOIN node_usergroups g
          ON g.id = gm.group_id
        WHERE gm.user_id = ua.user_id
          AND g.title = 'Super Users'
      )
        AND NOT EXISTS (
          SELECT 1
          FROM [${utilitySchema}].[app_users] au
          WHERE au.legacy_user_id = ua.user_id
        )
      ORDER BY ua.user_id ASC
    `);

    const legacyUserId = String(result.recordset[0]?.legacyUserId ?? '').trim();
    assert.ok(legacyUserId, 'Expected an unlinked legacy Security Level 2 user for tests');
    return legacyUserId;
  }

  async function loginAndGetCookie(credentials: { username: string; password: string }) {
    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: credentials,
    });

    assert.equal(response.statusCode, 200);
    const cookieHeader = response.headers['set-cookie'];
    assert.ok(cookieHeader);

    return Array.isArray(cookieHeader) ? cookieHeader[0].split(';')[0] : cookieHeader.split(';')[0];
  }

  test.before(async () => {
    process.env.UTILITY_AUTO_INIT = 'true';

    const appModule = await import('../app.js');
    const sqlServerModule = await import('../shared/database/sql-server.js');
    const bootstrapModule = await import('../shared/database/bootstrap.js');
    const passwordModule = await import('../shared/utils/password.js');
    const envModule = await import('../config/env.js');
    const resetQaModule = await import('../modules/quantity-adjustments/reset-qa.service.js');

    app = await appModule.buildApp();
    getSqlPool = sqlServerModule.getSqlPool;
    closeSqlPool = sqlServerModule.closeSqlPool;
    sql = sqlServerModule.sql;
    ensureUtilitySchema = bootstrapModule.ensureUtilitySchema;
    hashPassword = passwordModule.hashPassword;
    resetQuantityAdjustments = resetQaModule.resetQuantityAdjustments;
    utilitySchema = envModule.env.UTILITY_SCHEMA;
    qaNumberStartDefault = envModule.env.QA_NUMBER_START;

    await getSqlPool();
    await ensureUtilitySchema();
  securityLevel2LegacyUser = await getAvailableSecurityLevel2LegacyUser();

    const pool = await getSqlPool();
    const itemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1
        end_qty AS endQty,
        END_QTY_TEMP AS endQtyTemp,
        ASSEMBLY_QTY AS assemblyQty,
        adjustment
      FROM items
      WHERE itemcode = @itemcode
    `);

    const qaNumberingResult = await pool.request().query(`
      SELECT TOP 1
        next_value AS nextValue,
        number_format AS numberFormat
      FROM [${utilitySchema}].[qa_numbering]
      WHERE number_key = N'QA'
    `);

    originalItemState = {
      quantity: Number(itemResult.recordset[0].endQty ?? 0),
      tempQuantity: Number(itemResult.recordset[0].endQtyTemp ?? 0),
      assemblyQuantity: Number(itemResult.recordset[0].assemblyQty ?? 0),
      adjustment: Number(itemResult.recordset[0].adjustment ?? 0),
    };

    originalQaNumbering = {
      nextValue: Number(qaNumberingResult.recordset[0].nextValue ?? 1),
      format: String(qaNumberingResult.recordset[0].numberFormat ?? 'QA-{date}-000X'),
    };

    await cleanupTestData();
    await createTestUsers();
  });

  test.after(async () => {
    const pool = await getSqlPool();
    await pool
      .request()
      .input('itemcode', TEST_ITEMCODE)
      .input('endQty', sql.Decimal(18, 2), originalItemState.quantity)
      .input('endQtyTemp', sql.Decimal(18, 2), originalItemState.tempQuantity)
      .input('assemblyQty', sql.Decimal(18, 2), originalItemState.assemblyQuantity)
      .input('adjustment', sql.Decimal(18, 2), originalItemState.adjustment)
      .input('qaNextValue', sql.BigInt, originalQaNumbering.nextValue)
      .input('qaFormat', sql.NVarChar, originalQaNumbering.format)
      .query(`
        UPDATE items
        SET
          end_qty = @endQty,
          END_QTY_TEMP = @endQtyTemp,
          ASSEMBLY_QTY = @assemblyQty,
          adjustment = @adjustment
        WHERE itemcode = @itemcode

        UPDATE [${utilitySchema}].[qa_numbering]
        SET
          next_value = @qaNextValue,
          number_format = @qaFormat,
          updated_at = SYSUTCDATETIME()
        WHERE number_key = N'QA'
      `);

    await cleanupTestData();
    await app.close();
    await closeSqlPool();
  });

  test('rejects protected route access without authentication', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/inventory',
    });

    assert.equal(response.statusCode, 401);
  });

  test('supports login and 1-character item search through the SQL Server-backed inventory endpoint', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const response = await app.inject({
      method: 'GET',
      url: '/api/inventory?search=0&page=1&limit=5',
      headers: {
        cookie,
      },
    });

    assert.equal(response.statusCode, 200);
    const payload = response.json();
    assert.equal(payload.success, true);
    assert.ok(Array.isArray(payload.data.data));
    assert.ok(payload.data.data.length > 0);
  });

  test('accepts short lowercase passwords for create and reset without changing login behavior', async () => {
    const adminCookie = await loginAndGetCookie(ADMIN);

    const createResponse = await app.inject({
      method: 'POST',
      url: '/api/users',
      headers: {
        cookie: adminCookie,
      },
      payload: {
        username: SHORT_PASSWORD_USER.username,
        password: SHORT_PASSWORD_USER.password,
        roleId: 3,
      },
    });

    assert.equal(createResponse.statusCode, 201);
    const createdUser = createResponse.json().data;
    assert.equal(createdUser.username, SHORT_PASSWORD_USER.username);

    const shortPasswordCookie = await loginAndGetCookie(SHORT_PASSWORD_USER);
    assert.ok(shortPasswordCookie);

    const resetResponse = await app.inject({
      method: 'POST',
      url: `/api/users/${createdUser.id}/reset-password`,
      headers: {
        cookie: adminCookie,
      },
      payload: {
        newPassword: 'xyz',
      },
    });

    assert.equal(resetResponse.statusCode, 200);

    const resetCookie = await loginAndGetCookie({
      username: SHORT_PASSWORD_USER.username,
      password: 'xyz',
    });

    assert.ok(resetCookie);
  });

  test('allows an encoder-equivalent user to save but not post a quantity adjustment', async () => {
    const cookie = await loginAndGetCookie(OFFICER);

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'DM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 1,
            itemRemark: 'Officer save test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();
    assert.equal(savedPayload.data.status, 'SAVED');

    const editResponse = await app.inject({
      method: 'PATCH',
      url: `/api/quantity-adjustments/${savedPayload.data.id}`,
      headers: {
        cookie,
      },
      payload: {
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 2,
            itemRemark: 'Officer edited save test',
          },
        ],
      },
    });

    assert.equal(editResponse.statusCode, 200);
    const editedPayload = editResponse.json();
    assert.equal(editedPayload.data.lines[0].adjustQty, 2);
    assert.equal(editedPayload.data.lines[0].itemRemark, 'Officer edited save test');

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 403);
  });

  test('allows a plain utility admin to post', async () => {
    const cookie = await loginAndGetCookie(PLAIN_ADMIN);

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'DM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 1,
            itemRemark: 'Plain admin post test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 200);
  });

  test('supports custom QA formats and keeps saved QA numbers fixed after settings change', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

    const savePlainFormatResponse = await app.inject({
      method: 'PUT',
      url: '/api/numbering/qa',
      headers: {
        cookie,
      },
      payload: {
        format: 'ADJ-{number}',
        nextValue: 100,
      },
    });

    assert.equal(savePlainFormatResponse.statusCode, 200);
    assert.equal(savePlainFormatResponse.json().data.preview, 'ADJ-100');

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'DM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 1,
            itemRemark: 'QA numbering plain format test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    const plainSavedPayload = saveResponse.json();
    assert.equal(plainSavedPayload.data.qaNo, 'ADJ-100');

    const saveDateFormatResponse = await app.inject({
      method: 'PUT',
      url: '/api/numbering/qa',
      headers: {
        cookie,
      },
      payload: {
        format: 'QA-{date}-000X',
        nextValue: 7,
      },
    });

    assert.equal(saveDateFormatResponse.statusCode, 200);
    assert.equal(saveDateFormatResponse.json().data.preview, `QA-${today}-0007`);

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${plainSavedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 200);
    assert.equal(postResponse.json().data.qaNo, 'ADJ-100');

    const datedSaveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'CM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 1,
            itemRemark: 'QA numbering date format test',
          },
        ],
      },
    });

    assert.equal(datedSaveResponse.statusCode, 201);
    assert.equal(datedSaveResponse.json().data.qaNo, `QA-${today}-0007`);
    const datedPostResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${datedSaveResponse.json().data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(datedPostResponse.statusCode, 200);
    assert.equal(datedPostResponse.json().data.qaNo, `QA-${today}-0007`);
  });

  test('pads QA numbers only while the sequence is below three digits when using 000X', async () => {
    const cookie = await loginAndGetCookie(ADMIN);

    const updateResponse = await app.inject({
      method: 'PUT',
      url: '/api/numbering/qa',
      headers: {
        cookie,
      },
      payload: {
        format: 'QA-000X',
        nextValue: 1,
      },
    });

    assert.equal(updateResponse.statusCode, 200);
    assert.equal(updateResponse.json().data.preview, 'QA-0001');

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'DM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 1,
            itemRemark: 'Padded QA numbering test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    assert.equal(saveResponse.json().data.qaNo, 'QA-0001');
  });

  test('rejects QA numbering formats that do not include a number token', async () => {
    const cookie = await loginAndGetCookie(ADMIN);

    const response = await app.inject({
      method: 'PUT',
      url: '/api/numbering/qa',
      headers: {
        cookie,
      },
      payload: {
        format: 'QA-ONLY',
        nextValue: 1,
      },
    });

    assert.equal(response.statusCode, 400);
  });

  test('posts using the current database quantity and synchronizes mirrored quantity fields', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const pool = await getSqlPool();

    await app.inject({
      method: 'PUT',
      url: '/api/numbering/qa',
      headers: {
        cookie,
      },
      payload: {
        format: 'QA-000X',
        nextValue: 6001,
      },
    });

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'CM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 2,
            itemRemark: 'Live quantity posting test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();
    assert.equal(savedPayload.data.qaNo, 'QA-6001');

    const liveQuantity = originalItemState.quantity + 5;
    await pool
      .request()
      .input('itemcode', TEST_ITEMCODE)
      .input('liveQty', sql.Decimal(18, 2), liveQuantity)
      .input('tempQty', sql.Decimal(18, 2), 999)
      .input('assemblyQty', sql.Decimal(18, 2), 888)
      .query(`
        UPDATE items
        SET
          end_qty = @liveQty,
          END_QTY_TEMP = @tempQty,
          ASSEMBLY_QTY = @assemblyQty
        WHERE itemcode = @itemcode
      `);

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 200);
    const postedPayload = postResponse.json();
    assert.equal(postedPayload.data.qaNo, 'QA-6001');
    assert.equal(postedPayload.data.lines[0].oldQty, liveQuantity);
    assert.equal(postedPayload.data.lines[0].newQty, liveQuantity + 2);

    const itemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1
        end_qty AS endQty,
        END_QTY_TEMP AS endQtyTemp,
        ASSEMBLY_QTY AS assemblyQty
      FROM items
      WHERE itemcode = @itemcode
    `);

    assert.equal(Number(itemResult.recordset[0].endQty), liveQuantity + 2);
    assert.equal(Number(itemResult.recordset[0].endQtyTemp), liveQuantity + 2);
    assert.equal(Number(itemResult.recordset[0].assemblyQty), liveQuantity + 2);
  });

  test('reset:qa removes a specific posted quantity adjustment and restores inventory state', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const pool = await getSqlPool();
    const beforeResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1
        end_qty AS endQty,
        END_QTY_TEMP AS endQtyTemp,
        ASSEMBLY_QTY AS assemblyQty,
        adjustment
      FROM items
      WHERE itemcode = @itemcode
    `);
    const beforeItemState = {
      quantity: Number(beforeResult.recordset[0].endQty),
      tempQuantity: Number(beforeResult.recordset[0].endQtyTemp),
      assemblyQuantity: Number(beforeResult.recordset[0].assemblyQty),
    };

    const numberingResponse = await app.inject({
      method: 'PUT',
      url: '/api/numbering/qa',
      headers: {
        cookie,
      },
      payload: {
        format: 'ADJ-{number}',
        nextValue: 250,
      },
    });

    assert.equal(numberingResponse.statusCode, 200);
    assert.equal(numberingResponse.json().data.preview, 'ADJ-250');

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'DM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: 3,
            itemRemark: 'Reset QA script test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();
    assert.equal(savedPayload.data.qaNo, 'ADJ-250');

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 200);

    const resetResult = await resetQuantityAdjustments('ADJ-250');
    assert.equal(resetResult.mode, 'single');
    assert.equal(resetResult.matchedQaCount, 1);
    assert.equal(resetResult.deletedQaNumbers[0], 'ADJ-250');
    assert.equal(resetResult.numberingReset, false);
    assert.equal(resetResult.restoredQuantities[0]?.quantity, beforeItemState.quantity);

    const verification = await pool.request().input('itemcode', TEST_ITEMCODE).input('qaNo', 'ADJ-250').query(`
      SELECT TOP 1
        end_qty AS endQty,
        END_QTY_TEMP AS endQtyTemp,
        ASSEMBLY_QTY AS assemblyQty,
        adjustment
      FROM items
      WHERE itemcode = @itemcode;

      SELECT COUNT(*) AS total
      FROM [${utilitySchema}].[qa_header]
      WHERE qa_no = @qaNo;
    `);
    const recordsets = verification.recordsets as Array<Array<Record<string, unknown>>>;

    assert.equal(Number(recordsets[0][0].endQty), beforeItemState.quantity);
    assert.equal(Number(recordsets[0][0].endQtyTemp), beforeItemState.tempQuantity);
    assert.equal(Number(recordsets[0][0].assemblyQty), beforeItemState.assemblyQuantity);
    assert.equal(Number(recordsets[1][0].total), 0);
  });

  test('allows a utility user linked to Security Level 2 to post exactly once', async () => {
    const cookie = await loginAndGetCookie(ADMIN);

    const saveResponse = await app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'CM',
        lines: [
          {
            itemcode: TEST_ITEMCODE,
            entryMode: 'DELTA',
            requestedQty: -1,
            itemRemark: 'Admin post test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 200);
    const postedPayload = postResponse.json();
    assert.equal(postedPayload.data.status, 'POSTED');

    const printResponse = await app.inject({
      method: 'GET',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/print`,
      headers: {
        cookie,
      },
    });

    assert.equal(printResponse.statusCode, 200);
    const printPayload = printResponse.json();
    assert.equal(printPayload.data.id, savedPayload.data.id);
    assert.equal(printPayload.data.status, 'POSTED');
    assert.equal(printPayload.data.printCount, 1);

    const duplicatePostResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(duplicatePostResponse.statusCode, 409);
  });
}
