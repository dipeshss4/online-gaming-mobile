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
  { code: 'DRAGON_TIDE', name: 'Dragon Tide', description: 'Fish-table shooter.', minStake: 0.1, maxStake: 10, engineType: 'FISH', featuredSymbol: 'DRAGON',
    engine: { layout: 'FISH', symbols: ['SHRIMP', 'SHARK', 'DRAGON'], payline: [0, 1], rules: ['Each bullet costs the bet when it hits a creature.'],
      paytable: [['SHRIMP', 'Shrimp', 2], ['CLOWNFISH', 'Clownfish', 3], ['PUFFER', 'Pufferfish', 5], ['ANGELFISH', 'Angelfish', 8], ['TURTLE', 'Sea Turtle', 12], ['LANTERN', 'Lanternfish', 15],
        ['OCTOPUS', 'Octopus', 20], ['STINGRAY', 'Stingray', 30], ['SWORDFISH', 'Swordfish', 50], ['SHARK', 'Great Shark', 80], ['WHALE', 'Golden Whale', 120]].map(([code, label, multiplier]) => ({ label, multiplier, pattern: [code, 'HIT'] }))
        .concat([100, 150, 200, 300, 500].map(x => ({ label: `Tide Dragon ${x}x`, multiplier: x, pattern: ['DRAGON', `HIT${x}`] }))) },
    presentation: { glyph: '🐉', tileSubtitle: 'Fish table · Up to 500x' } },
  { code: 'VEGAS_JACKPOT_DEVIL_HEART', name: 'Vegas Jackpot: Devil Heart', description: 'Five lines, locking wilds.', minStake: 0.1, maxStake: 50, engineType: 'CLASSIC_5L', featuredSymbol: 'SEVEN',
    engine: { layout: 'CLASSIC_5L', symbols: ['SEVEN', 'BAR3', 'BAR2', 'BAR1', 'WILD', 'X2', 'JACKPOT', 'BLANK'], payline: [], rules: ['Three reels and five fixed lines.'], paytable: [],
      lines: [[3, 4, 5], [0, 1, 2], [6, 7, 8], [0, 4, 8], [6, 4, 2]] },
    presentation: { badge: 'HOT', tileSubtitle: 'JACKPOT 10X–30X' } },
  { code: 'SEVEN_STARS_DELUXE', name: 'Seven Stars Deluxe', description: 'Five reels, twenty lines, wilds and free spins.', minStake: 0.2, maxStake: 100, engineType: 'VIDEO_5X3', featuredSymbol: '7',
    engine: { layout: 'VIDEO_5X3', symbols: ['7', 'BAR', 'BELL', 'STAR', 'WATERMELON', 'GRAPE', 'ORANGE', 'LEMON', 'CHERRY', 'WILD', 'SCATTER'], payline: [],
      rules: ['Five reels, three rows and twenty fixed lines.', 'Three or more SCATTER symbols anywhere award 8 free spins. Every free-spin win pays double.'],
      // The server's twenty lines (VideoSlotRules.LINE_ROWS), as cell indexes into a screen.
      lines: [[1,1,1,1,1],[0,0,0,0,0],[2,2,2,2,2],[0,1,2,1,0],[2,1,0,1,2],[0,0,1,2,2],[2,2,1,0,0],[1,0,0,0,1],[1,2,2,2,1],[0,1,1,1,0],
        [2,1,1,1,2],[1,0,1,2,1],[1,2,1,0,1],[0,1,0,1,0],[2,1,2,1,2],[1,1,0,1,1],[1,1,2,1,1],[0,2,0,2,0],[2,0,2,0,2],[0,2,2,2,0]].map(rows => rows.map((row, reel) => row * 5 + reel)),
      paytable: [['7', 'Sevens', 10, 40, 200], ['BAR', 'Bars', 5, 20, 80], ['WILD', 'Wilds', 20, 100, 500]].flatMap(([code, label, ...pays]) => pays.map((multiplier, i) => ({ label: `${i + 3} ${label}`, multiplier, pattern: Array(i + 3).fill(code) }))) },
    presentation: { eyebrow: 'DELUXE SERIES', badge: 'NEW · VIDEO SLOT', tileSubtitle: '20 LINES · FREE SPINS' } },
  { code: 'GALAXY_KENO', name: 'Galaxy Keno', description: 'Mark up to ten numbers.', minStake: 0.1, maxStake: 2, engineType: 'KENO', featuredSymbol: 'STAR',
    engine: { layout: 'KENO', symbols: Array.from({ length: 80 }, (_, i) => String(i + 1)), payline: [], rules: ['Mark 1 to 10 numbers from 1 to 80, then play.'],
      paytable: [[1, 1, 3.8], [2, 2, 15.8], [3, 2, 2.5], [3, 3, 43]].map(([picks, hits, multiplier]) => ({ label: `${picks} picks, ${hits} hits`, multiplier, pattern: [`PICK${picks}`, `HIT${hits}`] })) },
    presentation: { glyph: '🎱', badge: 'NEW · KENO', tileSubtitle: 'UP TO 10,000X' } },
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
const fishShots = []
const videoBets = []
const kenoBets = []
const slotBets = []
const devilBets = []
let fishBalance = 125.5
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
    if (path === '/api/games/DRAGON_TIDE/play') {
      fishShots.push(body)
      const multiplier = fishShots.length % 2 ? ({ SHRIMP: 2, CLOWNFISH: 3, PUFFER: 5 }[body.selection] ?? 0) : 0
      fishBalance = Math.round((fishBalance - body.stake + body.stake * multiplier) * 100) / 100
      return json({ requestId: body.requestId, betId: `f${fishShots.length}`, gameCode: 'DRAGON_TIDE', symbols: [body.selection, multiplier ? 'HIT' : 'MISS'], stake: body.stake,
        payout: Math.round(body.stake * multiplier * 100) / 100, balance: fishBalance, currency: 'USD', outcome: multiplier ? 'SMALL_WIN' : 'LOSS', multiplier, walletSequence: 100 + fishShots.length })
    }
    if (path === '/api/games/VEGAS_JACKPOT_DEVIL_HEART/play') {
      devilBets.push(body)
      // First spin: a WILD on reel 2 fills it and locks; 7 · WILD · 7 on the middle line pays 12 line bets, then the
      // respin pays the middle line again (7 · WILD · 7) for 24 line bets in all: 4.8x the bet.
      if (devilBets.length === 1) {
        const base = ['BAR1', 'WILD', 'BLANK', 'SEVEN', 'WILD', 'SEVEN', 'BLANK', 'WILD', 'BAR2']
        const respin = ['BAR3', 'WILD', 'BLANK', 'SEVEN', 'WILD', 'SEVEN', 'BLANK', 'WILD', 'BAR1']
        return json({ requestId: body.requestId, betId: 'd1', gameCode: 'VEGAS_JACKPOT_DEVIL_HEART', symbols: [...base, ...respin], stake: body.stake,
          payout: 0.48, balance: 125.88, currency: 'USD', outcome: 'BIG_WIN', multiplier: 4.8 })
      }
      // Second spin: three JACKPOTs on the top line win the 20x jackpot (a WILD reel would cross every line, so no lock here).
      const screen = ['JACKPOT', 'JACKPOT', 'JACKPOT', 'BAR1', 'SEVEN', 'BAR2', 'BLANK', 'BAR3', 'BLANK']
      return json({ requestId: body.requestId, betId: 'd2', gameCode: 'VEGAS_JACKPOT_DEVIL_HEART', symbols: [...screen, 'JP20'], stake: body.stake,
        payout: 2, balance: 127.78, currency: 'USD', outcome: 'JACKPOT', multiplier: 20 })
    }
    if (path === '/api/games/GALAXY_KENO/play') {
      kenoBets.push(body)
      const drawn = [42, 3, 7, 55, 19, 61, 70, 12, 33, 28, 80, 1, 64, 50, 45, 9, 77, 22, 36, 58].map(String)
      return json({ requestId: body.requestId, betId: 'k1', gameCode: 'GALAXY_KENO', symbols: [body.selection, ...drawn], stake: body.stake, payout: 4.3, balance: 129.6, currency: 'USD', outcome: 'BIG_WIN', multiplier: 43 })
    }
    if (path === '/api/games/SEVEN_STARS_DELUXE/play') {
      videoBets.push(body)
      // Three 7s on the middle line and three scatters on the top row, then eight free spins: the first pays three BARs.
      const quiet = rows => [0, 1, 2].flatMap(row => [0, 1, 2, 3, 4].map(reel => rows[reel][row]))
      const blanks = [['CHERRY', 'LEMON', 'GRAPE'], ['BELL', 'ORANGE', 'STAR'], ['WATERMELON', 'LEMON', 'CHERRY'], ['GRAPE', 'BELL', 'ORANGE'], ['STAR', 'CHERRY', 'LEMON']]
      const base = ['SCATTER', 'BAR', 'SCATTER', 'BELL', 'SCATTER', '7', '7', '7', 'LEMON', 'CHERRY', 'BELL', 'CHERRY', 'LEMON', 'BAR', 'GRAPE']
      const bars = quiet(blanks); bars[5] = bars[6] = bars[7] = 'BAR'
      const symbols = [...base, ...bars, ...Array.from({ length: 7 }, () => quiet(blanks))].flat()
      return json({ requestId: body.requestId, betId: 'v1', gameCode: 'SEVEN_STARS_DELUXE', symbols, stake: body.stake, payout: 4, balance: 129.3, currency: 'USD', outcome: 'BIG_WIN', multiplier: 20 })
    }
    slotBets.push(body)
    if (winningRound) return json({ requestId: body.requestId, betId: `b-win-${Date.now()}`, gameCode: 'HOT_7S', symbols: ['7', '7', '7'], stake: 1, payout: 50, balance: 174.5, currency: 'USD', outcome: 'WIN', multiplier: 50 })
    return json({ requestId: body.requestId, betId: 'b9', gameCode: 'HOT_7S', symbols: ['7', '7', 'BAR'], stake: 1, payout: 0, balance: 124.5, currency: 'USD', outcome: 'LOSS', multiplier: 0 })
  }
  // GET lists the player's flights; POST launches one.
  if (path === '/api/crash') return route.request().method() === 'GET' ? json([]) : json({ id: 'c1', status: 'WAITING', multiplier: 1, serverTime: now, startedAt: now, tickets: [], growthRate: 0.07 })
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
// The app opens with its intro: the coin, LOOT 777X and the tagline, then it fades into the app by itself.
const intro = page.getByRole('button', { name: 'Skip intro' })
if (!await intro.waitFor({ timeout: 5000 }).then(() => true).catch(() => false)) findings.push('intro: the app did not open with its intro')
else {
  await page.waitForTimeout(2600)
  await page.screenshot({ path: `${OUT}/00-intro.png` })
  if (!await page.getByText('THE ORIGINAL COLLECTION').first().isVisible().catch(() => false)) findings.push('intro: the tagline never appeared')
  await intro.waitFor({ state: 'detached', timeout: 6000 }).catch(() => findings.push('intro: it did not hand over to the app on its own'))
  console.log('## intro  (plays, then fades into the app)')
}
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
const back = page.getByLabel('Back to lobby').first()
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
await page.getByLabel('Back to lobby').first().waitFor({ timeout: 15000 })
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

