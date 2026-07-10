"""Tier classification and credit limit calculation"""

import pandas as pd
from typing import Dict, Optional, Tuple

from .config import (
    TIER_THRESHOLDS,
    CREDIT_MULTIPLIERS,
    INTEREST_RATES,
    EXPECTED_DEFAULT_RATES,
)


class TierClassifier:
    """Assigns credit tiers and calculates borrowing capacity"""
    
    @staticmethod
    def assign_tier(score: Optional[float], confidence: str = 'MEDIUM') -> str:
        """Assign credit tier based on score
        
        Args:
            score: Credit score (0-1000)
            confidence: Confidence level (HIGH, MEDIUM, LOW)
            
        Returns:
            Tier name: PRIME, STANDARD, SUBPRIME, HIGH_RISK, or VERY_HIGH_RISK
        """
        if score is None or pd.isna(score):
            return 'NOT_SCORABLE'
        
        if score >= TIER_THRESHOLDS['PRIME']:
            return 'PRIME'
        elif score >= TIER_THRESHOLDS['STANDARD']:
            return 'STANDARD'
        elif score >= TIER_THRESHOLDS['SUBPRIME']:
            return 'SUBPRIME'
        elif score >= TIER_THRESHOLDS['HIGH_RISK']:
            return 'HIGH_RISK'
        else:
            return 'VERY_HIGH_RISK'
    
    @staticmethod
    def calculate_max_loan_amount(
        avg_invoice_amount: float,
        tier: str,
        median_invoice_amount: Optional[float] = None,
    ) -> float:
        """Calculate maximum safe loan amount (capacidad de endeudamiento)
        
        Args:
            avg_invoice_amount: Average invoice amount
            tier: Credit tier
            median_invoice_amount: Median invoice (optional, for more conservative estimate)
            
        Returns:
            Maximum loan amount in same currency as invoices
        """
        if tier not in CREDIT_MULTIPLIERS:
            return 0.0
        
        # Use 75th percentile between avg and median for more conservative estimate
        if median_invoice_amount and not pd.isna(median_invoice_amount):
            proven_capacity = (avg_invoice_amount + median_invoice_amount) / 2
        else:
            proven_capacity = avg_invoice_amount
        
        # Apply tier multiplier
        multiplier = CREDIT_MULTIPLIERS[tier]
        max_loan = proven_capacity * multiplier
        
        return round(max_loan, 2)
    
    @staticmethod
    def get_interest_rate_range(tier: str) -> Optional[Tuple[float, float]]:
        """Get recommended interest rate range for tier
        
        Args:
            tier: Credit tier
            
        Returns:
            Tuple of (min_rate, max_rate) as monthly percentages, or None if not eligible
        """
        return INTEREST_RATES.get(tier)
    
    @staticmethod
    def get_expected_default_rate(tier: str) -> float:
        """Get expected default rate for tier
        
        Args:
            tier: Credit tier
            
        Returns:
            Expected default rate (0.0 to 1.0)
        """
        return EXPECTED_DEFAULT_RATES.get(tier, 0.5)
    
    @staticmethod
    def generate_recommendation(
        tier: str,
        score: float,
        max_loan: float,
        confidence: str,
        risk_flags: Dict,
    ) -> str:
        """Generate human-readable recommendation
        
        Args:
            tier: Credit tier
            score: Credit score
            max_loan: Maximum loan amount
            confidence: Confidence level
            risk_flags: Dict of risk indicators
            
        Returns:
            Recommendation text
        """
        if tier == 'NOT_SCORABLE':
            return "Not enough data to score. Need at least 3 paid invoices and 30 days tenure."
        
        if tier == 'VERY_HIGH_RISK':
            return "BLOCKED from credit products. High default risk. Consider collections."
        
        if tier == 'HIGH_RISK':
            return "NOT ELIGIBLE for credit products currently. Monitor for improvement over 6 months."
        
        # Get interest rate range
        rate_range = TierClassifier.get_interest_rate_range(tier)
        if not rate_range:
            return "Not eligible for credit products."
        
        # Format loan amount
        loan_str = f"${max_loan:,.0f}"
        
        # Format interest rate
        rate_str = f"{rate_range[0]}-{rate_range[1]}% monthly"
        
        # Base recommendation
        if tier == 'PRIME':
            base = f"APPROVED for up to 3-month adelanto. Credit limit: {loan_str} @ {rate_str}. Automated approval."
        elif tier == 'STANDARD':
            base = f"Approved for up to 2-month adelanto. Credit limit: {loan_str} @ {rate_str}. Standard review required."
        elif tier == 'SUBPRIME':
            base = f"Eligible for 1-month adelanto only. Credit limit: {loan_str} @ {rate_str}. Manual approval required."
        else:
            base = "Not eligible."
        
        # Add warnings for risk flags
        warnings = []
        if risk_flags.get('chronic_insufficient_funds'):
            warnings.append("WARNING: Frequent insufficient funds")
        if risk_flags.get('has_chargebacks'):
            warnings.append("WARNING: Has chargeback history")
        if risk_flags.get('chronic_lateness'):
            warnings.append("WARNING: Chronic late payments")
        if risk_flags.get('inactive_customer'):
            warnings.append("WARNING: Inactive customer - verify before lending")
        
        if confidence == 'LOW':
            warnings.append("Note: Low confidence due to limited history")
        
        if warnings:
            return base + " | " + "; ".join(warnings)
        
        return base
    
    @staticmethod
    def add_tier_and_recommendations(scores_df: pd.DataFrame) -> pd.DataFrame:
        """Add tier classification and recommendations to scores DataFrame
        
        Args:
            scores_df: DataFrame with calculated scores
            
        Returns:
            DataFrame with tier, max_loan, and recommendation columns added
        """
        df = scores_df.copy()
        
        # Assign tiers
        df['tier'] = df.apply(
            lambda row: TierClassifier.assign_tier(row.get('score'), row.get('confidence', 'MEDIUM')),
            axis=1
        )
        
        # Calculate max loan amounts
        df['max_loan_amount'] = df.apply(
            lambda row: TierClassifier.calculate_max_loan_amount(
                row.get('avg_invoice_amount', 0),
                row.get('tier', 'NOT_SCORABLE'),
                row.get('median_invoice_amount')
            ),
            axis=1
        )
        
        # Get interest rate ranges
        df['interest_rate_min'] = df['tier'].apply(
            lambda t: TierClassifier.get_interest_rate_range(t)[0] if TierClassifier.get_interest_rate_range(t) else None
        )
        df['interest_rate_max'] = df['tier'].apply(
            lambda t: TierClassifier.get_interest_rate_range(t)[1] if TierClassifier.get_interest_rate_range(t) else None
        )
        
        # Expected default rate
        df['expected_default_rate'] = df['tier'].apply(TierClassifier.get_expected_default_rate)
        
        # Generate recommendations
        df['recommendation'] = df.apply(
            lambda row: TierClassifier.generate_recommendation(
                row.get('tier'),
                row.get('score'),
                row.get('max_loan_amount', 0),
                row.get('confidence', 'MEDIUM'),
                {
                    'chronic_insufficient_funds': row.get('chronic_insufficient_funds', False),
                    'has_chargebacks': row.get('has_chargebacks', False),
                    'chronic_lateness': row.get('chronic_lateness', False),
                    'inactive_customer': row.get('inactive_customer', False),
                }
            ),
            axis=1
        )
        
        # Build risk flags list
        df['risk_flags'] = df.apply(
            lambda row: [
                flag for flag, value in {
                    'CHRONIC_INSUFFICIENT_FUNDS': row.get('chronic_insufficient_funds', False),
                    'HAS_CHARGEBACKS': row.get('has_chargebacks', False),
                    'CHRONIC_LATENESS': row.get('chronic_lateness', False),
                    'INACTIVE_CUSTOMER': row.get('inactive_customer', False),
                }.items() if value
            ],
            axis=1
        )
        
        return df
    
    @staticmethod
    def generate_summary_stats(scores_df: pd.DataFrame) -> Dict:
        """Generate summary statistics for scored customers
        
        Args:
            scores_df: DataFrame with scores and tiers
            
        Returns:
            Dict with summary statistics
        """
        # Filter to scored customers only
        scored = scores_df[scores_df['status'] == 'SCORED'].copy()
        
        if len(scored) == 0:
            return {
                'total_customers': len(scores_df),
                'scorable_customers': 0,
                'error': 'No scorable customers found'
            }
        
        # Tier distribution
        tier_dist = scored['tier'].value_counts().to_dict()
        
        # Score statistics
        score_stats = {
            'mean': round(scored['score'].mean(), 1),
            'median': round(scored['score'].median(), 1),
            'std_dev': round(scored['score'].std(), 1),
            'min': round(scored['score'].min(), 1),
            'max': round(scored['score'].max(), 1),
        }
        
        # Dimension averages
        dimension_avgs = {
            'reliability': round(scored['reliability_score'].mean(), 1),
            'intent': round(scored['intent_score'].mean(), 1),
            'timeliness': round(scored['timeliness_score'].mean(), 1),
            'capacity': round(scored['capacity_score'].mean(), 1),
            'tenure': round(scored['tenure_score'].mean(), 1),
        }
        
        # Loan capacity
        eligible = scored[scored['max_loan_amount'] > 0]
        total_eligible_capacity = eligible['max_loan_amount'].sum()
        avg_loan_per_customer = eligible['max_loan_amount'].mean() if len(eligible) > 0 else 0
        
        # Expected default rate (weighted by loan amount)
        if len(eligible) > 0:
            weighted_default = (
                (eligible['expected_default_rate'] * eligible['max_loan_amount']).sum() /
                eligible['max_loan_amount'].sum()
            )
        else:
            weighted_default = 0
        
        # Data quality
        data_quality = {
            'avg_invoices_per_customer': round(scored['paid_invoices'].mean(), 1),
            'avg_tenure_months': round(scored['months_since_first_invoice'].mean(), 1),
            'customers_with_failures': int((scored['total_failed_attempts'] > 0).sum()),
            'avg_failures_per_customer': round(scored['total_failed_attempts'].mean(), 1),
        }
        
        # Confidence distribution
        confidence_dist = scored['confidence'].value_counts().to_dict()
        
        return {
            'merchant_id': scored.iloc[0]['merchant_id'],
            'analysis_date': scored.iloc[0]['created_at'].isoformat() if 'created_at' in scored.columns else None,
            'total_customers': len(scores_df),
            'scorable_customers': len(scored),
            'insufficient_data': int((scores_df['status'] == 'INSUFFICIENT_DATA').sum()),
            'too_new': int((scores_df['status'] == 'TOO_NEW').sum()),
            'tier_distribution': tier_dist,
            'score_statistics': score_stats,
            'dimension_averages': dimension_avgs,
            'total_eligible_loan_amount': round(total_eligible_capacity, 2),
            'average_loan_amount_per_customer': round(avg_loan_per_customer, 2),
            'expected_default_rate': round(weighted_default, 4),
            'data_quality': data_quality,
            'confidence_distribution': confidence_dist,
        }
