# Customer Credit Scoring System

Experimental credit scoring model to assess customer creditworthiness for financial products (adelanto de canon, credit cards, etc.)

## Runtime Quick Start

1. **Set up environment variables:**
```bash
cp .env.example .env
# Edit .env and add your TINYBIRD_TOKEN
```

2. **Run the scoring system:**
```bash
uv run python -m app.merchant_scoring --merchant inmobiliaria
```

3. **View results:**
- Open `outputs/inmobiliaria_analysis.html` in your browser
- Check `outputs/inmobiliaria_summary.json` for statistics
- Analyze `outputs/inmobiliaria_customer_scores.csv` for detailed data

## Merchant Analytics Skill

This repo now includes a draft, repo-local skill for read-only merchant analytics over scored outputs only.

Use it for questions like:
- `show me merchant umbral`
- `top tier customers for umbral`
- `who is eligible for more credit in umbral`
- `highest risk customers in umbral`

Run the deterministic query runner directly:

```bash
uv run skills/merchant-analytics/scripts/query_scores.py --merchant umbral --describe
uv run skills/merchant-analytics/scripts/query_scores.py --merchant umbral --sql "SELECT tier, COUNT(*) AS customers, AVG(score) AS avg_score FROM customer_scores WHERE status = 'SCORED' GROUP BY tier ORDER BY customers DESC"
```

v1 constraints:
- per-merchant only
- reads `outputs/{merchant}_scores.duckdb`
- reuses existing DuckDB first; regenerates only if missing or explicitly requested
- no raw Tinybird access
- no cross-merchant analytics

## What It Does

This system analyzes all historical invoice and payment data to:
1. Calculate a **0-1000 credit score** for each customer
2. Assign customers to **credit tiers** (Prime, Standard, Subprime, High Risk)
3. Calculate **maximum safe loan amounts** (capacidad de endeudamiento)
4. Generate **actionable recommendations** for credit decisions

## Scoring Methodology

The score is composed of 4 weighted dimensions:

### 1. Payment Reliability (40%)
- Do they pay their bills?
- Payment success rate
- Chargeback history
- Consecutive payment streaks

### 2. Payment Intent (30%) ⭐ CRITICAL
- **Do they WANT to pay?**
- Analyzes WHY payments fail
- `NOT_ENOUGH_FUNDS` is the strongest risk signal
- Distinguishes financial distress from technical issues

### 3. Payment Timeliness (20%)
- Do they pay on time?
- On-time vs late payment rate
- Average days late

### 4. Financial Capacity (10%)
- How much can they afford?
- Average invoice amount
- Payment stability

### Tenure Bonus
- How established is the relationship?
- Account age
- Total invoices paid
- Recent activity

## Credit Tiers

| Tier | Score | Max Loan | Interest | Default Risk |
|------|-------|----------|----------|--------------|
| **PRIME** | 750-1000 | 3× avg invoice | 2-2.5%/mo | <3% |
| **STANDARD** | 600-749 | 2× avg invoice | 3.5-4%/mo | 5-8% |
| **SUBPRIME** | 450-599 | 1× avg invoice | 5-6%/mo | 12-18% |
| **HIGH RISK** | 300-449 | Not eligible | N/A | >25% |
| **VERY HIGH RISK** | <300 | Blocked | N/A | >50% |

## Output Files

All outputs are saved to `outputs/` directory:

1. **`{merchant}_customer_scores.csv`** - Complete customer scores and metrics
2. **`{merchant}_summary.json`** - Aggregate statistics and distributions
3. **`{merchant}_scores.duckdb`** - DuckDB database for SQL analysis
4. **`{merchant}_analysis.html`** - Interactive visualizations

The merchant analytics skill reads only item 3 plus the `customer_scores` table inside it.

## Configuration

Edit `.env` file to customize:

```bash
# Which merchant to score
MERCHANT_ID=inmobiliaria

# Minimum requirements
MIN_INVOICES=3         # Need at least 3 paid invoices
MIN_TENURE_DAYS=30     # Need at least 30 days history
```

## Advanced Usage