// The bet is set with MIN, −, +, MAX and a picker of every allowed bet: nobody types a number.
const shownBet = async () => (await page.getByLabel(/^Bet [0-9.]+, choose a bet$/).first().getAttribute('aria-label')).match(/[0-9.]+/)[0]
await page.getByLabel('Maximum bet').first().click()
if (await shownBet() !== '50.00') findings.push(`bet bar: MAX set ${await shownBet()}, not the game's 50.00`)
await page.getByLabel('Minimum bet').first().click()
if (await shownBet() !== '0.10') findings.push(`bet bar: MIN set ${await shownBet()}`)
await page.getByLabel('Increase bet').first().click()
if (await shownBet() !== '0.20') findings.push(`bet bar: + went to ${await shownBet()}, not the next size 0.20`)
await page.getByLabel(/^Bet [0-9.]+, choose a bet$/).first().click()
await page.getByLabel('Bet 1.00', { exact: true }).click()
if (await shownBet() !== '1.00') findings.push(`bet bar: picking 1.00 set ${await shownBet()}`)
await page.waitForTimeout(600)
const bar = await page.evaluate(() => [...document.querySelectorAll('[aria-label="Maximum bet"],[aria-label="Minimum bet"],[aria-label="Increase bet"],[aria-label="Decrease bet"]')].map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.left), Math.round(r.right), Math.round(r.width), Math.round(r.height)] }))
if (bar.some(([left, right, w, h]) => left < 0 || right > (page.viewportSize()?.width ?? 9999) || w < 40 || h < 40)) findings.push(`bet bar: a button is cut off or small ${JSON.stringify(bar)}`)
await audit('13b-bet-bar')
console.log('## bet bar  (MAX 50.00, MIN 0.10, + 0.20, picker 1.00)')

