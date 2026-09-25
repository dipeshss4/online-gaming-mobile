/**
 * Checks the app's layout at phone size against the web preview, so a screen that scrolls sideways, text too
 * small to read, or a control too small to tap is caught before a device build.
 *
 *   npm start -- --web --port 8090          # in one terminal
 *   node scripts/check-ui.mjs               # in another (needs playwright: npx playwright install chromium)
 *
 * The API is mocked here, so it needs no backend and no account. PREVIEW_URL and SHOT_DIR override the
 * defaults. It exits non-zero when it finds something, and writes a screenshot of every screen it visits.
 */
import { chromium } from 'playwright'
import { mkdirSync, readFileSync } from 'node:fs'

const PREVIEW = process.env.PREVIEW_URL || 'http://localhost:8090/'
const OUT = process.env.SHOT_DIR || 'ui-shots'
mkdirSync(OUT, { recursive: true })
// The shipped site content, so the mock serves what a real backend would. When this app is checked out on its
// own, the copy below the fallback is enough for a layout check.
let defaults
try { defaults = JSON.parse(readFileSync(new URL('../../src/main/resources/site-content-defaults.json', import.meta.url), 'utf8')) }
catch { defaults = { brand: { logoGlyph: '7', tagline: 'THE ORIGINAL COLLECTION', creditsLabel: 'DEMO CREDITS', demoBadge: 'DEMO PLAY', legalNotice: '18+ CONCEPT EXPERIENCE · DEMO CREDITS HAVE NO CASH VALUE', footerNote: 'Play for the experience. Demo credits only.' },
  signIn: { formKicker: "MEMBERS' ENTRANCE", loginTitle: 'Welcome back.', loginSubtitle: 'Your next game is waiting.', registerTitle: 'Join the floor.', registerSubtitle: 'Create your demo player account.', registrationClosed: 'New accounts are paused right now.' },
  lobby: { welcomeLabel: 'THE ORIGINAL COLLECTION', heroEnabled: true, featuredGameCode: 'HOT_7S', heroEyebrow: 'IN THE SPOTLIGHT', heroHeadline: 'A classic feeling.', heroAccent: 'A fresh spin.', heroBody: 'Discover {game} and find your rhythm.', heroNote: 'PLAY WITH DEMO CREDITS · NO CASH VALUE', heroArtLabel: 'ONLINE GAME ORIGINAL', quickLinkTitle: 'Your game. Your pace.', quickLinkBody: 'Original games, one demo wallet.', libraryEyebrow: 'FIND YOUR NEXT FAVORITE', defaultBadge: 'ONLINE GAME ORIGINAL' } } }
const findings = []
const now = new Date().toISOString()

