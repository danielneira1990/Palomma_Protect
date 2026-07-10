"""Data loader for extracting invoice data from Tinybird/ClickHouse"""

import json
import urllib.parse
import urllib.request
from typing import Optional

import pandas as pd

from .config import TINYBIRD_HOST, TINYBIRD_TOKEN


class TinybirdDataLoader:
    """Handles data extraction from Tinybird/ClickHouse"""

    def __init__(self, token: Optional[str] = None, host: Optional[str] = None):
        """Initialize connection to Tinybird

        Args:
            token: Tinybird API token (defaults to env var)
            host: Tinybird host (defaults to env var)
        """
        self.token = token or TINYBIRD_TOKEN
        host = host or TINYBIRD_HOST

        if not self.token:
            raise ValueError(
                "TINYBIRD_TOKEN must be set in environment or passed to constructor"
            )

        # El host del token es el de ClickHouse (clickhouse.<region>...); la API
        # REST de Tinybird (/v0/sql) vive en api.<region>... y funciona con un
        # token de scope de lectura (clickhouse-connect exigiría token ADMIN).
        if host.startswith("clickhouse."):
            self.api_host = "api." + host[len("clickhouse.") :]
        else:
            self.api_host = host

    def _query(self, sql: str) -> pd.DataFrame:
        """Ejecuta SQL contra la API REST de Tinybird → DataFrame."""
        url = "https://" + self.api_host + "/v0/sql?" + urllib.parse.urlencode(
            {"q": sql.strip() + "\nFORMAT JSON"}
        )
        req = urllib.request.Request(
            url, headers={"Authorization": f"Bearer {self.token}"}
        )
        with urllib.request.urlopen(req, timeout=180) as resp:
            payload = json.loads(resp.read().decode("utf-8"))
        return pd.DataFrame(payload.get("data", []))

    def load_invoice_data(self, merchant_id: str) -> pd.DataFrame:
        """Load all invoice data for a merchant

        Args:
            merchant_id: Merchant identifier (e.g., 'inmobiliaria')

        Returns:
            DataFrame with invoice data
        """
        m = merchant_id.replace("'", "''")
        query = f"""
        SELECT
            rentalsMerchantId,
            customerDocumentNumber,
            id AS invoice_id,
            status,
            amount,
            paymentAmount,
            dueDate,
            paymentDate,
            paymentDeadlines,
            unsuccessfulPayments,
            unsuccessfulPaymentsCount,
            details,
            chargebackRecovered,
            createdAt,
            updatedAt,
            is_deleted
        FROM rentals_invoices
        WHERE
            is_deleted = 0
            AND rentalsMerchantId = '{m}'
            AND status != 'pending'
        ORDER BY
            customerDocumentNumber, createdAt
        """

        df = self._query(query)

        # La API REST devuelve algunos numéricos como texto: se coercionan.
        for col in ["amount", "paymentAmount", "unsuccessfulPaymentsCount"]:
            if col in df.columns:
                df[col] = pd.to_numeric(df[col], errors="coerce")

        print(f"Loaded {len(df):,} invoices for merchant '{merchant_id}'")
        if len(df) and "customerDocumentNumber" in df.columns:
            print(f"  - Unique customers: {df['customerDocumentNumber'].nunique():,}")

        return df

    def load_customer_metadata(self, merchant_id: str) -> pd.DataFrame:
        """Load customer metadata

        Args:
            merchant_id: Merchant identifier

        Returns:
            DataFrame with customer metadata
        """
        m = merchant_id.replace("'", "''")
        query = f"""
        SELECT
            rentalsMerchantId,
            documentNumber,
            name,
            email,
            phoneNumber,
            createdAt
        FROM rentals_customers
        WHERE
            is_deleted = 0
            AND rentalsMerchantId = '{m}'
        """

        df = self._query(query)

        print(f"Loaded {len(df):,} customer records")

        return df

    @staticmethod
    def parse_json_field(value: str) -> list:
        """Parse JSON string field safely

        Args:
            value: JSON string or None

        Returns:
            Parsed list or empty list if invalid
        """
        if pd.isna(value) or value == "" or value == "[]":
            return []

        try:
            return json.loads(value)
        except (json.JSONDecodeError, TypeError):
            return []

    @staticmethod
    def parse_payment_deadlines(deadlines_str: str) -> list:
        """Parse payment deadlines JSON

        Args:
            deadlines_str: JSON string with payment deadlines

        Returns:
            List of {date, amount} dicts
        """
        deadlines = TinybirdDataLoader.parse_json_field(deadlines_str)

        if not deadlines:
            return []

        # Parse each deadline
        parsed = []
        for d in deadlines:
            if isinstance(d, dict) and "date" in d and "amount" in d:
                parsed.append(
                    {"date": pd.to_datetime(d["date"]), "amount": float(d["amount"])}
                )

        return parsed

    @staticmethod
    def parse_unsuccessful_payments(failures_str: str) -> list:
        """Parse unsuccessful payments JSON

        Args:
            failures_str: JSON string with payment failures

        Returns:
            List of failure dicts with parsed fields
        """
        failures = TinybirdDataLoader.parse_json_field(failures_str)

        if not failures:
            return []

        # Parse each failure
        parsed = []
        for f in failures:
            if isinstance(f, dict):
                parsed.append(
                    {
                        "id": f.get("id", ""),
                        "date": pd.to_datetime(f.get("date"))
                        if f.get("date")
                        else None,
                        "amount": float(f.get("amount", 0)),
                        "type": f.get("type", ""),
                        "source": f.get("source", ""),
                        "statusMessage": f.get("statusMessage", ""),
                        "fee": float(f.get("fee", 0)),
                    }
                )

        return parsed

    @staticmethod
    def preprocess_invoice_data(df: pd.DataFrame) -> pd.DataFrame:
        """Preprocess invoice data for analysis

        Args:
            df: Raw invoice DataFrame

        Returns:
            Preprocessed DataFrame with parsed fields
        """
        # Make a copy
        df = df.copy()

        # Parse dates
        date_cols = ["dueDate", "paymentDate", "createdAt", "updatedAt"]
        for col in date_cols:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col])

        # Parse JSON fields
        print("Parsing payment deadlines...")
        df["payment_deadlines_parsed"] = df["paymentDeadlines"].apply(
            TinybirdDataLoader.parse_payment_deadlines
        )

        print("Parsing unsuccessful payments...")
        df["unsuccessful_payments_parsed"] = df["unsuccessfulPayments"].apply(
            TinybirdDataLoader.parse_unsuccessful_payments
        )

        # Extract first deadline for simpler analysis
        df["first_deadline_date"] = df["payment_deadlines_parsed"].apply(
            lambda x: x[0]["date"] if x and len(x) > 0 else None
        )
        df["first_deadline_amount"] = df["payment_deadlines_parsed"].apply(
            lambda x: x[0]["amount"] if x and len(x) > 0 else None
        )

        # Fix dueDate: Use first payment deadline when dueDate is 1970-01-01 (fallback value)
        print("Fixing invalid due dates (1970-01-01) using payment deadlines...")
        bad_date_mask = df["dueDate"] == pd.Timestamp('1970-01-01')
        bad_date_count = bad_date_mask.sum()
        
        if bad_date_count > 0:
            print(f"  - Found {bad_date_count:,} invoices with invalid dueDate")
            
            def extract_first_deadline_date(deadlines):
                """Extract the date from the first payment deadline"""
                if deadlines and len(deadlines) > 0 and 'date' in deadlines[0]:
                    try:
                        return pd.to_datetime(deadlines[0]['date'])
                    except:
                        return None
                return None
            
            # Apply fix: replace 1970-01-01 with first deadline date
            fixed_dates = df.loc[bad_date_mask, 'payment_deadlines_parsed'].apply(
                extract_first_deadline_date
            )
            df.loc[bad_date_mask, 'dueDate'] = fixed_dates
            
            # Count how many were successfully fixed
            still_bad = df["dueDate"].isna().sum()
            fixed_count = bad_date_count - still_bad
            print(f"  - Fixed {fixed_count:,} invoices using paymentDeadlines")
            if still_bad > 0:
                print(f"  - Warning: {still_bad:,} invoices still have missing dueDate")

        # Calculate days late (if paid)
        df["days_late"] = (df["paymentDate"] - df["dueDate"]).dt.days
        df.loc[df["days_late"] < 0, "days_late"] = 0  # Not late if negative

        # Boolean flags
        df["is_paid"] = df["status"] == "paid"
        df["is_cancelled"] = df["status"] == "cancelled"
        df["is_chargeback"] = df["status"] == "chargeback"
        df["is_on_time"] = (df["is_paid"]) & (df["days_late"] == 0)
        df["is_late"] = (df["is_paid"]) & (df["days_late"] > 0)

        # Chargeback recovery
        df["chargeback_recovered"] = df["chargebackRecovered"].fillna(False)

        print(f"Preprocessing complete. Shape: {df.shape}")

        return df


def load_data_for_merchant(merchant_id: str) -> tuple[pd.DataFrame, pd.DataFrame]:
    """Convenience function to load all data for a merchant

    Args:
        merchant_id: Merchant identifier

    Returns:
        Tuple of (invoices_df, customers_df)
    """
    loader = TinybirdDataLoader()

    print(f"\n{'=' * 60}")
    print(f"Loading data for merchant: {merchant_id}")
    print(f"{'=' * 60}\n")

    # Load invoices
    invoices = loader.load_invoice_data(merchant_id)
    invoices = loader.preprocess_invoice_data(invoices)

    # Load customer metadata
    customers = loader.load_customer_metadata(merchant_id)

    print(f"\n{'=' * 60}")
    print("Data loading complete!")
    print(f"{'=' * 60}\n")

    return invoices, customers
