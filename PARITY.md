# Web → native parity checklist

Audit of current frontend source, 2026-09-14; limits added 2026-09-18. All implementation remains inside mobile/. This is not a claim of complete parity.

| Area | Native status | Remaining |
| --- | --- | --- |
| Login/register, account/password | Implemented, with silent session renewal | Sound-led welcome, stronger device QA |
| Server branding, catalog/search | Implemented | Live content events, persistent favorites |
| Three-reel/3×3 slots | Playable, with win celebration (paying row pulses, banner, sparks) | Sound |
| Multi-bet roulette | Playable, with win celebration | Wheel/table visual polish, sound |
| Crash | Implemented, with cash-out celebration | Visual/audio polish, device timing QA |
| Reef fish arcade | Missing | Native score-only game controls/rendering |
| Wallet balance/ledger | Latest 20 entries; cashier panes (Deposit/Withdraw/Activity/Limits) as on the web | Pagination |
| Stripe deposits | Hosted test-only flow | Real sandbox/device verification, native return links |
| Withdrawals/Connect | Implemented (Wallet → Withdraw): request, cancel, status, Stripe payout setup | Real-device check of the return from Stripe's page; push when staff decide |
| Other payment providers | Missing | Separate sandbox integration review |
| Play history | Latest 20 bets; crash history in game | Unified history/pagination |
| Limits/cooling-off | Implemented (Wallet tab) | Reminders while playing; device QA |
| Admin/RBAC management | Web only | Native administration requires its own permission-aware screens |
| Live activity | Implemented (lobby): floor totals, biggest wins, recent rounds; says so when a server has no `/api/live` | Polls every 6s; no push (no EventSource in React Native) |

Payments remain test-only. No live-mode enablement, provider credentials, backend changes or deployment is included. Test coverage listed in README distinguishes mocked API tests from real-device verification.
