# Vector Log conventions

[All table conventions](database_conventions.md) · [Database schema](../data/SCHEMA.sql)

`vector_log` stores the supplied Vector labels and `DNA Fragment - No Vector`. `vector` is the text primary key. `resistance` records bacterial resistance, with `source_url` and `verification_status` recording provenance. `sequence` is blank for every vector. No-vector resistance is blank by definition. Unverified labels also keep blank resistance; distinguish them using verification_status, not assumptions. See [reference metadata](../scripts/vector_reference.json).

Contains the 52 supplied vector labels plus `DNA Fragment - No Vector`. Preserve label variants. Four resistances remain unverified and blank: pUCm-T, pUCP-18, pUC-SPK, pUC-SP. No-vector resistance and all vector sequences are empty strings. Metadata source URLs and verification flags are maintained in [vector_reference.json](../scripts/vector_reference.json).

## Current database columns

| Column | Type | Nullable | Default / expression |
| --- | --- | --- | --- |
| `vector` | `VARCHAR` | No | — |
| `resistance` | `VARCHAR` | No | '' |
| `sequence` | `VARCHAR` | No | '' |
| `source_url` | `VARCHAR` | Yes | '' |
| `verification_status` | `VARCHAR` | Yes | '' |

### Enforced constraints

- `PRIMARY KEY(vector)`
- `NOT NULL`
- `NOT NULL`
- `NOT NULL`
