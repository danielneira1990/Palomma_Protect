"""Utility functions for output generation and reporting"""

import pandas as pd
import json
import plotly.graph_objects as go
import plotly.express as px
from plotly.subplots import make_subplots
from pathlib import Path
from typing import Dict


def save_to_csv(df: pd.DataFrame, filepath: str) -> None:
    """Save DataFrame to CSV
    
    Args:
        df: DataFrame to save
        filepath: Output file path
    """
    # Ensure directory exists
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    
    # Convert list columns to string for CSV compatibility
    df_copy = df.copy()
    for col in df_copy.columns:
        if df_copy[col].dtype == 'object':
            # Check if it's a list column
            if isinstance(df_copy[col].iloc[0] if len(df_copy) > 0 else None, list):
                df_copy[col] = df_copy[col].apply(lambda x: json.dumps(x) if isinstance(x, list) else x)
    
    df_copy.to_csv(filepath, index=False)
    print(f"\n✅ Saved CSV: {filepath}")
    print(f"   Rows: {len(df):,}, Columns: {len(df.columns)}")


def save_to_json(data: Dict, filepath: str) -> None:
    """Save dictionary to JSON
    
    Args:
        data: Dictionary to save
        filepath: Output file path
    """
    # Ensure directory exists
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    
    with open(filepath, 'w') as f:
        json.dump(data, f, indent=2, default=str)
    
    print(f"\n✅ Saved JSON: {filepath}")


def save_to_duckdb(df: pd.DataFrame, filepath: str, table_name: str = 'customer_scores') -> None:
    """Save DataFrame to DuckDB
    
    Args:
        df: DataFrame to save
        filepath: Output file path (.duckdb)
        table_name: Name of table to create
    """
    try:
        import duckdb
        
        # Ensure directory exists
        Path(filepath).parent.mkdir(parents=True, exist_ok=True)
        
        # Connect and save
        con = duckdb.connect(filepath)
        con.execute(f"CREATE OR REPLACE TABLE {table_name} AS SELECT * FROM df")
        con.close()
        
        print(f"\n✅ Saved DuckDB: {filepath}")
        print(f"   Table: {table_name}, Rows: {len(df):,}")
    except ImportError:
        print("\n⚠️  DuckDB not available - skipping DuckDB export")


