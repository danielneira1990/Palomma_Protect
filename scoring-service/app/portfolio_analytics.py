"""Generate portfolio analytics from existing cross-merchant outputs."""

from __future__ import annotations

from pathlib import Path

import pandas as pd

from scoring.cross_merchant.portfolio_analytics import save_portfolio_outputs


def main(
    input_csv: str = "outputs/cross_merchant/global_scores.csv",
    output_dir: str = "outputs/cross_merchant",
) -> None:
    input_path = Path(input_csv)
    if not input_path.exists():
        raise FileNotFoundError(f"Input file not found: {input_path}")

    print("\n📊 PORTFOLIO ANALYTICS")
    print(f"   Input:  {input_path}")
    print(f"   Output: {Path(output_dir)}")

    scores_df = pd.read_csv(input_path, low_memory=False)
    summary = save_portfolio_outputs(scores_df, output_dir)

    print("\n✅ PORTFOLIO ANALYTICS COMPLETE!")
    print(f"   Eligible customers: {summary['eligible_customers']:,}")
    print(f"   Total eligible capacity: ${summary['total_eligible_capacity']:,.0f}")
    print(f"   Expected loss amount: ${summary['expected_loss_amount']:,.0f}")


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Generate portfolio analytics from cross-merchant customer scores"
    )
    parser.add_argument(
        "--input",
        type=str,
        default="outputs/cross_merchant/global_scores.csv",
        help="Input CSV file (default: outputs/cross_merchant/global_scores.csv)",
    )
    parser.add_argument(
        "--output",
        type=str,
        default="outputs/cross_merchant",
        help="Output directory (default: outputs/cross_merchant)",
    )
    args = parser.parse_args()

    try:
        main(args.input, args.output)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        raise SystemExit(1)
    except Exception as exc:
        print(f"\n\n❌ Error: {exc}")
        import traceback

        traceback.print_exc()
        raise SystemExit(1)
