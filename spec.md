# Family Financial Mission Control — Technical Specification

## Document Purpose

This is a complete build specification for an AI-assisted family budgeting web application. Hand this entire document to Claude Code, Cursor, or any AI coding assistant to build the project from scratch. Every architectural decision has been made. The builder's job is execution, not design.

---

## 1. Product Overview

### What This Is

A web application for a family (2 adults) to track all household spending, set financial goals across time horizons, and receive AI-generated budget optimisation suggestions. It connects to Australian bank accounts via the Basiq Open Banking API and uses Claude to provide intelligent budget advice.

### What This Is NOT

- Not a multi-tenant SaaS — this is a single-family app with one household
- Not a social platform — no leaderboards or public sharing
- Not a trading/investment tool — spending and savings only
- Not a mobile app — responsive web is sufficient

### Core User Stories

1. **As a family member**, I can connect my ING (and other) bank accounts and see all transactions automatically synced
2. **As a family member**, I can see a dashboard showing our financial health at a glance — budget status, goal progress, spending trends
3. **As a family member**, I can categorise transactions (auto-categorised by AI, manually correctable)
4. **As a family member**, I can set short/medium/long-term savings goals and track progress toward each
5. **As a family member**, I can ask the AI advisor "how do we hit our house deposit goal by Dec 2027?" and get specific, actionable budget tweaks
6. **As a family member**, I feel motivated by visual progress, streaks, and milestone celebrations

---

## 2. Tech Stack

### Principle: "The best part is no part"

Every dependency must justify its existence. Fewer moving parts = fewer things to break.

### Stack

| Layer | Technology | Justification |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | Full-stack React. API routes, SSR, file-based routing. One project. |
| Language | **TypeScript** | Type safety across the stack. Non-negotiable for financial data. |
| Database | **PostgreSQL (Render managed)** | Render's managed Postgres. Zero ops. |
| ORM | **Prisma** | Type-safe queries, easy migrations, excellent DX with Postgres. |
| Styling | **Tailwind CSS** | Utility-first. No CSS files to manage. |
| Charts | **Recharts** | React-native charting. Simple API. Covers 95% of needs. |
| Animations | **Framer Motion** | For goal progress animations and milestone celebrations. |
| Auth | **Simple password auth (bcrypt + JWT)** | Single family, no OAuth complexity needed. Just a login page. |
| Bank Data | **Basiq API v3** | Australian Open Banking CDR-accredited aggregator. |
| AI | **Anthropic Claude API (claude-sonnet-4-5-20250929)** | Budget analysis and suggestion engine. |
| Hosting | **Render** | Web service + managed Postgres. Simple deploy from Git. |
| Cron/Jobs | **Render Cron Jobs** or **node-cron within the app** | For scheduled transaction syncing. |

### What We're NOT Using (and why)

- **No Redis** — Postgres handles everything at this scale
- **No separate backend** — Next.js API routes are the backend
- **No state management library** — React Server Components + minimal client state
- **No Docker** — Render deploys from Git directly
- **No separate CSS/SCSS** — Tailwind only
- **No component library** — Custom components with Tailwind. We want full design control for the gamification layer.

---

## 3. Architecture

### High-Level Data Flow

```
ING/Banks → Basiq API → Sync Job → PostgreSQL → Next.js App → Browser
                                         ↕
                                    Claude API
                                  (AI Advisor)
```

### Project Structure

