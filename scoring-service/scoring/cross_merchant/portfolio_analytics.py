"""Portfolio analytics for cross-merchant scoring outputs."""

from __future__ import annotations

from pathlib import Path
from typing import Dict

import pandas as pd

from scoring.merchant.utils import save_to_csv, save_to_json

TIER_ORDER = ["PRIME", "STANDARD", "SUBPRIME", "HIGH_RISK", "VERY_HIGH_RISK"]
ELIGIBLE_TIERS = {"PRIME", "STANDARD", "SUBPRIME"}
OVERLAP_ORDER = ["1", "2", "3", "4+"]
RISK_FLAG_COLUMNS = {
    "has_chargebacks": "Has chargebacks",
    "chronic_insufficient_funds": "Chronic insufficient funds",
    "chronic_lateness": "Chronic lateness",
    "inactive_customer": "Inactive customer",
}

TIER_COLORS = {
    "PRIME": "#2a9d8f",
    "STANDARD": "#457b9d",
    "SUBPRIME": "#e9c46a",
    "HIGH_RISK": "#f4a261",
    "VERY_HIGH_RISK": "#e76f51",
}


def _overlap_segment(merchant_count: float) -> str:
    count = int(merchant_count) if pd.notna(merchant_count) else 1
    if count >= 4:
        return "4+"
    return str(max(1, count))


def _prepare_scores(scores_df: pd.DataFrame) -> pd.DataFrame:
    df = scores_df.copy()

    if "created_at" in df.columns:
        df["created_at"] = pd.to_datetime(df["created_at"], errors="coerce")

    numeric_columns = [
        "score",
        "merchant_count",
        "diversity_bonus",
        "max_loan_amount",
        "expected_default_rate",
        "paid_invoices",
        "avg_invoice_amount",
    ]
    for column in numeric_columns:
        if column in df.columns:
            df[column] = pd.to_numeric(df[column], errors="coerce")

    for column in RISK_FLAG_COLUMNS:
        if column not in df.columns:
            df[column] = False
            continue

        normalized = df[column].fillna(False)
        if normalized.dtype == bool:
            df[column] = normalized
        else:
            df[column] = normalized.astype(str).str.lower().isin({"true", "1", "yes"})

    if "merchant_count" not in df.columns:
        df["merchant_count"] = 1

    if "primary_merchant" not in df.columns:
        df["primary_merchant"] = "UNKNOWN"

    df["overlap_segment"] = df["merchant_count"].apply(_overlap_segment)
    df["expected_loss_amount"] = (
        df["max_loan_amount"].fillna(0) * df["expected_default_rate"].fillna(0)
    )

    return df


def _currency_compact(value: float) -> str:
    absolute = abs(value)
    if absolute >= 1_000_000_000:
        return f"${value / 1_000_000_000:.1f}B COP"
    if absolute >= 1_000_000:
        return f"${value / 1_000_000:.1f}M COP"
    return f"${value:,.0f} COP"


def _currency_full(value: float) -> str:
    return f"${value:,.0f} COP"


def _pct(value: float, digits: int = 1) -> str:
    return f"{value * 100:.{digits}f}%"


def _safe_round(value: float, digits: int = 1) -> float:
    if pd.isna(value):
        return 0.0
    return round(float(value), digits)


def _health_status(summary: Dict) -> Dict[str, str]:
    ready_share = summary["credit_ready"]["share_of_scorable"]
    default_rate = summary["weighted_expected_default_rate"]
    flagged_share = summary["risk_flags"]["share_with_any_flag"]

    if ready_share >= 0.55 and default_rate <= 0.06 and flagged_share <= 0.30:
        return {
            "label": "Healthy and expandable",
            "tone": "positive",
            "message": "Large lendable base, low expected loss, and risk flags are contained.",
        }
    if ready_share >= 0.40 and default_rate <= 0.09:
        return {
            "label": "Solid with watchpoints",
            "tone": "balanced",
            "message": "Good credit coverage, but concentration and manual-review cohorts need active monitoring.",
        }
    return {
        "label": "Fragile",
        "tone": "warning",
        "message": "Credit growth should be constrained until risk and data quality improve.",
    }


def _build_tier_summary(scored: pd.DataFrame) -> pd.DataFrame:
    if scored.empty:
        return pd.DataFrame()

    grouped = scored.groupby("tier", observed=False).agg(
        customers=("customer_document_number", "count"),
        avg_score=("score", "mean"),
        median_score=("score", "median"),
        avg_paid_invoices=("paid_invoices", "mean"),
        avg_merchant_count=("merchant_count", "mean"),
        total_capacity=("max_loan_amount", "sum"),
        avg_capacity=("max_loan_amount", "mean"),
        expected_loss_amount=("expected_loss_amount", "sum"),
    )

    grouped = grouped.reindex(TIER_ORDER, fill_value=0).reset_index()
    total_customers = len(scored)
    total_capacity = grouped["total_capacity"].sum()

    grouped["share_of_scorable_pct"] = (
        grouped["customers"] / total_customers * 100 if total_customers else 0
    )
    grouped["capacity_share_pct"] = (
        grouped["total_capacity"] / total_capacity * 100 if total_capacity else 0
    )
    grouped["weighted_default_rate"] = grouped.apply(
        lambda row: row["expected_loss_amount"] / row["total_capacity"]
        if row["total_capacity"]
        else 0,
        axis=1,
    )

    return grouped[
        [
            "tier",
            "customers",
            "share_of_scorable_pct",
            "avg_score",
            "median_score",
            "avg_paid_invoices",
            "avg_merchant_count",
            "total_capacity",
            "capacity_share_pct",
            "avg_capacity",
            "expected_loss_amount",
            "weighted_default_rate",
        ]
    ]


