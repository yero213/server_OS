# Caddy internal CA — trusting clients (fully offline)

Phase 1 serves `https://server.local` and `https://*.server.local` with
certificates from Caddy's internal CA (`tls internal`). No internet, ACME
or DNS validation is involved. Browsers show a warning until the CA root
is trusted once per client device.

## Export the root (on the laptop)

```bash
sudo cat /var/lib/caddy/pki/authorities/local/root.crt > caddy-root.crt
# fingerprint for verification:
sudo caddy trust --address 127.0.0.1:2019  # installs into SERVER store only
openssl x509 -in caddy-root.crt -noout -fingerprint -sha256
```

Copy `caddy-root.crt` to each client (USB/local share — never internet).

## Per-OS trust

* **Ubuntu/Debian client:** `sudo cp caddy-root.crt
  /usr/local/share/ca-certificates/caddy-root.crt && sudo update-ca-certificates`
* **Windows:** double-click → Install Certificate → Local Machine →
  Trusted Root Certification Authorities (verify fingerprint first).
* **macOS:** Keychain Access → System → import → Always Trust.
* **Android:** Settings → Security → Install certificate → CA certificate
  (note: apps targeting API 24+ may still pin; browser works).
* **iOS:** AirDrop/mail the `.crt` → install profile → enable full trust
  under Settings → General → About → Certificate Trust Settings.

## Fallback

`http://<laptop-ip>:80` redirects to HTTPS; direct API access for bootstrap:
`http://<laptop-ip>:3001` is loopback-only by default — use the proxy.
