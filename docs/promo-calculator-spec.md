# Promo Calculator — Calculation Rules (canonical)

Paste-ready spec for the Commercial Master sheet + the app's Calculator tab.
**Single rule: all margins are NET OF VAT (18%).** The app (`business_rules.py`,
`Campaigns.tsx`) and the sheet must agree on this.

## 0. Canonical formulas

For a gross price `P` (incl. VAT, what the customer pays) and loaded COGS `C`
(ex-VAT, the catalog's `total_cogs`):

```
net_price        = P / 1.18
net_margin       = (net_price − C) / net_price
min_safe_price   = C × 1.6667 × 1.18          # lowest GROSS price at the 40% net floor
max_safe_discount= 1 − (min_safe_price / P)    # uncapped — CAN exceed 25%
discounted_price = P × (1 − d)
```

- The **40% margin floor is a NET floor**. The `1.6667` multiplier gives the 40%
  net margin price; `×1.18` converts it to a gross price.
- **25% is not a hard cap.** It is the consumer-deal guideline / B2B entry point.
  The only binding block is `net_margin < 40%`.
- COGS = `total_cogs` (loaded, ex-VAT, per capsule for capsules). Currency: GEL.

Worked check (Espresso classic): `P=₾1.50, C=₾0.45, d=25% → ₾1.125`,
`net 1.125/1.18=0.953`, `margin (0.953−0.45)/0.953 = 52.7%`,
`min_safe = 0.45×1.6667×1.18 = ₾0.885`.

## 1. Per-tab corrections to make in the sheet

| Tab | Fix |
|-----|-----|
| **Inputs** | Recompute **"Max off 40%"** net-of-VAT: `=1 − (AvgCOGS×1.6667×1.18)/PricePerCap`. Today it's gross → reads ~7pts too generous (Espresso ~49.6% gross vs ~42% net). "Average Margin" and "Margin after discount" columns should divide price by 1.18 too. |
| **Starter Bundles** | Already net-of-VAT — good. Document corner cost explicitly: `corner_cost = (machine_price/1.18 − machine_COGS) − (bundle_price/1.18 − Σ item_COGS)`; `payback = corner_cost / monthly_capsule_margin`. (This is the machine's foregone profit, not value-to-customer.) |
| **MEAMA Mix** | Document: `you_pay = basket − flat_off`; `effective_discount = flat_off/basket`; `per_cup = you_pay/caps`; `blended_margin = (you_pay/1.18 − caps×blended_COGS_per_cup)/(you_pay/1.18)`; floor at 40%. |
| **Accessory Upsell & Gift** | Clarify "Full margin" = net-of-VAT **at the upsell price** (e.g. Milk Frother `(70/1.18−43.8)/(70/1.18)=26.2%`). "Cost to gift" = COGS; a free gift costs only its COGS. |
| **B2B Wholesale** | Restate: capsules **25% (<500 caps) / 30% (500+)**, accessories **15%**, machines **= ecom**. Net-of-VAT. Gated; never combined with any B2C offer. |

## 2. Per-component contract (what each calculator shows)

- **Promotion Builder** — inputs SKU/category (auto-fills `P`,`C`), discount `d`.
  Outputs `net_margin`, `discounted_price`, `min_safe_price`, `max_safe_discount`.
  Verdict GREEN unless `net_margin < 40%` **or** `discounted_price < min_safe_price`.
  A "margin-safe ceiling" badge shows `max_safe_discount` for the current inputs.
- **ROI estimate** — audience × conv% × units → revenue; `net_revenue = revenue/1.18`;
  `gross_profit = net_revenue − units×C`; `roi = gross_profit / (promo_cost/1.18)`.
- **Bundle margin** — fixed-price kit: `bundle_margin = (price/1.18 − ΣCOGS)/(price/1.18)`;
  `corner_cost`/`payback` per §1; floor at 40%.
- **MEAMA Mix** — capsule tiers (Mix 4/6/8) flat ₾ off; per §1.
- **Category ceilings** — computed **live** from catalog category averages via
  `max_safe_discount`; no hardcoded table (Fresh Juice naturally → ~0%).
- **Accessory upsell & gift** — Gift mode (cost = COGS, basket margin hit) and
  Upsell mode (sell at reduced price; margin net-of-VAT at the upsell price).
- **B2B wholesale** — per-category capsule margins at both tiers + accessory
  wholesale margins; thin-margin ⚠ when net margin < 40%.

## 2b. Category economics (canonical — from the Inputs tab)

Category taxonomy + per-cup economics, transcribed from the Inputs tab. The
**Avg margin / Max-safe-discount / B2B margin** columns below are **recomputed
net of VAT** from this tab's own Price/cap and COGS/cap — they REPLACE the tab's
current gross columns (which read ~5–7 pts high). `Max safe discount` is the
ceiling the calculator enforces; B2B margin is shown at the 30% tier.

| Category | Subcategory | Caps/pack | ₾/pack | ₾/cap | COGS/cap | Avg margin (net) | Max safe disc (net) | B2B margin @30% |
|---|---|--:|--:|--:|--:|--:|--:|--:|
| Espresso & Lungo | Classic | 10 | 15 | 1.50 | 0.44 | 65.4% | 42.3% | 50.6% |
| Espresso & Lungo | Flavoured | 10 | 16 | 1.60 | 0.41 | 69.8% | 49.6% | 56.8% |
| Espresso & Lungo | **Average** | 10 | 15.5 | 1.55 | 0.43 | 67.3% | 45.4% | 53.2% |
| Filtered Coffee | Classic | 12 | 20 | 1.67 | 0.49 | 65.4% | 42.3% | 50.5% |
| Filtered Coffee | Classic — Flagship | 12 | 24 | 2.00 | 0.65 | 61.7% | 36.1% | 45.2% |
| Filtered Coffee | Flavoured | 12 | 21 | 1.75 | 0.61 | 58.9% | 31.5% | 41.2% |
| Filtered Coffee | Latte | 12 | 22 | 1.83 | 0.73 | 52.9% | 21.6% | 32.8% |
| Filtered Coffee | **Average** | 12 | 21.75 | 1.81 | 0.62 | 59.6% | 32.6% | 42.3% |
| Tea & Infusions | Classic | 12 | 18 | 1.50 | 0.42 | 67.0% | 44.9% | 52.8% |
| Tea & Infusions | Specialty | 12 | 22 | 1.83 | 0.50 | 67.8% | 46.3% | 53.9% |
| Tea & Infusions | Latte | 12 | 20 | 1.67 | 0.62 | 56.2% | 27.0% | 37.4% |
| Tea & Infusions | **Average** | 12 | 20 | 1.67 | 0.52 | 63.3% | 38.8% | 47.5% |
| Juices & Cold Drinks | Cold | 12 | 20 | 1.67 | 0.41 | 71.0% | 51.7% | 58.6% |
| Juices & Cold Drinks | Fresh Juice | 12 | 22 | 1.83 | 1.40 | 9.7% | 0% (no disc) | −29% (loss) |
| Juices & Cold Drinks | **Average** | 12 | 21 | 1.75 | 0.91 | 38.6% | 0% | 12.3% |
| Functional | Wellness Drink | 12 | 22 | 1.83 | 0.78 | 49.7% | 16.2% | 28.1% |
| Functional | Functional Coffee | 12 | 22 | 1.83 | 0.75 | 51.6% | 19.4% | 30.9% |
| Functional | **Average** | 12 | 22 | 1.83 | 0.76 | 51.0% | 18.3% | 30.0% |
| **Blended (avg) Multicapsule** | | 12 | 21.19 | 1.77 | 0.70 | 53.3% | 22.2% | 33.3% |
| **Blended (avg)** | | 11.6 | 20.05 | 1.72 | 0.65 | 55.4% | 25.7% | 36.3% |

Formulas (per row): `avg_margin = 1 − COGS×1.18/price`;
`max_safe_disc = max(0, 1 − COGS×1.6667×1.18/price)`;
`B2B_margin@30% = 1 − COGS×1.18/(price×0.70)`.

> ⚠ **COGS source mismatch.** This tab's "Average COGS" (e.g. Espresso Classic
> ₾0.44/cap) is HIGHER than the live catalog's per-cap `total_cogs` (≈₾0.36). The
> app's category selector computes averages from the **catalog**, so its on-screen
> margins/ceilings will read higher than the table above. Pick one authoritative
> COGS source (recommend the catalog, since the app and orders read it) and align
> the sheet to it, or the two will keep disagreeing.

## 3. App ↔ sheet anchor numbers (must match)

- Versatile Starter Kit: bundle net margin ≈ 5.9%, payback ≈ 1.7 mo.
- Mix 6: you-pay ≈ ₾95, per-cup ≈ ₾1.38, blended margin ≈ 44%.
- B2B Espresso <500: ≈ 56.6% net margin.
- Milk Frother upsell (₾70): margin ≈ 26.2%.
