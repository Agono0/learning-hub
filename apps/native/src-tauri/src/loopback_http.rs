//! Small, std-only helpers for the Max Focus loopback server (127.0.0.1:47615).
//!
//! Kept free of Tauri so it compiles and tests on its own. It adds, without changing what the
//! server answers to a valid client:
//! - a constant-time token comparison (`ct_eq`) that does not return early on a mismatch or on
//!   a length difference;
//! - a bounded request read (`read_request_head`): a total deadline, a byte cap and read/write
//!   timeouts, so an idle or slow client frees its thread instead of holding it forever;
//! - a connection cap (`ConnGuard`), so a flood of idle connections cannot grow threads
//!   without limit.
//!
//! This is local resource and timing hardening only. It does not authenticate who owns the
//! port, and it does not change the pairing model.

use std::io::{ErrorKind, Read, Write};
use std::net::TcpStream;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

/// Most requests this server accepts at once. Extra connections get a 503 and are closed.
pub const MAX_CONNECTIONS: usize = 16;
/// Largest request head (request line plus headers) read before refusing.
pub const MAX_HEAD_BYTES: usize = 8 * 1024;
/// Total time a client has to send a full request head.
pub const READ_DEADLINE: Duration = Duration::from_secs(5);
/// Time allowed to write a response before giving up on a stalled client.
pub const WRITE_TIMEOUT: Duration = Duration::from_secs(5);

static ACTIVE: AtomicUsize = AtomicUsize::new(0);

/// Holds one of the connection slots until dropped.
pub struct ConnGuard(&'static AtomicUsize);

impl ConnGuard {
    /// Take a slot, or `None` when `MAX_CONNECTIONS` are already in use.
    pub fn acquire() -> Option<ConnGuard> {
        Self::acquire_in(&ACTIVE, MAX_CONNECTIONS)
    }

    fn acquire_in(counter: &'static AtomicUsize, max: usize) -> Option<ConnGuard> {
        let prev = counter.fetch_add(1, Ordering::AcqRel);
        if prev >= max {
            counter.fetch_sub(1, Ordering::AcqRel);
            return None;
        }
        Some(ConnGuard(counter))
    }
}

impl Drop for ConnGuard {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::AcqRel);
    }
}

/// Constant-time equality for secrets. Always walks `max(len)` bytes and folds a length
/// difference into the result, so neither the position of the first mismatch nor the length
/// of the guess changes how long the comparison takes.
pub fn ct_eq(a: &[u8], b: &[u8]) -> bool {
    let n = a.len().max(b.len());
    let mut diff: usize = a.len() ^ b.len();
    for i in 0..n {
        let x = *a.get(i).unwrap_or(&0);
        let y = *b.get(i).unwrap_or(&0);
        diff |= (x ^ y) as usize;
    }
    // Keep the comparison from being turned back into an early exit by the optimizer.
    std::hint::black_box(diff) == 0
}

#[derive(Debug, PartialEq, Eq)]
pub enum ReadError {
    /// The client did not finish the request head within `READ_DEADLINE`.
    Timeout,
    /// The head was larger than `MAX_HEAD_BYTES`.
    TooLarge,
    /// The client closed before sending a full head, or the read failed.
    Closed,
}

/// Read until the end of the request head (`\r\n\r\n`), never beyond `MAX_HEAD_BYTES`, within
/// `deadline` in total. The body, if any, is not read: no route here uses one.
pub fn read_request_head(stream: &mut TcpStream, deadline: Duration) -> Result<String, ReadError> {
    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));
    let start = Instant::now();
    let mut buf: Vec<u8> = Vec::with_capacity(512);
    let mut chunk = [0u8; 1024];
    loop {
        if let Some(end) = find_head_end(&buf) {
            buf.truncate(end);
            return Ok(String::from_utf8_lossy(&buf).into_owned());
        }
        if buf.len() >= MAX_HEAD_BYTES {
            return Err(ReadError::TooLarge);
        }
        let left = deadline.saturating_sub(start.elapsed());
        if left.is_zero() {
            return Err(ReadError::Timeout);
        }
        let _ = stream.set_read_timeout(Some(left));
        match stream.read(&mut chunk) {
            Ok(0) => return Err(ReadError::Closed),
            Ok(n) => buf.extend_from_slice(&chunk[..n]),
            Err(e) if matches!(e.kind(), ErrorKind::WouldBlock | ErrorKind::TimedOut) => {
                return Err(ReadError::Timeout)
            }
            Err(e) if e.kind() == ErrorKind::Interrupted => continue,
            Err(_) => return Err(ReadError::Closed),
        }
    }
}