```
/
├── prisma/
│   ├── schema.prisma          # Database schema
│   └── seed.ts                # Seed data (categories, default budgets)
├── src/
│   ├── app/
│   │   ├── layout.tsx         # Root layout
│   │   ├── page.tsx           # Dashboard (main screen)
│   │   ├── login/
│   │   │   └── page.tsx       # Login page
│   │   ├── transactions/
│   │   │   └── page.tsx       # Transaction list + categorisation
│   │   ├── goals/
│   │   │   └── page.tsx       # Goals & AI advisor
│   │   ├── settings/
│   │   │   └── page.tsx       # Account connections, preferences
│   │   └── api/
│   │       ├── auth/
│   │       │   └── route.ts   # Login/logout
│   │       ├── sync/
│   │       │   └── route.ts   # Trigger Basiq sync
│   │       ├── transactions/
│   │       │   └── route.ts   # CRUD transactions
│   │       ├── categories/
│   │       │   └── route.ts   # Category management
│   │       ├── goals/
│   │       │   └── route.ts   # CRUD goals
│   │       ├── budgets/
│   │       │   └── route.ts   # Budget CRUD
│   │       ├── advisor/
│   │       │   └── route.ts   # Claude AI advisor endpoint
│   │       └── webhooks/
│   │           └── basiq/
│   │               └── route.ts  # Basiq webhook receiver
│   ├── lib/
│   │   ├── db.ts              # Prisma client singleton
│   │   ├── basiq.ts           # Basiq API wrapper
│   │   ├── claude.ts          # Claude API wrapper
│   │   ├── auth.ts            # Auth utilities (JWT, middleware)
│   │   ├── categories.ts      # Auto-categorisation logic
│   │   └── scoring.ts         # Financial health score calculator
│   ├── components/
│   │   ├── dashboard/
│   │   │   ├── HealthScore.tsx       # Overall financial health gauge
│   │   │   ├── GoalProgressRing.tsx  # Animated circular progress
│   │   │   ├── BudgetGauge.tsx       # Category budget vs actual
│   │   │   ├── SpendingTrend.tsx     # Sparkline trends
│   │   │   ├── StreakCounter.tsx     # Consecutive fortnights under budget
│   │   │   └── MilestoneToast.tsx    # Celebration animation
│   │   ├── transactions/
│   │   │   ├── TransactionList.tsx
│   │   │   ├── TransactionRow.tsx
│   │   │   ├── CategoryPicker.tsx
│   │   │   └── ImportStatus.tsx
│   │   ├── goals/
│   │   │   ├── GoalCard.tsx
│   │   │   ├── WhatIfSlider.tsx      # Interactive scenario simulator
│   │   │   ├── AIAdvisor.tsx         # Chat-style AI suggestions
│   │   │   └── TimelineView.tsx      # Goal timeline visualisation
│   │   └── shared/
│   │       ├── Nav.tsx
│   │       ├── Card.tsx
│   │       └── AnimatedNumber.tsx
│   └── types/
│       └── index.ts           # Shared TypeScript types
├── .env.local                 # Environment variables
├── package.json
├── tailwind.config.ts
├── tsconfig.json
└── next.config.js
```

---

## 4. Database Schema (Prisma)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Single family app — users are family members
model User {
  id            String   @id @default(cuid())
  name          String
  email         String   @unique
  passwordHash  String
  role          String   @default("member") // "admin" or "member"
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}

// Basiq connection records
model BankConnection {
  id              String   @id @default(cuid())
  basiqUserId     String   // Basiq's user ID
  basiqConnectionId String // Basiq's connection ID
  institutionId   String   // e.g., "AU00301" for ING
  institutionName String
  status          String   @default("active") // active, invalid, deleted
  lastSyncAt      DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  accounts        Account[]
}

model Account {
  id              String   @id @default(cuid())
  basiqAccountId  String   @unique
  connectionId    String
  connection      BankConnection @relation(fields: [connectionId], references: [id])
  name            String   // "Everyday Account", "Savings Maximiser"
  accountNumber   String?
  balance         Decimal  @default(0) @db.Decimal(12, 2)
  availableFunds  Decimal? @db.Decimal(12, 2)
  type            String   // "transaction", "savings", "credit-card", "mortgage"
  currency        String   @default("AUD")
  lastUpdated     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  transactions    Transaction[]
}

model Transaction {
  id                String   @id @default(cuid())
  basiqTransactionId String? @unique // null if manually entered
  accountId         String
  account           Account  @relation(fields: [accountId], references: [id])
  date              DateTime
  description       String   // Raw bank description
  cleanDescription  String?  // Basiq-enriched or AI-cleaned description
  amount            Decimal  @db.Decimal(12, 2) // Negative = debit, Positive = credit
  direction         String   // "debit" or "credit"
  categoryId        String?
  category          Category? @relation(fields: [categoryId], references: [id])
  categorySource    String?  @default("auto") // "auto", "manual", "ai"
  merchantName      String?  // Enriched merchant name
  isExcluded        Boolean  @default(false) // Exclude from budget calculations (transfers, etc.)
  notes             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([date])
  @@index([categoryId])
  @@index([accountId, date])
}