def generate_html_report(scores_df: pd.DataFrame, summary: Dict, filepath: str) -> None:
    """Generate interactive HTML report with visualizations
    
    Args:
        scores_df: DataFrame with scores
        summary: Summary statistics dict
        filepath: Output file path (.html)
    """
    # Filter to scored customers
    scored = scores_df[scores_df['status'] == 'SCORED'].copy()
    
    if len(scored) == 0:
        print("\n⚠️  No scored customers - skipping HTML report")
        return
    
    # Create subplots
    fig = make_subplots(
        rows=3, cols=2,
        subplot_titles=(
            'Score Distribution',
            'Tier Distribution',
            'Score vs Payment Rate',
            'Intent Score vs Insufficient Funds Rate',
            'Capacity Distribution by Tier',
            'Failure Reasons Distribution',
        ),
        specs=[
            [{'type': 'histogram'}, {'type': 'pie'}],
            [{'type': 'scatter'}, {'type': 'scatter'}],
            [{'type': 'box'}, {'type': 'bar'}],
        ]
    )
    
    # 1. Score distribution histogram
    fig.add_trace(
        go.Histogram(
            x=scored['score'],
            name='Scores',
            nbinsx=50,
            marker_color='lightblue'
        ),
        row=1, col=1
    )
    
    # 2. Tier distribution pie chart
    tier_counts = scored['tier'].value_counts()
    fig.add_trace(
        go.Pie(
            labels=tier_counts.index,
            values=tier_counts.values,
            name='Tiers'
        ),
        row=1, col=2
    )
    
    # 3. Score vs payment rate scatter
    scored['payment_rate'] = (scored['paid_invoices'] / scored['total_invoices']) * 100
    fig.add_trace(
        go.Scatter(
            x=scored['payment_rate'],
            y=scored['score'],
            mode='markers',
            name='Customers',
            marker=dict(
                color=scored['tier'].map({
                    'PRIME': 'green',
                    'STANDARD': 'blue',
                    'SUBPRIME': 'orange',
                    'HIGH_RISK': 'red',
                    'VERY_HIGH_RISK': 'darkred',
                }),
                size=8,
                opacity=0.6
            ),
            text=scored['tier'],
        ),
        row=2, col=1
    )
    
    # 4. Intent score vs insufficient funds rate
    fig.add_trace(
        go.Scatter(
            x=scored['insufficient_funds_rate'] * 100,
            y=scored['intent_score'],
            mode='markers',
            name='Customers',
            marker=dict(
                color=scored['tier'].map({
                    'PRIME': 'green',
                    'STANDARD': 'blue',
                    'SUBPRIME': 'orange',
                    'HIGH_RISK': 'red',
                    'VERY_HIGH_RISK': 'darkred',
                }),
                size=8,
                opacity=0.6
            ),
            text=scored['tier'],
        ),
        row=2, col=2
    )
    
    # 5. Capacity distribution by tier
    for tier in ['PRIME', 'STANDARD', 'SUBPRIME', 'HIGH_RISK', 'VERY_HIGH_RISK']:
        tier_data = scored[scored['tier'] == tier]
        if len(tier_data) > 0:
            fig.add_trace(
                go.Box(
                    y=tier_data['avg_invoice_amount'],
                    name=tier,
                    boxmean='sd'
                ),
                row=3, col=1
            )
    
    # 6. Top failure reasons
    failure_types = {
        'High Risk': scored['high_risk_failures'].sum(),
        'Medium Risk': scored['medium_risk_failures'].sum(),
        'Low Risk': scored['low_risk_failures'].sum(),
    }
    fig.add_trace(
        go.Bar(
            x=list(failure_types.keys()),
            y=list(failure_types.values()),
            marker_color=['red', 'orange', 'lightblue'],
            name='Failures'
        ),
        row=3, col=2
    )
    
    # Update layout
    fig.update_layout(
        height=1200,
        showlegend=False,
        title_text=f"Customer Credit Score Analysis - {summary['merchant_id']}",
        title_font_size=20,
    )
    
    # Update axes labels
    fig.update_xaxes(title_text="Score", row=1, col=1)
    fig.update_yaxes(title_text="Count", row=1, col=1)
    
    fig.update_xaxes(title_text="Payment Rate (%)", row=2, col=1)
    fig.update_yaxes(title_text="Credit Score", row=2, col=1)
    
    fig.update_xaxes(title_text="Insufficient Funds Rate (%)", row=2, col=2)
    fig.update_yaxes(title_text="Intent Score", row=2, col=2)
    
    fig.update_xaxes(title_text="Tier", row=3, col=1)
    fig.update_yaxes(title_text="Avg Invoice Amount", row=3, col=1)
    
    fig.update_xaxes(title_text="Failure Type", row=3, col=2)
    fig.update_yaxes(title_text="Total Failures", row=3, col=2)
    
    # Save
    Path(filepath).parent.mkdir(parents=True, exist_ok=True)
    fig.write_html(filepath)
    
    print(f"\n✅ Saved HTML Report: {filepath}")