def _build_primary_merchant_summary(scored: pd.DataFrame, eligible: pd.DataFrame) -> pd.DataFrame:
    if scored.empty:
        return pd.DataFrame()

    merchant_summary = scored.groupby("primary_merchant", observed=False).agg(
        scorable_customers=("customer_document_number", "count"),
        avg_score=("score", "mean"),
        multi_merchant_customers=("merchant_count", lambda s: int((s > 1).sum())),
    )

    if not eligible.empty:
        eligible_summary = eligible.groupby("primary_merchant", observed=False).agg(
            eligible_customers=("customer_document_number", "count"),
            total_capacity=("max_loan_amount", "sum"),
            avg_capacity=("max_loan_amount", "mean"),
            expected_loss_amount=("expected_loss_amount", "sum"),
        )
        merchant_summary = merchant_summary.join(eligible_summary, how="left")

    merchant_summary = merchant_summary.fillna(0).reset_index()
    for column in ["eligible_customers", "total_capacity", "avg_capacity", "expected_loss_amount"]:
        if column not in merchant_summary.columns:
            merchant_summary[column] = 0
    total_capacity = merchant_summary["total_capacity"].sum()
    merchant_summary["capacity_share_pct"] = (
        merchant_summary["total_capacity"] / total_capacity * 100 if total_capacity else 0
    )
    merchant_summary["expected_loss_rate"] = merchant_summary.apply(
        lambda row: row["expected_loss_amount"] / row["total_capacity"]
        if row["total_capacity"]
        else 0,
        axis=1,
    )

    return merchant_summary.sort_values(
        ["total_capacity", "eligible_customers", "scorable_customers"],
        ascending=[False, False, False],
    )


def _build_overlap_summary(scored: pd.DataFrame, eligible: pd.DataFrame) -> pd.DataFrame:
    if scored.empty:
        return pd.DataFrame()

    summary = scored.groupby("overlap_segment", observed=False).agg(
        customers=("customer_document_number", "count"),
        avg_score=("score", "mean"),
        avg_diversity_bonus=("diversity_bonus", "mean"),
    )

    if not eligible.empty:
        eligible_summary = eligible.groupby("overlap_segment", observed=False).agg(
            eligible_customers=("customer_document_number", "count"),
            total_capacity=("max_loan_amount", "sum"),
            expected_loss_amount=("expected_loss_amount", "sum"),
        )
        summary = summary.join(eligible_summary, how="left")

    summary = summary.reindex(OVERLAP_ORDER).fillna(0).reset_index()
    total_customers = len(scored)
    total_capacity = summary["total_capacity"].sum()
    summary["share_of_scorable_pct"] = (
        summary["customers"] / total_customers * 100 if total_customers else 0
    )
    summary["capacity_share_pct"] = (
        summary["total_capacity"] / total_capacity * 100 if total_capacity else 0
    )
    summary["weighted_default_rate"] = summary.apply(
        lambda row: row["expected_loss_amount"] / row["total_capacity"]
        if row["total_capacity"]
        else 0,
        axis=1,
    )

    return summary[
        [
            "overlap_segment",
            "customers",
            "share_of_scorable_pct",
            "eligible_customers",
            "avg_score",
            "avg_diversity_bonus",
            "total_capacity",
            "capacity_share_pct",
            "expected_loss_amount",
            "weighted_default_rate",
        ]
    ]


def _build_risk_flag_summary(scored: pd.DataFrame, eligible: pd.DataFrame) -> pd.DataFrame:
    rows = []
    scorable_count = len(scored)
    eligible_count = len(eligible)

    for column, label in RISK_FLAG_COLUMNS.items():
        scorable_customers = int(scored[column].sum()) if column in scored.columns else 0
        eligible_customers = int(eligible[column].sum()) if column in eligible.columns else 0
        rows.append(
            {
                "risk_flag": label,
                "scorable_customers": scorable_customers,
                "share_of_scorable_pct": (scorable_customers / scorable_count * 100)
                if scorable_count
                else 0,
                "eligible_customers": eligible_customers,
                "share_of_eligible_pct": (eligible_customers / eligible_count * 100)
                if eligible_count
                else 0,
            }
        )

    return pd.DataFrame(rows).sort_values("scorable_customers", ascending=False)


