//! Delta-OTA update module (O1-02 skeleton): channel pointer + build manifest
//! contracts, minisign (Ed25519) signature verification and sha256 per-file
//! verification.
//!
//! Contracts mirror `packages/core/src/update/index.ts` — the single source of
//! truth for the update system (see docs/updates.md). The native layer owns
//! verification and NEVER degrades it to a warning: a manifest whose signature
//! does not verify, or a file whose sha256 mismatches, is hostile input and
//! stops the update flow (the update is aborted, never "installed anyway").
//!
//! Fetching uses `ureq` (blocking, std-only) as sanctioned by the O1-02 brief
//! ("ureq or use plugin http"); https is enforced before every request,
//! mirroring `assertHttps` in the core contract. A/B slot download and the
//! atomic pointer file are O1-03; boot-confirm rollback is O1-05.
//!
//! Rust-only deps (`minisign-verify`, `sha2`, `ureq`) are requested in
//! docs/SHARED_CHANGES.md — `Cargo.toml` is a LEAD-owned shared file.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::fmt;
use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::LazyLock;
use std::time::Duration;

/// Blocking HTTP agent shared by all update fetches (30s timeout).
static AGENT: LazyLock<ureq::Agent> = LazyLock::new(|| {
    ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(10))
        .timeout(Duration::from_secs(30))
        .build()
});

// ─── Contracts (mirror packages/core/src/update/index.ts) ────────────────────

/// Release channels, most-to-least volatile: `nightly` → `beta` → `stable`.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UpdateChannel {
    Nightly,
    Beta,
    Stable,
}

impl UpdateChannel {
    /// Pointer document name for the channel (`nightly.json`, …).
    pub fn pointer_file(&self) -> &'static str {
        match self {
            UpdateChannel::Nightly => "nightly.json",
            UpdateChannel::Beta => "beta.json",
            UpdateChannel::Stable => "stable.json",
        }
    }
}

/// One file inside a content-addressed manifest (`updateFileSchema`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateFile {
    /// Repo-root-relative path within the `.next-tauri` export.
    pub path: String,
    /// sha256 of the file bytes, lowercase hex — the content address.
    pub sha256: String,
    /// File size in bytes.
    pub size: u64,
}

/// One delta patch entry (`updatePatchSchema`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePatch {
    /// Version the patch applies from; must equal the installed version.
    pub from_version: String,
    /// https URL of the patch artifact on the release.
    pub url: String,
    /// sha256 of the patch artifact bytes, lowercase hex.
    pub sha256: String,
    /// Patch artifact size in bytes.
    pub size: u64,
}

/// The content-addressed build manifest (`updateManifestSchema`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateManifest {
    /// Manifest contract version — the client refuses anything but 1.
    pub manifest_version: u8,
    /// Channel this build was published to.
    pub channel: UpdateChannel,
    /// Semver-ish build version (see `compare_versions` in the core contract).
    pub version: String,
    /// Git commit the build was produced from.
    pub build_sha: String,
    /// RFC 3339 publication timestamp.
    pub created_at: String,
    /// Minimum native shell version this web build runs against.
    pub min_native_version: String,
    /// True when a new installer/APK is required (not a web-only hot update).
    pub requires_native: bool,
    /// Content-addressed file list of the `.next-tauri` export.
    pub files: Vec<UpdateFile>,
    /// Delta patches from up to the 5 most recent previous versions.
    #[serde(default)]
    pub patches: Vec<UpdatePatch>,
    /// https URL of the full package — the patch fallback.
    pub full_package_url: String,
}

/// The per-channel pointer document (`updatePointerSchema`).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePointer {
    /// Channel the pointer belongs to.
    pub channel: UpdateChannel,
    /// Current version on the channel.
    pub version: String,
    /// https URL of the signed manifest for this build.
    pub manifest_url: String,
    /// RFC 3339 timestamp of when the pointer was published.
    pub published_at: String,
    /// Optional human-facing release notes for the banner/changelog panel.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

// ─── Errors ──────────────────────────────────────────────────────────────────

/// Everything that can go wrong while consuming the update feed.
#[derive(Debug)]
pub enum UpdateError {
    /// Fetch failed (network, timeout, non-2xx) or the URL was not https.
    Network(String),
    /// A document did not match its contract (serde parse or version guard).
    Parse(String),
    /// Minisign signature did not verify against the committed public key.
    Signature(String),
    /// A sha256 digest did not match the manifest's content address.
    Hash(String),
    /// The operation was refused by policy (e.g. Max Focus session active).
    Refused(String),
    /// An argument was malformed before any I/O happened.
    InvalidInput(String),
}

impl fmt::Display for UpdateError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            UpdateError::Network(m) => write!(f, "update network error: {m}"),
            UpdateError::Parse(m) => write!(f, "update document parse error: {m}"),
            UpdateError::Signature(m) => write!(f, "update signature error: {m}"),
            UpdateError::Hash(m) => write!(f, "update hash error: {m}"),
            UpdateError::Refused(m) => write!(f, "update refused: {m}"),
            UpdateError::InvalidInput(m) => write!(f, "update input error: {m}"),
        }
    }
}

impl std::error::Error for UpdateError {}

// ─── Parse (contract guards) ─────────────────────────────────────────────────

/// Parses a pointer document (`nightly.json`). No signature: the pointer is a
/// convenience locator; the manifest it names is the security boundary.
pub fn parse_pointer(json: &str) -> Result<UpdatePointer, UpdateError> {
    serde_json::from_str(json).map_err(|e| UpdateError::Parse(format!("pointer: {e}")))
}

/// Parses a manifest document (`manifest.json`) and enforces the contract
/// version guard: the client understands exactly `manifestVersion: 1`.
pub fn parse_manifest(json: &str) -> Result<UpdateManifest, UpdateError> {
    let manifest: UpdateManifest =
        serde_json::from_str(json).map_err(|e| UpdateError::Parse(format!("manifest: {e}")))?;
    if manifest.manifest_version != 1 {
        return Err(UpdateError::Parse(format!(
            "unsupported manifestVersion {} (client supports 1)",
            manifest.manifest_version
        )));
    }
    Ok(manifest)
}

// ─── Fetch (https-only) ──────────────────────────────────────────────────────

/// Rejects anything that is not an absolute `https://` URL (core design law).
/// Deliberately dependency-free: the host must be non-empty and free of
/// whitespace; `ureq` performs full URL parsing afterwards and fails closed.
fn assert_https(url: &str) -> Result<(), UpdateError> {
    let rest = match url.strip_prefix("https://") {
        Some(rest) => rest,
        None => {
            return Err(UpdateError::InvalidInput(format!(
                "update URL must be absolute https: {url}"
            )))
        }
    };
    let host = rest.split(['/', '?', '#']).next().unwrap_or("");
    if host.is_empty() || host.contains(char::is_whitespace) {
        return Err(UpdateError::InvalidInput(format!(
            "update URL has no usable host: {url}"
        )));
    }
    Ok(())
}

/// GETs a UTF-8 document over https only.
fn http_get(url: &str) -> Result<String, UpdateError> {
    assert_https(url)?;
    let response = AGENT
        .get(url)
        .call()
        .map_err(|e| UpdateError::Network(e.to_string()))?;
    response
        .into_string()
        .map_err(|e| UpdateError::Network(format!("body read failed: {e}")))
}

/// Fetches the channel pointer from `{base_url}/{channel}.json`
/// (e.g. `https://…/releases/latest/nightly.json`).
pub fn fetch_pointer(base_url: &str, channel: UpdateChannel) -> Result<UpdatePointer, UpdateError> {
    let base = base_url.trim_end_matches('/');
    let pointer = parse_pointer(&http_get(&format!("{base}/{}", channel.pointer_file()))?)?;
    if pointer.channel != channel {
        return Err(UpdateError::Parse(format!(
            "pointer channel {:?} does not match requested {:?}",
            pointer.channel, channel
        )));
    }
    Ok(pointer)
}

/// Fetches the signed manifest (`manifest_url`) plus its sidecar signature
/// (`{manifest_url}.sig`, the base64 minisign signature blob).
pub fn fetch_manifest(manifest_url: &str) -> Result<(UpdateManifest, String), UpdateError> {
    let manifest = parse_manifest(&http_get(manifest_url)?)?;
    let signature = http_get(&format!("{manifest_url}.sig"))?;
    let signature = signature.trim().to_string();
    if signature.is_empty() {
        return Err(UpdateError::Signature("empty manifest signature".into()));
    }
    Ok((manifest, signature))
}

// ─── Verification ────────────────────────────────────────────────────────────