// Winning has to look like winning. The reels stop one at a time, so this waits for the whole round.
winningRound = true
await page.getByRole('button', { name: 'Spin', exact: true }).click()
// The tease: 7 · 7 on the first two reels, so the last reel spins on, glowing, before it lands.
await page.waitForTimeout(1600)
await page.screenshot({ path: `${OUT}/14a-tease.png` })
// 50x the bet is an EPIC WIN: the full-screen show, the amount rolling up to the server's payout, tap to collect.
await page.getByText('EPIC WIN').first().waitFor({ timeout: 20000 })
if (slotBets.at(-1)?.stake !== 1) findings.push(`bet bar: the spin sent stake ${slotBets.at(-1)?.stake}, not the 1.00 picked`)
await page.waitForTimeout(1200)
await page.screenshot({ path: `${OUT}/14b-epic-win.png` })
await page.getByText('50.00').first().waitFor({ timeout: 10000 })
await audit('14-win')
console.log('## win celebration  (EPIC WIN show, amount rolls up to 50.00)')
await page.getByRole('button', { name: /EPIC WIN: 50.00. Tap to collect/ }).click()
await page.getByText('EPIC WIN').first().waitFor({ state: 'hidden', timeout: 5000 }).catch(() => findings.push('big win: tapping did not collect'))
console.log('## win celebration clears  (tap to collect)')
winningRound = false