def build_portfolio_summary(scores_df: pd.DataFrame) -> Dict:
    df = _prepare_scores(scores_df)
    scored = df[df["status"] == "SCORED"].copy()
    eligible = scored[scored["tier"].isin(ELIGIBLE_TIERS) & (scored["max_loan_amount"] > 0)].copy()

    total_customers = len(df)
    scorable_customers = len(scored)
    eligible_customers = len(eligible)
    total_capacity = float(eligible["max_loan_amount"].sum())
    expected_loss_amount = float(eligible["expected_loss_amount"].sum())
    credit_ready = scored[scored["tier"].isin({"PRIME", "STANDARD"})].copy()
    manual_review = scored[scored["tier"] == "SUBPRIME"].copy()

    primary_capacity = (
        eligible.groupby("primary_merchant", observed=False)["max_loan_amount"].sum().sort_values(ascending=False)
        if not eligible.empty
        else pd.Series(dtype=float)
    )

    single_merchant = scored[scored["merchant_count"] <= 1]
    multi_merchant = scored[scored["merchant_count"] > 1]
    any_risk_flag = scored[list(RISK_FLAG_COLUMNS)].any(axis=1) if not scored.empty else pd.Series(dtype=bool)

    score_stats = {
        "mean": _safe_round(scored["score"].mean()),
        "median": _safe_round(scored["score"].median()),
        "min": _safe_round(scored["score"].min()),
        "max": _safe_round(scored["score"].max()),
    }
    dimension_avgs = {
        "reliability": _safe_round(scored["reliability_score"].mean()),
        "intent": _safe_round(scored["intent_score"].mean()),
        "timeliness": _safe_round(scored["timeliness_score"].mean()),
        "capacity": _safe_round(scored["capacity_score"].mean()),
        "tenure": _safe_round(scored["tenure_score"].mean()),
    }

    return {
        "merchant_id": "CROSS_MERCHANT",
        "analysis_date": (
            df["created_at"].dropna().max().isoformat()
            if "created_at" in df.columns and df["created_at"].notna().any()
            else None
        ),
        "total_customers": total_customers,
        "scorable_customers": scorable_customers,
        "scorable_rate": round(scorable_customers / total_customers, 4) if total_customers else 0,
        "insufficient_data": int((df["status"] == "INSUFFICIENT_DATA").sum()),
        "too_new": int((df["status"] == "TOO_NEW").sum()),
        "eligible_customers": eligible_customers,
        "eligible_rate_of_scorable": round(eligible_customers / scorable_customers, 4)
        if scorable_customers
        else 0,
        "credit_ready": {
            "customers": int(len(credit_ready)),
            "share_of_scorable": round(len(credit_ready) / scorable_customers, 4)
            if scorable_customers
            else 0,
            "capacity": round(float(credit_ready["max_loan_amount"].sum()), 2),
        },
        "manual_review": {
            "customers": int(len(manual_review)),
            "share_of_scorable": round(len(manual_review) / scorable_customers, 4)
            if scorable_customers
            else 0,
            "capacity": round(float(manual_review["max_loan_amount"].sum()), 2),
        },
        "total_eligible_capacity": round(total_capacity, 2),
        "average_capacity_per_eligible_customer": round(total_capacity / eligible_customers, 2)
        if eligible_customers
        else 0,
        "expected_loss_amount": round(expected_loss_amount, 2),
        "weighted_expected_default_rate": round(expected_loss_amount / total_capacity, 4)
        if total_capacity
        else 0,
        "score_statistics": score_stats,
        "dimension_averages": dimension_avgs,
        "concentration": {
            "top_10_primary_merchant_capacity_share": round(
                primary_capacity.head(10).sum() / total_capacity, 4
            )
            if total_capacity
            else 0,
            "top_1_primary_merchant_capacity_share": round(
                primary_capacity.head(1).sum() / total_capacity, 4
            )
            if total_capacity
            else 0,
            "primary_merchant_capacity_hhi": round(
                ((primary_capacity / total_capacity) ** 2).sum(), 4
            )
            if total_capacity
            else 0,
        },
        "cross_merchant": {
            "multi_merchant_customers": int(len(multi_merchant)),
            "multi_merchant_share_of_scorable": round(len(multi_merchant) / scorable_customers, 4)
            if scorable_customers
            else 0,
            "multi_merchant_capacity_share": round(
                multi_merchant["max_loan_amount"].sum() / total_capacity, 4
            )
            if total_capacity
            else 0,
            "total_diversity_bonus_points": float(
                round(scored["diversity_bonus"].fillna(0).sum(), 1)
            ),
            "avg_diversity_bonus_multi_merchant": round(
                multi_merchant["diversity_bonus"].mean(), 1
            )
            if not multi_merchant.empty
            else 0,
            "avg_score_single_merchant": round(single_merchant["score"].mean(), 1)
            if not single_merchant.empty
            else 0,
            "avg_score_multi_merchant": round(multi_merchant["score"].mean(), 1)
            if not multi_merchant.empty
            else 0,
        },
        "risk_flags": {
            "customers_with_any_flag": int(any_risk_flag.sum()) if not scored.empty else 0,
            "share_with_any_flag": round(any_risk_flag.mean(), 4) if not scored.empty else 0,
            **{
                label: {
                    "customers": int(scored[column].sum()),
                    "share_of_scorable": round(float(scored[column].mean()), 4),
                }
                for column, label in RISK_FLAG_COLUMNS.items()
            },
        },
    }