```bash
# Score a different merchant
uv run python -m app.merchant_scoring --merchant maxibienes

# Custom output directory
uv run python -m app.merchant_scoring --merchant inmobiliaria --output my_results/

# Help
uv run python -m app.merchant_scoring --help
```

## Data Requirements

Customers must have:
- ✅ At least 3 paid invoices
- ✅ At least 30 days of account history
- ✅ Valid payment data (dates, amounts, statuses)

Customers not meeting these criteria receive:
- Status: `INSUFFICIENT_DATA` or `TOO_NEW`
- Score: `NULL`
- Tier: `NOT_SCORABLE`

## Technical Details

**Built with:**
- Python 3.14
- pandas for data manipulation
- clickhouse-connect for Tinybird access
- plotly for visualizations
- duckdb for optional database export

**Architecture:**
```
Data Flow:
Tinybird/ClickHouse → data_loader.py → score_calculator.py → tier_classifier.py → outputs/
```

**Modules:**
- `scoring/merchant/data_loader.py` - Extract and preprocess invoice data
- `scoring/merchant/score_calculator.py` - Calculate credit scores
- `scoring/merchant/tier_classifier.py` - Assign tiers and credit limits
- `scoring/merchant/utils.py` - Output generation and reporting
- `scoring/merchant/config.py` - Configuration constants

## Validation

The system validates:
- ✅ Score distributions follow expected patterns
- ✅ High scores correlate with good payment behavior
- ✅ Low scores correlate with defaults and late payments
- ✅ Intent score correlates with `NOT_ENOUGH_FUNDS` rate

## Project Layout

Core entrypoints:
- `app/merchant_scoring.py` - merchant scoring pipeline
- `app/cross_merchant_scoring.py` - cross-merchant scoring pipeline
- `app/portfolio_analytics.py` - portfolio analytics entrypoint

Runtime package:
- `scoring/merchant/` - merchant-scoped scoring code
- `scoring/cross_merchant/` - cross-merchant and portfolio analytics code

Supporting folders:
- `outputs/` - generated per-merchant and portfolio artifacts
- `skills/merchant-analytics/` - repo-local DuckDB analytics skill
- `docs/` - plans, setup guides, FAQs, and presentation material

## Documentation

### 📚 Complete Documentation Suite

**Start here:** [DOCUMENTATION_INDEX.md](./docs/DOCUMENTATION_INDEX.md) - Master guide to all documentation

**For Team Presentations:**
- **[PRESENTATION_DECK_SHORT.md](./docs/PRESENTATION_DECK_SHORT.md)** - Focused deck (~12 slides, 25-30 min) ⭐ **RECOMMENDED**
- **[PRESENTATION_DECK.md](./docs/PRESENTATION_DECK.md)** - Full deck (~20 slides, 45-60 min) 📚 For deeper discussions
- **[QUICK_REFERENCE.md](./docs/QUICK_REFERENCE.md)** - One-page summary (print & distribute) 📄
- **[FAQ.md](./docs/FAQ.md)** - 100+ questions answered ❓

**For Implementation:**
- **[CUSTOMER_SCORING_PLAN.md](./docs/CUSTOMER_SCORING_PLAN.md)** - Complete technical spec (17k words) 📋
- **[IMPLEMENTATION_SUMMARY.md](./docs/IMPLEMENTATION_SUMMARY.md)** - What was built ✅
- **[GETTING_STARTED.md](./docs/GETTING_STARTED.md)** - Setup & troubleshooting guide 🚀

### Documentation Quick Links

| Need to... | Read this |
|------------|-----------|
| Present to team (main) | docs/PRESENTATION_DECK_SHORT.md |
| Present technical deep dive | docs/PRESENTATION_DECK.md |
| Print handouts | docs/QUICK_REFERENCE.md |
| Answer questions | docs/FAQ.md |
| Understand methodology | docs/CUSTOMER_SCORING_PLAN.md |
| Set up & run | docs/GETTING_STARTED.md |

## Support

Questions? Check **docs/FAQ.md** first (100+ answered), then contact the team.

---

**Status:** Experimental  
**Version:** 0.1.0  
**Last Updated:** April 21, 2026