// Dragon Tide, the fish table, drawn with Skia: it fills the sideways screen, and firing at a creature is a bet on it.
await page.getByLabel('Back to lobby').first().click()
await page.getByText('All Games').first().waitFor({ timeout: 15000 })
await page.getByLabel('Play Dragon Tide').first().click()
// Every game opens behind the branded loading screen: the logo, the game's name and a progress bar that moves.
await page.getByTestId('game-loading').waitFor({ timeout: 10000 })
const readings = []
let loadingText = ''
for (let i = 0; i < 6; i++) {
  const text = await page.getByTestId('game-loading').innerText().catch(() => '')
  const match = /(\d+)%/.exec(text); if (match) readings.push(Number(match[1]))
  if (!loadingText) loadingText = text
  if (i === 1) await page.screenshot({ path: `${OUT}/19a-game-loading.png` })
  await page.waitForTimeout(150)
}
if (!/LOOT777X/.test(loadingText)) findings.push('game loading: the Loot777x logo is missing')
if (!(readings.length >= 2 && readings[readings.length - 1] > readings[0])) findings.push(`game loading: the progress did not move (${readings.join(', ')})`)
await page.getByTestId('game-loading').waitFor({ state: 'detached', timeout: 10000 }).catch(() => findings.push('game loading: the loading screen never left'))
const loadingNow = readings.join('→')
console.log(`## game loading screen  (logo, progress ${loadingNow}%, then gone)`)
await page.getByLabel('Back to games').waitFor({ timeout: 30000 })
await page.waitForFunction(() => document.querySelector('canvas')?.getBoundingClientRect().height > 0, null, { timeout: 30000 })
await page.waitForTimeout(2500)
const table = await page.evaluate(() => { const box = document.querySelector('canvas').getBoundingClientRect(); return { width: Math.round(box.width), height: Math.round(box.height) } })
if (table.height < 360 || table.width < 640) findings.push(`the fish table is only ${table.width}x${table.height} on a phone held sideways`)
await audit('19-fish-table')
const box = await page.locator('canvas').first().boundingBox()
await page.mouse.move(box.x + box.width * .5, box.y + box.height * .4)
await page.mouse.down()
for (let i = 0; i < 40 && fishShots.length < 3; i++) await page.waitForTimeout(250)
await page.mouse.up()
await page.waitForTimeout(1200)
if (!fishShots.length) findings.push('fish table: holding on the table fired no bet at a creature')
for (const shot of fishShots) if (!shot.selection || shot.stake !== 0.1 || !/^[0-9a-f-]{36}$/.test(shot.requestId)) findings.push(`fish table: a malformed bet ${JSON.stringify(shot)}`)
await page.getByTestId('fish-balance').filter({ hasText: fishBalance.toFixed(2) }).waitFor({ timeout: 10000 }).catch(() => findings.push(`fish table: the credits did not show ${fishBalance.toFixed(2)} after the shots`))
await audit('20-fish-table-play')
await page.getByLabel('Paytable and rules').click()
await page.getByText('×100–500').waitFor({ timeout: 5000 }).catch(() => findings.push('fish table: the paytable does not show the dragon'))
await audit('21-fish-paytable')
await page.getByLabel('Close').last().click()
console.log(`## fish table  (${table.width}x${table.height}, ${fishShots.length} bets on ${[...new Set(fishShots.map(s => s.selection))].join(', ')})`)
await page.getByLabel('Back to games').click()
await page.getByText('All Games').first().waitFor({ timeout: 15000 })