model Category {
  id           String   @id @default(cuid())
  name         String   @unique // "Groceries", "Dining Out", "Fuel", etc.
  icon         String?  // Emoji or icon identifier
  colour       String?  // Hex colour for charts
  parentId     String?  // For sub-categories
  parent       Category? @relation("SubCategories", fields: [parentId], references: [id])
  children     Category[] @relation("SubCategories")
  isSystem     Boolean  @default(false) // System categories can't be deleted
  sortOrder    Int      @default(0)
  transactions Transaction[]
  budgets      Budget[]
  createdAt    DateTime @default(now())

  @@index([parentId])
}

model Budget {
  id          String   @id @default(cuid())
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  amount      Decimal  @db.Decimal(12, 2) // Budget amount per period
  period      String   @default("fortnightly") // "weekly", "fortnightly", "monthly"
  startDate   DateTime
  endDate     DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([categoryId, period, startDate])
}

model Goal {
  id              String   @id @default(cuid())
  name            String   // "House Deposit", "Emergency Fund", "Bali Holiday"
  targetAmount    Decimal  @db.Decimal(12, 2)
  currentAmount   Decimal  @default(0) @db.Decimal(12, 2)
  targetDate      DateTime?
  horizon         String   // "short" (<6mo), "medium" (6mo-2yr), "long" (2yr+)
  priority        Int      @default(1) // 1 = highest
  icon            String?  // Emoji
  colour          String?  // Hex colour
  isCompleted     Boolean  @default(false)
  completedAt     DateTime?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  contributions   GoalContribution[]
  milestones      GoalMilestone[]
}

model GoalContribution {
  id        String   @id @default(cuid())
  goalId    String
  goal      Goal     @relation(fields: [goalId], references: [id])
  amount    Decimal  @db.Decimal(12, 2)
  date      DateTime
  source    String   @default("manual") // "manual", "auto", "surplus"
  note      String?
  createdAt DateTime @default(now())
}

model GoalMilestone {
  id          String   @id @default(cuid())
  goalId      String
  goal        Goal     @relation(fields: [goalId], references: [id])
  percentage  Int      // 25, 50, 75, 100
  reachedAt   DateTime?
  celebrated  Boolean  @default(false) // Has user seen the celebration?
  createdAt   DateTime @default(now())
}

// Track streaks and achievements
model Achievement {
  id          String   @id @default(cuid())
  type        String   // "streak", "milestone", "under_budget", "first_sync"
  title       String
  description String?
  metadata    Json?    // Flexible data (e.g., { streakCount: 5, categoryId: "..." })
  earnedAt    DateTime @default(now())
  seen        Boolean  @default(false)
}

// Store fortnightly snapshots for trend analysis
model PeriodSnapshot {
  id            String   @id @default(cuid())
  periodStart   DateTime
  periodEnd     DateTime
  totalIncome   Decimal  @db.Decimal(12, 2)
  totalExpenses Decimal  @db.Decimal(12, 2)
  netSavings    Decimal  @db.Decimal(12, 2)
  healthScore   Int      // 0-100
  categoryBreakdown Json // { "Groceries": 450.00, "Dining": 120.00, ... }
  wasUnderBudget Boolean @default(false)
  createdAt     DateTime @default(now())

  @@unique([periodStart])
}

// AI conversation history for the advisor
model AdvisorChat {
  id        String   @id @default(cuid())
  messages  Json     // Array of { role, content } messages
  summary   String?  // AI-generated summary of the advice given
  createdAt DateTime @default(now())
}

// Category mapping rules learned from manual corrections
model CategoryRule {
  id          String   @id @default(cuid())
  pattern     String   // Regex or substring match on description
  categoryId  String
  confidence  Float    @default(1.0)
  source      String   @default("manual") // "manual", "ai"
  createdAt   DateTime @default(now())

  @@unique([pattern])
}
```

---

## 5. Basiq Integration

### Setup Requirements

1. Register at https://dashboard.basiq.io
2. Create an application
3. Generate an API key
4. Configure consent policy (read-only transaction access)
5. Note: For Open Banking (CDR) access, you may need to work with Basiq's customer success team to enable the appropriate access model

### Environment Variables

```env
BASIQ_API_KEY=your_basiq_api_key
BASIQ_API_URL=https://au-api.basiq.io
```

### Basiq API Wrapper (`src/lib/basiq.ts`)

Implement a wrapper class with these methods:

```typescript
class BasiqClient {
  // Auth — get server access token (cached, refreshed when expired)
  async getToken(): Promise<string>