def generate_portfolio_html_report(
    summary: Dict,
    tier_summary: pd.DataFrame,
    primary_merchant_summary: pd.DataFrame,
    overlap_summary: pd.DataFrame,
    risk_flag_summary: pd.DataFrame,
    filepath: str,
) -> None:
    """Generate a presentation-style HTML portfolio report."""
    analysis_date = summary.get("analysis_date") or "N/A"
    health = _health_status(summary)

    max_capacity = float(tier_summary["total_capacity"].max()) if not tier_summary.empty else 0.0
    max_flag_pct = float(risk_flag_summary["share_of_scorable_pct"].max()) if not risk_flag_summary.empty else 0.0
    top_merchants = primary_merchant_summary.head(8).copy()

    tier_rows = []
    for row in tier_summary.itertuples(index=False):
        width = (row.total_capacity / max_capacity * 100) if max_capacity else 0
        color = TIER_COLORS.get(row.tier, "#6c757d")
        capacity_label = _currency_compact(row.total_capacity) if row.total_capacity else "$0"
        extra = ""
        if row.tier == "PRIME":
            extra = "Auto-approve"
        elif row.tier == "STANDARD":
            extra = "Standard review"
        elif row.tier == "SUBPRIME":
            extra = "Manual review"
        elif row.tier == "HIGH_RISK":
            extra = "Not eligible"
        elif row.tier == "VERY_HIGH_RISK":
            extra = "Blocked"

        tier_rows.append(
            f"""
            <div class="tier-row">
              <div class="tier-meta">
                <div class="tier-name">{row.tier.replace('_', ' ')}</div>
                <div class="tier-stats">{int(row.customers):,} customers · {row.share_of_scorable_pct:.1f}% · {extra}</div>
              </div>
              <div class="bar-track"><div class="bar-fill" style="width:{width:.1f}%;background:{color};"></div></div>
              <div class="tier-value">{capacity_label}</div>
            </div>
            """
        )

    flag_rows = []
    for row in risk_flag_summary.itertuples(index=False):
        width = (row.share_of_scorable_pct / max_flag_pct * 100) if max_flag_pct else 0
        flag_rows.append(
            f"""
            <div class="flag-row">
              <div class="flag-label">{row.risk_flag}</div>
              <div class="bar-track slim"><div class="bar-fill warning" style="width:{width:.1f}%;"></div></div>
              <div class="flag-value">{row.scorable_customers:,} · {row.share_of_scorable_pct:.1f}%</div>
            </div>
            """
        )

    merchant_rows = []
    for row in top_merchants.itertuples(index=False):
        merchant_rows.append(
            f"""
            <tr>
              <td>{row.primary_merchant}</td>
              <td>{int(row.eligible_customers):,}</td>
              <td>{_currency_compact(row.total_capacity)}</td>
              <td>{row.capacity_share_pct:.1f}%</td>
              <td>{row.expected_loss_rate * 100:.1f}%</td>
            </tr>
            """
        )

    subprime_capacity = float(
        tier_summary.loc[tier_summary["tier"] == "SUBPRIME", "total_capacity"].iloc[0]
    )
    high_risk_customers = int(
        tier_summary.loc[tier_summary["tier"] == "HIGH_RISK", "customers"].iloc[0]
    )
    very_high_risk_customers = int(
        tier_summary.loc[tier_summary["tier"] == "VERY_HIGH_RISK", "customers"].iloc[0]
    )
    blocked_customers = high_risk_customers + very_high_risk_customers
    blocked_share = (
        blocked_customers / summary["scorable_customers"] if summary["scorable_customers"] else 0
    )
    cleaner_capacity_share = (
        summary["credit_ready"]["capacity"] / summary["total_eligible_capacity"]
        if summary["total_eligible_capacity"]
        else 0
    )
    portfolio_signal_cards = [
        (
            "Credit Ready",
            f'{summary["credit_ready"]["customers"]:,}',
            f'{_pct(summary["credit_ready"]["share_of_scorable"])} of scored',
        ),
        (
            "Manual Review",
            f'{summary["manual_review"]["customers"]:,}',
            f'{_pct(summary["manual_review"]["share_of_scorable"])} of scored',
        ),
        (
            "Blocked Cohort",
            f"{blocked_customers:,}",
            f"{_pct(blocked_share)} of scored",
        ),
        (
            "Any Risk Flag",
            f'{summary["risk_flags"]["customers_with_any_flag"]:,}',
            f'{_pct(summary["risk_flags"]["share_with_any_flag"])} of scored',
        ),
    ]
    portfolio_signal_markup = []
    for label, value, sublabel in portfolio_signal_cards:
        portfolio_signal_markup.append(
            f"""
            <div class="mini-card mini-card-strong">
              <div class="mini-label">{label}</div>
              <div class="mini-value">{value}</div>
              <div class="mini-sub">{sublabel}</div>
            </div>
            """
        )

    html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Cross-Merchant Portfolio Health</title>
  <style>
    :root {{
      --colors-primary: #533afd;
      --colors-primary-deep: #4434d4;
      --colors-primary-press: #2e2b8c;
      --colors-primary-soft: #665efd;
      --colors-primary-bg-subdued-hover: #b9b9f9;
      --colors-brand-dark-900: #1c1e54;
      --colors-ruby: #ea2261;
      --colors-magenta: #f96bee;
      --colors-lemon: #9b6829;
      --colors-canvas: #ffffff;
      --colors-canvas-soft: #f6f9fc;
      --colors-canvas-cream: #f5e9d4;
      --colors-hairline: #e3e8ee;
      --colors-hairline-input: #a8c3de;
      --colors-ink: #0d253d;
      --colors-ink-secondary: #273951;
      --colors-ink-mute: #64748d;
      --colors-on-primary: #ffffff;
      --shadow-level-1: rgba(0,55,112,0.08) 0 1px 3px;
      --shadow-level-2: rgba(0,55,112,0.08) 0 8px 24px, rgba(0,55,112,0.04) 0 2px 6px;
      --rounded-lg: 12px;
      --rounded-xl: 16px;
      --rounded-pill: 9999px;
    }}
    * {{ box-sizing: border-box; }}
    html {{ background: var(--colors-canvas); }}
    body {{
      margin: 0;
      color: var(--colors-ink);
      background: var(--colors-canvas);
      font-family: Inter, "SF Pro Display", system-ui, sans-serif;
      font-weight: 300;
      line-height: 1.4;
      font-feature-settings: "ss01" 1;
      -webkit-font-smoothing: antialiased;
      text-rendering: optimizeLegibility;
    }}
    a {{
      color: inherit;
      text-decoration: none;
    }}
    .page {{
      overflow: clip;
    }}
    .shell {{
      width: min(1200px, calc(100vw - 48px));
      margin: 0 auto;
    }}
    .hero-band {{
      position: relative;
      padding: 24px 0 72px;
      isolation: isolate;
      overflow: hidden;
    }}
    .hero-band::before {{
      content: "";
      position: absolute;
      inset: 0 0 24% 0;
      background:
        radial-gradient(44% 56% at 10% 18%, rgba(245, 233, 212, 0.98), transparent 68%),
        radial-gradient(34% 42% at 24% 20%, rgba(249, 107, 238, 0.46), transparent 70%),
        radial-gradient(42% 52% at 34% 8%, rgba(255, 205, 133, 0.88), transparent 70%),
        radial-gradient(42% 50% at 58% 22%, rgba(102, 94, 253, 0.72), transparent 72%),
        radial-gradient(40% 52% at 84% 18%, rgba(234, 34, 97, 0.60), transparent 72%),
        radial-gradient(36% 42% at 73% 6%, rgba(83, 58, 253, 0.82), transparent 70%),
        linear-gradient(180deg, #fff8f0 0%, #fdfcff 54%, rgba(255,255,255,0.96) 100%);
      z-index: -2;
    }}
    .hero-band::after {{
      content: "";
      position: absolute;
      inset: auto 0 0 0;
      height: 36%;
      background: linear-gradient(180deg, rgba(255,255,255,0) 0%, var(--colors-canvas) 84%);
      z-index: -1;
    }}
    .nav {{
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      padding: 8px 0 28px;
    }}
    .brand {{
      font-size: 14px;
      letter-spacing: 0.1px;
      color: var(--colors-ink-secondary);
    }}
    .nav-links {{
      display: flex;
      align-items: center;
      gap: 12px;
      color: var(--colors-ink-mute);
      font-size: 13px;
    }}
    .button-primary-pill {{
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: var(--colors-primary);
      color: var(--colors-on-primary);
      padding: 8px 16px;
      border-radius: var(--rounded-pill);
      font-size: 16px;
      font-weight: 400;
      line-height: 1;
      box-shadow: var(--shadow-level-1);
      transition: background 120ms ease;
    }}
    .button-primary-pill:hover {{
      background: var(--colors-primary-press);
    }}
    .hero-grid {{
      display: grid;
      grid-template-columns: minmax(0, 1.35fr) minmax(320px, 0.65fr);
      gap: 24px;
      align-items: stretch;
    }}
    .hero-card, .panel, .dark-panel {{
      border-radius: var(--rounded-lg);
      box-shadow: var(--shadow-level-2);
    }}
    .hero-card {{
      background: rgba(255,255,255,0.84);
      border: 1px solid rgba(227, 232, 238, 0.84);
      backdrop-filter: blur(12px);
      padding: 32px;
    }}
    .eyebrow {{
      font-size: 10px;
      font-weight: 400;
      line-height: 1.15;
      letter-spacing: 0.1px;
      text-transform: uppercase;
      color: var(--colors-ink-mute);
      margin-bottom: 16px;
    }}
    h1, h2, h3 {{
      margin: 0;
      font-family: Inter, "SF Pro Display", system-ui, sans-serif;
      font-weight: 300;
      color: var(--colors-ink);
      font-feature-settings: "ss01" 1;
    }}
    h1 {{
      font-size: clamp(42px, 5vw, 56px);
      line-height: 1.03;
      letter-spacing: -1.4px;
      max-width: 10ch;
      margin-bottom: 16px;
    }}
    h2 {{
      font-size: clamp(28px, 3.2vw, 32px);
      line-height: 1.1;
      letter-spacing: -0.64px;
      margin-bottom: 14px;
    }}
    h3 {{
      font-size: 22px;
      line-height: 1.1;
      letter-spacing: -0.22px;
      margin-bottom: 10px;
    }}
    .hero-copy {{
      max-width: 58ch;
      font-size: 16px;
      color: var(--colors-ink-secondary);
      margin-bottom: 18px;
    }}
    .hero-pills {{
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 28px;
    }}
    .pill-tag-soft {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      padding: 4px 8px;
      border-radius: var(--rounded-pill);
      background: var(--colors-primary-bg-subdued-hover);
      color: var(--colors-primary-deep);
      font-size: 10px;
      font-weight: 400;
      line-height: 1.15;
      letter-spacing: 0.1px;
      text-transform: uppercase;
    }}
    .metrics {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 16px;
    }}
    .metric {{
      padding: 20px;
      border-radius: var(--rounded-lg);
      border: 1px solid var(--colors-hairline);
      background: var(--colors-canvas);
      box-shadow: var(--shadow-level-1);
    }}
    .metric-label {{
      font-size: 13px;
      font-weight: 400;
      line-height: 1.4;
      letter-spacing: -0.39px;
      color: var(--colors-ink-mute);
      margin-bottom: 10px;
    }}
    .metric-value, .tier-value, .flag-value, .mini-value, .table td:nth-child(n+2) {{
      font-feature-settings: "tnum" 1;
      font-variant-numeric: tabular-nums;
      letter-spacing: -0.42px;
    }}
    .metric-value {{
      font-size: 32px;
      line-height: 1.03;
      letter-spacing: -0.64px;
      margin-bottom: 8px;
      color: var(--colors-ink);
    }}
    .metric-sub {{
      font-size: 14px;
      color: var(--colors-ink-mute);
    }}
    .status {{
      background: var(--colors-brand-dark-900);
      color: var(--colors-on-primary);
      padding: 28px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      min-height: 100%;
    }}
    .status.balanced {{
      background: linear-gradient(160deg, #1c1e54 0%, #4434d4 100%);
    }}
    .status.warning {{
      background: linear-gradient(160deg, #1c1e54 0%, #9b6829 100%);
    }}
    .status .eyebrow,
    .status .metric-label,
    .status .metric-sub {{
      color: rgba(255,255,255,0.72);
    }}
    .status h2,
    .status .metric-value {{
      color: var(--colors-on-primary);
    }}
    .status .metric {{
      background: rgba(255,255,255,0.06);
      border-color: rgba(255,255,255,0.10);
      box-shadow: none;
    }}
    .section-soft {{
      background: var(--colors-canvas-soft);
      padding: 48px 0 40px;
    }}
    .section-cream {{
      background: var(--colors-canvas);
      padding: 40px 0;
    }}
    .section-white {{
      background: var(--colors-canvas);
      padding: 40px 0 64px;
    }}
    .grid {{
      display: grid;
      grid-template-columns: repeat(12, minmax(0, 1fr));
      gap: 24px;
    }}
    .span-12 {{ grid-column: span 12; }}
    .span-8 {{ grid-column: span 8; }}
    .span-7 {{ grid-column: span 7; }}
    .span-6 {{ grid-column: span 6; }}
    .span-5 {{ grid-column: span 5; }}
    .span-4 {{ grid-column: span 4; }}
    .panel {{
      background: var(--colors-canvas);
      border: 1px solid var(--colors-hairline);
      padding: 32px;
    }}
    .panel-cream {{
      background: var(--colors-canvas);
    }}
    .dark-panel {{
      background: var(--colors-brand-dark-900);
      color: var(--colors-on-primary);
      padding: 0;
      overflow: hidden;
    }}
    .dark-panel h2,
    .dark-panel h3,
    .dark-panel .eyebrow {{
      color: var(--colors-on-primary);
    }}
    .app-chrome {{
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 14px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      background: rgba(13, 37, 61, 0.24);
    }}
    .dot {{
      width: 8px;
      height: 8px;
      border-radius: 999px;
      background: rgba(255,255,255,0.28);
    }}
    .dot:nth-child(1) {{ background: rgba(249,107,238,0.72); }}
    .dot:nth-child(2) {{ background: rgba(255,205,133,0.82); }}
    .dot:nth-child(3) {{ background: rgba(102,94,253,0.78); }}
    .app-body {{
      padding: 24px;
    }}
    .report-block {{
      margin: 0;
      white-space: pre-wrap;
      font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
      font-size: 14px;
      line-height: 1.7;
      color: rgba(255,255,255,0.92);
      background: transparent;
    }}
    .tier-row, .flag-row {{
      display: grid;
      grid-template-columns: 1.45fr 2fr 1fr;
      gap: 16px;
      align-items: center;
      padding: 14px 0;
      border-bottom: 1px solid var(--colors-hairline);
    }}
    .tier-row:last-child, .flag-row:last-child {{
      border-bottom: 0;
    }}
    .tier-name, .flag-label {{
      font-size: 18px;
      letter-spacing: -0.2px;
      color: var(--colors-ink);
    }}
    .tier-stats, .mini-sub {{
      margin-top: 4px;
      font-size: 13px;
      color: var(--colors-ink-mute);
    }}
    .bar-track {{
      position: relative;
      height: 12px;
      border-radius: var(--rounded-pill);
      background: rgba(168,195,222,0.18);
      overflow: hidden;
    }}
    .bar-track.slim {{
      height: 10px;
    }}
    .bar-fill {{
      height: 100%;
      border-radius: var(--rounded-pill);
    }}
    .bar-fill.warning {{
      background: linear-gradient(90deg, var(--colors-ruby) 0%, var(--colors-magenta) 100%);
    }}
    .tier-value, .flag-value {{
      text-align: right;
      font-size: 14px;
      color: var(--colors-ink-secondary);
    }}
    .mini-grid {{
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 14px;
      margin-top: 12px;
    }}
    .mini-card {{
      background: var(--colors-canvas);
      border: 1px solid var(--colors-hairline);
      border-radius: var(--rounded-lg);
      padding: 16px;
      box-shadow: var(--shadow-level-1);
    }}
    .mini-card-strong {{
      background: rgba(255,255,255,0.94);
      border-color: rgba(39, 57, 81, 0.12);
    }}
    .mini-label {{
      margin-bottom: 10px;
      font-size: 10px;
      font-weight: 400;
      text-transform: uppercase;
      letter-spacing: 0.1px;
      color: var(--colors-ink-secondary);
    }}
    .mini-value {{
      font-size: 28px;
      line-height: 1.03;
      letter-spacing: -0.64px;
      color: var(--colors-ink);
    }}
    .mini-sub {{
      color: var(--colors-ink-secondary);
    }}
    .insight-list {{
      display: grid;
      gap: 12px;
      margin-top: 18px;
    }}
    .insight {{
      background: rgba(255,255,255,0.94);
      border: 1px solid rgba(39, 57, 81, 0.10);
      border-radius: var(--rounded-lg);
      padding: 16px;
      color: var(--colors-ink-secondary);
    }}
    .insight strong {{
      display: block;
      font-size: 15px;
      font-weight: 400;
      color: var(--colors-ink);
      margin-bottom: 6px;
    }}
    .table {{
      width: 100%;
      border-collapse: collapse;
      color: rgba(255,255,255,0.92);
      font-size: 14px;
    }}
    .table th, .table td {{
      padding: 12px 10px;
      text-align: left;
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }}
    .table th {{
      font-size: 13px;
      font-weight: 400;
      letter-spacing: -0.39px;
      color: rgba(255,255,255,0.70);
    }}
    .table tbody tr:last-child td {{
      border-bottom: 0;
    }}
    .section-note {{
      margin-top: 14px;
      font-size: 14px;
      color: var(--colors-ink-secondary);
      max-width: 60ch;
    }}
    @media (max-width: 1100px) {{
      .hero-grid,
      .metrics,
      .mini-grid {{
        grid-template-columns: 1fr;
      }}
      .span-8, .span-7, .span-6, .span-5, .span-4 {{
        grid-column: span 12;
      }}
    }}
    @media (max-width: 768px) {{
      .shell {{
        width: min(100vw - 24px, 1200px);
      }}
      .nav {{
        flex-direction: column;
        align-items: flex-start;
      }}
      .hero-card, .panel, .status, .app-body {{
        padding: 24px;
      }}
      .tier-row, .flag-row {{
        grid-template-columns: 1fr;
      }}
      .tier-value, .flag-value {{
        text-align: left;
      }}
      h1 {{
        font-size: 36px;
        letter-spacing: -0.96px;
      }}
      h2 {{
        font-size: 26px;
        letter-spacing: -0.26px;
      }}
    }}
  </style>
</head>
<body>
  <main class="page">
    <section class="hero-band">
      <div class="shell">
        <div class="nav">
          <div class="brand">Cross-Merchant Portfolio Health</div>
          <div class="nav-links">
            <span>Analysis date: {analysis_date}</span>
            <a class="button-primary-pill" href="./portfolio_health.md">Open Deck Summary</a>
          </div>
        </div>

        <div class="hero-grid">
          <div class="hero-card">
            <div class="eyebrow">Portfolio Analytics · Cross Merchant</div>
            <h1>Cross-Merchant Portfolio Health</h1>
            <div class="hero-copy">
              A portfolio-level view of credit-ready customers, manual-review volume, blocked cohorts,
              expected loss, and merchant concentration across the full scored base.
            </div>
            <div class="hero-pills">
              <span class="pill-tag-soft">Credit ready {_pct(summary["credit_ready"]["share_of_scorable"])}</span>
              <span class="pill-tag-soft">Expected default {_pct(summary["weighted_expected_default_rate"], 2)}</span>
              <span class="pill-tag-soft">Capacity {_currency_compact(summary["total_eligible_capacity"])}</span>
            </div>
            <div class="metrics">
              <div class="metric">
                <div class="metric-label">Scorable Customers</div>
                <div class="metric-value">{summary["scorable_customers"]:,}</div>
                <div class="metric-sub">{_pct(summary["scorable_rate"])} of total base</div>
              </div>
              <div class="metric">
                <div class="metric-label">Credit Ready</div>
                <div class="metric-value">{summary["credit_ready"]["customers"]:,}</div>
                <div class="metric-sub">PRIME + STANDARD</div>
              </div>
              <div class="metric">
                <div class="metric-label">Eligible Capacity</div>
                <div class="metric-value">{_currency_compact(summary["total_eligible_capacity"]).replace(" COP", "")}</div>
                <div class="metric-sub">Including SUBPRIME manual review</div>
              </div>
              <div class="metric">
                <div class="metric-label">Expected Loss</div>
                <div class="metric-value">{_currency_compact(summary["expected_loss_amount"]).replace(" COP", "")}</div>
                <div class="metric-sub">{_pct(summary["weighted_expected_default_rate"], 2)} weighted default</div>
              </div>
            </div>
          </div>

          <aside class="status {health["tone"]}">
            <div>
              <div class="eyebrow">Portfolio Verdict</div>
              <h2>{health["label"]}</h2>
              <div class="hero-copy" style="color:rgba(255,255,255,0.82);margin-bottom:24px;">
                {health["message"]}
              </div>
            </div>
            <div class="metrics" style="grid-template-columns:1fr;gap:12px;">
              <div class="metric">
                <div class="metric-label">Top 10 Concentration</div>
                <div class="metric-value">{summary["concentration"]["top_10_primary_merchant_capacity_share"] * 100:.1f}%</div>
                <div class="metric-sub">of total eligible capacity</div>
              </div>
              <div class="metric">
                <div class="metric-label">Any Risk Flag</div>
                <div class="metric-value">{summary["risk_flags"]["share_with_any_flag"] * 100:.1f}%</div>
                <div class="metric-sub">{summary["risk_flags"]["customers_with_any_flag"]:,} scored customers</div>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <section class="section-soft">
      <div class="shell">
        <div class="grid">
          <div class="dark-panel span-7">
            <div class="app-chrome">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
            <div class="app-body">
              <div class="eyebrow">Deck Format</div>
              <h2 style="color:white;">Overall Portfolio Health</h2>
              <pre class="report-block">━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CUSTOMER BASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Customers:              {summary["total_customers"]:,}
Scorable (≥3 paid invoices):  {summary["scorable_customers"]:,} ({_pct(summary["scorable_rate"])}) ✅
Insufficient Data:            {summary["insufficient_data"]:,} ({(summary["insufficient_data"] / summary["total_customers"] * 100) if summary["total_customers"] else 0:.1f}%)
Too New:                      {summary["too_new"]:,}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIER DISTRIBUTION ({summary["scorable_customers"]:,} scored)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIME:                        {int(tier_summary.loc[tier_summary["tier"] == "PRIME", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "PRIME", "share_of_scorable_pct"].iloc[0]):4.1f}%)
STANDARD:                     {int(tier_summary.loc[tier_summary["tier"] == "STANDARD", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "STANDARD", "share_of_scorable_pct"].iloc[0]):4.1f}%)
SUBPRIME:                     {int(tier_summary.loc[tier_summary["tier"] == "SUBPRIME", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "SUBPRIME", "share_of_scorable_pct"].iloc[0]):4.1f}%)
HIGH RISK:                    {int(tier_summary.loc[tier_summary["tier"] == "HIGH_RISK", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "HIGH_RISK", "share_of_scorable_pct"].iloc[0]):4.1f}%)
VERY HIGH RISK:               {int(tier_summary.loc[tier_summary["tier"] == "VERY_HIGH_RISK", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "VERY_HIGH_RISK", "share_of_scorable_pct"].iloc[0]):4.1f}%)

