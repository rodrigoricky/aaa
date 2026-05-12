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
  const SUPERVISOR = { username: 'test_supervisor_backend', password: 'SupervisorPass1' };
  const OFFICER = { username: 'test_officer_backend', password: 'OfficerPass1' };
  const SECURITY_LEVEL_2 = { username: 'test_security_l2_backend', password: 'SecurityPass1' };
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
    assemblyBox: number;
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
      .input('supervisorUsername', SUPERVISOR.username)
      .input('officerUsername', OFFICER.username)
      .input('securityLevel2Username', SECURITY_LEVEL_2.username)
      .input('shortPasswordUsername', SHORT_PASSWORD_USER.username)
      .query(`
        SELECT qa_id AS qaId, qa_no AS qaNo
        FROM [${utilitySchema}].[qa_header]
        WHERE created_by_username IN (
          @adminUsername,
          @plainAdminUsername,
          @supervisorUsername,
          @officerUsername,
          @securityLevel2Username,
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
      .input('supervisorUsername', SUPERVISOR.username)
      .input('officerUsername', OFFICER.username)
      .input('securityLevel2Username', SECURITY_LEVEL_2.username)
      .input('shortPasswordUsername', SHORT_PASSWORD_USER.username)
      .query(`
        DELETE FROM [${utilitySchema}].[audit_log]
        WHERE actor_username IN (
              @adminUsername,
              @plainAdminUsername,
              @supervisorUsername,
              @officerUsername,
              @securityLevel2Username,
              @shortPasswordUsername
            )
           OR entity_id IN (
              @adminUsername,
              @plainAdminUsername,
              @supervisorUsername,
              @officerUsername,
              @securityLevel2Username,
              @shortPasswordUsername
            );

        DELETE FROM [${utilitySchema}].[app_users]
        WHERE username IN (
          @adminUsername,
          @plainAdminUsername,
          @supervisorUsername,
          @officerUsername,
          @securityLevel2Username,
          @shortPasswordUsername
        );
      `);
  }

  async function createTestUsers() {
    const pool = await getSqlPool();
    const adminHash = await hashPassword(ADMIN.password);
    const supervisorHash = await hashPassword(SUPERVISOR.password);
    const officerHash = await hashPassword(OFFICER.password);
    const securityLevel2Hash = await hashPassword(SECURITY_LEVEL_2.password);

    await pool
      .request()
      .input('adminUsername', ADMIN.username)
      .input('adminHash', adminHash)
      .input('adminLegacyUserId', securityLevel2LegacyUser)
      .input('plainAdminUsername', PLAIN_ADMIN.username)
      .input('plainAdminHash', adminHash)
      .input('supervisorUsername', SUPERVISOR.username)
      .input('supervisorHash', supervisorHash)
      .input('officerUsername', OFFICER.username)
      .input('officerHash', officerHash)
      .input('securityLevel2Username', SECURITY_LEVEL_2.username)
      .input('securityLevel2Hash', securityLevel2Hash)
      .query(`
        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, legacy_user_id, is_active)
        VALUES (@adminUsername, @adminHash, 1, @adminLegacyUserId, 1);

        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, is_active)
        VALUES (@plainAdminUsername, @plainAdminHash, 1, 1);

        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, is_active)
        VALUES (@supervisorUsername, @supervisorHash, 2, 1);

        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, is_active)
        VALUES (@officerUsername, @officerHash, 3, 1);

        INSERT INTO [${utilitySchema}].[app_users] (username, password_hash, role_id, is_active)
        VALUES (@securityLevel2Username, @securityLevel2Hash, 5, 1);
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

  async function setTestItemQuantity(quantity: number) {
    const pool = await getSqlPool();
    await pool
      .request()
      .input('itemcode', TEST_ITEMCODE)
      .input('quantity', sql.Decimal(18, 2), quantity)
      .query(`
        UPDATE items
        SET
          end_qty = @quantity,
          END_QTY_TEMP = @quantity,
          assembly_box = @quantity,
          ASSEMBLY_QTY = @quantity
        WHERE itemcode = @itemcode
      `);
  }

  async function setTestItemLiveFields(input: {
    endQty: number | null;
    endQtyTemp?: number;
    assemblyBox?: number;
    assemblyQty?: number;
  }) {
    const pool = await getSqlPool();
    await pool
      .request()
      .input('itemcode', TEST_ITEMCODE)
      .input('endQty', sql.Decimal(18, 2), input.endQty)
      .input('endQtyTemp', sql.Decimal(18, 2), input.endQtyTemp ?? null)
      .input('assemblyBox', sql.Decimal(18, 2), input.assemblyBox ?? null)
      .input('assemblyQty', sql.Decimal(18, 2), input.assemblyQty ?? null)
      .query(`
        UPDATE items
        SET
          end_qty = @endQty,
          END_QTY_TEMP = COALESCE(@endQtyTemp, END_QTY_TEMP),
          assembly_box = COALESCE(@assemblyBox, assembly_box),
          ASSEMBLY_QTY = COALESCE(@assemblyQty, ASSEMBLY_QTY)
        WHERE itemcode = @itemcode
      `);
  }

  async function saveAdjustment(cookie: string, requestedQty: number, itemcode = TEST_ITEMCODE) {
    return app.inject({
      method: 'POST',
      url: '/api/quantity-adjustments',
      headers: {
        cookie,
      },
      payload: {
        refType: 'DM',
        lines: [
          {
            itemcode,
            entryMode: 'DELTA',
            requestedQty,
            itemRemark: 'Quantity safety test',
          },
        ],
      },
    });
  }

  async function postAdjustment(cookie: string, adjustmentId: string | number) {
    return app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${adjustmentId}/post`,
      headers: {
        cookie,
      },
    });
  }

  async function getPostedLegacyAdjustment(qaNo: string) {
    const pool = await getSqlPool();
    const batchNo = qaNo.slice(-10);
    const result = await pool
      .request()
      .input('itemcode', sql.NVarChar, TEST_ITEMCODE)
      .input('batchNo', sql.NVarChar, batchNo)
      .query(`
        SELECT TOP 1
          old_balance AS oldBalance,
          qty,
          balance,
          new_qty AS newQty,
          end_qty AS endQty
        FROM inventory_adjustment
        WHERE machine_id = N'UTILITY'
          AND BATCH_NO = @batchNo
          AND itemcode = @itemcode
        ORDER BY trans_date DESC
      `);

    return result.recordset[0] as Record<string, unknown> | undefined;
  }

  async function getLatestAuditEvent(eventType: string, qaId: string | number) {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input('eventType', sql.NVarChar, eventType)
      .input('entityId', sql.NVarChar, String(qaId))
      .query(`
        SELECT TOP 1
          event_type AS eventType,
          details
        FROM [${utilitySchema}].[audit_log]
        WHERE event_type = @eventType
          AND entity_id = @entityId
        ORDER BY created_at DESC
      `);

    return result.recordset[0] ?? null;
  }

  interface DeliveryMirrorSupport {
    hasDeliveryTable: boolean;
    hasItemcode: boolean;
    hasQty: boolean;
    hasQty2: boolean;
  }

  async function getDeliveryMirrorSupport(): Promise<DeliveryMirrorSupport> {
    const pool = await getSqlPool();
    const result = await pool.request().query(`
      SELECT
        CASE WHEN OBJECT_ID(N'dbo.delivery', N'U') IS NOT NULL THEN 1 ELSE 0 END AS hasDeliveryTable,
        CASE WHEN COL_LENGTH(N'dbo.delivery', N'itemcode') IS NOT NULL THEN 1 ELSE 0 END AS hasItemcode,
        CASE WHEN COL_LENGTH(N'dbo.delivery', N'qty') IS NOT NULL THEN 1 ELSE 0 END AS hasQty,
        CASE WHEN COL_LENGTH(N'dbo.delivery', N'qty2') IS NOT NULL THEN 1 ELSE 0 END AS hasQty2
    `);

    const row = result.recordset[0] as Record<string, unknown>;
    return {
      hasDeliveryTable: Number(row.hasDeliveryTable) === 1,
      hasItemcode: Number(row.hasItemcode) === 1,
      hasQty: Number(row.hasQty) === 1,
      hasQty2: Number(row.hasQty2) === 1,
    };
  }

  async function getDeliveryMirrorRows(itemcode: string) {
    const pool = await getSqlPool();
    const result = await pool
      .request()
      .input('itemcode', sql.NVarChar, itemcode)
      .query(`
        SELECT
          qty,
          qty2
        FROM dbo.delivery
        WHERE itemcode = @itemcode
      `);

    return result.recordset as Array<Record<string, unknown>>;
  }

  async function insertSavedAdjustmentForMissingItem() {
    const pool = await getSqlPool();
    const unique = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const missingItemcode = `QA_MISSING_${unique}`.slice(0, 50);
    const qaNo = `QA-MISSING-${unique}`.slice(0, 50);
    const refNo = `MISS-${unique}`.slice(0, 50);

    const result = await pool
      .request()
      .input('qaNo', sql.NVarChar, qaNo)
      .input('refNo', sql.NVarChar, refNo)
      .input('username', sql.NVarChar, ADMIN.username)
      .input('itemcode', sql.NVarChar, missingItemcode)
      .query(`
        DECLARE @createdBy BIGINT;
        DECLARE @createdQa TABLE (qaId BIGINT);

        SELECT TOP 1 @createdBy = user_id
        FROM [${utilitySchema}].[app_users]
        WHERE username = @username;

        INSERT INTO [${utilitySchema}].[qa_header] (
          qa_no,
          trans_date,
          ref_type,
          ref_no,
          ref_series_no,
          status,
          created_by,
          created_by_username,
          updated_by,
          updated_by_username
        )
        OUTPUT inserted.qa_id INTO @createdQa
        VALUES (
          @qaNo,
          SYSUTCDATETIME(),
          N'DM',
          @refNo,
          999999,
          N'SAVED',
          @createdBy,
          @username,
          @createdBy,
          @username
        );

        DECLARE @qaId BIGINT = (SELECT TOP 1 qaId FROM @createdQa);

        INSERT INTO [${utilitySchema}].[qa_detail] (
          qa_id,
          line_no,
          itemcode,
          itemname,
          old_qty,
          adjust_qty,
          new_qty,
          entry_mode,
          requested_qty,
          item_remark
        )
        VALUES (
          @qaId,
          1,
          @itemcode,
          N'Missing test item',
          100,
          -1,
          99,
          N'DELTA',
          -1,
          N'Missing item post test'
        );

        SELECT @qaId AS qaId;
      `);

    return {
      id: String(result.recordset[0].qaId),
      qaNo,
      itemcode: missingItemcode,
    };
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
        assembly_box AS assemblyBox,
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
      assemblyBox: Number(itemResult.recordset[0].assemblyBox ?? 0),
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
      .input('assemblyBox', sql.Decimal(18, 2), originalItemState.assemblyBox)
      .input('assemblyQty', sql.Decimal(18, 2), originalItemState.assemblyQuantity)
      .input('adjustment', sql.Decimal(18, 2), originalItemState.adjustment)
      .input('qaNextValue', sql.BigInt, originalQaNumbering.nextValue)
      .input('qaFormat', sql.NVarChar, originalQaNumbering.format)
      .query(`
        UPDATE items
        SET
          end_qty = @endQty,
          END_QTY_TEMP = @endQtyTemp,
          assembly_box = @assemblyBox,
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

  test('restricts QA numbering settings API to Admin only', async () => {
    const adminCookie = await loginAndGetCookie(ADMIN);
    const supervisorCookie = await loginAndGetCookie(SUPERVISOR);
    const encoderCookie = await loginAndGetCookie(OFFICER);
    const securityLevel2Cookie = await loginAndGetCookie(SECURITY_LEVEL_2);

    const adminGetResponse = await app.inject({
      method: 'GET',
      url: '/api/numbering/qa',
      headers: {
        cookie: adminCookie,
      },
    });

    assert.equal(adminGetResponse.statusCode, 200);

    const adminPutResponse = await app.inject({
      method: 'PUT',
      url: '/api/numbering/qa',
      headers: {
        cookie: adminCookie,
      },
      payload: {
        format: 'QA-000X',
        nextValue: 300,
      },
    });

    assert.equal(adminPutResponse.statusCode, 200);

    for (const cookie of [supervisorCookie, encoderCookie, securityLevel2Cookie]) {
      const getResponse = await app.inject({
        method: 'GET',
        url: '/api/numbering/qa',
        headers: {
          cookie,
        },
      });
      assert.equal(getResponse.statusCode, 403);

      const putResponse = await app.inject({
        method: 'PUT',
        url: '/api/numbering/qa',
        headers: {
          cookie,
        },
        payload: {
          format: 'QA-000X',
          nextValue: 301,
        },
      });
      assert.equal(putResponse.statusCode, 403);
    }
  });

  test('rejects saving when live item quantity is NULL', async () => {
    const cookie = await loginAndGetCookie(ADMIN);

    await setTestItemLiveFields({ endQty: null });
    const saveResponse = await saveAdjustment(cookie, 1);

    assert.equal(saveResponse.statusCode, 422);
    assert.match(saveResponse.json().message, /no valid current quantity/);

    await setTestItemQuantity(100);
  });

  test('rejects posting when live item quantity is NULL and writes an invalid-stock audit event', async () => {
    const cookie = await loginAndGetCookie(ADMIN);

    await setTestItemQuantity(100);
    const saveResponse = await saveAdjustment(cookie, -4);
    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();

    await setTestItemLiveFields({ endQty: null });

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 422);
    assert.match(postResponse.json().message, /no valid current quantity/);

    const audit = await getLatestAuditEvent(
      'QA_POST_BLOCKED_INVALID_STOCK',
      savedPayload.data.id
    );
    assert.ok(audit);

    await setTestItemQuantity(100);
  });

  test('rejects saving an adjustment for a missing item', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const missingItemcode = `QA_MISSING_SAVE_${Date.now()}`.slice(0, 50);

    const saveResponse = await saveAdjustment(cookie, 1, missingItemcode);

    assert.equal(saveResponse.statusCode, 422);
    assert.match(saveResponse.json().message, /no valid current quantity/);
  });

  test('rejects invalid adjustment quantities before saving', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const invalidQuantities = ['', 'not-a-number', 1_000_000_000];

    for (const requestedQty of invalidQuantities) {
      const response = await app.inject({
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
              requestedQty,
              itemRemark: 'Invalid quantity test',
            },
          ],
        },
      });

      assert.equal(response.statusCode, 400);
    }
  });

  test('rejects posting an adjustment whose saved item is missing', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const saved = await insertSavedAdjustmentForMissingItem();

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${saved.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 422);
    assert.match(postResponse.json().message, /no valid current quantity/);

    const audit = await getLatestAuditEvent('QA_POST_BLOCKED_INVALID_STOCK', saved.id);
    assert.ok(audit);
  });

  test('allows real zero quantity when saving and posting', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const pool = await getSqlPool();

    await setTestItemQuantity(0);
    const saveResponse = await saveAdjustment(cookie, 5);
    assert.equal(saveResponse.statusCode, 201);
    assert.equal(saveResponse.json().data.lines[0].oldQty, 0);

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${saveResponse.json().data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 200);
    assert.equal(postResponse.json().data.lines[0].oldQty, 0);
    assert.equal(postResponse.json().data.lines[0].postedOldQty, 0);
    assert.equal(postResponse.json().data.lines[0].postedNewQty, 5);

    const itemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1 end_qty AS endQty
      FROM items
      WHERE itemcode = @itemcode
    `);

    assert.equal(Number(itemResult.recordset[0].endQty), 5);
    await setTestItemQuantity(100);
  });

  test('posts legacy inventory_adjustment rows with balance equal to final stock', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const pool = await getSqlPool();

    await setTestItemQuantity(166);
    const positiveSaveResponse = await saveAdjustment(cookie, 50);
    assert.equal(positiveSaveResponse.statusCode, 201);
    const positiveSaved = positiveSaveResponse.json().data;
    const positivePostResponse = await postAdjustment(cookie, positiveSaved.id);
    assert.equal(positivePostResponse.statusCode, 200);

    const positiveLegacy = await getPostedLegacyAdjustment(positiveSaved.qaNo);
    assert.ok(positiveLegacy);
    assert.equal(Number(positiveLegacy.oldBalance), 166);
    assert.equal(Number(positiveLegacy.qty), 50);
    assert.equal(Number(positiveLegacy.balance), 216);
    assert.equal(Number(positiveLegacy.newQty), 216);
    assert.equal(Number(positiveLegacy.endQty), 216);

    let itemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1 end_qty AS endQty
      FROM items
      WHERE itemcode = @itemcode
    `);
    assert.equal(Number(itemResult.recordset[0].endQty), 216);

    const negativeSaveResponse = await saveAdjustment(cookie, -20);
    assert.equal(negativeSaveResponse.statusCode, 201);
    const negativeSaved = negativeSaveResponse.json().data;
    const negativePostResponse = await postAdjustment(cookie, negativeSaved.id);
    assert.equal(negativePostResponse.statusCode, 200);

    const negativeLegacy = await getPostedLegacyAdjustment(negativeSaved.qaNo);
    assert.ok(negativeLegacy);
    assert.equal(Number(negativeLegacy.oldBalance), 216);
    assert.equal(Number(negativeLegacy.qty), -20);
    assert.equal(Number(negativeLegacy.balance), 196);
    assert.equal(Number(negativeLegacy.newQty), 196);
    assert.equal(Number(negativeLegacy.endQty), 196);

    await setTestItemQuantity(100);
    const zeroSaveResponse = await saveAdjustment(cookie, 0);
    assert.equal(zeroSaveResponse.statusCode, 201);
    const zeroSaved = zeroSaveResponse.json().data;
    const zeroPostResponse = await postAdjustment(cookie, zeroSaved.id);
    assert.equal(zeroPostResponse.statusCode, 200);

    const zeroLegacy = await getPostedLegacyAdjustment(zeroSaved.qaNo);
    assert.ok(zeroLegacy);
    assert.equal(Number(zeroLegacy.oldBalance), 100);
    assert.equal(Number(zeroLegacy.qty), 0);
    assert.equal(Number(zeroLegacy.balance), 100);
    assert.equal(Number(zeroLegacy.newQty), 100);
    assert.equal(Number(zeroLegacy.endQty), 100);

    itemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1 end_qty AS endQty
      FROM items
      WHERE itemcode = @itemcode
    `);
    assert.equal(Number(itemResult.recordset[0].endQty), 100);
  });

  test('blocks posting when stock changed after save without partial writes', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const pool = await getSqlPool();

    await setTestItemQuantity(100);
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
            requestedQty: -4,
            itemRemark: 'Stale stock posting test',
          },
        ],
      },
    });

    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();
    assert.equal(savedPayload.data.lines[0].oldQty, 100);
    assert.equal(savedPayload.data.lines[0].newQty, 96);

    await setTestItemLiveFields({ endQty: 0, endQtyTemp: 777, assemblyQty: 888 });

    const postResponse = await app.inject({
      method: 'POST',
      url: `/api/quantity-adjustments/${savedPayload.data.id}/post`,
      headers: {
        cookie,
      },
    });

    assert.equal(postResponse.statusCode, 409);
    const conflictPayload = postResponse.json();
    assert.equal(
      conflictPayload.message,
      'Stock changed after this adjustment was saved. Please reload and review before posting.'
    );

    const verification = await pool
      .request()
      .input('itemcode', TEST_ITEMCODE)
      .input('qaId', sql.BigInt, Number(savedPayload.data.id))
      .input('batchNo', sql.NVarChar, String(savedPayload.data.qaNo).slice(-10))
      .query(`
      SELECT TOP 1
        end_qty AS endQty,
        END_QTY_TEMP AS endQtyTemp,
        ASSEMBLY_QTY AS assemblyQty
      FROM items
      WHERE itemcode = @itemcode;

      SELECT TOP 1
        h.status,
        d.old_qty AS oldQty,
        d.new_qty AS newQty,
        d.posted_old_qty AS postedOldQty,
        d.posted_new_qty AS postedNewQty
      FROM [${utilitySchema}].[qa_header] h
      INNER JOIN [${utilitySchema}].[qa_detail] d
        ON d.qa_id = h.qa_id
      WHERE h.qa_id = @qaId;

      SELECT COUNT(*) AS total
      FROM inventory_adjustment
      WHERE machine_id = 'UTILITY'
        AND BATCH_NO = @batchNo;
    `);
    const recordsets = verification.recordsets as Array<Array<Record<string, unknown>>>;

    assert.equal(Number(recordsets[0][0].endQty), 0);
    assert.equal(Number(recordsets[0][0].endQtyTemp), 777);
    assert.equal(Number(recordsets[0][0].assemblyQty), 888);
    assert.equal(recordsets[1][0].status, 'SAVED');
    assert.equal(Number(recordsets[1][0].oldQty), 100);
    assert.equal(Number(recordsets[1][0].newQty), 96);
    assert.equal(recordsets[1][0].postedOldQty, null);
    assert.equal(recordsets[1][0].postedNewQty, null);
    assert.equal(Number(recordsets[2][0].total), 0);

    const audit = await getLatestAuditEvent(
      'QA_POST_BLOCKED_STALE_STOCK',
      savedPayload.data.id
    );
    assert.ok(audit);

    await setTestItemQuantity(100);
  });

  test('posts when saved stock still matches live stock and preserves saved old quantity', async () => {
    const cookie = await loginAndGetCookie(ADMIN);
    const pool = await getSqlPool();

    const beforeItemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1
        itemname
      FROM items
      WHERE itemcode = @itemcode
    `);
    const beforeItemname = String(beforeItemResult.recordset[0].itemname ?? '');

    await setTestItemQuantity(100);
    await setTestItemLiveFields({ endQty: 100, endQtyTemp: 100, assemblyBox: 321, assemblyQty: 999 });
    const saveResponse = await saveAdjustment(cookie, -4);
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
    assert.equal(postedPayload.data.lines[0].oldQty, 100);
    assert.equal(postedPayload.data.lines[0].newQty, 96);
    assert.equal(postedPayload.data.lines[0].postedOldQty, 100);
    assert.equal(postedPayload.data.lines[0].postedNewQty, 96);

    const itemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
      SELECT TOP 1
        itemname,
        end_qty AS endQty,
        END_QTY_TEMP AS endQtyTemp,
        assembly_box AS assemblyBox,
        ASSEMBLY_QTY AS assemblyQty
      FROM items
      WHERE itemcode = @itemcode
    `);

    assert.equal(String(itemResult.recordset[0].itemname ?? ''), beforeItemname);
    assert.equal(Number(itemResult.recordset[0].endQty), 96);
    assert.equal(Number(itemResult.recordset[0].endQtyTemp), 96);
    assert.equal(Number(itemResult.recordset[0].assemblyBox), 96);
    assert.equal(Number(itemResult.recordset[0].assemblyQty), 96);

    await setTestItemQuantity(100);
  });

  test('updates matching delivery qty mirrors to final stock', async (t) => {
    const support = await getDeliveryMirrorSupport();
    if (!support.hasDeliveryTable || !support.hasItemcode || !support.hasQty || !support.hasQty2) {
      t.skip('delivery mirror test requires dbo.delivery(itemcode, qty, qty2)');
      return;
    }

    const beforeRows = await getDeliveryMirrorRows(TEST_ITEMCODE);
    if (beforeRows.length === 0) {
      t.skip('No matching delivery row for test itemcode');
      return;
    }

    try {
      const cookie = await loginAndGetCookie(ADMIN);

      await setTestItemQuantity(166);
      await setTestItemLiveFields({ endQty: 166, endQtyTemp: 166, assemblyBox: 10, assemblyQty: 999 });

      const saveResponse = await saveAdjustment(cookie, 50);
      assert.equal(saveResponse.statusCode, 201);
      const savedPayload = saveResponse.json();

      const postResponse = await postAdjustment(cookie, savedPayload.data.id);
      assert.equal(postResponse.statusCode, 200);

      const afterRows = await getDeliveryMirrorRows(TEST_ITEMCODE);
      assert.ok(afterRows.length > 0);
      for (const row of afterRows) {
        assert.equal(Number(row.qty), 216);
        assert.equal(Number(row.qty2), 216);
      }
    } finally {
      await setTestItemQuantity(100);
    }
  });

  test('succeeds when no matching delivery row exists', async (t) => {
    const support = await getDeliveryMirrorSupport();
    if (!support.hasDeliveryTable || !support.hasItemcode || !support.hasQty || !support.hasQty2) {
      t.skip('delivery mirror test requires dbo.delivery(itemcode, qty, qty2)');
      return;
    }

    const existingRows = await getDeliveryMirrorRows(TEST_ITEMCODE);
    if (existingRows.length > 0) {
      t.skip('Test requires itemcode with no delivery rows; existing rows found for test item');
      return;
    }

    try {
      const cookie = await loginAndGetCookie(ADMIN);
      const pool = await getSqlPool();

      await setTestItemQuantity(166);
      await setTestItemLiveFields({ endQty: 166, endQtyTemp: 166, assemblyBox: 1, assemblyQty: 999 });

      const saveResponse = await saveAdjustment(cookie, 50);
      assert.equal(saveResponse.statusCode, 201);
      const savedPayload = saveResponse.json();

      const postResponse = await postAdjustment(cookie, savedPayload.data.id);
      assert.equal(postResponse.statusCode, 200);

      const itemResult = await pool.request().input('itemcode', TEST_ITEMCODE).query(`
        SELECT TOP 1
          end_qty AS endQty,
          END_QTY_TEMP AS endQtyTemp,
          assembly_box AS assemblyBox,
          ASSEMBLY_QTY AS assemblyQty
        FROM items
        WHERE itemcode = @itemcode
      `);

      assert.equal(Number(itemResult.recordset[0].endQty), 216);
      assert.equal(Number(itemResult.recordset[0].endQtyTemp), 216);
      assert.equal(Number(itemResult.recordset[0].assemblyBox), 216);
      assert.equal(Number(itemResult.recordset[0].assemblyQty), 216);
    } finally {
      await setTestItemQuantity(100);
    }
  });

  test('rolls back posting when delivery mirror update fails', async (t) => {
    const support = await getDeliveryMirrorSupport();
    if (!support.hasDeliveryTable || !support.hasItemcode || !support.hasQty || !support.hasQty2) {
      t.skip('rollback test requires dbo.delivery(itemcode, qty, qty2)');
      return;
    }

    const deliveryRows = await getDeliveryMirrorRows(TEST_ITEMCODE);
    if (deliveryRows.length === 0) {
      t.skip('Rollback test requires a matching delivery row for the test item');
      return;
    }

    const cookie = await loginAndGetCookie(ADMIN);
    const pool = await getSqlPool();
    const triggerName = 'trg_qa_test_delivery_fail';

    await setTestItemQuantity(166);
    await setTestItemLiveFields({ endQty: 166, endQtyTemp: 166, assemblyBox: 10, assemblyQty: 999 });

    const saveResponse = await saveAdjustment(cookie, 50);
    assert.equal(saveResponse.statusCode, 201);
    const savedPayload = saveResponse.json();
    const batchNo = String(savedPayload.data.qaNo).slice(-10);

    await pool.request().query(`
      IF OBJECT_ID(N'dbo.${triggerName}', N'TR') IS NOT NULL
      BEGIN
        DROP TRIGGER dbo.${triggerName};
      END
    `);

    try {
      await pool.request().query(`
        CREATE TRIGGER dbo.${triggerName}
        ON dbo.delivery
        AFTER UPDATE
        AS
        BEGIN
          SET NOCOUNT ON;
          IF EXISTS (SELECT 1 FROM inserted WHERE itemcode = N'${TEST_ITEMCODE}')
          BEGIN
            THROW 51000, 'Simulated delivery mirror failure', 1;
          END
        END
      `);

      const postResponse = await postAdjustment(cookie, savedPayload.data.id);
      assert.equal(postResponse.statusCode, 500);

      const verification = await pool
        .request()
        .input('itemcode', sql.NVarChar, TEST_ITEMCODE)
        .input('qaId', sql.BigInt, Number(savedPayload.data.id))
        .input('batchNo', sql.NVarChar, batchNo)
        .query(`
          SELECT TOP 1
            end_qty AS endQty,
            END_QTY_TEMP AS endQtyTemp,
            assembly_box AS assemblyBox,
            ASSEMBLY_QTY AS assemblyQty
          FROM items
          WHERE itemcode = @itemcode;

          SELECT TOP 1
            status
          FROM [${utilitySchema}].[qa_header]
          WHERE qa_id = @qaId;

          SELECT COUNT(*) AS total
          FROM inventory_adjustment
          WHERE machine_id = N'UTILITY'
            AND BATCH_NO = @batchNo;
        `);

      const recordsets = verification.recordsets as Array<Array<Record<string, unknown>>>;
      assert.equal(Number(recordsets[0][0].endQty), 166);
      assert.equal(Number(recordsets[0][0].endQtyTemp), 166);
      assert.equal(Number(recordsets[0][0].assemblyBox), 10);
      assert.equal(Number(recordsets[0][0].assemblyQty), 999);
      assert.equal(String(recordsets[1][0].status), 'SAVED');
      assert.equal(Number(recordsets[2][0].total), 0);
    } finally {
      await pool.request().query(`
        IF OBJECT_ID(N'dbo.${triggerName}', N'TR') IS NOT NULL
        BEGIN
          DROP TRIGGER dbo.${triggerName};
        END
      `);
      await setTestItemQuantity(100);
    }
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