  // Users — Basiq requires a "user" object to attach connections to
  async createUser(email: string): Promise<BasiqUser>
  async getUser(userId: string): Promise<BasiqUser>

  // Connections — the link between a user and their bank
  async createConnection(userId: string, institutionId: string): Promise<BasiqJob>
  async refreshConnection(userId: string, connectionId: string): Promise<BasiqJob>
  async getJobStatus(jobId: string): Promise<BasiqJob>

  // Data retrieval
  async getAccounts(userId: string): Promise<BasiqAccount[]>
  async getTransactions(userId: string, filters?: {
    fromDate?: string
    toDate?: string
    accountId?: string
  }): Promise<BasiqTransaction[]>

  // Consent UI — Basiq provides a hosted consent flow
  async getConsentUrl(userId: string): Promise<string>
}
```

### Basiq Authentication Flow

```
1. POST /token  (API key → server access token)
2. POST /users  (create a Basiq user for this household)
3. Generate consent URL → redirect user to Basiq consent UI
4. User selects bank (ING), authenticates via Open Banking
5. Basiq creates connection → job starts
6. Poll GET /jobs/{jobId} until all steps complete
7. GET /users/{userId}/transactions to fetch data
```

### Sync Strategy

- **Initial sync**: Full historical pull when connection first established
- **Ongoing sync**: Cron job every 6 hours refreshes the connection and pulls new transactions
- **Manual sync**: User can trigger from the UI
- **Deduplication**: Use `basiqTransactionId` as the unique key. Upsert on sync.
- **Webhook (optional)**: Basiq supports webhooks for connection status changes. Register at `/api/webhooks/basiq`

### Sync Job Implementation (`/api/sync`)

```
1. For each active BankConnection:
   a. Refresh the connection via Basiq API
   b. Poll job status until complete
   c. Fetch all transactions since lastSyncAt
   d. For each transaction:
      - Check if basiqTransactionId exists in DB
      - If new: auto-categorise (see §6), insert
      - If exists: update amount/description if changed
   e. Update account balances
   f. Update lastSyncAt on BankConnection
2. After sync complete, recalculate:
   - Current period budget actuals
   - Goal progress (if auto-allocation rules exist)
   - Health score
   - Streak status
```

### Fallback: CSV Import

Even though Basiq is primary, include a CSV import endpoint for edge cases:

```
POST /api/transactions/import
Content-Type: multipart/form-data

Accepts: CSV file with columns [Date, Description, Amount, Balance]
Parses ING's CSV format (and common Australian bank formats)
Auto-categorises and inserts with basiqTransactionId = null
```

---

## 6. Auto-Categorisation System

### Three-Tier Approach

**Tier 1: Rule-based matching (instant, free)**
- Check `CategoryRule` table for matching patterns
- Rules are created when users manually re-categorise a transaction
- Example: User categorises "WOOLWORTHS" as "Groceries" → rule created for all future "WOOLWORTHS" matches

**Tier 2: Basiq enrichment (included with API)**
- Basiq's `enrich` field provides `merchant.businessName`, `category`, and `subClass`
- Map Basiq's category codes to your Category model
- Example: Basiq subClass code "451" = "Cafes, Restaurants and Takeaway Food Services" → map to "Dining Out"

**Tier 3: Claude AI fallback (for unmatched transactions)**
- Batch uncategorised transactions and send to Claude
- Prompt: "Categorise these Australian bank transactions into these categories: [list]. Return JSON."
- Use structured output to get reliable category assignments
- Save the result as a new CategoryRule for future matching

### Category Seed Data

Pre-populate with these categories (Australian household focused):

```
Income:
  - Salary/Wages
  - Government Benefits
  - Other Income

Essential Spending:
  - Groceries
  - Rent/Mortgage
  - Utilities (electricity, gas, water)
  - Insurance
  - Health/Medical
  - Transport/Fuel
  - Phone/Internet
  - Childcare/Education

Discretionary Spending:
  - Dining Out/Takeaway
  - Entertainment/Streaming
  - Shopping/Clothing
  - Hobbies
  - Personal Care
  - Gifts

Financial:
  - Savings Transfer (auto-exclude from budget)
  - Loan Repayment
  - Investment
  - Fees/Charges

Other:
  - Uncategorised