Credit Ready:                 {summary["credit_ready"]["customers"]:,} ({_pct(summary["credit_ready"]["share_of_scorable"])}) ← PRIME + STANDARD
Manual Review Pool:           {summary["manual_review"]["customers"]:,} ({_pct(summary["manual_review"]["share_of_scorable"])}) ← SUBPRIME

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORE STATISTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mean Score:                   {summary["score_statistics"]["mean"]}
Median Score:                 {summary["score_statistics"]["median"]}
Range:                        {summary["score_statistics"]["min"]} - {summary["score_statistics"]["max"]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION AVERAGES (0-100 scale)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reliability (40%):            {summary["dimension_averages"]["reliability"]}
Intent (30%):                 {summary["dimension_averages"]["intent"]}
Timeliness (20%):             {summary["dimension_averages"]["timeliness"]}
Capacity (10%):               {summary["dimension_averages"]["capacity"]}
Tenure (bonus):               {summary["dimension_averages"]["tenure"]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREDIT CAPACITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Eligible Loan Amount:   {_currency_full(summary["total_eligible_capacity"])}
Average Loan per Customer:    {_currency_full(summary["average_capacity_per_eligible_customer"])}
Expected Portfolio Default:   {_pct(summary["weighted_expected_default_rate"], 2)}

Breakdown by Tier:
  PRIME:     {_currency_compact(float(tier_summary.loc[tier_summary["tier"] == "PRIME", "total_capacity"].iloc[0]))}
  STANDARD:  {_currency_compact(float(tier_summary.loc[tier_summary["tier"] == "STANDARD", "total_capacity"].iloc[0]))}
  SUBPRIME:  {_currency_compact(float(tier_summary.loc[tier_summary["tier"] == "SUBPRIME", "total_capacity"].iloc[0]))}</pre>
            </div>
          </div>

          <div class="panel span-5">
            <div class="eyebrow">Capacity By Tier</div>
            <h2>Lendable mix</h2>
            {''.join(tier_rows)}
            <div class="section-note">
              PRIME and STANDARD dominate lendable capacity, while SUBPRIME remains the main manual-review expansion lane.
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-cream">
      <div class="shell">
        <div class="grid">
          <div class="panel panel-cream span-6">
            <div class="eyebrow">Risk Filters</div>
            <h2>Behavioral red flags</h2>
            {''.join(flag_rows)}
            <div class="section-note">
              These flags matter because they directly affect collection quality and approval guardrails. Chronic lateness and insufficient funds are the two signals to watch first.
            </div>
          </div>

          <div class="panel panel-cream span-6">
            <div class="eyebrow">Portfolio Health</div>
            <h2>Portfolio quality signals</h2>
            <div class="mini-grid">
              {''.join(portfolio_signal_markup)}
            </div>
            <div class="insight-list">
              <div class="insight">
                <strong>Most lendable capacity is in the clean cohorts.</strong>
                PRIME + STANDARD contribute {_currency_compact(summary["credit_ready"]["capacity"])} and represent {_pct(cleaner_capacity_share)} of the total eligible capacity.
              </div>
              <div class="insight">
                <strong>Subprime is real upside, but not cheap risk.</strong>
                The manual-review pool adds {_currency_compact(summary["manual_review"]["capacity"])} of additional capacity, anchored by {_currency_compact(subprime_capacity)} in SUBPRIME exposure at a 15.0% expected default assumption.
              </div>
              <div class="insight">
                <strong>Blocked customers are still a meaningful drag on coverage.</strong>
                {blocked_customers:,} customers sit in HIGH RISK or VERY HIGH RISK, which is {_pct(blocked_share)} of the scored base and currently contributes zero lendable capacity.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section class="section-white">
      <div class="shell">
        <div class="grid">
          <div class="dark-panel span-7">
            <div class="app-chrome">
              <span class="dot"></span><span class="dot"></span><span class="dot"></span>
            </div>
            <div class="app-body">
              <div class="eyebrow">Concentration</div>
              <h2 style="color:white;">Largest primary merchants</h2>
              <table class="table">
                <thead>
                  <tr>
                    <th>Primary Merchant</th>
                    <th>Eligible Cust.</th>
                    <th>Capacity</th>
                    <th>Share</th>
                    <th>Exp. Default</th>
                  </tr>
                </thead>
                <tbody>
                  {''.join(merchant_rows)}
                </tbody>
              </table>
            </div>
          </div>

          <div class="panel span-5">
            <div class="eyebrow">Takeaways</div>
            <h2>What matters</h2>
            <div class="insight-list">
              <div class="insight">
                <strong>Portfolio can support lending at scale.</strong>
                PRIME + STANDARD already represent {_pct(summary["credit_ready"]["share_of_scorable"])} of scored customers and {_currency_compact(summary["credit_ready"]["capacity"])} in cleaner capacity.
              </div>
              <div class="insight">
                <strong>Subprime is a meaningful expansion lane.</strong>
                SUBPRIME adds {_currency_compact(summary["manual_review"]["capacity"])} more capacity, but at a 15.0% expected default assumption.
              </div>
              <div class="insight">
                <strong>Merchant concentration is material but not extreme.</strong>
                The largest primary merchant contributes {summary["concentration"]["top_1_primary_merchant_capacity_share"] * 100:.1f}% of capacity; top 10 contribute {summary["concentration"]["top_10_primary_merchant_capacity_share"] * 100:.1f}%.
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  </main>
</body>
</html>"""

    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    Path(filepath).write_text(html, encoding="utf-8")
    print(f"\n✅ Saved HTML Report: {filepath}")


def generate_portfolio_markdown_report(summary: Dict, tier_summary: pd.DataFrame, filepath: str) -> None:
    """Generate a deck-friendly markdown block."""
    markdown = f"""## Portfolio Analytics

### Overall Portfolio Health (Cross-Merchant)

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CUSTOMER BASE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Customers:              {summary["total_customers"]:,}
Scorable (≥3 paid invoices):  {summary["scorable_customers"]:,} ({_pct(summary["scorable_rate"])}) ✅
Insufficient Data:            {summary["insufficient_data"]:,} ({(summary["insufficient_data"] / summary["total_customers"] * 100) if summary["total_customers"] else 0:.1f}%)
Too New:                      {summary["too_new"]:,}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TIER DISTRIBUTION ({summary["scorable_customers"]:,} scored)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PRIME:                        {int(tier_summary.loc[tier_summary["tier"] == "PRIME", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "PRIME", "share_of_scorable_pct"].iloc[0]):4.1f}%)
STANDARD:                     {int(tier_summary.loc[tier_summary["tier"] == "STANDARD", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "STANDARD", "share_of_scorable_pct"].iloc[0]):4.1f}%)
SUBPRIME:                     {int(tier_summary.loc[tier_summary["tier"] == "SUBPRIME", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "SUBPRIME", "share_of_scorable_pct"].iloc[0]):4.1f}%)
HIGH RISK:                    {int(tier_summary.loc[tier_summary["tier"] == "HIGH_RISK", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "HIGH_RISK", "share_of_scorable_pct"].iloc[0]):4.1f}%)
VERY HIGH RISK:               {int(tier_summary.loc[tier_summary["tier"] == "VERY_HIGH_RISK", "customers"].iloc[0]):,} ({float(tier_summary.loc[tier_summary["tier"] == "VERY_HIGH_RISK", "share_of_scorable_pct"].iloc[0]):4.1f}%)

