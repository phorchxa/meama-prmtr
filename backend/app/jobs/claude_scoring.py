"""Batch Claude scoring: churn_score, cluster_tag, upsell_tag. NOT a trained model.

Reads anonymized/aggregated features (customer IDs + counts/scores — never PII)
from Postgres, calls claude-sonnet-4-6 with strict-JSON prompts, validates and
writes results back to customer_metrics, and persists insights to ai_insights.
"""
from __future__ import annotations

from ..services.claude_client import ClaudeClient


def run(batch_size: int = 100) -> dict:
    """Score customers in batches. STUB skeleton — implemented in Phase 1."""
    _client = ClaudeClient  # constructed in Phase 1
    # TODO(phase1):
    #   1. select customers needing (re)scoring + anonymized features
    #   2. for each batch: build strict-JSON prompt, ClaudeClient.complete_json()
    #   3. validate fields: cluster_tag (str), churn_score (0.0–1.0), upsell_tag (bool)
    #   4. upsert into customer_metrics; persist insight rows in ai_insights (24h TTL)
    #   5. write a sync_log row
    return {"status": "stub", "job": "claude_scoring", "scored": 0}


if __name__ == "__main__":
    print(run())
