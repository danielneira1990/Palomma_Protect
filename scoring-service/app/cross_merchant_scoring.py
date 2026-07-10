"""Entry point for cross-merchant customer credit scoring."""

from pathlib import Path

from scoring.cross_merchant.data_loader import load_all_merchant_data
from scoring.cross_merchant.portfolio_analytics import save_portfolio_outputs
from scoring.cross_merchant.score_calculator import CrossMerchantScoreCalculator
from scoring.merchant.tier_classifier import TierClassifier
from scoring.merchant.utils import (
    save_to_csv,
    save_to_json,
    save_to_duckdb,
    generate_html_report,
    print_summary_table,
    print_top_customers,
)


def main(output_dir: str = 'outputs/cross_merchant'):
    print("\n" + "🌐 " * 30)
    print("CROSS-MERCHANT CUSTOMER CREDIT SCORING SYSTEM")
    print("🌐 " * 30 + "\n")

    # 1. Load data from all merchants
    print("Step 1: Loading data from all merchants...")
    invoices_df, customers_df = load_all_merchant_data()

    # 2. Calculate scores
    print("\nStep 2: Calculating cross-merchant scores...")
    calculator = CrossMerchantScoreCalculator(invoices_df)
    scores_df = calculator.calculate_scores_for_all_customers()

    # 3. Assign tiers and recommendations
    print("\nStep 3: Assigning tiers and generating recommendations...")
    scores_df = TierClassifier.add_tier_and_recommendations(scores_df)

    # 4. Generate summary
    print("\nStep 4: Generating summary statistics...")
    summary = TierClassifier.generate_summary_stats(scores_df)

    # 5. Save outputs
    print("\nStep 5: Saving outputs...")
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    save_to_csv(scores_df, str(output_path / "global_scores.csv"))
    save_to_json(summary, str(output_path / "summary.json"))
    save_to_duckdb(scores_df, str(output_path / "scores.duckdb"), table_name='customer_scores')
    generate_html_report(scores_df, summary, str(output_path / "analysis.html"))
    save_portfolio_outputs(scores_df, str(output_path))

    # 6. Print to console
    print_summary_table(summary)
    print_top_customers(scores_df, n=20)

    print("\n✅ CROSS-MERCHANT SCORING COMPLETE!")
    print(f"\n📁 Outputs saved to: {output_path.absolute()}")
    print()


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(
        description="Calculate cross-merchant customer credit scores"
    )
    parser.add_argument(
        '--output',
        type=str,
        default='outputs/cross_merchant',
        help="Output directory (default: outputs/cross_merchant/)"
    )

    args = parser.parse_args()

    try:
        main(args.output)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        raise SystemExit(1)
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise SystemExit(1)
