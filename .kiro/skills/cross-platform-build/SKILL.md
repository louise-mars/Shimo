---
name: cross-platform-build
description: Build production binaries (EXE/MSI for Windows, APK for Android) from Tauri 2 and Capacitor 8 projects. Use this skill whenever the user asks to build an EXE, MSI, APK, installer, or production binary from a Tauri or Capacitor project. Also trigger when the user says "build the app", "create installer", "package for distribution", "generate APK", or "compile for release". Covers the full pipeline from dependency builds through frontend bundling, native compilation, and troubleshooting common build failures.
---

# Cross-Platform Build Skill

Build production-ready desktop (EXE/MSI via Tauri 2) and mobile (APK via Capacitor 8) binaries from a web frontend project.

## When to Use

- User wants to build an EXE, MSI installer, or NSIS installer from a Tauri project
- User wants to build an APK from a Capacitor project
- User says "build the app", "create installer", "package for release", "generate APK"
- User has a Tauri 2 + Vite or Capacitor 8 + Vite project and wants distributable binaries

## Prerequisites Detection

Before building, verify these are available:

### Desktop (Tauri 2 → EXE)
- **Rust toolchain**: `rustc --version` and `cargo --version`
- **Node.js**: `node --version`
- **MSVC Build Tools** (Windows): Check for `cl.exe` or Visual Studio installation
- **Project structure**: `src-tauri/` directory with `Cargo.toml` and `tauri.conf.json`

### Mobile (Capacitor 8 → APK)
- **Java/JDK**: Check `JAVA_HOME` or find JBR bundled with Android Studio
- **Android SDK**: Check `ANDROID_HOME` or common paths
- **Gradle wrapper**: `android/gradlew` or `android/gradlew.bat`
- **Project structure**: `android/` directory with `app/build.gradle`

## Desktop Build Pipeline (Tauri 2 → EXE)

### Step 1: Build shared dependencies

If the project has a shared/common package (monorepo), build it first:
```bash
cd Shared && npm run build
```

### Step 2: Install frontend dependencies
```bash
cd Desktop && npm install
```

### Step 3: Verify TypeScript compiles
```bash
npx tsc --noEmit
```

Common fixes:
- Missing type declarations for native APIs → use `any` casts or exclude from tsconfig
- Unused variables with strict linting → remove dead code
- Test files in build → add `"exclude": ["src/test", "src/**/*.test.*"]` to tsconfig.app.json

### Step 4: Build frontend (Vite)
```bash
npx vite build
```

If native imports fail to resolve, add them as externals in `vite.config.ts`:
```typescript
build: {
  rollupOptions: {
    external: [
      '@tauri-apps/plugin-fs',
      '@tauri-apps/api/path',
      '@capacitor/filesystem',
    ],
  },
},
```

If barrel `export *` re-exports aren't resolved by Rolldown, add explicit named exports in the shared package's top-level `index.ts`.

### Step 5: Build Tauri binary
```bash
npx tauri build --ignore-version-mismatches
```

**Output locations:**
- `src-tauri/target/release/{app-name}.exe` (standalone)
- `src-tauri/target/release/bundle/nsis/{Name}_{ver}_x64-setup.exe` (NSIS installer)
- `src-tauri/target/release/bundle/msi/{Name}_{ver}_x64_en-US.msi` (MSI installer)

### Troubleshooting Desktop Builds

**"failed to parse JSON: expected value at line 1 column 1"**
This is a Tauri 2.x bug where `tauri-build` generates an empty permission file.
1. Align `tauri-build` and `tauri` versions in Cargo.toml
2. Remove `src-tauri/capabilities/default.json`
3. Remove `tauri-plugin-*` dependencies temporarily
4. Run `cargo clean` in `src-tauri/` and rebuild

**Version mismatch warning**
Use `--ignore-version-mismatches` or align the Rust crate version with the npm `@tauri-apps/api` version.

**First build takes 5-15 minutes**
This is normal — Rust compiles all dependencies from source. Subsequent builds reuse cached artifacts (30-90 seconds).

## Mobile Build Pipeline (Capacitor 8 → APK)

### Step 1: Build shared dependencies
```bash
cd Shared && npm run build
```

### Step 2: Build frontend
```bash
cd Mobile && npm run build
```
Same Vite external issues apply as desktop.

### Step 3: Sync to Android
```bash
npx cap sync android
```

### Step 4: Set environment variables

**Windows (PowerShell):**
```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
```

**macOS/Linux:**
```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export ANDROID_HOME="$HOME/Library/Android/sdk"
```

### Step 5: Build APK
```bash
cd android
.\gradlew.bat assembleRelease    # Windows
./gradlew assembleRelease        # macOS/Linux
```

**Output:** `android/app/build/outputs/apk/release/app-release-unsigned.apk`

### Step 6: Sign APK (optional, for distribution)
```bash
$ANDROID_HOME/build-tools/34.0.0/apksigner sign \
  --ks /path/to/keystore.jks \
  --out app-release-signed.apk \
  app-release-unsigned.apk
```

### Troubleshooting Mobile Builds

**JAVA_HOME not set**
Find JBR bundled with Android Studio:
- Windows: `C:\Program Files\Android\Android Studio\jbr`
- macOS: `/Applications/Android Studio.app/Contents/jbr/Contents/Home`

**SDK licenses not accepted**
```bash
yes | $ANDROID_HOME/cmdline-tools/latest/bin/sdkmanager --licenses
```

**Gradle dependency resolution fails**
```bash
./gradlew --refresh-dependencies assembleRelease
```

**First build takes 3-8 minutes**
Normal for Gradle downloading and compiling Android libraries.

## Quick Reference (One-Liners)

**Desktop (Windows PowerShell):**
```powershell
cd Shared; npm run build; cd ..\Desktop; npm install; npx vite build; npx tauri build --ignore-version-mismatches
```

**Mobile (Windows PowerShell):**
```powershell
cd Shared; npm run build; cd ..\Mobile; npm run build; npx cap sync android; cd android; $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"; $env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; .\gradlew.bat assembleRelease
```