def print_summary_table(summary: Dict) -> None:
    """Print summary statistics to console in formatted table
    
    Args:
        summary: Summary statistics dict
    """
    print("\n" + "="*80)
    print(f"CUSTOMER CREDIT SCORING SUMMARY - {summary['merchant_id']}")
    print("="*80)
    
    print(f"\n📊 OVERVIEW")
    print(f"   Total Customers: {summary['total_customers']:,}")
    print(f"   Scorable: {summary['scorable_customers']:,} ({summary['scorable_customers']/summary['total_customers']*100:.1f}%)")
    print(f"   Insufficient Data: {summary['insufficient_data']:,}")
    print(f"   Too New: {summary['too_new']:,}")
    
    print(f"\n🎯 TIER DISTRIBUTION")
    tier_dist = summary['tier_distribution']
    for tier in ['PRIME', 'STANDARD', 'SUBPRIME', 'HIGH_RISK', 'VERY_HIGH_RISK']:
        count = tier_dist.get(tier, 0)
        pct = count / summary['scorable_customers'] * 100 if summary['scorable_customers'] > 0 else 0
        print(f"   {tier:20s}: {count:5,} ({pct:5.1f}%)")
    
    print(f"\n📈 SCORE STATISTICS")
    stats = summary['score_statistics']
    print(f"   Mean:   {stats['mean']:6.1f}")
    print(f"   Median: {stats['median']:6.1f}")
    print(f"   Std:    {stats['std_dev']:6.1f}")
    print(f"   Range:  {stats['min']:6.1f} - {stats['max']:6.1f}")
    
    print(f"\n🎲 DIMENSION AVERAGES (0-100 scale)")
    dims = summary['dimension_averages']
    print(f"   Reliability (40%): {dims['reliability']:5.1f}")
    print(f"   Intent (30%):      {dims['intent']:5.1f}")
    print(f"   Timeliness (20%):  {dims['timeliness']:5.1f}")
    print(f"   Capacity (10%):    {dims['capacity']:5.1f}")
    print(f"   Tenure (bonus):    {dims['tenure']:5.1f}")
    
    print(f"\n💰 CREDIT CAPACITY")
    print(f"   Total Eligible Loan Capacity: ${summary['total_eligible_loan_amount']:,.0f}")
    print(f"   Avg Loan per Eligible Customer: ${summary['average_loan_amount_per_customer']:,.0f}")
    print(f"   Expected Portfolio Default Rate: {summary['expected_default_rate']*100:.2f}%")
    
    print(f"\n📋 DATA QUALITY")
    quality = summary['data_quality']
    print(f"   Avg Invoices per Customer: {quality['avg_invoices_per_customer']}")
    print(f"   Avg Tenure (months): {quality['avg_tenure_months']}")
    print(f"   Customers with Failed Attempts: {quality['customers_with_failures']:,}")
    print(f"   Avg Failures per Customer: {quality['avg_failures_per_customer']}")
    
    print(f"\n✅ CONFIDENCE DISTRIBUTION")
    conf_dist = summary['confidence_distribution']
    for level in ['HIGH', 'MEDIUM', 'LOW']:
        count = conf_dist.get(level, 0)
        pct = count / summary['scorable_customers'] * 100 if summary['scorable_customers'] > 0 else 0
        print(f"   {level:8s}: {count:5,} ({pct:5.1f}%)")
    
    print("\n" + "="*80 + "\n")


def print_top_customers(scores_df: pd.DataFrame, n: int = 10) -> None:
    """Print top and bottom N customers
    
    Args:
        scores_df: DataFrame with scores
        n: Number of customers to show
    """
    scored = scores_df[scores_df['status'] == 'SCORED'].copy()
    
    if len(scored) == 0:
        return
    
    print("\n" + "="*80)
    print(f"TOP {n} CUSTOMERS (Highest Scores)")
    print("="*80)
    
    top = scored.nlargest(n, 'score')[
        ['customer_document_number', 'score', 'tier', 'max_loan_amount', 
         'paid_invoices', 'not_enough_funds_count']
    ]
    
    print(top.to_string(index=False))
    
    print("\n" + "="*80)
    print(f"BOTTOM {n} CUSTOMERS (Lowest Scores)")
    print("="*80)
    
    bottom = scored.nsmallest(n, 'score')[
        ['customer_document_number', 'score', 'tier', 'max_loan_amount', 
         'paid_invoices', 'not_enough_funds_count']
    ]
    
    print(bottom.to_string(index=False))
    print()