/// Verifies a minisign (Ed25519) signature over `data`.
///
/// `pub_key_b64` is the base64 blob `"Ed" || raw 32-byte public key` (committed
/// to the repo / tauri.conf.json, O1-09); `signature_b64` is the base64 blob
/// `"Ed" || u64be(trailer_len) || 64-byte signature || trusted comment` as
/// produced by `minisign` and the nightly CI signer (O1-08).
pub fn verify_minisign(
    pub_key_b64: &str,
    signature_b64: &str,
    data: &[u8],
) -> Result<(), UpdateError> {
    let pk = minisign_verify::PublicKey::from_base64(pub_key_b64.trim())
        .map_err(|e| UpdateError::InvalidInput(format!("public key: {e}")))?;
    let sig = minisign_verify::Signature::from_base64(signature_b64.trim())
        .map_err(|e| UpdateError::Signature(format!("signature blob: {e}")))?;
    if sig.verify(&pk, data) {
        Ok(())
    } else {
        Err(UpdateError::Signature(
            "minisign signature did not verify — treating the document as hostile".into(),
        ))
    }
}

/// Verifies the manifest signature over the EXACT bytes that were fetched —
/// the canonical `manifest.json` bytes, not a re-serialization.
pub fn verify_manifest_signature(
    manifest_json_bytes: &[u8],
    signature_b64: &str,
    pub_key_b64: &str,
) -> Result<(), UpdateError> {
    verify_minisign(pub_key_b64, signature_b64, manifest_json_bytes)
}

/// Lowercase-hex sha256 of `data`.
pub fn hash_hex(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    to_hex(&digest)
}

/// Verifies `data` against the manifest's lowercase-hex sha256 content address.
pub fn verify_file_hash(data: &[u8], expected_sha256: &str) -> Result<(), UpdateError> {
    if !is_valid_sha256(expected_sha256) {
        return Err(UpdateError::InvalidInput(format!(
            "malformed sha256 in manifest: {expected_sha256:?}"
        )));
    }
    let actual = hash_hex(data);
    if actual == expected_sha256 {
        Ok(())
    } else {
        Err(UpdateError::Hash(format!(
            "sha256 mismatch: expected {expected_sha256}, got {actual}"
        )))
    }
}

/// True when `s` is exactly 64 lowercase hex characters.
fn is_valid_sha256(s: &str) -> bool {
    s.len() == 64 && s.bytes().all(|b| b.is_ascii_digit() || (b'a'..=b'f').contains(&b))
}

/// Byte → lowercase hex.
fn to_hex(bytes: &[u8]) -> String {
    let mut out = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        out.push(char::from_digit((b >> 4) as u32, 16).unwrap_or('0'));
        out.push(char::from_digit((b & 0x0f) as u32, 16).unwrap_or('0'));
    }
    out
}

// ─── A/B slots (O1-03) ───────────────────────────────────────────────────────
//
// The web payload lives in two sibling slots under
// `<app_data_dir>/updates/`:
//
//   slots/slot-a/…           ← full `.next-tauri` export of one build
//   slots/slot-b/…           ← the other build
//   slot-pointer.json        ← `{ "active": "slot-a" }` — THE switch
//
// Downloads always target the INACTIVE slot; the pointer is flipped with a
// tmp+rename atomic write only after a slot is complete and hash-verified.
// A crash can therefore leave a stale inactive slot, never a half-written
// active one. Serving the active slot over a custom URI scheme is O1-04;
// boot-confirm rollback (O1-05) lives in {@link boot_reconcile} below.

/// How many consecutive boots the ACTIVE slot may start WITHOUT the webview
/// confirming ready before it is declared broken and rolled back. Three gives
/// a flaky-but-recoverable shell two extra chances before reverting.
pub const MAX_BOOT_MISSES: u32 = 3;

/// The two install slots.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SlotId {
    /// First slot — also the implicit default on first run (the bundled app).
    #[serde(rename = "slot-a")]
    A,
    /// Second slot.
    #[serde(rename = "slot-b")]
    B,
}

impl SlotId {
    /// The other slot (A ↔ B).
    pub fn other(self) -> SlotId {
        match self {
            SlotId::A => SlotId::B,
            SlotId::B => SlotId::A,
        }
    }

    /// Directory name inside `slots/`.
    pub fn dir_name(self) -> &'static str {
        match self {
            SlotId::A => "slot-a",
            SlotId::B => "slot-b",
        }
    }
}

/// The atomic slot switch. Extra fields added later must keep parsing older
/// pointer files (serde ignores unknown fields; missing optionals default).
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotPointer {
    /// Slot the webview currently loads from.
    pub active: SlotId,
    /// RFC 3339 timestamp of the last flip (informational).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub updated_at: Option<String>,
    /// O1-05: consecutive boots the active slot started without the webview
    /// confirming ready. Reset to 0 by `confirm_boot_ready`; at
    /// `MAX_BOOT_MISSES` the pointer flips back to the previous slot.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub missed_confirmations: Option<u32>,
}

/// `<base>/slots/` — the two slot directories.
pub fn slots_root(base_dir: &Path) -> PathBuf {
    base_dir.join("slots")
}

/// `<base>/slot-pointer.json` — the atomic A/B switch file.
pub fn pointer_path(base_dir: &Path) -> PathBuf {
    base_dir.join("slot-pointer.json")
}

/// `<base>/slots/<slot>/` — one build's payload.
pub fn slot_dir(base_dir: &Path, slot: SlotId) -> PathBuf {
    slots_root(base_dir).join(slot.dir_name())
}

/// `<base>/slots/<slot>/manifest.json` — the EXACT signed manifest bytes of
/// the build in that slot (kept verbatim for future patch diffs, O1-19).
pub fn slot_manifest_path(base_dir: &Path, slot: SlotId) -> PathBuf {
    slot_dir(base_dir, slot).join("manifest.json")
}

/// Reads the pointer. A missing pointer file means first run: slot A is
/// active (the bundled payload is conceptually slot A).
pub fn read_pointer(base_dir: &Path) -> Result<SlotPointer, UpdateError> {
    match fs::read_to_string(pointer_path(base_dir)) {
        Ok(json) => serde_json::from_str(&json)
            .map_err(|e| UpdateError::Parse(format!("slot-pointer.json: {e}"))),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(SlotPointer {
            active: SlotId::A,
            updated_at: None,
            missed_confirmations: None,
        }),
        Err(e) => Err(UpdateError::Network(format!(
            "reading slot-pointer.json failed: {e}"
        ))),
    }
}

/// Atomically writes the pointer: serialize → write `<path>.tmp` → rename
/// over the target. `std::fs::rename` replaces an existing destination on
/// Windows (MoveFileEx + `MOVEFILE_REPLACE_EXISTING`), so readers on every
/// platform observe either the old or the new pointer — never a torn write.
pub fn write_pointer_atomic(base_dir: &Path, pointer: &SlotPointer) -> Result<(), UpdateError> {
    let json = serde_json::to_string_pretty(pointer)
        .map_err(|e| UpdateError::Parse(format!("serialize pointer: {e}")))?;
    let path = pointer_path(base_dir);
    let tmp = path.with_extension("json.tmp");
    fs::write(&tmp, json.as_bytes())
        .map_err(|e| UpdateError::Network(format!("writing pointer tmp file: {e}")))?;
    fs::rename(&tmp, &path).map_err(|e| UpdateError::Network(format!(
        "renaming pointer into place (atomic flip): {e}"
    )))?;
    Ok(())
}

/// Slot currently selected by the pointer (default A on first run).
pub fn active_slot(base_dir: &Path) -> Result<SlotId, UpdateError> {
    Ok(read_pointer(base_dir)?.active)
}

/// Slot downloads target — always the complement of the active slot.
pub fn inactive_slot(base_dir: &Path) -> Result<SlotId, UpdateError> {
    Ok(active_slot(base_dir)?.other())
}

/// Current slot occupancy, as reported by {@link list_current}.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SlotStatus {
    /// Slot the webview currently loads from.
    pub active: SlotId,
    /// The download target.
    pub inactive: SlotId,
    /// Version installed in the active slot (`None` = bundled first run).
    pub active_version: Option<String>,
    /// Version parked in the inactive slot (`None` = empty).
    pub inactive_version: Option<String>,
}

/// Lists the current A/B state: which slot is active and which versions are
/// installed where (read from each slot's stored `manifest.json`).
pub fn list_current(base_dir: &Path) -> Result<SlotStatus, UpdateError> {
    let active = active_slot(base_dir)?;
    let inactive = active.other();
    Ok(SlotStatus {
        active,
        inactive,
        active_version: slot_version(base_dir, active)?,
        inactive_version: slot_version(base_dir, inactive)?,
    })
}

