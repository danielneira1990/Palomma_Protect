"""Main entry point for customer credit scoring system."""

import argparse
from pathlib import Path

from scoring.merchant.config import DEFAULT_MERCHANT_ID
from scoring.merchant.data_loader import load_data_for_merchant
from scoring.merchant.score_calculator import CustomerScoreCalculator
from scoring.merchant.tier_classifier import TierClassifier
from scoring.merchant.utils import (
    save_to_csv,
    save_to_json,
    save_to_duckdb,
    generate_html_report,
    print_summary_table,
    print_top_customers,
)


def main(merchant_id: str, output_dir: str = 'outputs'):
    """Run complete scoring pipeline
    
    Args:
        merchant_id: Merchant to score customers for
        output_dir: Directory for output files
    """
    print("\n" + "🏦 "*30)
    print("CUSTOMER CREDIT SCORING SYSTEM")
    print("🏦 "*30 + "\n")
    
    # 1. Load data
    print("Step 1: Loading data from Tinybird...")
    invoices_df, customers_df = load_data_for_merchant(merchant_id)
    
    # 2. Calculate scores
    print("\nStep 2: Calculating scores...")
    calculator = CustomerScoreCalculator(invoices_df)
    scores_df = calculator.calculate_scores_for_all_customers()
    
    # 3. Assign tiers and recommendations
    print("\nStep 3: Assigning tiers and generating recommendations...")
    scores_df = TierClassifier.add_tier_and_recommendations(scores_df)
    
    # 4. Generate summary statistics
    print("\nStep 4: Generating summary statistics...")
    summary = TierClassifier.generate_summary_stats(scores_df)
    
    # 5. Save outputs
    print("\nStep 5: Saving outputs...")
    output_path = Path(output_dir)
    
    # CSV
    save_to_csv(
        scores_df,
        str(output_path / f"{merchant_id}_customer_scores.csv")
    )
    
    # JSON summary
    save_to_json(
        summary,
        str(output_path / f"{merchant_id}_summary.json")
    )
    
    # DuckDB (optional)
    save_to_duckdb(
        scores_df,
        str(output_path / f"{merchant_id}_scores.duckdb"),
        table_name='customer_scores'
    )
    
    # HTML report
    generate_html_report(
        scores_df,
        summary,
        str(output_path / f"{merchant_id}_analysis.html")
    )
    
    # 6. Print summary to console
    print_summary_table(summary)
    print_top_customers(scores_df, n=20)
    
    print("\n✅ SCORING COMPLETE!")
    print(f"\n📁 Output files saved to: {output_path.absolute()}")
    print(f"\n💡 Next steps:")
    print(f"   1. Review the HTML report: {merchant_id}_analysis.html")
    print(f"   2. Check the summary JSON: {merchant_id}_summary.json")
    print(f"   3. Analyze the CSV data: {merchant_id}_customer_scores.csv")
    print()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Calculate customer credit scores for Palomma rentals"
    )
    parser.add_argument(
        '--merchant',
        type=str,
        default=DEFAULT_MERCHANT_ID,
        help=f"Merchant ID to score (default: {DEFAULT_MERCHANT_ID})"
    )
    parser.add_argument(
        '--output',
        type=str,
        default='outputs',
        help="Output directory (default: outputs/)"
    )
    
    args = parser.parse_args()
    
    try:
        main(args.merchant, args.output)
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        raise SystemExit(1)
    except Exception as e:
        print(f"\n\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
        raise SystemExit(1)