Credit Ready:                 {summary["credit_ready"]["customers"]:,} ({_pct(summary["credit_ready"]["share_of_scorable"])}) ← PRIME + STANDARD
Manual Review Pool:           {summary["manual_review"]["customers"]:,} ({_pct(summary["manual_review"]["share_of_scorable"])}) ← SUBPRIME

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
SCORE STATISTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Mean Score:                   {summary["score_statistics"]["mean"]}
Median Score:                 {summary["score_statistics"]["median"]}
Range:                        {summary["score_statistics"]["min"]} - {summary["score_statistics"]["max"]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
DIMENSION AVERAGES (0-100 scale)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Reliability (40%):            {summary["dimension_averages"]["reliability"]}
Intent (30%):                 {summary["dimension_averages"]["intent"]}
Timeliness (20%):             {summary["dimension_averages"]["timeliness"]}
Capacity (10%):               {summary["dimension_averages"]["capacity"]}
Tenure (bonus):               {summary["dimension_averages"]["tenure"]}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
CREDIT CAPACITY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Total Eligible Loan Amount:   {_currency_full(summary["total_eligible_capacity"])}
Average Loan per Customer:    {_currency_full(summary["average_capacity_per_eligible_customer"])}
Expected Portfolio Default:   {_pct(summary["weighted_expected_default_rate"], 2)}

Breakdown by Tier:
  PRIME:     {_currency_compact(float(tier_summary.loc[tier_summary["tier"] == "PRIME", "total_capacity"].iloc[0]))}
  STANDARD:  {_currency_compact(float(tier_summary.loc[tier_summary["tier"] == "STANDARD", "total_capacity"].iloc[0]))}
  SUBPRIME:  {_currency_compact(float(tier_summary.loc[tier_summary["tier"] == "SUBPRIME", "total_capacity"].iloc[0]))}
```
"""
    Path(filepath).write_text(markdown, encoding="utf-8")
    print(f"\n✅ Saved Markdown Report: {filepath}")


def save_portfolio_outputs(scores_df: pd.DataFrame, output_dir: str) -> Dict:
    """Generate and save portfolio analytics outputs."""
    df = _prepare_scores(scores_df)
    scored = df[df["status"] == "SCORED"].copy()
    eligible = scored[scored["tier"].isin(ELIGIBLE_TIERS) & (scored["max_loan_amount"] > 0)].copy()

    summary = build_portfolio_summary(df)
    tier_summary = _build_tier_summary(scored)
    primary_merchant_summary = _build_primary_merchant_summary(scored, eligible)
    overlap_summary = _build_overlap_summary(scored, eligible)
    risk_flag_summary = _build_risk_flag_summary(scored, eligible)

    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    save_to_json(summary, str(output_path / "portfolio_summary.json"))
    save_to_csv(tier_summary, str(output_path / "portfolio_tier_summary.csv"))
    save_to_csv(primary_merchant_summary, str(output_path / "portfolio_primary_merchant_summary.csv"))
    save_to_csv(overlap_summary, str(output_path / "portfolio_overlap_summary.csv"))
    save_to_csv(risk_flag_summary, str(output_path / "portfolio_risk_flags_summary.csv"))
    generate_portfolio_markdown_report(
        summary,
        tier_summary,
        str(output_path / "portfolio_health.md"),
    )
    generate_portfolio_html_report(
        summary,
        tier_summary,
        primary_merchant_summary,
        overlap_summary,
        risk_flag_summary,
        str(output_path / "portfolio_analytics.html"),
    )

    return summary