/// Version of the build parked in `slot` (from its stored manifest), or
/// `None` when the slot has never been filled.
fn slot_version(base_dir: &Path, slot: SlotId) -> Result<Option<String>, UpdateError> {
    let path = slot_manifest_path(base_dir, slot);
    match fs::read_to_string(&path) {
        Ok(json) => Ok(Some(parse_manifest(&json)?.version)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(UpdateError::Parse(format!(
            "reading slot manifest {:?}: {e}",
            path
        ))),
    }
}

/// Derives the files base URL from a manifest URL: the release asset
/// directory the manifest was fetched from (CI uploads every payload file
/// next to `manifest.json`, see O1-08).
pub fn files_base_url(manifest_url: &str) -> Result<String, UpdateError> {
    match manifest_url.trim_end_matches('/').strip_suffix("/manifest.json") {
        Some(base) if !base.is_empty() => Ok(base.to_string()),
        _ => Err(UpdateError::InvalidInput(format!(
            "manifest URL does not end in /manifest.json: {manifest_url}"
        ))),
    }
}

/// Fetches one manifest file as raw bytes over https (release asset).
pub fn fetch_file_bytes(file_base_url: &str, file: &UpdateFile) -> Result<Vec<u8>, UpdateError> {
    let url = format!("{}/{}", file_base_url.trim_end_matches('/'), file.path);
    assert_https(&url)?;
    let response = AGENT
        .get(&url)
        .call()
        .map_err(|e| UpdateError::Network(format!("fetch {}: {e}", file.path)))?;
    // No capacity hint from the manifest: a hostile manifest could claim a
    // multi-GB size and force an allocation. read_to_end grows on demand.
    let mut bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| UpdateError::Network(format!("read {}: {e}", file.path)))?;
    Ok(bytes)
}

/// True when `path` is a safe relative path for a slot file: POSIX-style,
/// no absolute prefix, no `.`/`..`/empty segments, no backslashes. Manifest
/// paths come from the (signed) CI generator, but the slot writer still
/// refuses anything that could escape the slot directory.
fn is_unsafe_rel_path(path: &str) -> bool {
    path.is_empty()
        || path.starts_with('/')
        || path.starts_with('\\')
        || path.contains('\\')
        || path.split('/').any(|seg| seg.is_empty() || seg == "." || seg == "..")
}

/// Clears the INACTIVE slot and fills it with the manifest's files:
/// every file is fetched through `fetch_file`, hash-verified BEFORE it is
/// written, and placed at `slots/<slot>/<path>`. The exact (signed) manifest
/// bytes are stored as the slot's `manifest.json`.
///
/// The pointer is deliberately NOT touched here — a failed or interrupted
/// download can only leave a stale inactive slot, never poison the active
/// install. Flipping is an explicit `promote_inactive_slot` call.
pub fn download_to_inactive_slot<F>(
    base_dir: &Path,
    manifest: &UpdateManifest,
    manifest_bytes: &[u8],
    file_base_url: &str,
    fetch_file: F,
) -> Result<SlotId, UpdateError>
where
    F: Fn(&UpdateFile) -> Result<Vec<u8>, UpdateError>,
{
    assert_https(file_base_url)?;
    let slot = inactive_slot(base_dir)?;
    let dir = slot_dir(base_dir, slot);

    // Start the slot from scratch so a stale previous build can never leak
    // files into the new one.
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| UpdateError::Network(format!("clearing slot: {e}")))?;
    }
    fs::create_dir_all(&dir).map_err(|e| UpdateError::Network(format!("creating slot: {e}")))?;

    for file in &manifest.files {
        if is_unsafe_rel_path(&file.path) {
            return Err(UpdateError::InvalidInput(format!(
                "unsafe path in manifest: {:?}",
                file.path
            )));
        }
        let bytes = fetch_file(file)?;
        if bytes.len() as u64 != file.size {
            return Err(UpdateError::Hash(format!(
                "size mismatch for {}: manifest says {} bytes, got {}",
                file.path,
                file.size,
                bytes.len()
            )));
        }
        // Verify BEFORE writing: a tampered download never touches the disk.
        verify_file_hash(&bytes, &file.sha256)?;
        let dest = dir.join(&file.path);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| UpdateError::Network(format!("mkdir {}: {e}", file.path)))?;
        }
        fs::write(&dest, &bytes)
            .map_err(|e| UpdateError::Network(format!("write {}: {e}", file.path)))?;
    }

    // Keep the signed artifact verbatim — the slot's own manifest.
    fs::write(slot_manifest_path(base_dir, slot), manifest_bytes)
        .map_err(|e| UpdateError::Network(format!("write slot manifest: {e}")))?;
    Ok(slot)
}

/// Atomically flips the pointer to the INACTIVE slot (the one
/// `download_to_inactive_slot` just filled and verified). The new slot
/// starts with a fresh boot-confirm budget.
pub fn promote_inactive_slot(base_dir: &Path) -> Result<SlotId, UpdateError> {
    let next = inactive_slot(base_dir)?;
    write_pointer_atomic(
        base_dir,
        &SlotPointer {
            active: next,
            updated_at: None,
            missed_confirmations: Some(0),
        },
    )?;
    Ok(next)
}

// ─── Boot-confirm rollback (O1-05) ───────────────────────────────────────────

/// Called ONCE per app boot, before the webview loads: reconciles the
/// boot-confirm counter of the active slot.
///
/// - counter ≥ `MAX_BOOT_MISSES` → the active slot never confirmed ready on
///   `MAX_BOOT_MISSES` consecutive boots: it is declared broken and the
///   pointer flips BACK to the other slot (which holds the previously
///   confirmed build — downloads target the inactive slot and promotion
///   swaps roles). Counter resets; the broken slot becomes the next
///   download target, so the system self-heals.
/// - otherwise → counter increments: this boot is pending confirmation.
///
/// The webview invokes `update_confirm_boot_ready` once it is actually
/// serving, which resets the counter (`confirm_boot_ready`). Every write is
/// the atomic tmp+rename, so a crash mid-boot can never lose the counter.
pub fn boot_reconcile(base_dir: &Path) -> Result<SlotId, UpdateError> {
    let mut pointer = read_pointer(base_dir)?;
    let missed = pointer.missed_confirmations.unwrap_or(0);
    if missed >= MAX_BOOT_MISSES {
        let broken = pointer.active;
        pointer.active = broken.other();
        pointer.missed_confirmations = Some(0);
        write_pointer_atomic(base_dir, &pointer)?;
        log::warn!(
            "update: slot {:?} missed {} consecutive boot confirmations — rolled back to {:?}",
            broken,
            MAX_BOOT_MISSES,
            pointer.active
        );
        return Ok(pointer.active);
    }
    pointer.missed_confirmations = Some(missed + 1);
    write_pointer_atomic(base_dir, &pointer)?;
    log::info!(
        "update: boot on slot {:?} pending confirmation ({}/{} missed so far)",
        pointer.active,
        missed + 1,
        MAX_BOOT_MISSES
    );
    Ok(pointer.active)
}

/// The webview confirmed it is serving from the active slot. Resets the
/// boot-confirm counter (no-op write when it is already 0).
pub fn confirm_boot_ready(base_dir: &Path) -> Result<(), UpdateError> {
    let mut pointer = read_pointer(base_dir)?;
    if pointer.missed_confirmations.unwrap_or(0) != 0 {
        pointer.missed_confirmations = Some(0);
        write_pointer_atomic(base_dir, &pointer)?;
        log::info!("update: webview confirmed boot ready — counter reset");
    }
    Ok(())
}

// ─── Never-apply-during-Max-Focus (O1-06) ────────────────────────────────────

/// Whether a pending update may be applied (promote + restart) right now.
///
/// Locked policy: ask-first, apply on restart — and NEVER while a Max Focus
/// session is active (an apply swaps the webview payload under the lock and
/// can kill the session machinery mid-flight). The web layer reports session
/// liveness via the focus session commands (M2-23); this pure gate is the
/// Rust mirror of `updateApplyGate` in
/// `packages/core/src/focus-lock/session.ts`.
pub fn can_apply_update(session_active: bool) -> Result<(), UpdateError> {
    if session_active {
        Err(UpdateError::Refused(
            "Max Focus session is active — apply deferred until it ends".into(),
        ))
    } else {
        Ok(())
    }
}

/// `promote_inactive_slot` behind the O1-06 policy gate: refuses with the
/// pointer untouched while a Max Focus session is active.
pub fn promote_inactive_slot_if_allowed(
    base_dir: &Path,
    session_active: bool,
) -> Result<SlotId, UpdateError> {
    can_apply_update(session_active)?;
    promote_inactive_slot(base_dir)
}

// ─── Resumable ranged download (O1-16) ──────────────────────────────────────

/// What the server answered to a ranged GET.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RangeResponse {
    /// HTTP 206 — the server honored `Range:`; bytes continue the file.
    Partial(Vec<u8>),
    /// HTTP 200 — the server ignored `Range:` and returned the WHOLE file;
    /// the caller must restart from scratch.
    Full(Vec<u8>),
}

/// `Range:` header value to resume a download at byte `start` (open-ended to
/// EOF — the server sends the remainder, which we hash-verify in full).
pub fn range_header(start: u64) -> String {
    format!("bytes={start}-")
}