// The welcome pop-up and new-message pop-up are switched off until their own scenario, so they do not cover the
// screens the layout checks look at.
const site = { platformName: 'Online Game', supportEmail: 'support@example.com', currency: 'USD', registrationEnabled: true, maintenanceMode: false, content: { ...defaults, promo: { ...(defaults.promo || {}), enabled: false } } }
const promoOn = { enabled: true, imageId: '', title: 'WELCOME', intro: 'Your lucky floor is open', amount: '$20', amountLabel: 'BONUS', body: 'Spin the reels, chase the multiplier, and find the game that feels lucky tonight.', gameCode: 'HOT_7S', gameLine: "Let's try {game} first!", button: 'Play now' }
let inboxView = { unread: 0, messages: [{ id: 'm0', title: 'Welcome to the floor', body: 'Thanks for joining.', createdAt: now, read: true }] }
const inboxReads = []
const identity = { userId: 'u1', email: 'player@example.com', role: 'USER', permissions: [] }
const engine = {
  layout: 'REEL_3', symbols: ['7', 'BAR', 'CHERRY', 'LEMON', 'BELL'], payline: [0, 1, 2],
  rules: ['Three reels and one center payline.', 'Payouts are total returns, including the stake.'],
  paytable: [{ label: 'Three 7s', multiplier: 50 }, { label: 'Any other three matching', multiplier: 5 }, { label: 'First two reels matching', multiplier: 1.5 }]
}
const games = [
  { code: 'HOT_7S', name: 'Hot 7s', description: 'Turn up the heat on a classic three-reel cabinet.', minStake: 0.1, maxStake: 50, engineType: 'SLOT', featuredSymbol: '7', engine, presentation: { eyebrow: 'House original', tagline: 'Turn up the heat', badge: 'POPULAR', tileSubtitle: 'Slots · From 0.10 credits', collection: 'Originals' } },
  { code: 'FRUIT_RUSH', name: 'Fruit Rush', description: 'A fresh spin on play with juicy multipliers.', minStake: 0.1, maxStake: 25, engineType: 'SLOT', featuredSymbol: 'CHERRY', engine, presentation: { eyebrow: 'House original', tagline: 'A fresh spin', badge: 'NEW', tileSubtitle: 'Slots · From 0.10 credits', collection: 'Originals' } },
  { code: 'ROULETTE', name: 'Roulette', description: 'European single-zero table with multi-bet tickets.', minStake: 0.1, maxStake: 100, engineType: 'ROULETTE', engine: { ...engine, layout: 'ROULETTE' }, presentation: { tileSubtitle: 'Table · From 0.10 credits' } },
  { code: 'ASCENT_CRASH', name: 'Ascent Crash', description: 'Cash out before the climb ends.', minStake: 0.1, maxStake: 50, engineType: 'CRASH', presentation: { tileSubtitle: 'Arcade · From 0.10 credits' } }
]
const wallet = { balance: 125.5, currency: 'USD', held: 20, status: 'ACTIVE' }
const transactions = { items: Array.from({ length: 6 }, (_, i) => ({ id: `t${i}`, type: i % 2 ? 'BET' : 'PAYOUT', amount: i % 2 ? -1.5 : 3.25, description: i % 2 ? 'Hot 7s stake' : 'Hot 7s payout', createdAt: now })), totalPages: 2 }
const bets = { items: Array.from({ length: 6 }, (_, i) => ({ betId: `b${i}`, gameCode: 'HOT_7S', stake: 1.5, payout: i % 3 ? 0 : 7.5, status: i % 3 ? 'LOST' : 'WON', settledAt: now })), totalPages: 2 }

const playHistory = {
  items: Array.from({ length: 6 }, (_, i) => ({ id: `h${i}`, kind: i === 2 ? 'CRASH' : 'ROUND', gameCode: i === 2 ? 'ASCENT_CRASH' : 'HOT_7S', gameName: i === 2 ? 'Ascent Crash' : 'Hot 7s',
    stake: 1.5, payout: i % 3 ? 0 : 7.5, multiplier: i % 3 ? 0 : 5, result: i % 3 ? 'LOSS' : 'WIN', outcome: null, symbols: i === 2 ? [] : ['7', 'BAR', 'CHERRY'],
    notes: i === 2 ? ['Panel 1: lost', 'Crashed at 1.42×'] : [], freeSpin: false, balanceAfter: 120, playedAt: now })),
  nextBefore: now,
  games: [{ code: 'HOT_7S', name: 'Hot 7s', rounds: 5, staked: 7.5, returned: 15, wins: 2, biggestReturn: 7.5, bestMultiplier: 5 },
    { code: 'ASCENT_CRASH', name: 'Ascent Crash', rounds: 1, staked: 1.5, returned: 0, wins: 0, biggestReturn: 0, bestMultiplier: 0 }],
  summary: { code: null, name: 'All games', rounds: 6, staked: 9, returned: 15, wins: 2, biggestReturn: 7.5, bestMultiplier: 5 }
}

