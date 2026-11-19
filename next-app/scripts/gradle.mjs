// Runs the Android Gradle wrapper on any OS: `node scripts/gradle.mjs <task...>`.
// npm scripts run through cmd.exe on Windows, where `./gradlew` does not work.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const androidDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'android');
const isWindows = process.platform === 'win32';
const wrapper = path.join(androidDir, isWindows ? 'gradlew.bat' : 'gradlew');
const tasks = process.argv.slice(2);

if (tasks.some((t) => t.startsWith('bundleRelease') || t.startsWith('assembleRelease'))
  && !existsSync(path.join(androidDir, 'keystore.properties'))) {
  console.error('Missing android/keystore.properties: the release build would be unsigned.');
  console.error('See next-app/ANDROID_RELEASE.md, step 1.');
  process.exit(1);
}

const result = spawnSync(wrapper, tasks, { cwd: androidDir, stdio: 'inherit', shell: isWindows });
process.exit(result.status ?? 1);
