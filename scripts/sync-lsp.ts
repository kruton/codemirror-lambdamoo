import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";

type Artifact = {
  repository: string;
  version: string;
  archive: string;
  directory: string;
};

const execFileAsync = promisify(execFile);
const workspace = process.cwd();
const manifest = JSON.parse(
  await readFile(resolve(workspace, "lsp-artifact.json"), "utf8"),
) as Artifact;
const destination = resolve(workspace, ".lsp/browser");
const staging = resolve(workspace, ".lsp/browser.next");
const localArgument = process.argv.indexOf("--from-dir");

await rm(staging, { force: true, recursive: true });
await mkdir(staging, { recursive: true });

if (localArgument >= 0) {
  const localPath = process.argv[localArgument + 1];
  if (!localPath) throw new Error("--from-dir requires a directory path");
  await cp(resolve(localPath), staging, { recursive: true });
  await installStagedArtifact();
  process.stdout.write(`Staged local browser artifact from ${localPath}\n`);
  process.exit(0);
}

const temporaryDirectory = await mkdtemp(resolve(tmpdir(), "codemirror-lambdamoo-lsp-"));
try {
  const releaseBase = `https://github.com/${manifest.repository}/releases/download/${manifest.version}`;
  const archivePath = resolve(temporaryDirectory, manifest.archive);
  const checksumsPath = resolve(temporaryDirectory, "SHA256SUMS");
  await Promise.all([
    download(`${releaseBase}/${manifest.archive}`, archivePath),
    download(`${releaseBase}/SHA256SUMS`, checksumsPath),
  ]);

  const checksumLines = (await readFile(checksumsPath, "utf8")).split(/\r?\n/);
  const expectedLine = checksumLines.find((line) => line.trim().endsWith(` ${manifest.archive}`));
  if (!expectedLine) throw new Error(`${manifest.archive} is missing from SHA256SUMS`);
  const expected = expectedLine.trim().split(/\s+/)[0];
  const actual = createHash("sha256")
    .update(await readFile(archivePath))
    .digest("hex");
  if (actual !== expected) {
    throw new Error(
      `Checksum mismatch for ${manifest.archive}: expected ${expected}, got ${actual}`,
    );
  }

  if (process.env.CI) {
    await execFileAsync("gh", [
      "attestation",
      "verify",
      archivePath,
      "--repo",
      manifest.repository,
    ]);
  }

  await execFileAsync("tar", [
    "-xzf",
    archivePath,
    "-C",
    staging,
    "--strip-components=1",
    manifest.directory,
  ]);
  await installStagedArtifact();
  process.stdout.write(`Staged ${manifest.repository} ${manifest.version} browser artifact\n`);
} finally {
  await rm(temporaryDirectory, { force: true, recursive: true });
  await rm(staging, { force: true, recursive: true });
}

async function download(url: string, path: string): Promise<void> {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) throw new Error(`Failed to download ${url}: ${response.status}`);
  await writeFile(path, new Uint8Array(await response.arrayBuffer()));
  process.stdout.write(`Downloaded ${basename(path)}\n`);
}

async function installStagedArtifact(): Promise<void> {
  await rm(destination, { force: true, recursive: true });
  await rename(staging, destination);
}
