"""Data loader for cross-merchant scoring — loads invoices from ALL merchants"""

import pandas as pd
from typing import Optional

from scoring.merchant.data_loader import TinybirdDataLoader


class CrossMerchantDataLoader(TinybirdDataLoader):
    """Loads invoice data across all merchants, one merchant at a time to avoid query timeouts"""

    def get_all_merchant_ids(self) -> list[str]:
        """Fetch distinct merchant IDs"""
        query = """
        SELECT DISTINCT rentalsMerchantId
        FROM rentals_invoices
        WHERE is_deleted = 0
          AND customerDocumentNumber IS NOT NULL
        ORDER BY rentalsMerchantId
        """
        result = self.client.query(query)
        merchant_ids = [row[0] for row in result.result_rows]
        print(f"Found {len(merchant_ids)} merchants: {merchant_ids}")
        return merchant_ids

    def load_all_invoices(self) -> pd.DataFrame:
        """Load invoices merchant by merchant and combine (avoids 10s query timeout)"""
        merchant_ids = self.get_all_merchant_ids()
        frames = []

        for i, merchant_id in enumerate(merchant_ids, 1):
            print(f"  [{i}/{len(merchant_ids)}] Loading merchant: {merchant_id}...")
            df = self.load_invoice_data(merchant_id)
            frames.append(df)

        combined = pd.concat(frames, ignore_index=True)
        print(f"\nCombined: {len(combined):,} invoices across {len(merchant_ids)} merchants")
        print(f"  - Unique customers: {combined['customerDocumentNumber'].nunique():,}")
        print(f"  - Date range: {combined['createdAt'].min()} to {combined['createdAt'].max()}")
        return combined

    def load_all_customers(self) -> pd.DataFrame:
        """Load customer metadata per merchant and combine"""
        merchant_ids = self.get_all_merchant_ids()
        frames = []

        for merchant_id in merchant_ids:
            df = self.load_customer_metadata(merchant_id)
            frames.append(df)

        combined = pd.concat(frames, ignore_index=True)
        print(f"Loaded {len(combined):,} customer records across all merchants")
        return combined


def load_all_merchant_data() -> tuple[pd.DataFrame, pd.DataFrame]:
    """Convenience function to load all cross-merchant data"""
    loader = CrossMerchantDataLoader()

    print(f"\n{'=' * 60}")
    print("Loading cross-merchant data (ALL merchants)")
    print(f"{'=' * 60}\n")

    invoices = loader.load_all_invoices()
    invoices = loader.preprocess_invoice_data(invoices)

    customers = loader.load_all_customers()

    print(f"\n{'=' * 60}")
    print("Data loading complete!")
    print(f"{'=' * 60}\n")

    return invoices, customers
