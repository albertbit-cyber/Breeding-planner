import { describe, expect, it, vi } from "vitest";

vi.mock("../../platform/index.js", () => ({
  saveFile: vi.fn(async (options) => ({ method: "download", name: options.name })),
}));

import { saveFile } from "../../platform/index.js";
import {
  BACKUP_FILE_MIME,
  assertBackupFileSelectable,
  assertRestorableBackup,
  buildBackupFilename,
  describeBackupPayload,
  fileSafeName,
  isoToFileTimestamp,
  saveBackupFile,
} from "./backupFile.js";

describe("backup file naming", () => {
  it("builds a .bpbackup name from a base and a timestamp", () => {
    expect(buildBackupFilename("serpentora-backup", "2026-10-12T10-00-00-000Z")).toBe(
      "serpentora-backup-2026-10-12T10-00-00-000Z.bpbackup"
    );
  });

  it("strips characters a file system rejects", () => {
    expect(fileSafeName('Manual backup • 12/10/2026 10:00 "test"')).toBe("Manual backup • 12-10-2026 10-00 -test-");
    expect(fileSafeName("   ")).toBe("serpentora-backup");
  });

  it("turns an ISO timestamp into a file-safe one", () => {
    expect(isoToFileTimestamp("2026-10-12T10:00:00.000Z")).toBe("2026-10-12T10-00-00-000Z");
  });
});

describe("assertRestorableBackup", () => {
  it("accepts a version 1 file with animals", () => {
    const payload = { version: 1, snakes: [{ id: "a" }], pairings: [] };
    expect(assertRestorableBackup(payload)).toBe(payload);
  });

  it("accepts a legacy file without a version field", () => {
    expect(() => assertRestorableBackup({ snakes: [{ id: "a" }] })).not.toThrow();
  });

  it("refuses a file from a newer format", () => {
    expect(() => assertRestorableBackup({ version: 2, snakes: [{ id: "a" }] })).toThrow(/newer Serpentora/);
  });

  it("refuses non-objects and empty files", () => {
    expect(() => assertRestorableBackup(null)).toThrow(/invalid/);
    expect(() => assertRestorableBackup([])).toThrow(/invalid/);
    expect(() => assertRestorableBackup({ version: 1, snakes: [], pairings: [] })).toThrow(/does not contain/);
  });
});

describe("assertBackupFileSelectable", () => {
  it("accepts a .bpbackup with the native MIME, octet-stream or no type", () => {
    expect(assertBackupFileSelectable({ name: "x.bpbackup", type: BACKUP_FILE_MIME })).toEqual({ isNativeBackup: true, isLegacyJson: false });
    expect(assertBackupFileSelectable({ name: "x.bpbackup", type: "application/octet-stream" }).isNativeBackup).toBe(true);
    expect(assertBackupFileSelectable({ name: "x.bpbackup", type: "" }).isNativeBackup).toBe(true);
  });

  it("accepts a .bpbackup that Android reports as application/json", () => {
    expect(assertBackupFileSelectable({ name: "x.bpbackup", type: "application/json" }).isNativeBackup).toBe(true);
  });

  it("only accepts .json when legacy import is allowed", () => {
    expect(() => assertBackupFileSelectable({ name: "x.json", type: "application/json" })).toThrow(/Select a \.bpbackup backup\./);
    expect(assertBackupFileSelectable({ name: "x.json", type: "application/json" }, { allowLegacyJson: true }).isLegacyJson).toBe(true);
  });

  it("rejects other extensions and types", () => {
    expect(() => assertBackupFileSelectable({ name: "x.txt", type: "text/plain" }, { allowLegacyJson: true })).toThrow(/Select a/);
    expect(() => assertBackupFileSelectable({ name: "x.bpbackup", type: "text/plain" })).toThrow(/Unsupported backup file type/);
  });
});

describe("saveBackupFile", () => {
  it("serializes the payload and hands it to the platform", async () => {
    const payload = { version: 1, generatedAt: "2026-10-12T10:00:00.000Z", snakes: [{ id: "a" }], pairings: [] };
    const result = await saveBackupFile(payload);
    expect(result).toEqual({ method: "download", name: "serpentora-backup-2026-10-12T10-00-00-000Z.bpbackup" });
    const call = saveFile.mock.calls.at(-1)[0];
    expect(call.mime).toBe(BACKUP_FILE_MIME);
    expect(JSON.parse(call.data)).toEqual(payload);
  });

  it("refuses to save nothing", async () => {
    await expect(saveBackupFile(null)).rejects.toThrow(/Nothing to back up/);
  });

  it("counts what a payload holds", () => {
    expect(describeBackupPayload({ snakes: [1, 2], pairings: [1] })).toEqual({ snakes: 2, pairings: 1 });
    expect(describeBackupPayload(undefined)).toEqual({ snakes: 0, pairings: 0 });
  });
});