/// Bytes already on disk = the resume offset. A missing file means "start
/// over"; a stale/partial file means "continue at its length".
pub fn resume_offset(dest: &Path) -> u64 {
    fs::metadata(dest).map(|m| m.len()).unwrap_or(0)
}

/// Downloaded/total as a 0–100 percentage (saturating; totals of 0 report 100
/// only when downloaded is 0 — a 0-byte file is "done").
pub fn progress_percent(downloaded: u64, total: u64) -> u64 {
    if total == 0 {
        return 100;
    }
    ((downloaded.min(total) * 100) / total).min(100)
}

/// Performs the actual ranged GET for `download_resumable`. Production binds
/// this to `fetch_range_http`; tests inject in-memory responses.
pub trait RangeFetcher {
    /// Fetches the file bytes from `start` to EOF.
    fn fetch_range(&mut self, start: u64) -> Result<RangeResponse, UpdateError>;
}

/// HTTP ranged GET via the shared agent (https-only). Maps 206 →
/// `Partial`, 200 → `Full`; anything else is a network error.
pub fn fetch_range_http(url: &str, start: u64) -> Result<RangeResponse, UpdateError> {
    assert_https(url)?;
    let response = AGENT
        .get(url)
        .set("Range", &range_header(start))
        .call()
        .map_err(|e| UpdateError::Network(format!("ranged GET {url} @ {start}: {e}")))?;
    // Capture the status BEFORE consuming the body (into_reader moves it).
    let status = response.status();
    let mut bytes = Vec::new();
    response
        .into_reader()
        .read_to_end(&mut bytes)
        .map_err(|e| UpdateError::Network(format!("ranged GET body: {e}")))?;
    match status {
        206 => Ok(RangeResponse::Partial(bytes)),
        200 => Ok(RangeResponse::Full(bytes)),
        status => Err(UpdateError::Network(format!(
            "ranged GET {url}: unexpected status {status}"
        ))),
    }
}

/// Resumable, hash-verified single-file download.
///
/// Contract:
/// - resumes at {@link resume_offset} of `dest` (a hostile/stale partial
///   LARGER than `total` restarts from scratch);
/// - `206 Partial` appends the remainder; `200 Full` restarts from scratch
///   (some servers/CDNs strip `Range:`);
/// - the assembled file MUST match `expected_sha256` and `total` exactly, or
///   the whole thing errors out (nothing partial is ever left trusted —
///   callers treat a lingering partial as scratch space);
/// - progress is reported as `(downloaded, total)` pairs via `on_progress`,
///   with a final call at (total, total). The tauri command
///   `update_download_file` (lib.rs) bridges this onto the webview as
///   `update://download-progress` events.
pub fn download_resumable<P>(
    dest: &Path,
    total: u64,
    expected_sha256: &str,
    mut on_progress: P,
    fetcher: &mut dyn RangeFetcher,
) -> Result<(), UpdateError>
where
    P: FnMut(u64, u64),
{
    let mut start = resume_offset(dest);
    if start > total {
        // Stale partial from a previous, different download — scratch it.
        fs::write(dest, b"").map_err(|e| UpdateError::Network(format!("truncate {dest:?}: {e}")))?;
        start = 0;
    }
    on_progress(start, total);

    match fetcher.fetch_range(start)? {
        RangeResponse::Partial(rest) => {
            if start + rest.len() as u64 != total {
                return Err(UpdateError::Hash(format!(
                    "ranged download size mismatch: had {start}, got {} more, total {total}",
                    rest.len()
                )));
            }
            use std::io::Write;
            let mut file = fs::OpenOptions::new()
                .append(true)
                .create(true)
                .open(dest)
                .map_err(|e| UpdateError::Network(format!("open {dest:?}: {e}")))?;
            file.write_all(&rest)
                .map_err(|e| UpdateError::Network(format!("append {dest:?}: {e}")))?;
        }
        RangeResponse::Full(all) => {
            if all.len() as u64 != total {
                return Err(UpdateError::Hash(format!(
                    "full download size mismatch: got {} bytes, manifest says {total}",
                    all.len()
                )));
            }
            fs::write(dest, &all)
                .map_err(|e| UpdateError::Network(format!("write {dest:?}: {e}")))?;
        }
    }

    on_progress(total, total);
    let assembled = fs::read(dest)
        .map_err(|e| UpdateError::Network(format!("read {dest:?}: {e}")))?;
    verify_file_hash(&assembled, expected_sha256)
}

/// Convenience wrapper over {@link download_resumable} for `fetch_range_http`.
pub fn download_resumable_http<P>(
    dest: &Path,
    url: &str,
    total: u64,
    expected_sha256: &str,
    on_progress: P,
) -> Result<(), UpdateError>
where
    P: FnMut(u64, u64),
{
    let url = url.to_string();
    let mut fetcher = HttpRangeFetcher { url };
    download_resumable(dest, total, expected_sha256, on_progress, &mut fetcher)
}

/// {@link RangeFetcher} backed by the shared https agent.
struct HttpRangeFetcher {
    url: String,
}

impl RangeFetcher for HttpRangeFetcher {
    fn fetch_range(&mut self, start: u64) -> Result<RangeResponse, UpdateError> {
        fetch_range_http(&self.url, start)
    }
}

// ─── Hot-patch application (O1-19) ───────────────────────────────────────────

/// Applies a hot-patch bundle (the zip of CHANGED files emitted by
/// `scripts/update-manifest.mjs`, O1-07) plus the target manifest into the
/// INACTIVE slot, returning the slot id. The pointer is not touched —
/// promotion stays an explicit, gated (`O1-06`) flip.
///
/// Fill order, then reconciliation:
/// 1. the inactive slot is cleared (deletions between versions are handled
///    by this — no stale file can survive into the new slot);
/// 2. UNCHANGED files (same path + sha256 + size in `installed` and
///    `target`) are copied from the ACTIVE slot — zero bandwidth;
/// 3. every patch zip entry is verified against the TARGET manifest (path
///    listed, size + sha256 match) BEFORE it is written;
/// 4. any target file with no source (neither unchanged nor in the patch)
///    is a hard error — a truncated bundle can never yield a half-updated
///    slot.
///
/// Callers must verify the patch bundle's OWN sha256 against the
/// `target.patches` entry (via {@link verify_file_hash}) and the manifest's
/// signature before invoking this.
pub fn apply_patch_bundle(
    base_dir: &Path,
    installed: &UpdateManifest,
    target: &UpdateManifest,
    manifest_bytes: &[u8],
    patch_bytes: &[u8],
) -> Result<SlotId, UpdateError> {
    let slot = inactive_slot(base_dir)?;
    let dir = slot_dir(base_dir, slot);
    if dir.exists() {
        fs::remove_dir_all(&dir).map_err(|e| UpdateError::Network(format!("clearing slot: {e}")))?;
    }
    fs::create_dir_all(&dir).map_err(|e| UpdateError::Network(format!("creating slot: {e}")))?;

    let mut handled: std::collections::HashSet<String> = std::collections::HashSet::new();

    // 2. Zero-bandwidth reuse of unchanged files from the active slot.
    let active_dir = slot_dir(base_dir, active_slot(base_dir)?);
    for file in &target.files {
        if let Some(prev) = installed.files.iter().find(|f| f.path == file.path) {
            if prev.sha256 == file.sha256 && prev.size == file.size {
                let src = active_dir.join(&file.path);
                let dest = dir.join(&file.path);
                if let Some(parent) = dest.parent() {
                    fs::create_dir_all(parent)
                        .map_err(|e| UpdateError::Network(format!("mkdir {}: {e}", file.path)))?;
                }
                fs::copy(&src, &dest).map_err(|e| {
                    UpdateError::Parse(format!(
                        "unchanged file {} missing from active slot: {e}",
                        file.path
                    ))
                })?;
                handled.insert(file.path.clone());
            }
        }
    }

    // 3. Patch entries — verify against the target manifest, then write.
    let reader = std::io::Cursor::new(patch_bytes);
    let mut archive = zip::ZipArchive::new(reader)
        .map_err(|e| UpdateError::Parse(format!("patch bundle: {e}")))?;
    for i in 0..archive.len() {
        let mut entry = archive
            .by_index(i)
            .map_err(|e| UpdateError::Parse(format!("patch entry {i}: {e}")))?;
        let name = entry.name().to_string();
        if is_unsafe_rel_path(&name) {
            return Err(UpdateError::InvalidInput(format!(
                "unsafe path in patch bundle: {name:?}"
            )));
        }
        let target_file = target
            .files
            .iter()
            .find(|f| f.path == name)
            .ok_or_else(|| {
                UpdateError::Parse(format!(
                    "patch contains {name:?} which is not in the target manifest"
                ))
            })?;
        let mut bytes = Vec::new();
        entry
            .read_to_end(&mut bytes)
            .map_err(|e| UpdateError::Parse(format!("patch entry {name}: {e}")))?;
        if bytes.len() as u64 != target_file.size {
            return Err(UpdateError::Hash(format!(
                "patch file {name}: got {} bytes, manifest says {}",
                bytes.len(),
                target_file.size
            )));
        }
        verify_file_hash(&bytes, &target_file.sha256)?;
        let dest = dir.join(&name);
        if let Some(parent) = dest.parent() {
            fs::create_dir_all(parent)
                .map_err(|e| UpdateError::Network(format!("mkdir {name}: {e}")))?;
        }
        fs::write(&dest, &bytes)
            .map_err(|e| UpdateError::Network(format!("write {name}: {e}")))?;
        handled.insert(name);
    }

    // 4. Every target file must have had a source.
    for file in &target.files {
        if !handled.contains(&file.path) {
            return Err(UpdateError::Parse(format!(
                "no source for {}: neither unchanged in the active slot nor present in the patch bundle",
                file.path
            )));
        }
    }

    // The signed manifest rides along verbatim.
    fs::write(slot_manifest_path(base_dir, slot), manifest_bytes)
        .map_err(|e| UpdateError::Network(format!("write slot manifest: {e}")))?;
    Ok(slot)
}