fn find_head_end(buf: &[u8]) -> Option<usize> {
    buf.windows(4).position(|w| w == b"\r\n\r\n")
}

/// The bearer token of the first `Authorization: Bearer <token>` header (name and scheme are
/// case-insensitive), or "" when absent. Only the head is searched, so a body can never smuggle
/// a header.
pub fn extract_bearer(head: &str) -> &str {
    for line in head.lines().skip(1) {
        let Some((name, value)) = line.split_once(':') else {
            continue;
        };
        if !name.trim().eq_ignore_ascii_case("authorization") {
            continue;
        }
        let value = value.trim();
        if value.len() > 7
            && value.is_char_boundary(7)
            && value[..7].eq_ignore_ascii_case("bearer ")
        {
            return value[7..].trim();
        }
        return "";
    }
    ""
}

/// What a request head asks for, after the token check.
#[derive(Debug, PartialEq, Eq)]
pub enum Route {
    Options,
    Unauthorized,
    Lock,
    Heartbeat,
    NotFound,
    Malformed,
}

/// Classify a request head. An empty expected token never authorizes (no active lock).
pub fn classify(head: &str, expected_token: &str) -> Route {
    let mut parts = head.lines().next().unwrap_or("").split_whitespace();
    let (Some(method), Some(path)) = (parts.next(), parts.next()) else {
        return Route::Malformed;
    };
    if method == "OPTIONS" {
        return Route::Options;
    }
    let presented = extract_bearer(head);
    // Evaluate the comparison first, then the emptiness rule, with no early return between.
    let same = ct_eq(presented.as_bytes(), expected_token.as_bytes());
    if expected_token.is_empty() || !same {
        return Route::Unauthorized;
    }
    match path {
        "/v1/lock" | "/v1/status" => Route::Lock,
        "/v1/heartbeat" => Route::Heartbeat,
        _ => Route::NotFound,
    }
}

