"""Score calculation algorithms for customer creditworthiness"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional

from .config import (
    WEIGHT_RELIABILITY,
    WEIGHT_INTENT,
    WEIGHT_TIMELINESS,
    WEIGHT_CAPACITY,
    TENURE_MULTIPLIER,
    HIGH_RISK_FAILURES,
    MEDIUM_RISK_FAILURES,
    LOW_RISK_FAILURES,
    PENALTY_HIGH_RISK,
    PENALTY_MEDIUM_RISK,
    PENALTY_LOW_RISK,
    PENALTY_INSUFFICIENT_FUNDS_THRESHOLD,
    PENALTY_INSUFFICIENT_FUNDS_SEVERE,
    MIN_PAID_INVOICES,
    MIN_TENURE_DAYS,
)


class CustomerScoreCalculator:
    """Calculates credit scores for customers based on payment history"""
    
    def __init__(self, invoices_df: pd.DataFrame):
        """Initialize calculator with invoice data
        
        Args:
            invoices_df: Preprocessed invoice DataFrame
        """
        self.invoices_df = invoices_df
        self.today = pd.Timestamp.now()
    
    def calculate_scores_for_all_customers(self) -> pd.DataFrame:
        """Calculate scores for all customers
        
        Returns:
            DataFrame with customer scores and metrics
        """
        print("\n" + "="*60)
        print("CALCULATING CUSTOMER SCORES")
        print("="*60 + "\n")
        
        # Group by customer
        customers = self.invoices_df.groupby('customerDocumentNumber')
        
        results = []
        total_customers = len(customers)
        
        for idx, (customer_id, customer_invoices) in enumerate(customers, 1):
            if idx % 100 == 0:
                print(f"Processing customer {idx:,}/{total_customers:,}...", end='\r')
            
            score_data = self.calculate_customer_score(customer_id, customer_invoices)
            if score_data:
                results.append(score_data)
        
        print(f"\nCompleted scoring for {len(results):,} customers")
        
        df = pd.DataFrame(results)
        
        # Add calculated fields
        df['created_at'] = self.today
        
        return df
    
    def calculate_customer_score(
        self, 
        customer_id: str, 
        invoices: pd.DataFrame
    ) -> Optional[Dict]:
        """Calculate credit score for a single customer
        
        Args:
            customer_id: Customer document number
            invoices: DataFrame of customer's invoices
            
        Returns:
            Dict with score and all metrics, or None if insufficient data
        """
        # Check minimum requirements
        paid_invoices = invoices[invoices['is_paid']]
        
        if len(paid_invoices) < MIN_PAID_INVOICES:
            return {
                'customer_document_number': customer_id,
                'merchant_id': invoices.iloc[0]['rentalsMerchantId'],
                'status': 'INSUFFICIENT_DATA',
                'score': None,
                'tier': 'NOT_SCORABLE',
                'confidence': 'NONE',
                'reason': f'Only {len(paid_invoices)} paid invoices (need {MIN_PAID_INVOICES})',
            }
        
        # Check tenure
        first_invoice_date = invoices['createdAt'].min()
        tenure_days = (self.today - first_invoice_date).days
        
        if tenure_days < MIN_TENURE_DAYS:
            return {
                'customer_document_number': customer_id,
                'merchant_id': invoices.iloc[0]['rentalsMerchantId'],
                'status': 'TOO_NEW',
                'score': None,
                'tier': 'NOT_SCORABLE',
                'confidence': 'NONE',
                'reason': f'Only {tenure_days} days old (need {MIN_TENURE_DAYS})',
            }
        
        # Calculate each dimension
        reliability = self._calculate_reliability_score(invoices)
        intent = self._calculate_intent_score(invoices)
        timeliness = self._calculate_timeliness_score(invoices)
        capacity = self._calculate_capacity_score(invoices)
        tenure = self._calculate_tenure_score(invoices)
        
        # Calculate composite score
        main_score = (
            reliability['score'] * WEIGHT_RELIABILITY +
            intent['score'] * WEIGHT_INTENT +
            timeliness['score'] * WEIGHT_TIMELINESS +
            capacity['score'] * WEIGHT_CAPACITY
        )
        
        # Add tenure bonus
        tenure_bonus = tenure['score'] * TENURE_MULTIPLIER
        
        # Scale to 0-1000
        final_score = min(1000, max(0, (main_score + tenure_bonus) * 10))
        
        # Determine confidence level
        confidence = self._determine_confidence(len(paid_invoices), tenure_days)
        
        # Gather all failure metrics
        failure_analysis = self._analyze_failures(invoices)
        
        # Payment metrics
        payment_metrics = self._calculate_payment_metrics(invoices)
        
        return {
            'customer_document_number': customer_id,
            'merchant_id': invoices.iloc[0]['rentalsMerchantId'],
            'status': 'SCORED',
            
            # Overall score
            'score': round(final_score, 1),
            'confidence': confidence,
            
            # Dimension scores
            'reliability_score': round(reliability['score'], 1),
            'intent_score': round(intent['score'], 1),
            'timeliness_score': round(timeliness['score'], 1),
            'capacity_score': round(capacity['score'], 1),
            'tenure_score': round(tenure['score'], 1),
            
            # Invoice counts
            'total_invoices': len(invoices),
            'paid_invoices': len(paid_invoices),
            'cancelled_invoices': reliability['cancelled_count'],
            'chargeback_invoices': reliability['chargeback_count'],
            'chargeback_recovered': reliability['chargebacks_recovered'],
            
            # Payment timing
            'on_time_invoices': timeliness['on_time_count'],
            'late_invoices': timeliness['late_count'],
            'avg_days_late': round(timeliness['avg_days_late'], 1),
            'max_days_late': timeliness['max_days_late'],
            
            # Failure metrics
            'total_failed_attempts': failure_analysis['total_failures'],
            'not_enough_funds_count': failure_analysis['not_enough_funds'],
            'cancellation_count': failure_analysis['cancellation'],
            'high_risk_failures': failure_analysis['high_risk_count'],
            'medium_risk_failures': failure_analysis['medium_risk_count'],
            'low_risk_failures': failure_analysis['low_risk_count'],
            'insufficient_funds_rate': round(failure_analysis['insufficient_funds_rate'], 3),
            
            # Financial capacity
            'avg_invoice_amount': round(payment_metrics['avg_amount'], 2),
            'median_invoice_amount': round(payment_metrics['median_amount'], 2),
            'max_invoice_paid': round(payment_metrics['max_amount'], 2),
            'total_amount_paid': round(payment_metrics['total_paid'], 2),
            'amount_volatility': round(capacity['volatility'], 3),
            
            # Tenure metrics
            'months_since_first_invoice': tenure['months_tenure'],
            'days_since_last_payment': tenure['days_since_last'],
            'consecutive_payment_streak': reliability['consecutive_streak'],
            
            # Risk flags
            'has_chargebacks': reliability['chargeback_count'] > 0,
            'chronic_insufficient_funds': failure_analysis['insufficient_funds_rate'] > PENALTY_INSUFFICIENT_FUNDS_THRESHOLD,
            'chronic_lateness': timeliness['avg_days_late'] > 15,
            'inactive_customer': tenure['days_since_last'] > 180,
        }
    
    def _calculate_reliability_score(self, invoices: pd.DataFrame) -> Dict:
        """Calculate payment reliability score (40% weight)"""
        total = len(invoices)
        paid = invoices['is_paid'].sum()
        cancelled = invoices['is_cancelled'].sum()
        chargebacks = invoices['is_chargeback'].sum()
        chargebacks_recovered = invoices['chargeback_recovered'].sum()
        
        # Payment rate (0-100)
        payment_rate = (paid / total) * 100 if total > 0 else 0
        
        # Penalties
        chargeback_penalty = max(0, (chargebacks - chargebacks_recovered)) * 100
        default_penalty = cancelled * 50
        
        # Consecutive payment streak (bonus)
        consecutive_streak = self._calculate_consecutive_streak(invoices)
        streak_bonus = min(consecutive_streak * 5, 100)
        
        # Final score
        score = max(0, min(100, payment_rate - chargeback_penalty - default_penalty + streak_bonus))
        
        return {
            'score': score,
            'payment_rate': payment_rate,
            'cancelled_count': cancelled,
            'chargeback_count': chargebacks,
            'chargebacks_recovered': chargebacks_recovered,
            'consecutive_streak': consecutive_streak,
        }
    
    def _calculate_intent_score(self, invoices: pd.DataFrame) -> Dict:
        """Calculate payment intent score (30% weight) - CRITICAL DIMENSION"""
        # Analyze all failure reasons
        all_failures = []
        for failures in invoices['unsuccessful_payments_parsed']:
            all_failures.extend(failures)
        
        if not all_failures:
            return {'score': 100.0, 'failure_analysis': {}}
        
        # Count by severity
        high_risk_count = sum(
            1 for f in all_failures 
            if f.get('statusMessage', '') in HIGH_RISK_FAILURES
        )
        medium_risk_count = sum(
            1 for f in all_failures 
            if f.get('statusMessage', '') in MEDIUM_RISK_FAILURES
        )
        low_risk_count = sum(
            1 for f in all_failures 
            if f.get('statusMessage', '') in LOW_RISK_FAILURES
        )
        
        # NOT_ENOUGH_FUNDS is the most critical signal
        not_enough_funds_count = sum(
            1 for f in all_failures 
            if f.get('statusMessage', '') == 'NOT_ENOUGH_FUNDS'
        )
        
        # Calculate score
        score = 100.0
        score -= high_risk_count * PENALTY_HIGH_RISK
        score -= medium_risk_count * PENALTY_MEDIUM_RISK
        score -= low_risk_count * PENALTY_LOW_RISK
        
        # Severe penalty if >30% of failures are insufficient funds
        total_failures = len(all_failures)
        insufficient_funds_rate = not_enough_funds_count / total_failures if total_failures > 0 else 0
        
        if insufficient_funds_rate > PENALTY_INSUFFICIENT_FUNDS_THRESHOLD:
            score -= PENALTY_INSUFFICIENT_FUNDS_SEVERE
        
        score = max(0, min(100, score))
        
        return {
            'score': score,
            'total_failures': total_failures,
            'high_risk_count': high_risk_count,
            'medium_risk_count': medium_risk_count,
            'low_risk_count': low_risk_count,
            'not_enough_funds_count': not_enough_funds_count,
            'insufficient_funds_rate': insufficient_funds_rate,
        }
    
    def _calculate_timeliness_score(self, invoices: pd.DataFrame) -> Dict:
        """Calculate payment timeliness score (20% weight)"""
        paid = invoices[invoices['is_paid']].copy()
        
        if len(paid) == 0:
            return {'score': 0, 'on_time_count': 0, 'late_count': 0, 'avg_days_late': 0}
        
        # On-time vs late
        on_time = paid['is_on_time'].sum()
        late = paid['is_late'].sum()
        
        # On-time rate
        on_time_rate = (on_time / len(paid)) * 100 if len(paid) > 0 else 0
        
        # Average lateness for late payments
        late_invoices = paid[paid['is_late']]
        avg_days_late = late_invoices['days_late'].mean() if len(late_invoices) > 0 else 0
        max_days_late = late_invoices['days_late'].max() if len(late_invoices) > 0 else 0
        
        # Penalties
        late_penalty = min(avg_days_late * 2, 40)
        
        # Penalty fee indicator (chronic lateness)
        # Check if they've paid penalty fees (would be in details JSON)
        # Simplified: assume 0 for now unless we parse details
        penalty_fee_penalty = 0
        
        score = max(0, min(100, on_time_rate - late_penalty - penalty_fee_penalty))
        
        return {
            'score': score,
            'on_time_count': on_time,
            'late_count': late,
            'on_time_rate': on_time_rate,
            'avg_days_late': avg_days_late,
            'max_days_late': max_days_late,
        }
    
    def _calculate_capacity_score(self, invoices: pd.DataFrame) -> Dict:
        """Calculate financial capacity score (10% weight)"""
        paid = invoices[invoices['is_paid']]
        
        if len(paid) == 0:
            return {'score': 0, 'avg_amount': 0, 'volatility': 0}
        
        amounts = paid['amount'].values
        avg_amount = np.mean(amounts)
        std_amount = np.std(amounts)
        
        # Volatility (coefficient of variation)
        volatility = std_amount / avg_amount if avg_amount > 0 else 0
        
        # Percentile within merchant (simplified: use 50 as baseline)
        # In full implementation, would compare to all customers in merchant
        capacity_percentile = 50  # Placeholder
        
        # Bonuses
        stability_bonus = 20 if volatility < 0.3 else 0
        
        # Trend analysis (last 6 months vs previous 6 months)
        # Simplified: assume no trend bonus for now
        trend_bonus = 0
        
        score = min(100, capacity_percentile + stability_bonus + trend_bonus)
        
        return {
            'score': score,
            'avg_amount': avg_amount,
            'volatility': volatility,
            'stability_bonus': stability_bonus,
        }
    
    def _calculate_tenure_score(self, invoices: pd.DataFrame) -> Dict:
        """Calculate tenure score (bonus, not weighted)"""
        # Time-based
        first_invoice = invoices['createdAt'].min()
        months_tenure = max(0, (self.today - first_invoice).days / 30)
        tenure_bonus = min(months_tenure * 2, 50)
        
        # Volume-based
        paid_count = invoices['is_paid'].sum()
        volume_bonus = min(paid_count * 5, 50)
        
        # Recency-based
        last_payment = invoices[invoices['is_paid']]['paymentDate'].max()
        if pd.notna(last_payment):
            days_since_last = (self.today - last_payment).days
            recency_bonus = 20 if days_since_last <= 90 else 0
        else:
            days_since_last = 9999
            recency_bonus = 0
        
        total_score = tenure_bonus + volume_bonus + recency_bonus
        
        return {
            'score': total_score,
            'months_tenure': round(months_tenure, 1),
            'days_since_last': days_since_last,
            'tenure_bonus': tenure_bonus,
            'volume_bonus': volume_bonus,
            'recency_bonus': recency_bonus,
        }
    
    def _calculate_consecutive_streak(self, invoices: pd.DataFrame) -> int:
        """Calculate longest consecutive payment streak"""
        sorted_invoices = invoices.sort_values('createdAt')
        
        max_streak = 0
        current_streak = 0
        
        for _, invoice in sorted_invoices.iterrows():
            if invoice['is_paid']:
                current_streak += 1
                max_streak = max(max_streak, current_streak)
            else:
                current_streak = 0
        
        return max_streak
    
    def _analyze_failures(self, invoices: pd.DataFrame) -> Dict:
        """Analyze failure reasons in detail"""
        all_failures = []
        for failures in invoices['unsuccessful_payments_parsed']:
            all_failures.extend(failures)
        
        if not all_failures:
            return {
                'total_failures': 0,
                'not_enough_funds': 0,
                'cancellation': 0,
                'high_risk_count': 0,
                'medium_risk_count': 0,
                'low_risk_count': 0,
                'insufficient_funds_rate': 0.0,
            }
        
        not_enough_funds = sum(
            1 for f in all_failures if f.get('statusMessage') == 'NOT_ENOUGH_FUNDS'
        )
        cancellation = sum(
            1 for f in all_failures if f.get('statusMessage') == 'CUSTOMER_CANCELLATION'
        )
        high_risk = sum(
            1 for f in all_failures if f.get('statusMessage') in HIGH_RISK_FAILURES
        )
        medium_risk = sum(
            1 for f in all_failures if f.get('statusMessage') in MEDIUM_RISK_FAILURES
        )
        low_risk = sum(
            1 for f in all_failures if f.get('statusMessage') in LOW_RISK_FAILURES
        )
        
        return {
            'total_failures': len(all_failures),
            'not_enough_funds': not_enough_funds,
            'cancellation': cancellation,
            'high_risk_count': high_risk,
            'medium_risk_count': medium_risk,
            'low_risk_count': low_risk,
            'insufficient_funds_rate': not_enough_funds / len(all_failures) if all_failures else 0.0,
        }
    
    def _calculate_payment_metrics(self, invoices: pd.DataFrame) -> Dict:
        """Calculate basic payment metrics"""
        paid = invoices[invoices['is_paid']]
        
        if len(paid) == 0:
            return {
                'avg_amount': 0,
                'median_amount': 0,
                'max_amount': 0,
                'total_paid': 0,
            }
        
        return {
            'avg_amount': paid['amount'].mean(),
            'median_amount': paid['amount'].median(),
            'max_amount': paid['amount'].max(),
            'total_paid': paid['amount'].sum(),
        }
    
    def _determine_confidence(self, paid_count: int, tenure_days: int) -> str:
        """Determine confidence level based on data volume
        
        Args:
            paid_count: Number of paid invoices
            tenure_days: Days since first invoice
            
        Returns:
            Confidence level: HIGH, MEDIUM, or LOW
        """
        if paid_count >= 10 and tenure_days >= 180:
            return 'HIGH'
        elif paid_count >= 5 and tenure_days >= 90:
            return 'MEDIUM'
        else:
            return 'LOW'