```

---

## 7. AI Advisor (Claude Integration)

### Environment Variables

```env
ANTHROPIC_API_KEY=your_anthropic_api_key
```

### Advisor Endpoint (`/api/advisor`)

This is the brain of the app. It takes the user's question plus financial context and returns actionable advice.

### Claude API Wrapper (`src/lib/claude.ts`)

```typescript
import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

interface AdvisorContext {
  currentPeriodBudgets: BudgetVsActual[];
  goals: GoalWithProgress[];
  recentTrends: PeriodSnapshot[];  // Last 6 periods
  totalIncome: number;
  totalExpenses: number;
  netSavings: number;
  healthScore: number;
}

async function getAdvisorResponse(
  userMessage: string,
  context: AdvisorContext,
  chatHistory: Message[]
): Promise<string> {
  const systemPrompt = buildAdvisorSystemPrompt(context);

  const response = await client.messages.create({
    model: "claude-sonnet-4-5-20250929",
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      ...chatHistory,
      { role: "user", content: userMessage }
    ]
  });

  return response.content[0].text;
}
```

### System Prompt for the AI Advisor

```
You are a practical, encouraging family financial advisor for an Australian household.
You have access to their real financial data (provided below).

Your job is to:
1. Answer questions about their spending and financial position
2. Suggest specific, actionable budget tweaks to help hit their goals
3. Run "what-if" scenarios when asked (e.g., "what if we cut dining by $100/fortnight?")
4. Be encouraging but honest — celebrate wins, flag risks

Rules:
- Always reference actual numbers from their data
- Suggestions must be specific: "Reduce Dining Out from $280 to $180/fortnight" not "spend less on food"
- When suggesting cuts, acknowledge the tradeoff ("you'd eat out twice less per fortnight")
- Frame everything in fortnightly periods (this family budgets fortnightly)
- Use Australian dollars
- Be concise. No waffle. Dot points for action items.
- When calculating goal timelines, show the math briefly
- Never give investment advice or recommend specific financial products

