IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = N'utility')
BEGIN
  EXEC('CREATE SCHEMA [utility]');
END
GO

IF OBJECT_ID(N'[utility].[app_roles]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[app_roles] (
    role_id INT NOT NULL PRIMARY KEY,
    role_name NVARCHAR(50) NOT NULL UNIQUE,
    role_code NVARCHAR(50) NOT NULL UNIQUE,
    can_post BIT NOT NULL DEFAULT 0,
    is_admin BIT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

MERGE [utility].[app_roles] AS target
USING (
  VALUES
    (1, N'Admin',            N'ADMIN',            1, 1),
    (2, N'Supervisor',       N'SUPERVISOR',        1, 0),
    (3, N'Encoder',          N'ENCODER',           0, 0),
    (4, N'POS User',         N'POS_USER',          0, 0),
    (5, N'Security Level 2', N'SECURITY_LEVEL_2',  0, 0)
) AS source (role_id, role_name, role_code, can_post, is_admin)
ON target.role_id = source.role_id
WHEN MATCHED THEN
  UPDATE SET
    role_name = source.role_name,
    role_code = source.role_code,
    can_post = source.can_post,
    is_admin = source.is_admin
WHEN NOT MATCHED THEN
  INSERT (role_id, role_name, role_code, can_post, is_admin)
  VALUES (source.role_id, source.role_name, source.role_code, source.can_post, source.is_admin);
GO

IF OBJECT_ID(N'[utility].[app_users]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[app_users] (
    user_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    username NVARCHAR(100) NOT NULL UNIQUE,
    password_hash NVARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    legacy_user_id NVARCHAR(50) NULL,
    is_active BIT NOT NULL DEFAULT 1,
    last_login_at DATETIME2 NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_app_users_role FOREIGN KEY (role_id) REFERENCES [utility].[app_roles](role_id)
  );

  CREATE UNIQUE INDEX IX_app_users_legacy_user_id
    ON [utility].[app_users] (legacy_user_id)
    WHERE legacy_user_id IS NOT NULL;
END
GO

IF OBJECT_ID(N'[utility].[qa_numbering]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[qa_numbering] (
    number_key NVARCHAR(20) NOT NULL PRIMARY KEY,
    prefix NVARCHAR(20) NOT NULL,
    next_value BIGINT NOT NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
  );
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_numbering]') AND name = N'number_format'
)
BEGIN
  ALTER TABLE [utility].[qa_numbering]
  ADD number_format NVARCHAR(120) NULL;
END
GO

IF EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_numbering]')
    AND name = N'number_format'
    AND max_length < 240
)
BEGIN
  ALTER TABLE [utility].[qa_numbering]
  ALTER COLUMN number_format NVARCHAR(120) NULL;
END
GO

UPDATE [utility].[qa_numbering]
SET number_format = N'QA-{date}-000X'
WHERE number_key = N'QA'
  AND (number_format IS NULL OR LTRIM(RTRIM(number_format)) = N'');
GO

IF OBJECT_ID(N'[utility].[qa_header]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[qa_header] (
    qa_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    qa_no NVARCHAR(50) NOT NULL UNIQUE,
    trans_date DATETIME2 NOT NULL,
    ref_type NVARCHAR(2) NOT NULL,
    ref_no NVARCHAR(50) NOT NULL,
    ref_series_no BIGINT NOT NULL,
    status NVARCHAR(20) NOT NULL,
    created_by BIGINT NOT NULL,
    created_by_username NVARCHAR(100) NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    updated_by BIGINT NOT NULL,
    updated_by_username NVARCHAR(100) NOT NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    posted_by BIGINT NULL,
    posted_by_username NVARCHAR(100) NULL,
    posted_at DATETIME2 NULL,
    print_count INT NOT NULL DEFAULT 0,
    last_printed_at DATETIME2 NULL,
    CONSTRAINT CHK_qa_header_ref_type CHECK (ref_type IN (N'DM', N'CM')),
    CONSTRAINT CHK_qa_header_status CHECK (status IN (N'SAVED', N'POSTED', N'PENDING_CANCELLATION', N'CANCELLED')),
    CONSTRAINT FK_qa_header_created_by FOREIGN KEY (created_by) REFERENCES [utility].[app_users](user_id),
    CONSTRAINT FK_qa_header_updated_by FOREIGN KEY (updated_by) REFERENCES [utility].[app_users](user_id),
    CONSTRAINT FK_qa_header_posted_by FOREIGN KEY (posted_by) REFERENCES [utility].[app_users](user_id)
  );

  CREATE UNIQUE INDEX IX_qa_header_ref ON [utility].[qa_header] (ref_type, ref_no);
  CREATE INDEX IX_qa_header_status_date ON [utility].[qa_header] (status, trans_date DESC);
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_header]') AND name = N'cancellation_reason'
)
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD cancellation_reason NVARCHAR(MAX) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_header]') AND name = N'cancellation_requested_by'
)
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD cancellation_requested_by BIGINT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_header]') AND name = N'cancellation_requested_by_username'
)
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD cancellation_requested_by_username NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_header]') AND name = N'cancellation_requested_at'
)
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD cancellation_requested_at DATETIME2 NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_header]') AND name = N'cancelled_by'
)
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD cancelled_by BIGINT NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_header]') AND name = N'cancelled_by_username'
)
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD cancelled_by_username NVARCHAR(100) NULL;
END
GO

IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_header]') AND name = N'cancelled_at'
)
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD cancelled_at DATETIME2 NULL;
END
GO

IF OBJECT_ID(N'[utility].[FK_qa_header_cancellation_requested_by]', N'F') IS NULL
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD CONSTRAINT FK_qa_header_cancellation_requested_by
    FOREIGN KEY (cancellation_requested_by) REFERENCES [utility].[app_users](user_id);
END
GO

IF OBJECT_ID(N'[utility].[FK_qa_header_cancelled_by]', N'F') IS NULL
BEGIN
  ALTER TABLE [utility].[qa_header]
  ADD CONSTRAINT FK_qa_header_cancelled_by
    FOREIGN KEY (cancelled_by) REFERENCES [utility].[app_users](user_id);
END
GO

IF EXISTS (
  SELECT 1 FROM sys.check_constraints
  WHERE parent_object_id = OBJECT_ID(N'[utility].[qa_header]')
    AND name = N'CHK_qa_header_status'
)
BEGIN
  ALTER TABLE [utility].[qa_header] DROP CONSTRAINT CHK_qa_header_status;
END
GO

ALTER TABLE [utility].[qa_header]
ADD CONSTRAINT CHK_qa_header_status
CHECK (status IN (N'SAVED', N'POSTED', N'PENDING_CANCELLATION', N'CANCELLED'));
GO

IF OBJECT_ID(N'[utility].[qa_detail]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[qa_detail] (
    detail_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    qa_id BIGINT NOT NULL,
    line_no INT NOT NULL,
    itemcode NVARCHAR(50) NOT NULL,
    itemname NVARCHAR(200) NOT NULL,
    old_qty DECIMAL(18, 2) NOT NULL,
    adjust_qty DECIMAL(18, 2) NOT NULL,
    new_qty DECIMAL(18, 2) NOT NULL,
    item_remark NVARCHAR(500) NULL,
    updated_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_qa_detail_header FOREIGN KEY (qa_id) REFERENCES [utility].[qa_header](qa_id) ON DELETE CASCADE
  );

  CREATE UNIQUE INDEX IX_qa_detail_line ON [utility].[qa_detail] (qa_id, line_no);
  CREATE INDEX IX_qa_detail_itemcode ON [utility].[qa_detail] (itemcode);
END
GO

IF OBJECT_ID(N'[utility].[qa_posting_log]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[qa_posting_log] (
    posting_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    qa_id BIGINT NOT NULL UNIQUE,
    inventory_rows_inserted INT NOT NULL DEFAULT 0,
    posted_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    posted_by BIGINT NOT NULL,
    notes NVARCHAR(500) NULL,
    CONSTRAINT FK_qa_posting_log_header FOREIGN KEY (qa_id) REFERENCES [utility].[qa_header](qa_id),
    CONSTRAINT FK_qa_posting_log_user FOREIGN KEY (posted_by) REFERENCES [utility].[app_users](user_id)
  );
END
GO

IF OBJECT_ID(N'[utility].[qa_print_log]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[qa_print_log] (
    print_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    qa_id BIGINT NOT NULL,
    printed_by BIGINT NOT NULL,
    printed_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_qa_print_log_header FOREIGN KEY (qa_id) REFERENCES [utility].[qa_header](qa_id),
    CONSTRAINT FK_qa_print_log_user FOREIGN KEY (printed_by) REFERENCES [utility].[app_users](user_id)
  );
END
GO

