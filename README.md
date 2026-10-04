# AR Vault (SecureApp)

A private media and document vault for iOS and Android, built with React Native, Expo SDK 54 and Expo Router.

AR Vault keeps photos, videos, audio and documents in the app's private storage, behind a PIN and optional biometric unlock. On Android it can move photos and videos out of the system gallery, so the only remaining copy is inside the vault. It can back up and restore the whole vault as a ZIP file, or on Android as a plain folder. It also includes a PIN-gated launcher for other Android apps.

> **Security model in one sentence:** the vault is an **access-control** layer (PIN, biometrics, auto-lock) over files kept in app-private storage. Vault files are **not encrypted by the app**. See [How the security works](#how-the-security-works).

---

## Features

### Security and authentication
- PIN set on first launch (numeric, 4 to 12 digits), entered twice to confirm.
- The PIN is stored as a salted SHA-256 hash in `expo-secure-store`. It is never stored in plain text.
- Optional biometric unlock (Face ID, Touch ID, fingerprint) through `expo-local-authentication`. It is offered only when the device has the hardware and at least one enrolled biometric.
- When biometrics are enabled, the biometric prompt opens automatically on the lock screen.
- Auto-lock when the app goes to the background. This is on by default and can be turned off.
- "Lock vault immediately" actions on the Home and Settings screens.
- The last successful unlock time is recorded and shown on Home and in Settings.

### Storage and backup
- Vault files are copied into `documentDirectory/vault/` under generated file names.
- A JSON index stores each item's display name, category, MIME type and timestamp. A second copy of the index is written as a fallback.
- Index writes go through a serialized queue, so concurrent imports or deletes cannot overwrite each other.
- Index entries are validated when loaded. Entries with a missing category, a bad timestamp, or a file name containing a path separator are dropped.
- **ZIP backup** (iOS and Android): the index, app shortcuts and all files are packed with JSZip and handed to the system share sheet. The size limit is about 350 MB.
- **Folder backup** (Android): writes an `ARVault_backup_<timestamp>` folder to a location picked through the Storage Access Framework. This suits large vaults.
- **Restore** from a ZIP file or a backup folder. A restore first checks that every indexed file is present, then stages the files and swaps them in. If the swap fails, it rolls back to the previous vault and index.

### Media and documents
- **Photos:** multi-select import, a grid or list view, and search by name.
- **Videos:** multi-select import and in-app playback with `expo-video`.
- **Audio:** multi-select import of `audio/*` files and in-app play and pause with `expo-audio`.
- **Documents:** multi-select import of any file type. Documents open through the system share sheet ("Share or open externally").
- **Move from gallery (Android):** with "Remove originals from gallery" on, a custom paged picker built on `expo-media-library` lists the device's photos or videos, with live video previews. It copies the selected items into the vault, then deletes the originals by their exact MediaStore IDs. This flow requires full ("Allow all") media access.
- **Remove originals on other paths:** after a standard picker import, the app tries to delete the gallery original by `assetId` and reports any copies it could not remove.
- **Release to gallery:** copies a photo, video or audio item back to the system library, then removes it from the vault.
- **Export or share** a single item while keeping it in the vault.

### App shortcuts (Android)
- Save shortcuts for installed apps by package name and launch them from inside the vault with `expo-intent-launcher`.
- The app's own UI says this plainly: it is a launcher behind your PIN. It does not sandbox or hide the other apps.

### UI
- A custom dark theme with gold accents (`constants/vaultTheme.ts`), gradient backgrounds and headers (`expo-linear-gradient`), and haptic feedback (`expo-haptics`).
- A Home dashboard with live item counts per category.
- Search bars on every collection screen.

---

## How the security works

This section describes what the code does, including what it does not do.

### What is stored where

| Data | Location | Protection |
|---|---|---|
| PIN hash (`salt:sha256hex`) | `expo-secure-store` | iOS Keychain or Android Keystore-backed storage (library defaults) |
| Biometric on/off, lock-on-background flag, last unlock time | `expo-secure-store` | Same as above |
| "Remove originals from gallery" preference | AsyncStorage | None (not sensitive) |
| Vault files (photos, videos, audio, documents) | `documentDirectory/vault/` | App sandbox and OS storage encryption only. **Not encrypted by the app.** |
| Vault index and app shortcuts (`vault-index.json`, `vault-apps.json`, plus backups) | `documentDirectory/` | Plain JSON. Contains original file names and MIME types. |
| ZIP backup | `cacheDirectory`, then wherever you share it | **Unencrypted** ZIP |
| Folder backup (Android) | User-chosen SAF folder | **Unencrypted** files |

### PIN
- `lib/pin.ts` generates a 16-byte random salt with `expo-crypto` and stores `base64(salt):SHA-256(salt + PIN)` in hex.
- To unlock, the app recomputes the hash and compares strings.
- Limitations:
  - SHA-256 is a fast hash, not a password KDF such as PBKDF2, scrypt or Argon2. A 4 to 12 digit PIN can be brute-forced quickly offline if the hash is ever extracted. In practice it is protected by the Keychain or Keystore.
  - There is **no attempt limit, delay or lockout** after wrong PINs.
  - There is **no change-PIN or PIN-reset flow** in the UI.

### Biometrics
- `LocalAuthentication.authenticateAsync` runs with `disableDeviceFallback: false`, so the **device passcode is also accepted** in place of a biometric.
- A successful prompt sets an in-memory `unlocked` flag. Biometrics are **not bound to any key or secret**. They gate the UI and do not decrypt anything.

### Locking
- Lock state lives in React context (`contexts/AuthContext.tsx`). While it is `false`, the root layout renders only the PIN screens, and no vault route is mounted.
- Auto-lock happens on the `background` AppState event. During system pickers, permission dialogs and the share sheet, auto-lock is paused for up to 120 seconds so those flows do not lock the vault halfway through.
- Locking does not happen on `inactive`. The app does not blur the app-switcher snapshot and does not block screenshots.

### Files at rest
- Files are plain copies inside the app sandbox. Their confidentiality depends on the OS (sandboxing and device storage encryption), not on the app.
- The UI lock does not protect files from anyone with file-system access to the app's data, such as a rooted or jailbroken device or a device backup.
- Deleting an item removes the file with a normal file delete. It is not a secure wipe.
- Imports use the pickers' cache copies (`copyToCacheDirectory: true` for documents and audio). Those temporary copies, and exported ZIPs in `cacheDirectory`, are not explicitly deleted by the app.

### What this is not
- No file or database encryption, and no encryption keys.
- No network or server component. Nothing is uploaded unless you share or export it yourself.

---

## Architecture

```
app/_layout.tsx  ── AuthProvider ──┬── not ready ───▶ spinner
                                   ├── locked ──────▶ VaultAuthScreens (setup PIN / unlock)
                                   └── unlocked ────▶ Stack
                                                       ├── (tabs)
                                                       │    ├── index      Home dashboard
                                                       │    ├── apps       Android app shortcuts
                                                       │    ├── settings   Security, backup, restore
                                                       │    ├── photos     ┐
                                                       │    ├── video      │ hidden tabs, opened
                                                       │    ├── audio      │ from Home
                                                       │    └── documents  ┘
                                                       ├── viewer          Preview / play / share / release
                                                       └── gallery-move    Android move-from-gallery (modal)

Screens ──▶ hooks (useVaultItems, useVaultStats) ──▶ lib/vaultStore ──▶ expo-file-system
Settings ──▶ lib/vaultBackup (JSZip, SAF, staged restore + rollback)
Photos/Video ──▶ lib/galleryVault, lib/mediaLibraryMove ──▶ expo-media-library
AuthContext ──▶ lib/pin (expo-crypto) + expo-secure-store + expo-local-authentication
```

### Project layout

| Path | Purpose |
|---|---|
| `app/` | Expo Router routes (typed routes enabled) |
| `components/VaultAuthScreens.tsx` | PIN setup and unlock screens, biometric auto-prompt |
| `components/VaultItemList.tsx`, `PhotoGalleryGrid.tsx` | List and grid views with search filtering and delete |
| `components/VaultChrome.tsx`, `VaultLuxuryBackground.tsx`, `VaultSearchBar.tsx` | Shared UI chrome |
| `constants/vaultTheme.ts` | Color tokens and gradients |
| `contexts/AuthContext.tsx` | Lock state, PIN and biometric unlock, auto-lock, background-lock suppression |
| `hooks/useVaultItems.ts`, `useVaultStats.ts` | Load items or per-category counts on screen focus |
| `lib/vaultStore.ts` | Vault directory, JSON index with backup copy, serialized writes, add and delete |
| `lib/vaultBackup.ts` | ZIP export and import, Android SAF folder backup and restore, staged restore with rollback |
| `lib/mediaLibraryMove.ts` | Copies MediaLibrary assets into the vault, then deletes the originals |
| `lib/galleryVault.ts` | Gallery delete helpers and "release to gallery" |
| `lib/pin.ts` | Salted SHA-256 PIN hashing and verification |
| `lib/vaultPrefs.ts` | Non-sensitive preferences in AsyncStorage |
| `types/vault.ts` | `VaultItem`, `VaultCategory`, `VaultAppShortcut` |
| `patches/expo-image-picker+17.0.10.patch` | Native patch, see below |

### The `expo-image-picker` patch
Applied automatically by `patch-package` on `npm install`. On Android it:
- Resolves a MediaStore asset ID from more kinds of picker URIs, including Photo Picker and OEM gallery URIs, plus a `ContentResolver` query fallback. This lets the app delete the exact gallery original after import.
- Falls back to file-descriptor size when the picker does not report `fileSize`.
- Adds an opt-in `preferRemovingOriginal` option and an `originalRemovedNatively` result field, matching iOS and TypeScript type additions. The current app code does not pass `preferRemovingOriginal`, so the native delete fallback stays inactive.

---

## Tech stack

| Area | Library | Version |
|---|---|---|
| Runtime | Expo SDK | 54.0.33 |
| | React Native (New Architecture enabled) | 0.81.5 |
| | React | 19.1.0 |
| | TypeScript | 5.9 |
| Navigation | Expo Router | 6.0.23 |
| Security | expo-secure-store | 15.0.8 |
| | expo-local-authentication | 17.0.8 |
| | expo-crypto | 15.0.8 |
| Files and media | expo-file-system (legacy API) | 19.0.21 |
| | expo-media-library | 18.2.1 |
| | expo-image-picker (patched) | 17.0.10 |
| | expo-document-picker | 14.0.8 |
| | expo-video / expo-audio | 3.0.x / 1.1.x |
| | expo-sharing, expo-intent-launcher | 14.0.x, 13.0.x |
| Backup | JSZip | 3.10.1 |
| UI | react-native-reanimated, expo-linear-gradient, expo-haptics, expo-image | 4.1.x, 15.0.x, 15.0.x, 3.0.x |
| Tooling | patch-package | 8.x |

---

## Getting started

### Prerequisites
- Node.js and npm
- For device builds: Android Studio with an Android SDK and emulator or device, and/or Xcode for iOS (macOS only)

### Install
```bash
git clone https://github.com/AttayR/SecureApp.git
cd SecureApp
npm install        # also runs patch-package (postinstall)
```

### Run
| Command | What it does |
|---|---|
| `npm run android` | `expo run:android`, a native build and run on Android |
| `npm run ios` | `expo run:ios`, a native build and run on iOS |
| `npm start` | `expo start`, the Metro dev server |

**Use a development build, not Expo Go.** The project patches native Android code in `expo-image-picker`. Those changes only exist in a native build compiled from this repo. The `android` and `ios` scripts use `expo run:*`, which generate the native projects and build them locally. The `/ios` and `/android` folders are git-ignored.

A `web` script exists from the Expo template. The app targets iOS and Android, and web is not a supported target: secure storage, biometrics and media features are native-only.

---

## Screenshots

Screenshots are not included in the repository yet.

---

## Author

**Attay Rasool**, [github.com/AttayR](https://github.com/AttayR)