const protectionView = {
  limits: [
    { kind: 'DEPOSIT_DAY', amount: 100, used: 40, remaining: 60, pendingAmount: null, pendingRemoval: false, pendingEffectiveAt: null },
    { kind: 'DEPOSIT_WEEK', amount: null, used: null, remaining: null, pendingAmount: null, pendingRemoval: false, pendingEffectiveAt: null },
    { kind: 'DEPOSIT_MONTH', amount: 500, used: 120, remaining: 380, pendingAmount: 900, pendingRemoval: false, pendingEffectiveAt: new Date(Date.now() + 86400000).toISOString() },
    { kind: 'LOSS_DAY', amount: 50, used: 12.5, remaining: 37.5, pendingAmount: null, pendingRemoval: false, pendingEffectiveAt: null },
    { kind: 'LOSS_WEEK', amount: null, used: null, remaining: null, pendingAmount: null, pendingRemoval: false, pendingEffectiveAt: null },
    { kind: 'LOSS_MONTH', amount: null, used: null, remaining: null, pendingAmount: null, pendingRemoval: false, pendingEffectiveAt: null }
  ],
  activeBreak: null, coolingHours: 24
}

/** One withdrawal already under review, so the cancel path has something to act on. */
let withdrawals = [{ id: 'w-1', providerCode: 'SANDBOX_BANK', amount: 40, currency: 'USD', status: 'REQUESTED', failureReason: null, reviewNote: null, createdAt: now, completedAt: null }]
let payoutFails = 1
let liveMissing = false
// The access token lasts 15 minutes. These let the check play out what happens when it runs out mid-session.
let winningRound = false
let liveUnauthorized = 0
let refreshed = false
const liveAuth = []

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
page.on('pageerror', error => console.log('PAGE ERROR:', error.message))

await page.route('**/api/**', async route => {
  const url = new URL(route.request().url())
  const path = url.pathname
  const headers = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' }
  const json = data => route.fulfill({ json: data, headers })
  if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers })
  if (path === '/api/site') return json(site)
  if (path === '/api/inbox') return json(inboxView)
  if (path.startsWith('/api/inbox/')) { inboxReads.push(path); return route.fulfill({ status: 204, headers }) }
  if (path === '/api/auth/login' || path === '/api/auth/register') return json({ ...identity, accessToken: 'preview-token' })
  if (path === '/api/auth/refresh') {
    if (!route.request().headers()['x-session-refresh']) return route.fulfill({ status: 400, json: { message: 'Missing X-Session-Refresh header' }, headers })
    refreshed = true
    return json({ ...identity, accessToken: 'renewed-token' })
  }
  if (path === '/api/auth/me') return json(identity)
  if (path === '/api/games') return json(games)
  if (path === '/api/wallet') return json(wallet)
  if (path === '/api/wallet/transactions') return json(transactions)
  if (path === '/api/bets') return json(bets)
  if (path === '/api/bets/history') return json(playHistory)
  if (path === '/api/live') liveAuth.push(route.request().headers()['authorization'] || '')
  // An expired access token: the app must renew and retry rather than let the floor go quiet.
  if (path === '/api/live' && liveUnauthorized-- > 0) return route.fulfill({ status: 401, json: { message: 'Token expired' }, headers })
  // A backend older than the floor answers this with 401/404. The app must say so, not show a blank space.
  if (path === '/api/live' && liveMissing) return route.fulfill({ status: 404, json: { message: 'No handler' }, headers })
  if (path === '/api/live') return json({
    you: 'ref-me', scoreboardAt: now,
    totals: { rounds: 169, staked: 240.2, biggestMultiplier: 20, players: 5, minutes: 1440 },
    scoreboard: [{ player: 'Nora', gameName: 'Hot 7s', stake: 2, payout: 40, multiplier: 20, settledAt: now }],
    rounds: [{ betId: 'r1', player: null, playerRef: 'ref-x', gameCode: 'HOT_7S', gameName: 'Hot 7s', stake: 1, payout: 0, multiplier: 0, settledAt: now }]
  })
  if (path === '/api/protection') {
    if (route.request().method() !== 'GET') return json(protectionView)   // saving returns the new view
    return json(protectionView)
  }
  if (path.startsWith('/api/protection/')) return json(protectionView)
  if (path === '/api/payments/methods') return json({ demoCredits: true, methods: [
    { providerCode: 'STRIPE', displayName: 'Card (Stripe)', deposits: true, withdrawals: true, currency: 'USD', minAmount: 1, maxAmount: 1000, sandbox: true, payoutAccountRequired: true },
    { providerCode: 'SANDBOX_BANK', displayName: 'Sandbox Bank Transfer', deposits: true, withdrawals: true, currency: 'USD', minAmount: 25, maxAmount: 5000, sandbox: true, payoutAccountRequired: false }
  ] })
  if (path === '/api/payments/withdrawals') {
    if (route.request().method() === 'GET') return json(withdrawals)
    // A withdrawal is money: the first attempt is refused so the retry can be checked for a reused requestId.
    if (payoutFails-- > 0) return route.fulfill({ status: 500, json: { message: 'The provider did not answer.' }, headers })
    const body = JSON.parse(route.request().postData() || '{}')
    const made = { id: 'w-new', providerCode: body.providerCode, amount: body.amount, currency: 'USD', status: 'REQUESTED', failureReason: null, reviewNote: null, createdAt: now, completedAt: null }
    withdrawals = [made, ...withdrawals]
    return json(made)
  }
  if (path.startsWith('/api/payments/withdrawals/') && path.endsWith('/cancel')) {
    const id = path.split('/').at(-2)
    withdrawals = withdrawals.map(item => item.id === id ? { ...item, status: 'CANCELLED', completedAt: now } : item)
    return json(withdrawals.find(item => item.id === id))
  }
  if (path.startsWith('/api/payments/payout-accounts/')) {
    if (path.endsWith('/onboarding')) return json({ url: 'https://connect.stripe.com/setup/e/test_link' })
    if (path.endsWith('/dashboard')) return json({ url: 'https://connect.stripe.com/express/test_dashboard' })
    return json({ providerCode: 'STRIPE', status: 'NONE', detail: null, sandbox: true, updatedAt: null })
  }
  if (path.startsWith('/api/games/') && path.endsWith('/play')) {
    // A paying round when the scenario asks for one, so the win celebration can be checked.
    const body = JSON.parse(route.request().postData() || '{}')
    if (winningRound) return json({ requestId: body.requestId, betId: `b-win-${Date.now()}`, gameCode: 'HOT_7S', symbols: ['7', '7', '7'], stake: 1, payout: 50, balance: 174.5, currency: 'USD', outcome: 'WIN', multiplier: 50 })
    return json({ requestId: body.requestId, betId: 'b9', gameCode: 'HOT_7S', symbols: ['7', '7', 'BAR'], stake: 1, payout: 0, balance: 124.5, currency: 'USD', outcome: 'LOSS', multiplier: 0 })
  }
  if (path === '/api/crash') return json({ id: 'c1', status: 'WAITING', multiplier: 1, serverTime: now, startedAt: now, tickets: [], growthRate: 0.07 })
  return json({ items: [], totalPages: 0 })
})

