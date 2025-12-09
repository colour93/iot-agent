import { MigrationInterface, QueryRunner } from 'typeorm';

export class NanoidReset1700000002000 implements MigrationInterface {
  name = 'NanoidReset1700000002000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS external_data_cache CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_invocations CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_sessions CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS automation_runs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS automations CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS commands CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_events CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS telemetry_logs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_capabilities CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_attrs_snapshot CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS devices CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS rooms CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS homes CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS users CASCADE`);

    await queryRunner.query(`
      CREATE TABLE users (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        email varchar UNIQUE,
        "passwordHash" varchar,
        role varchar DEFAULT 'user'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE homes (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        name varchar NOT NULL,
        address varchar,
        timezone varchar DEFAULT 'Asia/Shanghai',
        "ownerId" varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE rooms (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        name varchar NOT NULL,
        floor varchar,
        type varchar,
        "homeId" varchar NOT NULL REFERENCES homes(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE devices (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        "deviceId" varchar UNIQUE,
        name varchar NOT NULL,
        type varchar,
        category varchar DEFAULT 'both',
        status varchar DEFAULT 'offline',
        "fwVersion" varchar,
        secret varchar,
        "lastSeen" timestamptz,
        "roomId" varchar NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
        "snapshotId" varchar
      )
    `);

    await queryRunner.query(`
      CREATE TABLE device_attrs_snapshot (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        attrs jsonb DEFAULT '{}'::jsonb,
        "deviceId" varchar UNIQUE REFERENCES devices(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`UPDATE devices SET "snapshotId" = NULL`);
    await queryRunner.query(`
      CREATE TABLE device_capabilities (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        kind varchar,
        name varchar,
        schema jsonb,
        "deviceId" varchar REFERENCES devices(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE telemetry_logs (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        "homeId" varchar,
        "roomId" varchar,
        ts timestamptz,
        payload jsonb,
        "deviceId" varchar REFERENCES devices(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE device_events (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        "eventType" varchar,
        params jsonb,
        ts timestamptz,
        "deviceId" varchar REFERENCES devices(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE commands (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        "cmdId" varchar,
        method varchar,
        params jsonb DEFAULT '{}'::jsonb,
        status varchar DEFAULT 'pending',
        "sentAt" timestamptz,
        "ackAt" timestamptz,
        error varchar,
        "retryCount" int DEFAULT 0,
        "homeId" varchar,
        "roomId" varchar,
        "deviceId" varchar NOT NULL REFERENCES devices(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE automations (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        name varchar,
        enabled boolean DEFAULT true,
        source varchar DEFAULT 'json',
        definition jsonb DEFAULT '{}'::jsonb,
        scope varchar,
        "homeId" varchar NOT NULL REFERENCES homes(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE automation_runs (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        input jsonb,
        output jsonb,
        status varchar DEFAULT 'pending',
        "executedAt" timestamptz,
        "automationId" varchar REFERENCES automations(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE llm_sessions (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        role varchar,
        "contextRef" varchar,
        "homeId" varchar REFERENCES homes(id) ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE TABLE llm_invocations (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        role varchar,
        summary varchar,
        input jsonb,
        output jsonb,
        "tokensIn" int DEFAULT 0,
        "tokensOut" int DEFAULT 0,
        cost float DEFAULT 0,
        "sessionId" varchar REFERENCES llm_sessions(id) ON DELETE SET NULL,
        "homeId" varchar REFERENCES homes(id) ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE TABLE external_data_cache (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        source varchar,
        "cacheKey" varchar,
        payload jsonb,
        "expireAt" timestamptz
      )
    `);

    await queryRunner.query(`
      CREATE TABLE audit_logs (
        id varchar PRIMARY KEY,
        "createdAt" timestamptz DEFAULT now(),
        "updatedAt" timestamptz DEFAULT now(),
        action varchar,
        target varchar,
        meta jsonb,
        "userId" varchar REFERENCES users(id) ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS audit_logs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS external_data_cache CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_invocations CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS llm_sessions CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS automation_runs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS automations CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS commands CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_events CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS telemetry_logs CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_capabilities CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS device_attrs_snapshot CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS devices CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS rooms CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS homes CASCADE`);
    await queryRunner.query(`DROP TABLE IF EXISTS users CASCADE`);
  }
}