IF OBJECT_ID(N'[utility].[audit_log]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[audit_log] (
    audit_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    event_type NVARCHAR(50) NOT NULL,
    entity_type NVARCHAR(50) NOT NULL,
    entity_id NVARCHAR(100) NULL,
    actor_user_id BIGINT NULL,
    actor_username NVARCHAR(100) NULL,
    details NVARCHAR(MAX) NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT FK_audit_log_user FOREIGN KEY (actor_user_id) REFERENCES [utility].[app_users](user_id)
  );

  CREATE INDEX IX_audit_log_created_at ON [utility].[audit_log] (created_at DESC);
  CREATE INDEX IX_audit_log_entity ON [utility].[audit_log] (entity_type, entity_id);
END
GO

IF OBJECT_ID(N'[utility].[demo_mode_state]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[demo_mode_state] (
    id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
    is_active BIT NOT NULL DEFAULT 0,
    snapshot_id NVARCHAR(80) NOT NULL,
    database_name NVARCHAR(128) NOT NULL,
    started_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    started_by NVARCHAR(100) NOT NULL DEFAULT N'system',
    ended_at DATETIME2 NULL,
    notes NVARCHAR(MAX) NULL
  );

  CREATE UNIQUE INDEX UX_demo_mode_state_active
    ON [utility].[demo_mode_state] (is_active)
    WHERE is_active = 1;
END
GO

IF OBJECT_ID(N'[utility].[demo_snapshot_tables]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[demo_snapshot_tables] (
    snapshot_id NVARCHAR(80) NOT NULL,
    table_ordinal INT NOT NULL,
    original_schema NVARCHAR(128) NOT NULL,
    original_table NVARCHAR(128) NOT NULL,
    snapshot_schema NVARCHAR(128) NOT NULL,
    snapshot_table NVARCHAR(128) NOT NULL,
    has_identity BIT NOT NULL DEFAULT 0,
    identity_column NVARCHAR(128) NULL,
    identity_seed_value DECIMAL(38, 0) NULL,
    identity_increment_value DECIMAL(38, 0) NULL,
    identity_last_value DECIMAL(38, 0) NULL,
    row_count BIGINT NOT NULL DEFAULT 0,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_demo_snapshot_tables PRIMARY KEY (snapshot_id, table_ordinal)
  );
END
GO

IF OBJECT_ID(N'[utility].[demo_snapshot_constraints]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[demo_snapshot_constraints] (
    snapshot_id NVARCHAR(80) NOT NULL,
    original_schema NVARCHAR(128) NOT NULL,
    original_table NVARCHAR(128) NOT NULL,
    constraint_name NVARCHAR(128) NOT NULL,
    constraint_type NVARCHAR(30) NOT NULL,
    is_disabled BIT NOT NULL,
    is_not_trusted BIT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_demo_snapshot_constraints
      PRIMARY KEY (snapshot_id, original_schema, original_table, constraint_name)
  );
END
GO

IF OBJECT_ID(N'[utility].[demo_snapshot_triggers]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[demo_snapshot_triggers] (
    snapshot_id NVARCHAR(80) NOT NULL,
    original_schema NVARCHAR(128) NOT NULL,
    original_table NVARCHAR(128) NOT NULL,
    trigger_name NVARCHAR(128) NOT NULL,
    is_disabled BIT NOT NULL,
    created_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_demo_snapshot_triggers
      PRIMARY KEY (snapshot_id, original_schema, original_table, trigger_name)
  );
END
GO

-- Add entry_mode and requested_qty to qa_detail if not already present
IF NOT EXISTS (
  SELECT 1 FROM sys.columns
  WHERE object_id = OBJECT_ID(N'[utility].[qa_detail]') AND name = N'entry_mode'
)
BEGIN
  ALTER TABLE [utility].[qa_detail] ADD entry_mode NVARCHAR(10) NULL;
  ALTER TABLE [utility].[qa_detail] ADD requested_qty DECIMAL(18, 2) NULL;
END
GO

-- Role-based permission overrides table
IF OBJECT_ID(N'[utility].[role_permissions]', N'U') IS NULL
BEGIN
  CREATE TABLE [utility].[role_permissions] (
    role_id          INT           NOT NULL,
    permission_key   NVARCHAR(50)  NOT NULL,
    permission_value BIT           NOT NULL DEFAULT 0,
    updated_at       DATETIME2     NOT NULL DEFAULT SYSUTCDATETIME(),
    CONSTRAINT PK_role_permissions PRIMARY KEY (role_id, permission_key),
    CONSTRAINT FK_role_permissions_role FOREIGN KEY (role_id)
      REFERENCES [utility].[app_roles](role_id)
  );
END
GO