/** 40px is the tap-target floor and 11px the text floor; below those a phone becomes guesswork. */
const audit = async label => {
  const problems = await page.evaluate(() => {
    const found = new Set()
    const label = el => (el.getAttribute('data-testid') || el.className || el.tagName).toString().slice(0, 40)
    if (document.documentElement.scrollWidth > innerWidth + 1) found.add(`PAGE scrolls sideways (${document.documentElement.scrollWidth}px)`)
    for (const el of document.querySelectorAll('div[role=button], button, a, [tabindex="0"]')) {
      const style = getComputedStyle(el)
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const box = el.getBoundingClientRect()
      if (box.height > 0 && box.height < 40 && el.innerText?.trim())
        found.add(`SMALL_TAP "${el.innerText.trim().slice(0, 22)}" ${Math.round(box.height)}px`)
    }
    // Artwork that bleeds inside a clipped box, and anything in a sideways carousel, is meant to be there.
    const contained = el => {
      for (let parent = el.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
        const style = getComputedStyle(parent)
        if (style.overflow !== 'visible' || style.overflowX !== 'visible' || style.overflowY !== 'visible') return true
      }
      return false
    }
    for (const el of document.querySelectorAll('body *')) {
      const box = el.getBoundingClientRect()
      if (box.width > 0 && box.right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed' && !contained(el))
        found.add(`OFFSCREEN ${label(el)} right=${Math.round(box.right)}`)
      if (el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && getComputedStyle(el).overflowX === 'visible' && !contained(el))
        found.add(`CLIPPED ${label(el)} ${el.scrollWidth}/${el.clientWidth}`)
    }
    // Text people actually have to read.
    for (const el of document.querySelectorAll('div, span, p')) {
      if (!el.children.length && el.innerText?.trim()) {
        const size = parseFloat(getComputedStyle(el).fontSize)
        if (size && size < 11) found.add(`TINY_TEXT ${size}px "${el.innerText.trim().slice(0, 22)}"`)
      }
    }
    return [...found]
  })
  await page.screenshot({ path: `${OUT}/${label}.png`, fullPage: true })
  if (problems.length) findings.push(`${label}: ${problems.join('; ')}`)
  console.log(`## ${label}` + (problems.length ? '\n  ' + problems.slice(0, 12).join('\n  ') : '  (clean)'))
}

/** The app scrolls inside its own view, so a screenshot stops at the fold unless the view is scrolled first. */
const toTheBottom = async () => {
  for (let pass = 0; pass < 4; pass++) {
    await page.evaluate(() => {
      for (const el of document.querySelectorAll('div'))
        if (el.scrollHeight > el.clientHeight + 40) el.scrollTop = el.scrollHeight
    })
    await page.waitForTimeout(400)
  }
}

await page.goto(PREVIEW, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
await audit('01-sign-in')

await page.getByPlaceholder(/email/i).fill('player@example.com').catch(() => {})
await page.locator('input[type=password], input[secureTextEntry]').first().fill('password123').catch(() => {})
await page.getByText(/^(Sign in|Sign In)$/).first().click().catch(() => {})
await page.waitForTimeout(2500)
await audit('02-lobby')

// The floor is the first thing on the lobby, so it is seen without scrolling past the games.
const floorText = await page.locator('body').innerText()
for (const expected of ['rounds · last 24h', 'staked', "TODAY'S BIGGEST WINS".replace("'", '\u2019'), 'ON THE FLOOR']) {
  if (!floorText.includes(expected)) findings.push(`lobby is missing "${expected}" from the floor`)
}
console.log('## floor on the lobby  (totals, biggest wins, recent rounds)')

// A game opens in its own screen; check the one most players will open first.
const tile = page.getByLabel('Play Hot 7s').first()
if (await tile.count()) { await tile.click().catch(() => {}); await page.waitForTimeout(2500); await audit('06-slots') }
// Leave the game before the tabs are checked; without this the later screenshots are still the game.
const back = page.getByText(/Back to lobby/).first()
if (await back.count()) { await back.click(); await page.waitForTimeout(1500) }
await page.getByText('All Games').first().waitFor({ timeout: 15000 })

for (const [label, tabName, expected] of [['03-wallet', 'Wallet', 'Your wallet'], ['04-history', 'History', 'Every round you have played']]) {
  await page.getByText(tabName, { exact: true }).last().click()
  await page.getByText(expected).first().waitFor({ timeout: 15000 })
  await page.waitForTimeout(800)
  await audit(label)
}

// Taking money out. The cashier's panes sit behind the wallet tab, in the order the web wallet uses.
await page.getByText('Wallet', { exact: true }).last().click()
await page.getByText('Your wallet').first().waitFor({ timeout: 15000 })
await page.getByRole('tab', { name: 'Withdraw' }).click()
await page.getByLabel('Withdraw with Sandbox Bank Transfer').waitFor({ timeout: 15000 })

// Stripe pays into an account the player sets up first, and is the method offered first — so it must ask for
// that setup, and must not ask for an amount it has no way to pay.
await page.getByText('Set up payouts with Stripe').waitFor({ timeout: 10000 })
if (await page.getByLabel('Withdrawal amount').count()) findings.push('Stripe asks for an amount before payouts are set up')
await toTheBottom()
await audit('10-payout-setup')
console.log('## payout setup  (amount hidden until the processor can pay)')

await page.getByLabel('Withdraw with Sandbox Bank Transfer').click()
await page.getByLabel('Withdrawal amount').waitFor({ timeout: 10000 })
await toTheBottom()
await audit('09-withdraw')

// Below the method's minimum, the app says so rather than letting the server refuse it.
await page.getByLabel('Withdrawal amount').fill('5')
await page.getByText('The smallest withdrawal is 25.00 USD.').waitFor({ timeout: 10000 })
// More than the balance is the mistake players actually make: within the method's range, but not theirs.
await page.getByLabel('Withdrawal amount').fill('200')
await page.getByText('You have 125.50 USD available.').waitFor({ timeout: 10000 })
console.log('## withdrawal limits  (below the minimum and above the balance are both refused here)')

// The first request fails at the provider; the retry must carry the SAME requestId, or one withdrawal becomes two.
await page.getByLabel('Withdrawal amount').fill('40')
const firstTry = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/payments/withdrawals'), { timeout: 10000 })
await page.getByRole('button', { name: 'Request withdrawal' }).click()
const firstBody = JSON.parse((await firstTry).postData() || '{}')
await page.getByText('The provider did not answer.').waitFor({ timeout: 10000 })
const retry = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/payments/withdrawals'), { timeout: 10000 })
await page.getByRole('button', { name: 'Request withdrawal' }).click()
const retryBody = JSON.parse((await retry).postData() || '{}')
if (firstBody.providerCode !== 'SANDBOX_BANK' || firstBody.amount !== 40) findings.push(`withdrawal sent ${JSON.stringify(firstBody)}`)
if (!firstBody.requestId) findings.push('withdrawal sent no requestId')
if (firstBody.requestId !== retryBody.requestId) findings.push('a retried withdrawal sent a new requestId, so it could be paid twice')
await page.getByText('is on hold until it is reviewed and paid.').waitFor({ timeout: 10000 })
console.log('## withdrawal request  (POST once, retried with the same requestId)')

// Until staff review it, the player can take it back.
const cancelled = page.waitForRequest(r => r.url().includes('/api/payments/withdrawals/') && r.url().endsWith('/cancel'), { timeout: 10000 })
await page.getByRole('button', { name: 'Cancel withdrawal of 40.00 USD' }).first().click()
await cancelled
await page.getByText('The money is available again.').waitFor({ timeout: 10000 })
console.log('## withdrawal cancel  (POST /api/payments/withdrawals/{id}/cancel)')

// The app scrolls inside its own view, so a full-page screenshot stops at the fold. Check what is below it too.
await page.getByRole('tab', { name: 'Limits' }).click()
await page.getByText('Your limits').first().waitFor({ timeout: 15000 })
await toTheBottom()
await audit('08-play-limits')

// Saving a limit must reach the server as the API expects it: a PUT for that window, carrying the amount.
const saved = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/api/protection/limits/'), { timeout: 10000 })
await page.getByRole('textbox', { name: 'Deposits in 24 hours limit' }).fill('25')
await page.getByRole('button', { name: 'Save Deposits in 24 hours limit' }).click()
const request = await saved
if (!request.url().endsWith('/api/protection/limits/DEPOSIT_DAY')) findings.push(`limit save went to ${request.url()}`)
if (JSON.parse(request.postData() || '{}').amount !== 25) findings.push(`limit save sent ${request.postData()}`)
console.log('## limit save  (PUT /api/protection/limits/DEPOSIT_DAY {"amount":25})')

// Removing one sends the same call with no amount, which is how the server is told to drop it.
const removed = page.waitForRequest(request => request.method() === 'PUT' && request.url().includes('/api/protection/limits/'), { timeout: 10000 })
await page.getByRole('button', { name: 'Remove Deposits in 24 hours limit' }).click()
if (JSON.parse((await removed).postData() || '{}').amount !== null) findings.push('limit removal did not send a null amount')
console.log('## limit removal  (PUT with {"amount":null})')

// A self-exclusion must ask first: the button alone must not start it.
await page.getByRole('button', { name: 'Self-exclude for 1 year' }).click()
await page.getByText('Self-exclude for 1 year?').waitFor({ timeout: 10000 })
const started = page.waitForRequest(request => request.url().includes('/api/protection/break'), { timeout: 10000 })
await page.getByText('Yes, start it').click()
const breakBody = JSON.parse((await started).postData() || '{}')
if (breakBody.kind !== 'SELF_EXCLUSION' || breakBody.duration !== '1y') findings.push(`break sent ${JSON.stringify(breakBody)}`)
console.log('## break confirmation  (asks first, then POST /api/protection/break)')

// The app has its own landscape layout (a phone turned sideways, and the game screens).
await page.setViewportSize({ width: 844, height: 390 })
await page.waitForTimeout(1500)
// The checks above left the app on the wallet, so this is what sideways looks like there.
await audit('07-landscape-wallet')

await page.getByText('Home', { exact: true }).last().click()
await page.getByText('All Games').first().waitFor({ timeout: 15000 })
await page.waitForTimeout(800)
await audit('07b-landscape-lobby')

// A phone held sideways is how this app is played. The game must be the larger half of that screen: the two
// columns were once decided by flex ratios that Android and the browser divided differently, and the game
// ended up the smaller side on a real device.
await page.getByLabel('Play Hot 7s').first().click()
await page.getByText(/Back to lobby/).first().waitFor({ timeout: 15000 })
await page.waitForTimeout(1200)
const stage = await page.evaluate(() => {
  const reels = [1, 2, 3].map(n => document.querySelector(`[aria-label^="Reel ${n}"]`)).filter(Boolean)
  if (reels.length < 3) return null
  const boxes = reels.map(el => el.getBoundingClientRect())
  return { right: Math.round(Math.max(...boxes.map(b => b.right))), height: Math.round(boxes[0].height), width: innerWidth }
})
if (!stage) findings.push('the slot reels were not found on the landscape game screen')
else {
  if (stage.right < stage.width * 0.55) findings.push(`the game is the smaller half in landscape (reels end at ${stage.right} of ${stage.width})`)
  if (stage.height < 190) findings.push(`the reels are only ${stage.height}px tall in landscape`)
  console.log(`## landscape game  (reels ${stage.height}px tall, stage reaches ${stage.right} of ${stage.width})`)
}
await audit('13-landscape-game')

// Winning has to look like winning. The reels stop one at a time, so this waits for the whole round.
winningRound = true
await page.getByRole('button', { name: /^SPIN$/ }).click()
await page.getByText('BIG WIN').waitFor({ timeout: 20000 })
await page.getByText('50.00').first().waitFor({ timeout: 10000 })
await audit('14-win')
console.log('## win celebration  (BIG WIN banner and the payout, over the cabinet)')
// It gets out of the way on its own rather than needing a tap.
await page.getByText('BIG WIN').waitFor({ state: 'hidden', timeout: 20000 })
console.log('## win celebration clears  (banner leaves by itself)')
winningRound = false

// An expired token must not kill the floor: the app renews the session and the data keeps coming.
liveUnauthorized = 1
liveAuth.length = 0
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(PREVIEW, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const enterAgain = page.getByRole('button', { name: /Continue quietly|Enter with sound|Skip intro/ }).first()
if (await enterAgain.count()) { await enterAgain.click(); await page.waitForTimeout(1500) }
await page.getByPlaceholder(/email/i).fill('player@example.com').catch(() => {})
await page.locator('input[type=password], input[secureTextEntry]').first().fill('password123').catch(() => {})
await page.getByText(/^(Sign in|Sign In)$/).first().click().catch(() => {})
await page.getByText('rounds · last 24h').waitFor({ timeout: 20000 })
if (!refreshed) findings.push('an expired token did not trigger POST /api/auth/refresh')
if (!liveAuth.includes('Bearer renewed-token')) findings.push(`the floor was not retried with the renewed token (saw ${JSON.stringify(liveAuth)})`)
await audit('12-floor-after-renewal')
console.log('## session renewal  (expired token renewed, floor retried and shown)')

// A server without the live floor must explain itself. Silence reads as "the feature is missing".
liveMissing = true
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(PREVIEW, { waitUntil: 'networkidle' })
await page.waitForTimeout(3000)
const enter = page.getByRole('button', { name: /Continue quietly|Enter with sound|Skip intro/ }).first()
if (await enter.count()) { await enter.click(); await page.waitForTimeout(1500) }
await page.getByPlaceholder(/email/i).fill('player@example.com').catch(() => {})
await page.locator('input[type=password], input[secureTextEntry]').first().fill('password123').catch(() => {})
await page.getByText(/^(Sign in|Sign In)$/).first().click().catch(() => {})
await page.getByText('All Games').first().waitFor({ timeout: 20000 })
await page.getByText('does not provide live activity').waitFor({ timeout: 15000 })
await audit('11-floor-unavailable')
console.log('## floor unavailable  (says the server has no live activity instead of showing nothing)')

// A broadcast and the welcome offer: the offer first, then the new message, one at a time; then the inbox.
liveMissing = false
site.content = { ...site.content, promo: promoOn }
inboxView = { unread: 1, messages: [{ id: 'm1', title: 'Weekend bonus is live', body: 'Every deposit this weekend gets 20% extra credits. Good luck on the floor!', createdAt: now, read: false }, ...inboxView.messages] }
await page.goto(PREVIEW, { waitUntil: 'networkidle' })
await page.waitForTimeout(2500)
await page.getByPlaceholder(/email/i).fill('player@example.com').catch(() => {})
await page.locator('input[type=password], input[secureTextEntry]').first().fill('password123').catch(() => {})
await page.getByText(/^(Sign in|Sign In)$/).first().click().catch(() => {})
await page.getByText('WELCOME', { exact: true }).waitFor({ timeout: 20000 })
await page.waitForTimeout(900)
if (await page.getByText('Weekend bonus is live').count()) findings.push('welcome-popup: the new message opened on top of the welcome offer')
if (!(await page.getByText('Hot 7s', { exact: true }).count())) findings.push('welcome-popup: the offer does not name its game')
await audit('15-welcome-popup')
await page.getByRole('button', { name: 'Close', exact: true }).first().click()
await page.getByText('Weekend bonus is live').waitFor({ timeout: 10000 })
await page.waitForTimeout(600)
await audit('16-new-message')
await page.getByText('Got it', { exact: true }).click()
await page.waitForTimeout(600)
if (!inboxReads.some(path => path.endsWith('/m1/read'))) findings.push('new-message: "Got it" did not mark the message read')
await page.getByRole('button', { name: /^Inbox/ }).first().click()
await page.getByText('Welcome to the floor').waitFor({ timeout: 10000 })
await page.waitForTimeout(500)
await audit('17-inbox')
await page.getByRole('button', { name: 'Close', exact: true }).first().click()
const soundButton = page.getByRole('button', { name: /Turn sound off/ }).first()
if (!(await soundButton.count())) findings.push('sound: no sound switch in the header')
else { await soundButton.click(); await page.waitForTimeout(300); if (!(await page.getByRole('button', { name: /Turn sound on/ }).count())) findings.push('sound: the switch did not turn sound off') }
console.log('## welcome offer, new message, inbox and sound switch')

// Log out: in plain sight on the Account tab, asks first, tells the server, and lands on the sign-in screen.
await page.getByRole('tab', { name: /Account/ }).first().click()
await page.getByText('Your account').waitFor({ timeout: 10000 })
await page.waitForTimeout(400)
await audit('18-account')
const loggedOut = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/api/auth/logout'), { timeout: 10000 })
page.once('dialog', dialog => dialog.accept())
await page.getByText('⏻  Log out', { exact: true }).click()
await loggedOut
await page.getByText('Welcome back.').waitFor({ timeout: 10000 })
console.log('## log out  (asks first, POST /api/auth/logout, back to sign-in)')

await browser.close()

if (findings.length) {
  console.error('\nFAIL\n' + findings.map(line => '  ' + line).join('\n'))
  process.exitCode = 1
} else {
  console.log(`\nPASS: sign-in, lobby, slots, wallet, withdraw, history, landscape (lobby, wallet, game), welcome offer, new message, inbox, sound switch and log out fit a phone. Screenshots in ${OUT}/.`)
}
