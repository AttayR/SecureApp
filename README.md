# AR Vault (SecureApp)

A private media and document vault for iOS and Android, built with React Native, Expo SDK 54 and Expo Router.

AR Vault keeps photos, videos, audio and documents in the app's private storage, behind a PIN and optional biometric unlock. On Android it can move photos and videos out of the system gallery, so the only remaining copy is inside the vault. It can back up and restore the whole vault as a ZIP file, or on Android as a plain folder. It also includes a PIN-gated launcher for other Android apps.

> **Security model in one sentence:** every vault file and the file list are encrypted with **AES-256-GCM** under a random vault key, which is locked by your PIN (**Argon2id**) and optionally by your biometrics. See [How the security works](#how-the-security-works).

---

## Features

### Security and authentication
- **Encryption at rest:** each file is encrypted with AES-256-GCM in 1 MiB chunks under its own random file key. The vault index (names, types, dates) is encrypted too.
- **PIN-locked vault key:** a random 256-bit vault key is wrapped with a key derived from the PIN by Argon2id (64 MiB, 3 passes). No PIN hash is stored; a wrong PIN simply fails to unwrap the key.
- **Biometric unlock that releases the key:** when turned on, a copy of the vault key is stored in the Keychain / Keystore behind biometric authentication (Face ID, Touch ID, fingerprint).
- **Wrong-PIN throttling:** after 5 wrong PINs, each further attempt waits longer (30 s, doubling, up to 1 hour). The wait survives restarts.
- **Change PIN:** re-wraps the vault key under the new PIN without re-encrypting files.
- New PINs need 6–12 digits.
- Auto-lock when the app goes to the background (on by default). Locking wipes the vault key from memory and deletes all decrypted view copies.
- The screen is covered whenever the app leaves the foreground, so the app switcher never shows vault content.
- Existing unencrypted vaults are encrypted automatically on the first unlock after updating.

### Storage and backup
- Vault files are stored encrypted in `documentDirectory/vault/` under generated file names.
- Import copies left by the system pickers in the app cache are deleted after the file is encrypted.
- Index writes go through a serialized queue, and a second encrypted copy of the index is kept as a fallback.
- **ZIP backup** (iOS and Android): the encrypted files, the encrypted index and the PIN-wrapped vault key, packed with JSZip and handed to the share sheet. The size limit is about 350 MB. The ZIP is deleted from the cache after sharing.
- **Folder backup** (Android): the same encrypted content written to a folder picked through the Storage Access Framework.
- **Restore:** a backup of the same vault restores directly. A backup made with another PIN or on another device asks for the PIN it was made with, then re-wraps each file key to the current vault key (only the 80-byte header of each file changes). Restores are staged and roll back if anything fails.
- Backups made by older, unencrypted versions can still be restored; their files are encrypted right after.

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

### Keys
```
PIN ──Argon2id(salt, 64 MiB, 3 passes)──▶ key-encryption key ──AES-256-GCM──▶ vault key (random, 256-bit)
                                                                                   │
Biometrics ──Keychain / Keystore item (requireAuthentication)──────────────────────┘
                                                                                   │
                                            per-file key (random) ◀──AES-256-GCM──┘
```
- `lib/crypto/keyStore.ts` creates the vault key with a secure random generator, wraps it under the PIN, and stores the wrapped key in `expo-secure-store` (`WHEN_UNLOCKED_THIS_DEVICE_ONLY`).
- Unlocking with the PIN re-derives the key-encryption key and opens the wrapped key. The GCM tag check is what rejects a wrong PIN.
- With biometrics on, a second copy of the vault key is stored with `requireAuthentication: true` (`WHEN_PASSCODE_SET_THIS_DEVICE_ONLY`). The OS only releases it after a successful biometric check. If the enrolled biometrics change, the OS invalidates it; the app turns biometrics off and asks for the PIN.
- While unlocked, the vault key exists only in memory. It is zeroed on lock.

### Files (format `ARV1`)
- Every file has its own random 256-bit key, stored in an 80-byte header wrapped by the vault key.
- Content is split into 1 MiB chunks, each sealed with AES-256-GCM. The chunk index, an "is last" flag and the header (including the original length) are authenticated with every chunk, so changed, reordered, dropped or truncated data fails to decrypt.
- Large files are streamed with `expo-file-system` file handles, so they never have to fit in memory.

### What is stored where

| Data | Location | Protection |
|---|---|---|
| Wrapped vault key, Argon2id parameters and salt | `expo-secure-store` | Encrypted by the PIN, inside the Keychain / Keystore |
| Biometric copy of the vault key (optional) | `expo-secure-store` | Released only after biometric authentication |
| Wrong-PIN counter, biometric and auto-lock settings, last unlock time | `expo-secure-store` | Keychain / Keystore |
| Vault files | `documentDirectory/vault/` | AES-256-GCM (`ARV1`) |
| Vault index and app shortcuts | `documentDirectory/vault-*.enc` | AES-256-GCM |
| Decrypted copies for viewing and sharing | `cacheDirectory/vault-view/` | Deleted on lock and at launch |
| ZIP and folder backups | Wherever you save them | Encrypted; restoring needs the PIN they were made with |
| "Remove originals from gallery" preference | AsyncStorage | None (not sensitive) |

### Limits worth knowing
- **The PIN is the secret.** Argon2id makes each guess expensive, but a short PIN can still be brute-forced offline if someone copies both the app data and the Keychain / Keystore item. Use a longer PIN for stronger protection. The wrong-PIN wait only applies inside the app.
- **A forgotten PIN cannot be recovered.** Without it (or a working biometric copy), the vault cannot be decrypted.
- **Plaintext exists while you look at it.** Viewing, sharing or releasing an item writes a temporary decrypted copy to the app cache. It is deleted when the vault locks or the app next launches, using a normal file delete.
- **Biometric unlock is as strong as the device's biometric and passcode security.**
- Items released to the gallery or shared to other apps leave the vault's protection.
- Android cloud backup of the app's data is turned off (`allowBackup: false`).

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
AuthContext ──▶ lib/crypto/keyStore (Argon2id, AES-GCM, expo-secure-store) + expo-local-authentication
vaultStore / viewCache ──▶ lib/crypto/fileCipher (ARV1 streaming encryption)
```

### Project layout

| Path | Purpose |
|---|---|
| `app/` | Expo Router routes (typed routes enabled) |
| `components/VaultAuthScreens.tsx` | PIN setup and unlock screens, biometric auto-prompt |
| `components/VaultItemList.tsx`, `PhotoGalleryGrid.tsx` | List and grid views with search filtering and delete |
| `components/VaultChrome.tsx`, `VaultLuxuryBackground.tsx`, `VaultSearchBar.tsx` | Shared UI chrome |
| `constants/vaultTheme.ts` | Color tokens and gradients |
| `contexts/AuthContext.tsx` | Unlock with PIN or biometrics, migration of old vaults, change PIN, auto-lock |
| `hooks/useVaultItems.ts`, `useVaultStats.ts` | Load items or per-category counts on screen focus |
| `lib/vaultStore.ts` | Encrypted vault directory and index, add and delete, migration of plaintext files |
| `lib/vaultBackup.ts` | Encrypted ZIP and Android folder backups, restore with key re-wrapping and rollback |
| `lib/mediaLibraryMove.ts` | Copies MediaLibrary assets into the vault, then deletes the originals |
| `lib/galleryVault.ts` | Gallery delete helpers and "release to gallery" |
| `lib/crypto/primitives.ts` | AES-256-GCM seal/open, Argon2id key derivation, random bytes |
| `lib/crypto/keyStore.ts` | Vault key creation, PIN and biometric wrapping, wrong-PIN throttling |
| `lib/crypto/fileCipher.ts` | `ARV1` streaming file encryption, header re-wrapping, encrypted index blobs |
| `lib/crypto/viewCache.ts` | Temporary decrypted copies for viewing, wiped on lock |
| `lib/pin.ts` | Checks the old SHA-256 PIN hash once, when upgrading an unencrypted vault |
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
| Security | react-native-quick-crypto (AES-256-GCM, Argon2id) | 1.1.x |
| | expo-secure-store | 15.0.8 |
| | expo-local-authentication | 17.0.8 |
| | expo-crypto (legacy PIN check only) | 15.0.8 |
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