CURRENT FINANCIAL DATA:
{JSON context injected here}
```

### Advisor Use Cases

1. **Goal planning**: "How do we save $60k for a house deposit by Dec 2027?"
   → Claude calculates required savings rate, identifies categories to cut, builds a plan

2. **Budget review**: "Where are we overspending this fortnight?"
   → Claude compares actuals to budgets, flags overruns, suggests adjustments

3. **What-if scenarios**: "What if we cancelled Stan, Disney+, and Kayo?"
   → Claude calculates savings, projects impact on goal timelines

4. **Trend analysis**: "How has our grocery spending changed over the last 3 months?"
   → Claude analyses period snapshots, identifies trends

---

## 8. Dashboard & Gamification

### Dashboard Layout (Single Screen)

```
┌─────────────────────────────────────────────────────────┐
│  Family Financial Mission Control     [Sync] [Settings] │
├───────────────┬─────────────────────────────────────────┤
│               │                                         │
│  HEALTH SCORE │  BUDGET STATUS (this fortnight)         │
│  [72/100]     │  ████░░ Groceries    $420 / $500       │
│  Animated     │  ██████ Dining Out   $310 / $200  ⚠️   │
│  gauge        │  ███░░░ Fuel         $180 / $250       │
│               │  █░░░░░ Entertainment $45 / $150        │
│  🔥 Streak: 3 │  ...                                    │
│               │                                         │
├───────────────┼─────────────────────────────────────────┤
│               │                                         │
│  GOALS        │  SPENDING TRENDS                        │
│               │                                         │
│  🏠 House     │  [Sparkline area chart showing          │
│  ████████░░   │   income vs expenses over last          │
│  73% ($43.8k) │   6 fortnights with net savings         │
│               │   highlighted]                          │
│  🏖️ Bali      │                                         │
│  ██████░░░░   │                                         │
│  58% ($2.9k)  │  RECENT TRANSACTIONS                    │
│               │  Today:                                 │
│  🚨 Emergency │  -$85.40  Woolworths    🛒 Groceries    │
│  ███░░░░░░░   │  -$42.00  Shell Coles   ⛽ Fuel         │
│  28% ($4.2k)  │  +$3,245  Salary        💰 Income       │
│               │  ...                     [View All →]   │
└───────────────┴─────────────────────────────────────────┘
```

### Health Score Calculation (`src/lib/scoring.ts`)

Score from 0-100, calculated from weighted components:

```typescript
function calculateHealthScore(data: ScoreInput): number {
  const weights = {
    budgetAdherence: 0.30,    // % of categories at or under budget
    savingsRate: 0.25,         // Net savings as % of income (target: 20%+)
    goalProgress: 0.20,        // On-track vs behind on goals
    emergencyFund: 0.15,       // Emergency fund % of 3-month expenses
    consistency: 0.10,          // Streak / trend direction
  };

  // Each component scores 0-100, then weighted
  const budgetScore = calculateBudgetAdherence(data.budgets);
  const savingsScore = calculateSavingsRate(data.income, data.expenses);
  const goalScore = calculateGoalProgress(data.goals);
  const emergencyScore = calculateEmergencyFund(data.emergencyGoal, data.monthlyExpenses);
  const consistencyScore = calculateConsistency(data.snapshots);

  return Math.round(
    budgetScore * weights.budgetAdherence +
    savingsScore * weights.savingsRate +
    goalScore * weights.goalProgress +
    emergencyScore * weights.emergencyFund +
    consistencyScore * weights.consistency
  );
}
```

### Gamification Elements

**1. Goal Progress Rings**
- Animated SVG circles (like Apple Watch rings)
- Colour transitions: Red (<25%) → Orange (<50%) → Yellow (<75%) → Green (75%+)
- Pulse animation when contribution is added
- Use Framer Motion for smooth transitions

**2. Streak Counter**
- Track consecutive fortnights where total spending ≤ total budget
- Display as 🔥 with count
- Streak milestones at 2, 4, 8, 12, 26 (half year), 52 (full year)
- If streak breaks, show "Start a new streak!" (not punishing)

**3. Milestone Celebrations**
- When a goal hits 25%, 50%, 75%, 100%: full-screen confetti animation + message
- Mark as `celebrated: true` after display so it only shows once
- 100% completion: extra special animation + achievement badge

**4. Budget Report Card (end of each fortnight)**
- Auto-generated when a fortnightly period closes
- Each category gets a letter grade: A (≤80%), B (≤100%), C (≤120%), D (>120%)
- Overall grade displayed prominently
- Saved as PeriodSnapshot

**5. What-If Simulator (on Goals page)**
- Interactive sliders for each budget category
- As user drags a slider (e.g., "Dining Out: $200 → $120"), goal timelines update in real-time
- Shows "saves $X/fortnight → goal reached Y months earlier"
- No AI call needed — pure client-side math

**6. Achievements**
- "First Sync" — Connected first bank account
- "Budget Boss" — All categories under budget for a fortnight
- "Streak Master" — Hit streak milestones
- "Goal Getter" — Completed first goal
- "AI Student" — Asked the advisor 10 questions
- Store in Achievement model, display in settings/profile

---

## 9. Key Pages — Detailed Specifications

### 9.1 Login Page (`/login`)

- Simple email + password form
- JWT stored in httpOnly cookie
- Redirect to dashboard on success
- No registration page — seed users via Prisma seed script

### 9.2 Dashboard (`/`)

- Protected route (redirect to login if not authenticated)
- Server-side data fetch for initial load
- Components refresh via client-side polling every 60 seconds (for live feel)
- Layout as described in §8
- Mobile responsive: stack columns vertically

### 9.3 Transactions (`/transactions`)

- Full transaction list with:
  - Date range filter (default: current fortnight)
  - Category filter (multi-select)
  - Account filter
  - Search by description
  - Direction filter (income/expense/all)
- Each transaction row shows: date, description (cleaned), amount, category badge, account
- Click category badge to re-categorise → opens CategoryPicker dropdown
- When user re-categorises, create/update a CategoryRule for future auto-matching
- Bulk actions: select multiple → assign category, mark as excluded
- "Excluded" toggle for transfers between own accounts (don't count in budget)
- Import CSV button (secondary action, in case Basiq is down)

### 9.4 Goals (`/goals`)

- Card layout showing all goals
- Each card: name, icon, progress ring, current/target amounts, target date, projected completion date
- "Add Goal" form: name, target amount, target date (optional), horizon (auto-calculated from date), priority, icon picker, colour picker
- "Add Contribution" button on each card: manual amount entry
- **AI Advisor panel** (right side or bottom):
  - Chat interface with Claude
  - Pre-populated quick prompts:
    - "How do we hit [goal] on time?"
    - "Where can we cut spending?"
    - "Review our budget this fortnight"
    - "What if we saved an extra $200/fortnight?"
  - Chat history persisted in AdvisorChat model
  - Context auto-injected (user never sees the raw data sent to Claude)
- **What-If Simulator**:
  - Shows current budget allocations as sliders
  - Dragging a slider recalculates goal projections in real-time
  - "Apply these changes" button → updates Budget records

### 9.5 Settings (`/settings`)

- **Bank Connections**: List connected institutions, status, last sync time. "Connect New Bank" button → Basiq consent flow
- **Family Members**: List users (name, email). Admin can add/remove.
- **Budget Periods**: Toggle between weekly/fortnightly/monthly as the base period
- **Categories**: Manage custom categories, reorder, set colours
- **Category Rules**: View learned rules, delete incorrect ones
- **Achievements**: Display earned badges
- **Data**: Export all transactions as CSV. Clear all data button (with confirmation).

---

## 10. API Endpoints

All endpoints under `/api/` require authentication (JWT in cookie) except `/api/auth/login` and `/api/webhooks/basiq`.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/login` | Login → returns JWT cookie |
| POST | `/api/auth/logout` | Clear JWT cookie |
| GET | `/api/auth/me` | Get current user |
| POST | `/api/sync` | Trigger Basiq sync for all connections |
| GET | `/api/transactions` | List transactions (with filters, pagination) |
| PATCH | `/api/transactions/:id` | Update category, notes, excluded status |
| POST | `/api/transactions/import` | CSV import |
| POST | `/api/transactions/bulk-categorise` | Bulk update categories |
| GET | `/api/categories` | List all categories |
| POST | `/api/categories` | Create category |
| PATCH | `/api/categories/:id` | Update category |
| DELETE | `/api/categories/:id` | Delete category (reassign transactions) |
| GET | `/api/budgets` | Get budgets for current period |
| POST | `/api/budgets` | Create/update budget for a category |
| GET | `/api/budgets/actuals` | Get budget vs actual for current period |
| GET | `/api/goals` | List all goals with progress |
| POST | `/api/goals` | Create goal |
| PATCH | `/api/goals/:id` | Update goal |
| DELETE | `/api/goals/:id` | Delete goal |
| POST | `/api/goals/:id/contribute` | Add manual contribution |
| POST | `/api/advisor` | Send message to AI advisor |
| GET | `/api/advisor/history` | Get chat history |
| GET | `/api/snapshots` | Get period snapshots for trends |
| GET | `/api/health-score` | Get current health score breakdown |
| GET | `/api/achievements` | List achievements |
| PATCH | `/api/achievements/:id/seen` | Mark achievement as seen |
| GET | `/api/connections` | List bank connections |
| POST | `/api/connections/consent-url` | Get Basiq consent URL |
| DELETE | `/api/connections/:id` | Remove bank connection |
| POST | `/api/webhooks/basiq` | Receive Basiq status webhooks |

