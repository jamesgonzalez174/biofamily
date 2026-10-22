# Architecture
- Manual ticket adjustments use an authenticated database RPC that atomically updates member and pharmacy balances and records the admin audit entry; row locking and request IDs prevent lost updates and duplicate retries.
- Invoice ticket ledger rows describe invoice credits only; manual changes belong in the admin audit trail to preserve invoice attribution.