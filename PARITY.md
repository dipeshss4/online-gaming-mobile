# Web → native parity checklist

Audit of current frontend source, 2026-09-14. All implementation remains inside mobile/. This is not a claim of complete parity.

| Area | Native status | Remaining |
| --- | --- | --- |
| Login/register, account/password | Implemented | Sound-led welcome, stronger device QA |
| Server branding, catalog/search | Implemented | Live content events, persistent favorites |
| Three-reel/3×3 slots | Playable | Full sound/effects and visual parity |
| Multi-bet roulette | Playable | Full visual/audio parity |
| Crash | Implemented in this increment | Visual/audio polish, device timing QA |
| Reef fish arcade | Missing | Native score-only game controls/rendering |
| Wallet balance/ledger | Latest 20 entries | Pagination, cashier layout parity |
| Stripe deposits | Hosted test-only flow | Real sandbox/device verification, native return links |
| Withdrawals/Connect | Missing | Test-only onboarding, review/cancel UI; backend contract review |
| Other payment providers | Missing | Separate sandbox integration review |
| Play history | Latest 20 bets; crash history in game | Unified history/pagination |
| Limits/cooling-off | Missing | Native protection screen and confirmation flow |
| Admin/RBAC management | Web only | Native administration requires its own permission-aware screens |
| Live activity | Missing | Authenticated events and refresh lifecycle |

Payments remain test-only. No live-mode enablement, provider credentials, backend changes or deployment is included. Test coverage listed in README distinguishes mocked API tests from real-device verification.