// The five-reel video slot opens behind the loading screen and plays: a round, then the free spins its scatters award.
await page.getByLabel('Play Seven Stars Deluxe').first().click()
await page.getByTestId('game-loading').waitFor({ timeout: 10000 })
await page.getByTestId('game-loading').waitFor({ state: 'detached', timeout: 10000 }).catch(() => findings.push('video slot: the loading screen never left'))
await page.getByLabel(/^Reel 5:/).waitFor({ timeout: 15000 }).catch(() => findings.push('video slot: the five reels did not show'))
const reels = await page.evaluate(() => [...document.querySelectorAll('[aria-label^="Reel "]')].map(el => { const box = el.getBoundingClientRect(); return { width: Math.round(box.width), height: Math.round(box.height) } }))
if (reels.length !== 5 || reels.some(reel => reel.width < 40 || reel.height < 120)) findings.push(`video slot: the reels are ${JSON.stringify(reels)}`)
await audit('22-video-slot')
await page.getByRole('button', { name: 'Spin', exact: true }).click()
await page.getByText('8 FREE SPINS', { exact: true }).waitFor({ timeout: 20000 }).catch(() => findings.push('video slot: three scatters did not announce the free spins'))
await page.screenshot({ path: `${OUT}/23a-video-free-spins.png` })
await page.getByText(/WIN 4\.00/).first().waitFor({ timeout: 40000 }).catch(() => findings.push('video slot: the round never showed the server\'s return'))
await page.getByText('129.30').first().waitFor({ timeout: 5000 }).catch(() => findings.push('video slot: the balance did not move to the server\'s'))
if (videoBets.length !== 1 || videoBets[0].stake !== 0.2 || !/^[0-9a-f-]{36}$/.test(videoBets[0].requestId)) findings.push(`video slot: the bets sent were ${JSON.stringify(videoBets)}`)
await audit('23-video-slot-played')
console.log(`## video slot  (${reels.length} reels ${reels[0]?.width}x${reels[0]?.height}, one bet, 8 free spins, return 4.00)`)
await page.getByLabel('Back to lobby').first().click()
await page.getByText('All Games').first().waitFor({ timeout: 15000 })