/// Reply to a connection that could not get a slot.
pub fn write_busy(stream: &mut TcpStream) {
    let _ = stream.set_write_timeout(Some(WRITE_TIMEOUT));
    let _ = stream.write_all(
        b"HTTP/1.1 503 Service Unavailable\r\nContent-Type: application/json\r\nContent-Length: 16\r\nConnection: close\r\n\r\n{\"error\":\"Busy\"}",
    );
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn ct_eq_matches_equal_and_rejects_everything_else() {
        assert!(ct_eq(b"abc", b"abc"));
        assert!(ct_eq(b"", b""));
        assert!(!ct_eq(b"abc", b"abd"));
        assert!(!ct_eq(b"abc", b"ab"));
        assert!(!ct_eq(b"ab", b"abc"));
        // A guess that is a prefix, or that pads with the same byte, is not equal.
        assert!(!ct_eq(b"abc", b"abc\0"));
        assert!(!ct_eq(b"", b"x"));
    }

    #[test]
    fn bearer_parsing_is_case_insensitive_and_head_only() {
        let h = "GET /v1/lock HTTP/1.1\r\nHost: x\r\nAUTHORIZATION: bearer tok123 \r\n";
        assert_eq!(extract_bearer(h), "tok123");
        assert_eq!(extract_bearer("GET / HTTP/1.1\r\nHost: x\r\n"), "");
        assert_eq!(
            extract_bearer("GET / HTTP/1.1\r\nAuthorization: Basic abc\r\n"),
            ""
        );
        // The request line is never read as a header.
        assert_eq!(extract_bearer("Authorization: Bearer x HTTP/1.1\r\n"), "");
        // Multibyte input does not panic on the prefix slice.
        assert_eq!(
            extract_bearer("GET / HTTP/1.1\r\nAuthorization: Bearé x\r\n"),
            ""
        );
    }

    #[test]
    fn routes_require_the_matching_token() {
        let ok = |p: &str| format!("GET {p} HTTP/1.1\r\nAuthorization: Bearer secret\r\n");
        assert_eq!(classify(&ok("/v1/lock"), "secret"), Route::Lock);
        assert_eq!(classify(&ok("/v1/status"), "secret"), Route::Lock);
        assert_eq!(classify(&ok("/nope"), "secret"), Route::NotFound);
        assert_eq!(classify(&ok("/v1/lock"), "other"), Route::Unauthorized);
        assert_eq!(classify(&ok("/v1/lock"), ""), Route::Unauthorized);
        assert_eq!(
            classify("GET /v1/lock HTTP/1.1\r\n", "secret"),
            Route::Unauthorized
        );
        assert_eq!(
            classify("GET /v1/lock HTTP/1.1\r\nAuthorization: Bearer \r\n", ""),
            Route::Unauthorized
        );
        assert_eq!(
            classify("OPTIONS /v1/lock HTTP/1.1\r\n", "secret"),
            Route::Options
        );
        assert_eq!(classify("", "secret"), Route::Malformed);
        let hb = "POST /v1/heartbeat HTTP/1.1\r\nAuthorization: Bearer secret\r\n";
        assert_eq!(classify(hb, "secret"), Route::Heartbeat);
    }

    #[test]
    fn connection_slots_are_capped_and_released() {
        static LOCAL: AtomicUsize = AtomicUsize::new(0);
        let a = ConnGuard::acquire_in(&LOCAL, 2).expect("slot 1");
        let b = ConnGuard::acquire_in(&LOCAL, 2).expect("slot 2");
        assert!(
            ConnGuard::acquire_in(&LOCAL, 2).is_none(),
            "third must be refused"
        );
        assert_eq!(
            LOCAL.load(Ordering::SeqCst),
            2,
            "a refused attempt leaves no slot held"
        );
        drop(a);
        assert!(
            ConnGuard::acquire_in(&LOCAL, 2).is_some(),
            "a dropped guard frees its slot"
        );
        drop(b);
    }

    fn pair() -> (TcpStream, TcpStream) {
        let l = TcpListener::bind("127.0.0.1:0").unwrap();
        let addr = l.local_addr().unwrap();
        let client = TcpStream::connect(addr).unwrap();
        let (server, _) = l.accept().unwrap();
        (client, server)
    }

    #[test]
    fn an_idle_client_times_out_instead_of_holding_the_thread() {
        let (_idle_client, mut server) = pair();
        let t = Instant::now();
        let r = read_request_head(&mut server, Duration::from_millis(300));
        assert_eq!(r, Err(ReadError::Timeout));
        assert!(
            t.elapsed() < Duration::from_secs(2),
            "returned promptly after the deadline"
        );
    }

    #[test]
    fn a_slow_drip_client_hits_the_total_deadline() {
        let (mut client, mut server) = pair();
        let h = thread::spawn(move || {
            for _ in 0..10 {
                if client.write_all(b"A").is_err() {
                    break;
                }
                thread::sleep(Duration::from_millis(100));
            }
        });
        let r = read_request_head(&mut server, Duration::from_millis(300));
        assert_eq!(r, Err(ReadError::Timeout));
        drop(server);
        let _ = h.join();
    }

    #[test]
    fn an_oversized_head_is_refused() {
        let (mut client, mut server) = pair();
        let h = thread::spawn(move || {
            let junk = vec![b'a'; MAX_HEAD_BYTES + 100];
            let _ = client.write_all(&junk);
            client
        });
        let r = read_request_head(&mut server, Duration::from_secs(2));
        assert_eq!(r, Err(ReadError::TooLarge));
        let _ = h.join();
    }

    #[test]
    fn a_closed_client_is_reported() {
        let (client, mut server) = pair();
        drop(client);
        assert_eq!(
            read_request_head(&mut server, Duration::from_secs(1)),
            Err(ReadError::Closed)
        );
    }

    #[test]
    fn a_normal_authorized_heartbeat_over_a_fragmented_request_works() {
        let (mut client, mut server) = pair();
        let h = thread::spawn(move || {
            client
                .write_all(b"POST /v1/heartbeat HTTP/1.1\r\nHost: 127.0.0.1\r\n")
                .unwrap();
            thread::sleep(Duration::from_millis(50));
            client
                .write_all(b"Authorization: Bearer secret\r\nContent-Length: 0\r\n\r\n")
                .unwrap();
            client
        });
        let head = read_request_head(&mut server, Duration::from_secs(2)).expect("head");
        assert_eq!(classify(&head, "secret"), Route::Heartbeat);
        assert_eq!(classify(&head, "wrong"), Route::Unauthorized);
        let _ = h.join();
    }
}
