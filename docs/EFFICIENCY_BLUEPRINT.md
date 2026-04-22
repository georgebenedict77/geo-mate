# Efficiency Blueprint: Build a Better Dating App

## Product principle

Optimize for **successful conversations per active user**, not endless swipes.

## Core KPIs

1. `Match-to-chat-start rate`
2. `Chat-start-to-date-intent rate`
3. `Median time to first meaningful reply`
4. `7-day retention after first match`
5. `Safety incident rate per 1,000 users`

## Matching system design

1. Retrieval stage
   - Pull candidate IDs from compact indexes (gender, geo-cell, activity window).
   - Remove already-seen/blocked users.
2. Filtering stage
   - Hard constraints: distance, age range, mutual preference.
3. Scoring stage
   - Compatibility + intent + recency + responsiveness + trust + fairness.
4. Re-ranking stage
   - Diversity constraints to avoid repetitive feeds.
   - New-user boost with safety caps.

## Efficiency decisions that matter

- Use two-tier architecture:
  - `Hot path`: Redis/memory for recommendations.
  - `Source of truth`: Postgres for profiles/swipes/matches.
- Keep recommendation P95 under 120ms.
- Precompute features every 5-10 minutes for active users.
- Write-through cache on swipe events.

## Anti-ghosting mechanics

1. Rank users with strong response history.
2. Offer conversation prompts based on shared interests.
3. Decay rank when a user repeatedly matches but never replies.
4. Prioritize users active in the last 24 hours.

## Safety + trust

1. Verification score feeds ranking but never fully overrides compatibility.
2. Device-level abuse checks before profile exposure.
3. In-app reporting should influence trust score quickly.

## Rollout plan

1. Phase 1: Launch current starter API + analytics events.
2. Phase 2: Add Redis, Postgres, and async feature jobs.
3. Phase 3: A/B test ranking weights by market segment.
4. Phase 4: Introduce embeddings + intent classifier.

## Recommended first experiments

1. Compare baseline ranking vs fairness-aware ranking on day-7 retention.
2. Compare recency half-life values (12h vs 18h vs 24h).
3. Compare hard-filter distance caps by city density.
