# Mobile API contract — first milestone

Base URL has no `/api` suffix. JSON request/response bodies. Authenticated calls use `Authorization: Bearer <accessToken>`. No secrets or provider credentials belong in EXPO_PUBLIC variables.

| Method | Path | Contract used |
| --- | --- | --- |
| POST | /api/auth/register | `{email,password}` → token and identity |
| POST | /api/auth/login | `{email,password}` → token and identity |
| GET | /api/auth/me | `{userId,email,role,permissions}` |
| POST | /api/auth/logout | empty object → 204; revokes all sessions |
| POST | /api/auth/password | `{currentPassword,newPassword}` → 204; revokes all sessions |
| GET | /api/games | Game array; code/name/description/minStake/maxStake, optional presentation/engine |
| GET | /api/wallet | balance/currency; optional held/status |
| GET | /api/wallet/transactions?page=0&size=20 | `{items,totalPages}`; id/type/amount/description/createdAt |
| GET | /api/bets?page=0&size=20 | `{items,totalPages}`; betId/gameCode/stake/payout/status/settledAt |

Errors use `{message}`. Authenticated read 401 clears the session. Password-check 401 displays the error without assuming the existing session is invalid. No automatic mutation retries. GET refreshes on foreground and pull-to-refresh. Money is displayed as returned; no mobile balance calculations or bet settlement.

Native REEL_3 / GRID_3X3 gameplay posts `/api/games/{gameCode}/play` with `{requestId,stake}`. The response supplies requestId/betId/gameCode/symbols/stake/payout/balance/currency/outcome/multiplier. GRID_3X3 is row-major (center row indexes 3,4,5); REEL_3 uses indexes 0,1,2. The client never calculates settlement. Pending requests persist before dispatch and explicit recovery reuses the same ID/stake. New rounds are blocked until resolved. The server's existing idempotency lookup is behind game availability/stake validation, so a disabled game or changed limit can require manual reconciliation. Other game layouts are not submitted by this renderer.
