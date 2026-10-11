# ADR-0006 — Video protection strategy (Phase 3) and its limits

**Status:** accepted (implementation in Phase 3)

Hiding the download button protects nothing. The plan:

1. **Managed streaming** (Mux or Cloudflare Stream): adaptive HLS, multiple renditions for weak networks.
   Raw files never sit on our servers.
2. **Signed, short-lived playback tokens** issued by our API only after `hasCourseAccess()` succeeds
   (entitlement check on every token request), bound to the asset and expiring in minutes.
3. **Domain restrictions** at the provider (allowed referrers / origins).
4. **Visible dynamic watermark**: the student's e-mail or id drifting over the player, discouraging
   screen recording and identifying leakers.
5. **Concurrent stream / device limits** (device limit already enforced per account) and anomaly alerts
   (many tokens per account per hour).
6. **DRM (Widevine/FairPlay)** via the provider for the strongest tier, if the business case justifies the cost.

**Limits (stated plainly):** anything that can be watched can be filmed. Screen recording (and a phone
pointed at a screen) cannot be prevented by any web technology; DRM blocks some capture paths on some
platforms only. The realistic goal is to make bulk theft inconvenient, traceable (watermark) and
revocable (tokens + entitlements), not impossible.
