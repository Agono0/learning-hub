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