---

## 11. Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@host:5432/familybudget

# Basiq
BASIQ_API_KEY=your_basiq_api_key
BASIQ_API_URL=https://au-api.basiq.io
BASIQ_WEBHOOK_SECRET=your_webhook_secret

# Anthropic
ANTHROPIC_API_KEY=your_anthropic_api_key

# Auth
JWT_SECRET=a_long_random_string_at_least_32_chars
JWT_EXPIRY=7d

# App
NEXT_PUBLIC_APP_URL=https://your-app.onrender.com
BUDGET_PERIOD=fortnightly  # default budget period
```

---

## 12. Deployment on Render

### Web Service

- **Build Command**: `npm install && npx prisma generate && npx prisma migrate deploy && npm run build`
- **Start Command**: `npm start`
- **Environment**: Node
- **Plan**: Free tier to start (upgradable)

### Database

- **Type**: PostgreSQL (Render managed)
- **Plan**: Free tier (256MB, sufficient for single household)

### Cron Job (Transaction Sync)

Option A: Render Cron Job → calls `POST /api/sync` every 6 hours
Option B: Implement with `node-cron` inside the app (simpler but requires the app to be always running)

Recommend Option A for Render.

### Deploy Steps

1. Push to GitHub
2. Create Render Web Service from repo
3. Create Render PostgreSQL database
4. Add all environment variables
5. Deploy
6. Run `npx prisma db seed` (initial categories + first user account)

---

## 13. Build Phases

### Phase 1: Foundation (MVP)

**Goal: Working app with bank connection, transactions, and basic dashboard**

- [ ] Project scaffold (Next.js + TypeScript + Tailwind + Prisma)
- [ ] Database schema + migrations + seed data
- [ ] Auth (login page, JWT middleware, seed first user)
- [ ] Basiq integration (connection flow, transaction sync)
- [ ] Transaction list page with filtering
- [ ] Basic auto-categorisation (Basiq enrichment + rule-based)
- [ ] Basic dashboard (budget vs actual bars, account balances)
- [ ] Deploy to Render

### Phase 2: Goals & Intelligence

**Goal: Goal tracking + AI advisor working**

- [ ] Goals CRUD + progress tracking
- [ ] Goal progress rings on dashboard
- [ ] Claude AI advisor integration
- [ ] Advisor chat UI with pre-populated prompts
- [ ] What-if simulator (client-side sliders)
- [ ] Period snapshots (fortnightly auto-generation)
- [ ] Spending trend charts

### Phase 3: Gamification & Polish

**Goal: Make it addictive and beautiful**

- [ ] Health score calculation + animated gauge
- [ ] Streak tracking + display
- [ ] Milestone celebrations (confetti + toast)
- [ ] Achievements system
- [ ] Fortnightly report card
- [ ] Smooth animations throughout (Framer Motion)
- [ ] Mobile responsive polish
- [ ] CSV export
- [ ] Error handling + loading states + empty states

---

## 14. Design Tokens

Use these consistently throughout the app:

```typescript
const colors = {
  // Status
  onTrack: '#10B981',      // Green — under budget, on target
  warning: '#F59E0B',      // Amber — approaching limit
  overBudget: '#EF4444',   // Red — over budget
  neutral: '#6B7280',      // Grey — no data / excluded

  // Goals (each goal gets one)
  goalPalette: ['#3B82F6', '#8B5CF6', '#EC4899', '#F97316', '#14B8A6'],

  // UI
  background: '#0F172A',   // Dark navy (dark mode default)
  surface: '#1E293B',      // Card backgrounds
  surfaceHover: '#334155',
  text: '#F8FAFC',
  textMuted: '#94A3B8',
  accent: '#3B82F6',       // Primary blue
  accentLight: '#60A5FA',
};