// Vegas Jackpot: Devil Heart: a WILD reel locks for a free respin, and three JACKPOTs win the jackpot.
await page.getByRole('tab', { name: 'SLOTS' }).click()
await page.getByLabel('Play Vegas Jackpot: Devil Heart').first().click()
await page.getByTestId('game-loading').waitFor({ state: 'detached', timeout: 15000 }).catch(() => findings.push('devil heart: the loading screen never left'))
await page.getByLabel(/^Reel 3:/).waitFor({ timeout: 15000 }).catch(() => findings.push('devil heart: the reels did not show'))
await audit('27-devil-heart')
await page.getByRole('button', { name: 'Spin' }).click()
await page.getByText('LOCKED').first().waitFor({ timeout: 15000 }).catch(() => findings.push('devil heart: the WILD reel did not lock'))
await page.getByText('WILD LOCKED · FREE RESPIN!').waitFor({ timeout: 5000 }).catch(() => findings.push('devil heart: no respin announced'))
await page.screenshot({ path: `${OUT}/27a-devil-locked.png` })
await page.getByText('WIN 0.48').waitFor({ timeout: 20000 }).catch(() => findings.push("devil heart: the respin round never showed the server's 0.48"))
await page.getByRole('button', { name: 'Spin' }).click()
await page.getByText('20× BET').waitFor({ timeout: 20000 }).catch(() => findings.push('devil heart: the jackpot was not shown'))
await page.screenshot({ path: `${OUT}/27b-devil-jackpot.png` })
await page.getByText('WIN 2.00').waitFor({ timeout: 20000 }).catch(() => findings.push("devil heart: the jackpot round never showed the server's 2.00"))
if (devilBets.length !== 2 || devilBets.some(bet => bet.stake !== 0.1 || !/^[0-9a-f-]{36}$/.test(bet.requestId)) || devilBets[0].requestId === devilBets[1].requestId) findings.push(`devil heart: the bets sent were ${JSON.stringify(devilBets)}`)
await audit('28-devil-heart-played')
console.log('## devil heart  (WILD reel locked, respin, 0.48; then a 20x jackpot, 2.00)')
await page.getByLabel('Back to lobby').first().click()
await page.getByRole('tab', { name: 'ALL GAMES' }).click()

// The lobby's dock files games by kind, as the game rooms do: keno sits under OTHER, the fish table under FISHING.
await page.getByRole('tab', { name: 'OTHER' }).click()
await page.getByLabel('Play Galaxy Keno').first().waitFor({ timeout: 5000 }).catch(() => findings.push('lobby: keno is not under OTHER'))
if (await page.getByLabel('Play Hot 7s').count()) findings.push('lobby: a slot shows under OTHER')
await audit('24-lobby-other')
await page.getByRole('tab', { name: 'FISHING' }).click()
await page.getByLabel('Play Dragon Tide').first().waitFor({ timeout: 5000 }).catch(() => findings.push('lobby: the fish table is not under FISHING'))
await page.getByRole('tab', { name: 'OTHER' }).click()

// Galaxy Keno: mark three numbers, play, watch twenty balls; the ticket sent is the numbers marked.
await page.getByLabel('Play Galaxy Keno').first().click()
await page.getByTestId('game-loading').waitFor({ state: 'detached', timeout: 15000 }).catch(() => findings.push('keno: the loading screen never left'))
await page.getByLabel('Keno board').waitFor({ timeout: 15000 })
for (const n of [42, 7, 19]) await page.getByLabel(`Number ${n}`, { exact: true }).click()
const board = await page.getByLabel('Keno board').boundingBox()
// The board reshapes to the screen (16 by 5 on a short phone held sideways); what matters is a ball big enough to tap.
const ball = await page.getByLabel('Number 42', { exact: false }).first().boundingBox()
if (!board || !ball || ball.height < 40 || board.width > 844) findings.push(`keno: balls are ${Math.round(ball?.height)}px on a board ${Math.round(board?.width)}x${Math.round(board?.height)}`)
await audit('25-keno-marked')
await page.getByRole('button', { name: /^PLAY$/ }).click()
await page.getByText('3 HITS · WIN 4.30').waitFor({ timeout: 20000 }).catch(() => findings.push('keno: the result never showed the server\'s return'))
if (kenoBets.length !== 1 || kenoBets[0].selection !== '7-19-42' || kenoBets[0].stake !== 0.1 || !/^[0-9a-f-]{36}$/.test(kenoBets[0].requestId)) findings.push(`keno: the bets sent were ${JSON.stringify(kenoBets)}`)
await audit('26-keno-played')
console.log(`## keno  (board ${Math.round(board?.width)}x${Math.round(board?.height)}, ticket ${kenoBets[0]?.selection}, 3 hits, return 4.30)`)
await page.getByLabel('Back to lobby').first().click()
await page.getByRole('tab', { name: 'ALL GAMES' }).click()

