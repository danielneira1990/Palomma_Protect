"""Cross-merchant score calculator — same algorithm, adds merchant diversity bonus"""

import pandas as pd
from typing import Dict, Optional

from scoring.cross_merchant.config import MERCHANT_DIVERSITY_BONUS, MAX_DIVERSITY_BONUS
from scoring.merchant.score_calculator import CustomerScoreCalculator


class CrossMerchantScoreCalculator(CustomerScoreCalculator):
    """Calculates credit scores using all merchant history for each customer"""

    def calculate_customer_score(
        self,
        customer_id: str,
        invoices: pd.DataFrame,
    ) -> Optional[Dict]:
        base = super().calculate_customer_score(customer_id, invoices)

        if base is None:
            return None

        # Compute per-merchant breakdown
        merchant_counts = invoices.groupby('rentalsMerchantId').size().to_dict()
        merchant_count = len(merchant_counts)
        primary_merchant = max(merchant_counts, key=merchant_counts.get)
        merchant_list = sorted(merchant_counts.keys())

        # Replace single merchant_id with cross-merchant metadata
        base['merchant_id'] = 'CROSS_MERCHANT'
        base['merchant_count'] = merchant_count
        base['primary_merchant'] = primary_merchant
        base['merchant_list'] = merchant_list
        base['merchant_invoice_counts'] = merchant_counts

        # Apply diversity bonus only to fully scored customers
        if base.get('status') == 'SCORED' and base.get('score') is not None:
            extra_merchants = max(0, merchant_count - 1)
            diversity_bonus = min(extra_merchants * MERCHANT_DIVERSITY_BONUS, MAX_DIVERSITY_BONUS)
            base['diversity_bonus'] = diversity_bonus
            base['score'] = round(min(1000, base['score'] + diversity_bonus), 1)
        else:
            base['diversity_bonus'] = 0

        return base
