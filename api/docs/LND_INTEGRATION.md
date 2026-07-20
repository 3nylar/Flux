# Connecting Flux to a real LND node

`LndRestProvider` (`src/providers/LndRestProvider.ts`) implements real
keysend payments against LND's REST API, built directly from LND's public
API reference. **It has not been exercised against a live LND node during
this project's development** — no Lightning node was reachable in that
build environment. This document is both a setup guide and the
verification checklist to run through before you rely on it.

## 1. Get a node to test against

The fastest way to get a realistic multi-node Lightning network on your own
machine is [Polar](https://lightningpolar.com/) — a desktop app that spins
up LND/CLN nodes on regtest (Bitcoin's "fake money, real protocol" test
mode) with a few clicks.

1. Install Polar, create a network with at least two LND nodes ("Sender"
   and "Receiver").
2. Start the network and mine a few blocks so the nodes have on-chain
   funds (Polar has a one-click "mine blocks" button).
3. Open a channel from Sender to Receiver with enough capacity for your
   test payments.
4. On the Receiver node, confirm keysend is enabled — Polar's LND images
   ship with `--accept-keysend` on by default, but double-check
   `lnd.conf` if you're not using Polar.

## 2. Gather the connection details Flux needs

For each node in Polar, the "Connect" tab shows:

- **REST Host** → `LND_REST_URL` (e.g. `https://127.0.0.1:8081`)
- **Macaroon (Hex)** → `LND_MACAROON_HEX` — use the **admin macaroon** for
  the Sender node specifically (Flux needs permission to send payments).
- **TLS Cert (Base64)** → `LND_TLS_CERT_BASE64`

Set these in your `.env` along with `LIGHTNING_PROVIDER=lnd`.

## 3. Verification checklist

Work through these in order. Each one exercises a specific part of
`LndRestProvider` that was written to LND's documented contract but not
run against a real node.

- [ ] **Balance read works.** `GET /v1/wallet/balance` (through Flux) returns
      a number that matches the Sender node's actual channel balance shown
      in Polar.
- [ ] **A single keysend succeeds.** Start a session with a large
      `tick_interval_seconds` (e.g. 3600) so only one payment fires, and
      confirm:
      - The payment shows up in Polar's payment list on the Sender node.
      - The receiver's balance increases by the expected amount.
      - `GET /v1/sessions/:id/payments` shows `status: succeeded` with a
        `payment_hash` that matches what Polar shows.
- [ ] **The preimage is authentic.** Independently verify
      `sha256(preimage) === payment_hash` for a recorded payment (a one-line
      check in `node -e "..."` using the `preimage` and `payment_hash`
      fields from the payments endpoint).
- [ ] **A receiver-disabled-keysend failure is classified correctly.**
      Temporarily restart the receiver node with `--reject-htlc` or without
      `--accept-keysend`, attempt a payment, and confirm Flux surfaces a
      `payment.failed` webhook / a `FAILED` Payment row rather than hanging
      or crashing.
- [ ] **A no-route failure is classified correctly.** Close the channel
      between Sender and Receiver (or point at a pubkey with no path) and
      confirm the same graceful failure handling.
- [ ] **Field naming matches your LND version.** LND's REST/JSON field
      casing (snake_case vs. camelCase) has varied across major versions
      depending on the grpc-gateway configuration in use. If payments fail
      to parse (you'll see a "no preimage and no error" `KeysendPaymentError`
      even though Polar shows the payment succeeded), capture the raw
      response body and compare field names against what
      `LndRestProvider.sendKeysend` expects (`payment_preimage`,
      `payment_error`, `payment_route.total_fees`) — adjust as needed for
      your node's exact version.
- [ ] **Self-signed TLS is trusted.** If your LND uses a self-signed cert
      (the default) and you're not going through a reverse proxy that
      terminates TLS, confirm `LND_TLS_CERT_BASE64` is being honored (no
      certificate errors in the API logs).

## 4. Once it's verified

Open a PR (or just update this checklist in your fork) noting which LND
version you tested against and any field-naming adjustments you had to
make — that context is valuable for the next person connecting a different
LND version.