// Every game, in the game-room frame, on an iPad held sideways and on a phone held upright: the game takes most of
// the screen, the console is one bar, and nothing spills or shrinks below a usable size.
for (const [size, viewport] of [['ipad', { width: 1180, height: 820 }], ['portrait', { width: 390, height: 844 }]]) {
  await page.setViewportSize(viewport)
  await page.waitForTimeout(600)
  for (const [name, code] of [['Hot 7s', 'hot7s'], ['Seven Stars Deluxe', 'video'], ['Vegas Jackpot: Devil Heart', 'devil'], ['Galaxy Keno', 'keno'], ['Roulette', 'roulette'], ['Ascent Crash', 'crash']]) {
    const allTab = page.getByRole('tab', { name: 'ALL GAMES' })
    if (await allTab.count()) await allTab.click()
    else await page.getByText('Home', { exact: true }).last().click().catch(() => {})
    await page.getByLabel(`Play ${name}`).first().click({ timeout: 15000 })
    await page.getByTestId('game-loading').waitFor({ state: 'detached', timeout: 15000 }).catch(() => {})
    if (!await page.getByLabel('Game information').waitFor({ timeout: 15000 }).then(() => true).catch(() => false)) {
      await page.screenshot({ path: `${OUT}/29-${size}-${code}-missing.png` }); findings.push(`${size} ${code}: the game screen did not open`)
      await page.getByLabel('Back to lobby').first().click({ timeout: 3000 }).catch(() => {}); continue
    }
    await page.waitForTimeout(700)
    const used = await page.evaluate(() => {
      const pick = [...document.querySelectorAll('[aria-label^="Reel "],[aria-label="Keno board"],[aria-label^="Bet number-"],[aria-label^="Bet Number"]')]
      const boxes = (pick.length ? pick : []).map(el => el.getBoundingClientRect())
      if (!boxes.length) return null
      const top = Math.min(...boxes.map(b => b.top)), bottom = Math.max(...boxes.map(b => b.bottom)), left = Math.min(...boxes.map(b => b.left)), right = Math.max(...boxes.map(b => b.right))
      return { height: Math.round(bottom - top), width: Math.round(right - left) }
    })
    if (used && code !== 'crash' && used.height < viewport.height * (size === 'ipad' ? .5 : .25) && used.width < viewport.width * .8)
      findings.push(`${size} ${code}: the game is only ${used.width}x${used.height} of ${viewport.width}x${viewport.height}`)
    await audit(`29-${size}-${code}`)
    await page.getByLabel('Game information').click()
    await page.getByText('RETURN TO GAME').waitFor({ timeout: 5000 }).catch(() => findings.push(`${size} ${code}: the info button did not open the paytable`))
    if (code === 'devil') await page.screenshot({ path: `${OUT}/29-${size}-devil-info.png` })
    await page.getByText('RETURN TO GAME').click().catch(() => {})
    await page.getByLabel('Back to lobby').first().click()
    await page.waitForTimeout(600)
    console.log(`## ${size} ${code}  (${used ? `${used.width}x${used.height}` : 'drawn'} of ${viewport.width}x${viewport.height})`)
  }
}
await page.setViewportSize({ width: 844, height: 390 })
await page.waitForTimeout(600)

// An expired token must not kill the floor: the app renews the session and the data keeps coming.
liveUnauthorized = 1
liveAuth.length = 0
await page.setViewportSize({ width: 390, height: 844 })
await page.goto(PREVIEW, { waitUntil: 'networkidle' })
await page.getByRole('button', { name: 'Skip intro' }).click({ timeout: 5000 }).catch(() => {})
await page.getByRole('button', { name: 'Skip intro' }).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
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
await page.getByRole('button', { name: 'Skip intro' }).click({ timeout: 5000 }).catch(() => {})
await page.getByRole('button', { name: 'Skip intro' }).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
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
await page.getByRole('button', { name: 'Skip intro' }).click({ timeout: 5000 }).catch(() => {})
await page.getByRole('button', { name: 'Skip intro' }).waitFor({ state: 'detached', timeout: 3000 }).catch(() => {})
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
  console.log(`\nPASS: sign-in, lobby, slots, wallet, withdraw, history, landscape (lobby, wallet, game), the Dragon Tide fish table, the video slot with free spins, the lobby's categories, keno, Devil Heart's locking respin and jackpot, welcome offer, new message, inbox, sound switch and log out fit a phone. Screenshots in ${OUT}/.`)
}