const borderRadius = {
  card: '12px',
  button: '8px',
  badge: '6px',
  full: '9999px',  // For circular elements like progress rings
};
```

**Design language**: Dark mode default (easier on the eyes for financial dashboards at night). Clean, minimal, data-dense. Think Bloomberg terminal meets a modern mobile banking app. Avoid toy-like gamification aesthetics — this should feel like a premium tool that happens to be motivating.

---

## 15. Important Implementation Notes

1. **All monetary values**: Store as Decimal(12,2) in DB. Use `Decimal.js` or `big.js` for calculations in JS. Never use floating point for money.

2. **Fortnightly periods**: The family budgets fortnightly. Period boundaries should be configurable (pick a start date, then every 14 days). All budget comparisons, snapshots, and streaks are based on these fortnightly periods.

3. **Timezone**: All dates stored as UTC in DB. Display in `Australia/Perth` (AWST, UTC+8). No daylight saving in WA, so this is straightforward.

4. **Basiq rate limits**: Be respectful. Cache tokens. Don't poll jobs more than once per second. Sync no more than every 6 hours unless manually triggered.

5. **Claude API costs**: Keep token usage lean. The advisor system prompt + financial context should be <2000 tokens. Use `claude-sonnet-4-5-20250929` (fast, cheap, capable enough). Budget ~$5/month for a household's usage.

6. **Security**: This app handles real bank data. HTTPS only. httpOnly cookies. Environment variables for all secrets. Never log transaction data. Basiq handles the actual bank credentials — your app never sees them.

7. **Error handling**: Every Basiq API call should have retry logic (exponential backoff, max 3 retries). Every Claude call should have a timeout (30s) and graceful fallback ("I couldn't generate a suggestion right now").

8. **CSV import format**: Support at minimum ING Australia's export format:
   ```
   Date,Description,Credit,Debit,Balance
   01/02/2026,"WOOLWORTHS 1234 PERTH",,85.40,1234.56
   ```
   Also handle the single-amount format where negative = debit.