/// Bytes of `rel_path` inside the ACTIVE slot — the serving seam used by the
/// custom URI-scheme protocol (O1-04, `serve_slot_protocol` in `lib.rs`).
///
/// Returns `None` when there is no pointer, the slot has never been filled,
/// the path is unsafe, or the file does not exist — every one of those cases
/// means "fall back to the bundled assets", not "error out the webview".
pub fn lookup_in_active_slot(base_dir: &Path, rel_path: &str) -> Option<Vec<u8>> {
    if is_unsafe_rel_path(rel_path) {
        return None;
    }
    let slot = active_slot(base_dir).ok()?;
    fs::read(slot_dir(base_dir, slot).join(rel_path)).ok()
}

// ─── Tests (known-key fixture, no network) ───────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    /// Exact `manifest.json` bytes of the fixture (2-space indented JSON).
    const FIXTURE_MANIFEST: &str = r#"{
  "manifestVersion": 1,
  "channel": "nightly",
  "version": "nightly-20261122-abc1234",
  "buildSha": "abc1234",
  "createdAt": "2026-11-22T10:00:00.000Z",
  "minNativeVersion": "0.1.0",
  "requiresNative": false,
  "files": [
    {
      "path": "index.html",
      "sha256": "0000000000000000000000000000000000000000000000000000000000000000",
      "size": 1024
    }
  ],
  "patches": [],
  "fullPackageUrl": "https://github.com/learning-hub/releases/download/nightly-20261122-abc1234/app.zip"
}"#;

    /// Minisign public-key blob for the fixture keypair ("Ed" || raw key).
    const FIXTURE_PK: &str = "RWQBMFmgKUfGYa5XZBkjDcVZyj2mPqGIe5UT40U2XR2SdQ==";

    /// Minisign signature blob over FIXTURE_MANIFEST bytes with trusted
    /// comment "trusted comment: fixture" (generated once with the fixture
    /// private key; see docs/updates.md key ceremony).
    const FIXTURE_SIG: &str = "RWQAAAAAAAAAGH3P1tG32SvdG3PYfXLI9FoK6fNG7kOvUBrnttGwV5yBS5cD+aPek9i5ZI8nnWV6mxC3/5bgr19D3Tcdjof7hAF0cnVzdGVkIGNvbW1lbnQ6IGZpeHR1cmU=";

    /// sha256 of FIXTURE_MANIFEST bytes (lowercase hex).
    const FIXTURE_SHA: &str = "fe9915390cf041ef51e75e9ad54c3f36441a869c06f196d90efce82c609cbec6";

    #[test]
    fn parses_pointer_contract() {
        let json = r#"{
          "channel": "nightly",
          "version": "nightly-20261122-abc1234",
          "manifestUrl": "https://example.com/manifest.json",
          "publishedAt": "2026-11-22T10:00:00.000Z",
          "notes": "hello"
        }"#;
        let pointer = parse_pointer(json).expect("pointer parses");
        assert_eq!(pointer.channel, UpdateChannel::Nightly);
        assert_eq!(pointer.version, "nightly-20261122-abc1234");
        assert_eq!(pointer.manifest_url, "https://example.com/manifest.json");
        assert_eq!(pointer.notes.as_deref(), Some("hello"));
    }

    #[test]
    fn parses_manifest_contract_and_enforces_version_guard() {
        let manifest = parse_manifest(FIXTURE_MANIFEST).expect("manifest parses");
        assert_eq!(manifest.manifest_version, 1);
        assert_eq!(manifest.files.len(), 1);
        assert_eq!(manifest.files[0].path, "index.html");
        assert!(manifest.patches.is_empty());

        let v2 = FIXTURE_MANIFEST.replace("\"manifestVersion\": 1", "\"manifestVersion\": 2");
        assert!(matches!(parse_manifest(&v2), Err(UpdateError::Parse(_))));
    }

    #[test]
    fn verifies_known_key_signature() {
        verify_manifest_signature(FIXTURE_MANIFEST.as_bytes(), FIXTURE_SIG, FIXTURE_PK)
            .expect("fixture signature must verify");
    }

    #[test]
    fn rejects_tampered_manifest() {
        let tampered = FIXTURE_MANIFEST.replace("nightly-20261122-abc1234", "nightly-20261122-ffff000");
        assert!(matches!(
            verify_manifest_signature(tampered.as_bytes(), FIXTURE_SIG, FIXTURE_PK),
            Err(UpdateError::Signature(_))
        ));
    }

    #[test]
    fn rejects_wrong_public_key() {
        // A different valid Ed25519 minisign public key must not verify.
        let other_pk = "RWQ83hYRbi91uaoqDeWgeYO7JwIGRoovTs9wY1xR/jtePA==";
        assert!(matches!(
            verify_manifest_signature(FIXTURE_MANIFEST.as_bytes(), FIXTURE_SIG, other_pk),
            Err(UpdateError::Signature(_))
        ));
    }

    #[test]
    fn verifies_and_rejects_file_hashes() {
        let data = FIXTURE_MANIFEST.as_bytes();
        verify_file_hash(data, FIXTURE_SHA).expect("hash must match");
        assert!(matches!(
            verify_file_hash(data, &"0".repeat(64)),
            Err(UpdateError::Hash(_))
        ));
        // Malformed digests are invalid input, not hash mismatches.
        assert!(matches!(
            verify_file_hash(data, &FIXTURE_SHA.to_uppercase()),
            Err(UpdateError::InvalidInput(_))
        ));
        assert!(matches!(
            verify_file_hash(data, "abc"),
            Err(UpdateError::InvalidInput(_))
        ));
    }

    #[test]
    fn hash_hex_is_lowercase_sha256() {
        assert_eq!(hash_hex(b""), "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
        assert_eq!(hash_hex(b"abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    }

    #[test]
    fn https_only_enforced_before_fetch() {
        assert!(assert_https("https://example.com/nightly.json").is_ok());
        assert!(assert_https("http://example.com/nightly.json").is_err());
        assert!(assert_https("file:///etc/passwd").is_err());
        assert!(assert_https("not a url").is_err());
    }

    #[test]
    fn pointer_file_names_match_channels() {
        assert_eq!(UpdateChannel::Nightly.pointer_file(), "nightly.json");
        assert_eq!(UpdateChannel::Beta.pointer_file(), "beta.json");
        assert_eq!(UpdateChannel::Stable.pointer_file(), "stable.json");
    }
}

// ─── A/B slot tests (O1-03) ──────────────────────────────────────────────────

#[cfg(test)]
mod slot_tests {
    use super::*;
    use std::sync::atomic::{AtomicUsize, Ordering};

    static TMP_COUNTER: AtomicUsize = AtomicUsize::new(0);

    /// Unique per-test base dir under the OS temp dir.
    fn temp_base() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lh-update-o1-03-{}-{}",
            std::process::id(),
            TMP_COUNTER.fetch_add(1, Ordering::Relaxed)
        ));
        fs::create_dir_all(&dir).expect("create temp base dir");
        dir
    }

    fn file_entry(path: &str, content: &[u8]) -> UpdateFile {
        UpdateFile {
            path: path.to_string(),
            sha256: hash_hex(content),
            size: content.len() as u64,
        }
    }

    fn test_manifest(files: Vec<UpdateFile>) -> (UpdateManifest, Vec<u8>) {
        let manifest = UpdateManifest {
            manifest_version: 1,
            channel: UpdateChannel::Nightly,
            version: "nightly-20261123-f00ba12".to_string(),
            build_sha: "f00ba12".to_string(),
            created_at: "2026-11-23T10:00:00.000Z".to_string(),
            min_native_version: "0.1.0".to_string(),
            requires_native: false,
            files,
            patches: vec![],
            full_package_url: "https://example.com/releases/app.zip".to_string(),
        };
        let bytes =
            serde_json::to_vec(&manifest).expect("serialize test manifest");
        (manifest, bytes)
    }

    #[test]
    fn pointer_defaults_to_slot_a_and_flips_atomically() {
        let base = temp_base();
        // First run: no pointer file — A active, B is the download target.
        assert_eq!(active_slot(&base).unwrap(), SlotId::A);
        assert_eq!(inactive_slot(&base).unwrap(), SlotId::B);
        // Flip — and flip again over an existing pointer (Windows rename path).
        assert_eq!(promote_inactive_slot(&base).unwrap(), SlotId::B);
        assert_eq!(active_slot(&base).unwrap(), SlotId::B);
        assert_eq!(promote_inactive_slot(&base).unwrap(), SlotId::A);
        // Atomic write leaves no tmp file behind.
        assert!(!pointer_path(&base).with_extension("json.tmp").exists());
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn download_fills_inactive_slot_and_list_current_reports_versions() {
        let base = temp_base();
        let (manifest, manifest_bytes) = test_manifest(vec![
            file_entry("index.html", b"<html>hi</html>"),
            file_entry("_next/static/app.js", b"console.log(1)"),
        ]);
        let slot = download_to_inactive_slot(
            &base,
            &manifest,
            &manifest_bytes,
            "https://example.com/rel",
            |f| {
                Ok(match f.path.as_str() {
                    "index.html" => b"<html>hi</html>".to_vec(),
                    _ => b"console.log(1)".to_vec(),
                })
            },
        )
        .expect("download succeeds");
        assert_eq!(slot, SlotId::B);
        assert!(slot_dir(&base, SlotId::B).join("index.html").exists());
        assert_eq!(
            fs::read(slot_dir(&base, SlotId::B).join("_next/static/app.js")).unwrap(),
            b"console.log(1)"
        );
        // The signed manifest is stored verbatim in the slot.
        assert_eq!(fs::read(slot_manifest_path(&base, SlotId::B)).unwrap(), manifest_bytes);
        // A download NEVER flips the pointer by itself.
        assert_eq!(active_slot(&base).unwrap(), SlotId::A);

        let status = list_current(&base).unwrap();
        assert_eq!(status.active, SlotId::A);
        assert_eq!(status.inactive, SlotId::B);
        assert_eq!(status.active_version, None);
        assert_eq!(
            status.inactive_version.as_deref(),
            Some("nightly-20261123-f00ba12")
        );

        // Promotion makes the new build current; the old slot becomes empty.
        assert_eq!(promote_inactive_slot(&base).unwrap(), SlotId::B);
        let status = list_current(&base).unwrap();
        assert_eq!(status.active_version.as_deref(), Some("nightly-20261123-f00ba12"));
        assert_eq!(status.inactive_version, None);
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn download_rejects_tampered_file_and_keeps_pointer() {
        let base = temp_base();
        let (manifest, manifest_bytes) = test_manifest(vec![file_entry("index.html", b"good")]);
        let err = download_to_inactive_slot(
            &base,
            &manifest,
            &manifest_bytes,
            "https://example.com/rel",
            |_| Ok(b"evil".to_vec()),
        )
        .unwrap_err();
        assert!(matches!(err, UpdateError::Hash(_)));
        // Pointer untouched, no slot manifest written on failure.
        assert_eq!(active_slot(&base).unwrap(), SlotId::A);
        assert!(!slot_manifest_path(&base, SlotId::B).exists());
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn download_rejects_size_mismatch() {
        let base = temp_base();
        let (manifest, manifest_bytes) = test_manifest(vec![UpdateFile {
            path: "a.txt".to_string(),
            sha256: hash_hex(b"good"),
            size: 4,
        }]);
        let err = download_to_inactive_slot(
            &base,
            &manifest,
            &manifest_bytes,
            "https://example.com/rel",
            |_| Ok(b"good!".to_vec()), // 5 bytes — manifest says 4
        )
        .unwrap_err();
        assert!(matches!(err, UpdateError::Hash(_)));
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn download_rejects_unsafe_paths() {
        let base = temp_base();
        for evil in ["../evil.txt", "/etc/passwd", "a\\b", "a//b", ""] {
            let (manifest, manifest_bytes) = test_manifest(vec![UpdateFile {
                path: evil.to_string(),
                sha256: hash_hex(b"x"),
                size: 1,
            }]);
            assert!(
                matches!(
                    download_to_inactive_slot(
                        &base,
                        &manifest,
                        &manifest_bytes,
                        "https://example.com/rel",
                        |_| Ok(b"x".to_vec()),
                    ),
                    Err(UpdateError::InvalidInput(_))
                ),
                "path {evil:?} must be rejected"
            );
        }
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn safe_rel_paths_are_accepted() {
        assert!(!is_unsafe_rel_path("_next/static/chunk.js"));
        assert!(!is_unsafe_rel_path("index.html"));
        assert!(is_unsafe_rel_path(".."));
        assert!(is_unsafe_rel_path("."));
        assert!(is_unsafe_rel_path("C:\\evil"));
    }

    #[test]
    fn files_base_url_strips_manifest_segment() {
        assert_eq!(
            files_base_url("https://example.com/rel/manifest.json").unwrap(),
            "https://example.com/rel"
        );
        assert!(files_base_url("https://example.com/other.json").is_err());
        assert!(files_base_url("http://example.com/manifest.json").is_err());
    }

    #[test]
    fn active_slot_lookup_serves_promoted_files_and_falls_back_to_none() {
        let base = temp_base();
        // First run: no slots on disk — every lookup falls back (None).
        assert_eq!(lookup_in_active_slot(&base, "index.html"), None);
        assert_eq!(lookup_in_active_slot(&base, "../escape"), None);

        let (manifest, manifest_bytes) = test_manifest(vec![file_entry("index.html", b"slotted")]);
        download_to_inactive_slot(
            &base,
            &manifest,
            &manifest_bytes,
            "https://example.com/rel",
            |_| Ok(b"slotted".to_vec()),
        )
        .unwrap();
        // Still bundled (download targets the INACTIVE slot): None.
        assert_eq!(lookup_in_active_slot(&base, "index.html"), None);
        // After promotion the active slot serves the new bytes.
        promote_inactive_slot(&base).unwrap();
        assert_eq!(
            lookup_in_active_slot(&base, "index.html"),
            Some(b"slotted".to_vec())
        );
        assert_eq!(lookup_in_active_slot(&base, "missing.html"), None);
        assert_eq!(lookup_in_active_slot(&base, "../evil"), None);
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn boot_counter_increments_and_rolls_back_after_max_misses() {
        let base = temp_base();
        // Boot 1..=MAX_BOOT_MISSES increment the counter, staying on slot A.
        for expected in 1..=MAX_BOOT_MISSES {
            assert_eq!(boot_reconcile(&base).unwrap(), SlotId::A);
            let pointer = read_pointer(&base).unwrap();
            assert_eq!(pointer.missed_confirmations, Some(expected));
        }
        // One more broken boot — the pointer flips BACK to slot B, counter reset.
        assert_eq!(boot_reconcile(&base).unwrap(), SlotId::B);
        let pointer = read_pointer(&base).unwrap();
        assert_eq!(pointer.active, SlotId::B);
        assert_eq!(pointer.missed_confirmations, Some(0));
        // The broken slot becomes the next download target (self-healing).
        assert_eq!(inactive_slot(&base).unwrap(), SlotId::A);
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn pointer_atomicity_survives_a_crash_leftover_tmp_file() {
        let base = temp_base();
        // Committed pointer says B (a previous promotion).
        write_pointer_atomic(
            &base,
            &SlotPointer { active: SlotId::B, updated_at: None, missed_confirmations: Some(0) },
        )
        .unwrap();
        // Simulate a crash mid-write: a stale .tmp full of garbage next to it.
        let tmp = pointer_path(&base).with_extension("json.tmp");
        fs::write(&tmp, b"{ \"active\": \"slot-a\" // torn write").unwrap();

        // Readers only ever consult the committed pointer — never the tmp.
        assert_eq!(read_pointer(&base).unwrap().active, SlotId::B);
        // And the next atomic write replaces BOTH the pointer and the tmp.
        write_pointer_atomic(
            &base,
            &SlotPointer { active: SlotId::A, updated_at: None, missed_confirmations: Some(0) },
        )
        .unwrap();
        assert_eq!(read_pointer(&base).unwrap().active, SlotId::A);
        assert!(!tmp.exists());
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn confirm_boot_ready_resets_the_counter() {
        let base = temp_base();
        boot_reconcile(&base).unwrap();
        assert_eq!(read_pointer(&base).unwrap().missed_confirmations, Some(1));
        confirm_boot_ready(&base).unwrap();
        assert_eq!(read_pointer(&base).unwrap().missed_confirmations, Some(0));
        // Idempotent: confirming again never writes or errors.
        confirm_boot_ready(&base).unwrap();
        assert_eq!(read_pointer(&base).unwrap().missed_confirmations, Some(0));
        // And healthy boots never accumulate toward rollback.
        assert_eq!(boot_reconcile(&base).unwrap(), SlotId::A);
        assert_eq!(read_pointer(&base).unwrap().missed_confirmations, Some(1));
        confirm_boot_ready(&base).unwrap();
        assert_eq!(boot_reconcile(&base).unwrap(), SlotId::A);
        assert_eq!(read_pointer(&base).unwrap().missed_confirmations, Some(1));
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn rollback_returns_the_previously_confirmed_build() {
        let base = temp_base();
        // Real-world shape: slot B was promoted and NEVER confirmed
        // (broken web build); slot A still holds the last good build.
        write_pointer_atomic(
            &base,
            &SlotPointer {
                active: SlotId::B,
                updated_at: None,
                missed_confirmations: Some(MAX_BOOT_MISSES),
            },
        )
        .unwrap();
        assert_eq!(boot_reconcile(&base).unwrap(), SlotId::A);
        let pointer = read_pointer(&base).unwrap();
        assert_eq!(pointer.active, SlotId::A);
        assert_eq!(pointer.missed_confirmations, Some(0));
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn pointer_without_counter_field_still_parses() {
        let base = temp_base();
        // A pointer written by the O1-03-only client (no missedConfirmations).
        fs::write(
            pointer_path(&base),
            r#"{ "active": "slot-b", "updatedAt": "2026-11-23T00:00:00.000Z" }"#,
        )
        .unwrap();
        let pointer = read_pointer(&base).unwrap();
        assert_eq!(pointer.active, SlotId::B);
        assert_eq!(pointer.missed_confirmations, None);
        // And the boot flow upgrades it in place.
        assert_eq!(boot_reconcile(&base).unwrap(), SlotId::B);
        assert_eq!(read_pointer(&base).unwrap().missed_confirmations, Some(1));
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn apply_gate_refuses_during_session_and_allows_after() {
        assert!(can_apply_update(false).is_ok());
        assert!(matches!(can_apply_update(true), Err(UpdateError::Refused(_))));
    }

    #[test]
    fn gated_promotion_leaves_pointer_untouched_during_session() {
        let base = temp_base();
        // Active A (default); a gated promote mid-session is refused, pointer A.
        assert!(matches!(
            promote_inactive_slot_if_allowed(&base, true),
            Err(UpdateError::Refused(_))
        ));
        assert_eq!(active_slot(&base).unwrap(), SlotId::A);
        // Once the session has ended, the same call promotes slot B.
        assert_eq!(promote_inactive_slot_if_allowed(&base, false).unwrap(), SlotId::B);
        assert_eq!(active_slot(&base).unwrap(), SlotId::B);
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn tampered_pointer_is_rejected_at_parse() {
        let base = temp_base();
        // A corrupted pointer (torn write, bit rot, hostile edit) is a hard
        // parse error — the boot flow refuses to guess and the protocol
        // falls back to the bundled payload (lookup_in_active_slot → None).
        for evil in [
            "not json at all",
            "{ \"active\": \"slot-c\" }", // unknown slot id
            "{ \"active\": 42 }",         // wrong type
            "",                           // empty file
        ] {
            fs::write(pointer_path(&base), evil).unwrap();
            assert!(
                matches!(read_pointer(&base), Err(UpdateError::Parse(_))),
                "pointer {evil:?} must be rejected"
            );
        }
        // A VALID but unsigned pointer (written by the native layer itself)
        // still parses — pointers are origin-trusted, signature-trust lives
        // in the manifest (see docs/updates.md integrity section).
        fs::write(
            pointer_path(&base),
            r#"{ "active": "slot-a", "missedConfirmations": 1 }"#,
        )
        .unwrap();
        assert_eq!(read_pointer(&base).unwrap().active, SlotId::A);
        fs::remove_dir_all(&base).ok();
    }
}

// ─── Resumable download tests (O1-16) ────────────────────────────────────────

#[cfg(test)]
mod download_tests {
    use super::*;

    fn temp_file(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lh-update-o1-16-{}-{}",
            std::process::id(),
            name
        ));
        fs::create_dir_all(&dir).expect("create temp dir");
        dir.join(name)
    }

    /// In-memory fetcher: serves `content[start..]` as 206, or the whole
    /// content as 200 when `ignore_range` is set.
    struct FakeFetcher {
        content: Vec<u8>,
        ignore_range: bool,
        calls: Vec<u64>,
    }

    impl FakeFetcher {
        fn new(content: &[u8]) -> Self {
            Self { content: content.to_vec(), ignore_range: false, calls: vec![] }
        }
    }

    impl RangeFetcher for FakeFetcher {
        fn fetch_range(&mut self, start: u64) -> Result<RangeResponse, UpdateError> {
            self.calls.push(start);
            if self.ignore_range {
                return Ok(RangeResponse::Full(self.content.clone()));
            }
            Ok(RangeResponse::Partial(self.content[start as usize..].to_vec()))
        }
    }

    #[test]
    fn range_header_is_open_ended() {
        assert_eq!(range_header(0), "bytes=0-");
        assert_eq!(range_header(1024), "bytes=1024-");
    }

    #[test]
    fn resume_offset_is_file_size_or_zero() {
        let dest = temp_file("offset");
        assert_eq!(resume_offset(&dest), 0);
        fs::write(&dest, b"0123456789").unwrap();
        assert_eq!(resume_offset(&dest), 10);
        fs::remove_dir_all(dest.parent().unwrap()).ok();
    }

    #[test]
    fn progress_percent_saturates() {
        assert_eq!(progress_percent(0, 100), 0);
        assert_eq!(progress_percent(50, 100), 50);
        assert_eq!(progress_percent(100, 100), 100);
        assert_eq!(progress_percent(150, 100), 100);
        assert_eq!(progress_percent(5, 0), 100);
    }

    #[test]
    fn resumes_a_partial_download_and_verifies_the_hash() {
        let dest = temp_file("resume");
        let content: Vec<u8> = (0..100u8).collect();
        let sha = hash_hex(&content);
        // Pre-existing partial: first 40 bytes already on disk.
        fs::write(&dest, &content[..40]).unwrap();

        let mut fetcher = FakeFetcher::new(&content);
        let mut progress = Vec::new();
        download_resumable(&dest, 100, &sha, |d, t| progress.push((d, t)), &mut fetcher)
            .expect("resumed download succeeds");

        // Fetcher was asked to continue at the resume offset, once.
        assert_eq!(fetcher.calls, vec![40]);
        assert_eq!(fs::read(&dest).unwrap(), content);
        // Progress walks 40 → 100.
        assert_eq!(progress, vec![(40, 100), (100, 100)]);
        fs::remove_dir_all(dest.parent().unwrap()).ok();
    }

    #[test]
    fn full_response_restarts_from_scratch() {
        let dest = temp_file("restart");
        let content = b"the-real-content".to_vec();
        // Stale partial with unrelated bytes.
        fs::write(&dest, b"stale").unwrap();

        let mut fetcher = FakeFetcher { content: content.clone(), ignore_range: true, calls: vec![] };
        download_resumable(
            &dest,
            content.len() as u64,
            &hash_hex(&content),
            |_, _| {},
            &mut fetcher,
        )
        .expect("restart download succeeds");

        // Server ignored Range → fetched from 0, final file is the full body.
        assert_eq!(fetcher.calls, vec![0]);
        assert_eq!(fs::read(&dest).unwrap(), content);
        fs::remove_dir_all(dest.parent().unwrap()).ok();
    }

    #[test]
    fn stale_partial_larger_than_total_restarts_at_zero() {
        let dest = temp_file("stale");
        let content = b"tiny".to_vec();
        fs::write(&dest, b"much-longer-than-total").unwrap();

        let mut fetcher = FakeFetcher::new(&content);
        download_resumable(
            &dest,
            content.len() as u64,
            &hash_hex(&content),
            |_, _| {},
            &mut fetcher,
        )
        .expect("stale partial is scratched and restarted");
        assert_eq!(fetcher.calls, vec![0]);
        assert_eq!(fs::read(&dest).unwrap(), content);
        fs::remove_dir_all(dest.parent().unwrap()).ok();
    }

    #[test]
    fn size_mismatch_from_server_is_a_hash_error() {
        let dest = temp_file("sizemismatch");
        let content = b"12345678".to_vec();
        fs::write(&dest, b"1234").unwrap(); // resume offset 4

        struct ShortFetcher;
        impl RangeFetcher for ShortFetcher {
            fn fetch_range(&mut self, _start: u64) -> Result<RangeResponse, UpdateError> {
                Ok(RangeResponse::Partial(b"567".to_vec())) // 3 bytes → 7 total ≠ 8
            }
        }
        assert!(matches!(
            download_resumable(&dest, 8, &hash_hex(&content), |_, _| {}, &mut ShortFetcher),
            Err(UpdateError::Hash(_))
        ));
        fs::remove_dir_all(dest.parent().unwrap()).ok();
    }

    #[test]
    fn final_hash_mismatch_is_rejected() {
        let dest = temp_file("badhash");
        struct WrongFetcher;
        impl RangeFetcher for WrongFetcher {
            fn fetch_range(&mut self, _start: u64) -> Result<RangeResponse, UpdateError> {
                Ok(RangeResponse::Full(b"not-what-the-manifest-said".to_vec()))
            }
        }
        assert!(matches!(
            download_resumable(&dest, 26, &hash_hex(b"expected"), |_, _| {}, &mut WrongFetcher),
            Err(UpdateError::Hash(_))
        ));
        fs::remove_dir_all(dest.parent().unwrap()).ok();
    }
}

// ─── Hot-patch chain tests (O1-19) ───────────────────────────────────────────

#[cfg(test)]
mod patch_tests {
    use super::*;
    use std::collections::BTreeMap;

    fn temp_base() -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "lh-update-o1-19-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).expect("create temp base dir");
        dir
    }

    /// Builds a zip bundle exactly like `scripts/update-manifest.mjs` emits:
    /// changed files at their export-relative paths (fflate-compatible zip).
    fn zip_bundle(files: &[(&str, &[u8])]) -> Vec<u8> {
        let mut writer = zip::ZipWriter::new(std::io::Cursor::new(Vec::new()));
        for (name, content) in files {
            writer
                .start_file(*name, zip::write::SimpleFileOptions::default())
                .expect("zip start_file");
            std::io::Write::write_all(&mut writer, content).expect("zip write");
        }
        writer.finish().expect("zip finish").into_inner()
    }

    fn manifest_for(version: &str, files: Vec<(&str, &[u8])>) -> (UpdateManifest, Vec<u8>) {
        let manifest = UpdateManifest {
            manifest_version: 1,
            channel: UpdateChannel::Nightly,
            version: version.to_string(),
            build_sha: "chain00".to_string(),
            created_at: "2026-11-23T12:00:00.000Z".to_string(),
            min_native_version: "0.1.0".to_string(),
            requires_native: false,
            files: files
                .into_iter()
                .map(|(path, content)| UpdateFile {
                    path: path.to_string(),
                    sha256: hash_hex(content),
                    size: content.len() as u64,
                })
                .collect(),
            patches: vec![],
            full_package_url: "https://example.com/releases/app.zip".to_string(),
        };
        let bytes = serde_json::to_vec(&manifest).expect("serialize manifest");
        (manifest, bytes)
    }

    /// path → sha256 of every file under `dir` (recursive).
    fn hash_slot(dir: &Path) -> BTreeMap<String, String> {
        fn walk(dir: &Path, prefix: &str, map: &mut BTreeMap<String, String>) {
            for entry in fs::read_dir(dir).expect("read_dir") {
                let entry = entry.expect("dir entry");
                let path = entry.path();
                let rel = format!(
                    "{}{}",
                    prefix,
                    entry.file_name().to_string_lossy()
                );
                if path.is_dir() {
                    walk(&path, &format!("{rel}/"), map);
                } else {
                    map.insert(rel, hash_hex(&fs::read(&path).expect("read file")));
                }
            }
        }
        let mut map = BTreeMap::new();
        walk(dir, "", &mut map);
        map
    }

    /// The O1-19 acceptance: apply patches from each of the last 5 manifests.
    #[test]
    fn upgrade_chain_applies_patches_across_five_manifests() {
        let base = temp_base();

        // v1 — the starting build, installed fully via download_to_inactive_slot.
        let (m1, bytes1) = manifest_for(
            "20261121-chain01",
            vec![("a.txt", b"A1"), ("b.txt", b"B1")],
        );
        download_to_inactive_slot(&base, &m1, &bytes1, "https://example.com/rel", |f| {
            Ok(match f.path.as_str() {
                "a.txt" => b"A1".to_vec(),
                _ => b"B1".to_vec(),
            })
        })
        .expect("v1 download");
        promote_inactive_slot(&base).expect("v1 promote");

        // (version, target files, patch contents) — the CI emits patches with
        // ONLY added/changed files (O1-07); deletions ride on the slot clear.
        let steps: [(&str, Vec<(&str, &[u8])>, Vec<(&str, &[u8])>); 4] = [
            (
                "20261122-chain02",
                vec![("a.txt", b"A2"), ("b.txt", b"B1")],
                vec![("a.txt", b"A2")],
            ),
            (
                "20261123-chain03",
                vec![("a.txt", b"A2"), ("b.txt", b"B2"), ("c.txt", b"C1")],
                vec![("b.txt", b"B2"), ("c.txt", b"C1")],
            ),
            // v4 modifies a.txt and DELETES b.txt — the clear handles deletions.
            (
                "20261124-chain04",
                vec![("a.txt", b"A3"), ("c.txt", b"C1")],
                vec![("a.txt", b"A3")],
            ),
            (
                "20261125-chain05",
                vec![("a.txt", b"A3"), ("c.txt", b"C3"), ("d.txt", b"D1")],
                vec![("c.txt", b"C3"), ("d.txt", b"D1")],
            ),
        ];

        let mut installed = m1;
        for (i, (version, files, patch_files)) in steps.iter().enumerate() {
            let (target, target_bytes) = manifest_for(version, files.clone());
            let patch = zip_bundle(patch_files);

            // (v5 is the fifth manifest counting v1 — the "last 5" window.)
            let slot = apply_patch_bundle(&base, &installed, &target, &target_bytes, &patch)
                .unwrap_or_else(|e| panic!("apply step {} failed: {e}", i + 2));
            assert_eq!(slot, if i % 2 == 0 { SlotId::B } else { SlotId::A });

            // The filled slot matches the target manifest EXACTLY (additions,
            // modifications and deletions all reconciled).
            let expected: BTreeMap<String, String> = target
                .files
                .iter()
                .map(|f| (f.path.clone(), f.sha256.clone()))
                .collect();
            assert_eq!(hash_slot(&slot_dir(&base, slot)), expected, "step {}", i + 2);

            promote_inactive_slot(&base).expect("step promote");
            installed = target;
        }

        let status = list_current(&base).unwrap();
        assert_eq!(status.active_version.as_deref(), Some("20261125-chain05"));
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn patch_with_file_missing_from_target_manifest_is_rejected() {
        let base = temp_base();
        let (m1, bytes1) = manifest_for("20261121-chain01", vec![("a.txt", b"A1")]);
        download_to_inactive_slot(&base, &m1, &bytes1, "https://example.com/rel", |_| {
            Ok(b"A1".to_vec())
        })
        .unwrap();
        promote_inactive_slot(&base).unwrap();

        // Target only lists a.txt; the patch smuggles an extra file.
        let (target, target_bytes) = manifest_for("20261122-chain02", vec![("a.txt", b"A2")]);
        let patch = zip_bundle(&[("a.txt", b"A2"), ("evil.txt", b"payload")]);
        assert!(matches!(
            apply_patch_bundle(&base, &m1, &target, &target_bytes, &patch),
            Err(UpdateError::Parse(_))
        ));
        // Pointer untouched, target slot still empty of the smuggled file.
        assert_eq!(active_slot(&base).unwrap(), SlotId::A);
        assert!(!slot_dir(&base, SlotId::B).join("evil.txt").exists());
        fs::remove_dir_all(&base).ok();
    }

    #[test]
    fn patch_missing_a_changed_file_is_rejected() {
        let base = temp_base();
        let (m1, bytes1) = manifest_for("20261121-chain01", vec![("a.txt", b"A1")]);
        download_to_inactive_slot(&base, &m1, &bytes1, "https://example.com/rel", |_| {
            Ok(b"A1".to_vec())
        })
        .unwrap();
        promote_inactive_slot(&base).unwrap();

        // Target changes a.txt AND adds b.txt, but the patch only has b.txt —
        // a.txt has no source (changed ⇒ not copied, absent ⇒ not patched).
        let (target, target_bytes) = manifest_for(
            "20261122-chain02",
            vec![("a.txt", b"A2"), ("b.txt", b"B1")],
        );
        let patch = zip_bundle(&[("b.txt", b"B1")]);
        assert!(matches!(
            apply_patch_bundle(&base, &m1, &target, &target_bytes, &patch),
            Err(UpdateError::Parse(_))
        ));
        fs::remove_dir_all(&base).ok();
    }
}
