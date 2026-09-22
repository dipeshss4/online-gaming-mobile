# Mobile API contract — first milestone

Base URL has no `/api` suffix. JSON request/response bodies. Authenticated calls use `Authorization: Bearer <accessToken>`. No secrets or provider credentials belong in EXPO_PUBLIC variables.

| Method | Path | Contract used |
| --- | --- | --- |
| POST | /api/auth/register | `{email,password}` → token and identity |
| POST | /api/auth/login | `{email,password}` → token and identity |
| GET | /api/auth/me | `{userId,email,role,permissions}` |
| POST | /api/auth/logout | empty object → 204; revokes all sessions |
| POST | /api/auth/refresh | needs the `X-Session-Refresh` header and the refresh cookie → a new access token |
| POST | /api/auth/password | `{currentPassword,newPassword}` → 204; revokes all sessions |
| GET | /api/games | Game array; code/name/description/minStake/maxStake, optional presentation/engine |
| GET | /api/wallet | balance/currency; optional held/status |
| GET | /api/wallet/transactions?page=0&size=20 | `{items,totalPages}`; id/type/amount/description/createdAt |
| GET | /api/bets?page=0&size=20 | `{items,totalPages}`; betId/gameCode/stake/payout/status/settledAt |
| GET | /api/payments/methods | `{methods,demoCredits}`; providerCode/displayName/deposits/withdrawals/currency/minAmount/maxAmount/sandbox/payoutAccountRequired |
| POST | /api/payments/withdrawals | `{providerCode,amount,requestId}` → withdrawal; the same requestId returns the same withdrawal |
| GET | /api/payments/withdrawals | withdrawal array (latest 20); id/providerCode/amount/currency/status/failureReason/reviewNote/createdAt/completedAt |
| POST | /api/payments/withdrawals/{id}/cancel | empty object → withdrawal; only while REQUESTED |
| GET | /api/payments/payout-accounts/{providerCode} | `{providerCode,status,detail,sandbox,updatedAt}`; status NONE/ONBOARDING/READY/RESTRICTED |
| POST | /api/payments/payout-accounts/{providerCode}/onboarding | empty object → `{url}`; single-use, expires in minutes |
| POST | /api/payments/payout-accounts/{providerCode}/dashboard | empty object → `{url}`; single-use, expires in minutes |

Withdrawals hold money rather than move it: requesting places a hold, staff review it, and only a processor-confirmed
payout debits the wallet. The app reuses one requestId for as long as the player is asking for the same amount from
the same provider, so a retry after a dropped connection cannot become a second withdrawal. It never marks a
withdrawal paid, and never opens a URL from `/onboarding` or `/dashboard` without checking it is HTTPS and belongs to
the provider. Methods that report `payoutAccountRequired` hide the amount field until the account reports READY.

The access token lasts 15 minutes. An authenticated call that comes back 401 triggers one renewal — `POST
/api/auth/refresh` with the `X-Session-Refresh` header; the refresh cookie is kept by the platform's HTTP stack —
and the call is then retried once with the new token. Renewals are shared, so several screens failing at once
cause one refresh rather than several (each would rotate the cookie and end the session). Cookies are asked for
on iOS and Android only: a browser refuses a credentialed request answered with `Access-Control-Allow-Origin: *`,
which is what the dev proxy sends. A refusal from the renewal itself ends the session and sign-in is shown.

Errors use `{message}`. Authenticated read 401 that survives renewal clears the session. Password-check 401 displays the error without assuming the existing session is invalid. No automatic mutation retries. GET refreshes on foreground and pull-to-refresh. Money is displayed as returned; no mobile balance calculations or bet settlement.

Native REEL_3 / GRID_3X3 gameplay posts `/api/games/{gameCode}/play` with `{requestId,stake}`. The response supplies requestId/betId/gameCode/symbols/stake/payout/balance/currency/outcome/multiplier. GRID_3X3 is row-major (center row indexes 3,4,5); REEL_3 uses indexes 0,1,2. The client never calculates settlement. Pending requests persist before dispatch and explicit recovery reuses the same ID/stake. New rounds are blocked until resolved. The server's existing idempotency lookup is behind game availability/stake validation, so a disabled game or changed limit can require manual reconciliation. Other game layouts are not submitted by this renderer.
