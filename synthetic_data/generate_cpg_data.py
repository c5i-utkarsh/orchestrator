"""
generate_cpg_data.py
--------------------
Generates a realistic CPG (Consumer Packaged Goods) synthetic dataset for
"RefreshCo Beverages & Snacks" — a fictional company selling carbonated drinks,
energy drinks, and snack foods.

Produces:
  Structured (CSVs)  → exercise schema_enricher.py (cryptic column names)
  ├─ cpg_sku_master.csv           SKU / product master data
  ├─ cpg_weekly_demand.csv        Weekly demand + forecast (ADJSTD_DMND style cols)
  ├─ cpg_inventory_snapshot.csv   Current inventory by plant/warehouse
  ├─ cpg_trade_promotions.csv     Trade promotion performance
  └─ cpg_vendor_scorecard.csv     Supplier / vendor KPIs

  Unstructured (TXT) → exercise graphify (spaCy NER + knowledge graph)
  ├─ product_catalog.txt          Full product catalog with descriptions
  ├─ market_research_report.txt   Consumer trend analysis
  ├─ category_playbook.txt        Category management strategy
  └─ trade_promotion_guidelines.txt  Trade spend & promo policy

Usage:
  python generate_cpg_data.py
  # Output files written to ./cpg_data/
"""
import csv
import random
import os
from datetime import date, timedelta
from pathlib import Path

random.seed(42)

OUT = Path(__file__).parent / "cpg_data"
OUT.mkdir(exist_ok=True)

# ─── Master reference data ────────────────────────────────────────────────────

BRANDS   = ["RefreshCo", "ZingEnergy", "CrunchBite", "SweetWave", "NatureNosh"]
CATS     = {
    "Carbonated Soft Drinks": ["Cola", "Lemon-Lime", "Orange Burst", "Root Beer", "Ginger Ale"],
    "Energy Drinks":          ["Original Surge", "Sugar-Free Surge", "Citrus Blast", "Berry Rush"],
    "Salty Snacks":           ["Classic Potato Chips", "Tortilla Chips", "Cheese Puffs", "Popcorn Butter", "Pretzels"],
    "Sweet Snacks":           ["Chocolate Chunk Cookies", "Granola Bars Honey", "Oat Crackers", "Fruit Chews"],
    "RTD Juice":              ["Orange Mango Blend", "Apple Cranberry", "Green Detox"],
}
PACK_SIZES  = ["355mL Can", "500mL Bottle", "1L Bottle", "2L Bottle",
               "28g Bag", "56g Bag", "100g Bag", "200g Bag", "6x355mL Pack", "12x355mL Case"]
PLANTS      = ["PLNT_CHI", "PLNT_DAL", "PLNT_ATL", "PLNT_LAX"]
VENDORS     = {
    "V001": "AmeriCan Packaging Ltd",
    "V002": "SugarSource Co",
    "V003": "FlavourTech Inc",
    "V004": "PotatoFarm Direct",
    "V005": "GrainMills Supply",
    "V006": "CornAgri Cooperative",
    "V007": "CartonBox Global",
    "V008": "NaturalOils Corp",
}
CHANNELS    = ["GROCERY", "MASS_MERCH", "CONV_STORE", "DRUG_STORE", "ECOMM", "CLUB"]
REGIONS     = ["NORTHEAST", "SOUTHEAST", "MIDWEST", "SOUTHWEST", "WEST"]

# Build SKU master
skus = []
sku_id = 1000
for cat, flavours in CATS.items():
    for flavour in flavours:
        for pack in random.sample(PACK_SIZES, k=min(3, len(PACK_SIZES))):
            brand = random.choice(BRANDS)
            skus.append({
                "SKU_CD":      f"RF{sku_id:05d}",
                "UPC_CD":      f"0{random.randint(10000000000, 99999999999)}",
                "EAN_CD":      f"{random.randint(1000000000000, 9999999999999)}",
                "PROD_DESC":   f"{brand} {flavour} {pack}",
                "BRAND_NM":    brand,
                "CAT_NM":      cat,
                "SUBCAT_NM":   flavour,
                "PACK_SZ_DESC":pack,
                "UOM_CD":      "EA",
                "WT_KG":       round(random.uniform(0.03, 2.5), 3),
                "VOL_ML":      random.choice([355, 500, 750, 1000, 2000, 28, 56, 100, 200]),
                "BASE_PRC_USD":round(random.uniform(0.99, 6.49), 2),
                "ACTV_FLG":    random.choices(["Y", "N"], weights=[92, 8])[0],
                "INTRD_DT":    (date(2019, 1, 1) + timedelta(days=random.randint(0, 1800))).isoformat(),
                "PLNT_CD":     random.choice(PLANTS),
            })
            sku_id += 1

# ─── 1. SKU Master ────────────────────────────────────────────────────────────

def write_sku_master():
    path = OUT / "cpg_sku_master.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(skus[0].keys()))
        w.writeheader()
        w.writerows(skus)
    print(f"  ✓ {path.name}  ({len(skus)} rows)")

# ─── 2. Weekly Demand & Forecast ─────────────────────────────────────────────
# Columns intentionally cryptic — exercise schema_enricher

def write_weekly_demand():
    rows = []
    # 26 weeks ending today
    end   = date.today()
    start = end - timedelta(weeks=26)
    active_skus = [s for s in skus if s["ACTV_FLG"] == "Y"][:60]  # keep manageable

    for sku in active_skus:
        base   = random.randint(800, 12000)
        trend  = random.uniform(-0.005, 0.012)
        for wk_offset in range(26):
            wk_start = start + timedelta(weeks=wk_offset)
            season   = 1 + 0.3 * (0.5 + 0.5 * __import__("math").sin(
                2 * 3.14159 * wk_offset / 52))
            act      = max(0, int(base * season * (1 + trend * wk_offset)
                                  + random.gauss(0, base * 0.08)))
            hist_4wk = max(0, int(act * random.uniform(0.88, 1.12)))
            fcst_raw = max(0, int(act * random.uniform(0.90, 1.15)))
            adjstd   = max(0, int(fcst_raw * random.uniform(0.95, 1.05)))

            rows.append({
                "SKU_CD":                sku["SKU_CD"],
                "BRAND_NM":              sku["BRAND_NM"],
                "CAT_NM":                sku["CAT_NM"],
                "WK_START_DT":           wk_start.isoformat(),
                "WK_NUM":                wk_start.isocalendar()[1],
                "YR_NUM":                wk_start.year,
                "CHNL_CD":               random.choice(CHANNELS),
                "REG_NM":                random.choice(REGIONS),
                "PLNT_CD":               sku["PLNT_CD"],
                "ACTV_SELL_QTY_WK":      act,
                "HIST_AVG_QTY_4WK":      hist_4wk,
                "UNCNSTND_FCST_QTY_WK":  fcst_raw,
                "ADJSTD_DMND_QTY_WK":    adjstd,
                "ADJSTD_DMND_QTY_WK4_FCST": max(0, int(adjstd * random.uniform(0.88, 1.14))),
                "ADJSTD_DMND_QTY_WK8_FCST": max(0, int(adjstd * random.uniform(0.82, 1.20))),
                "ADJSTD_DMND_QTY_WK13_FCST":max(0, int(adjstd * random.uniform(0.75, 1.28))),
                "BIAS_PCT":              round(random.gauss(0.02, 0.08), 4),
                "MAPE_PCT":              round(abs(random.gauss(0.12, 0.06)), 4),
                "PRMO_FLG":              random.choices(["Y", "N"], weights=[25, 75])[0],
                "NEW_ITM_FLG":           random.choices(["Y", "N"], weights=[5, 95])[0],
                "PREV_YR_ACTV_QTY_WK":   max(0, int(act * random.uniform(0.80, 1.20))),
                "YOY_DELTA_PCT":         round(random.gauss(0.04, 0.12), 4),
            })

    path = OUT / "cpg_weekly_demand.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"  ✓ {path.name}  ({len(rows)} rows)")

# ─── 3. Inventory Snapshot ────────────────────────────────────────────────────

def write_inventory():
    rows = []
    active_skus = [s for s in skus if s["ACTV_FLG"] == "Y"]
    for sku in active_skus:
        for plant in PLANTS:
            oh_qty  = random.randint(0, 15000)
            ss_qty  = random.randint(200, 2000)
            rop_val = ss_qty + random.randint(100, 800)
            lt_days = random.randint(3, 21)
            moq     = random.choice([100, 250, 500, 1000])
            rows.append({
                "SKU_CD":          sku["SKU_CD"],
                "PLNT_CD":         plant,
                "SLOC_CD":         f"SL{random.randint(10, 99)}",
                "SNAP_DT":         date.today().isoformat(),
                "OH_STK_QTY":      oh_qty,
                "INTR_TRNSIT_QTY": random.randint(0, 2000),
                "OPEN_PO_QTY":     random.randint(0, 5000),
                "RSVD_SO_QTY":     random.randint(0, oh_qty),
                "AVAIL_STK_QTY":   max(0, oh_qty - random.randint(0, oh_qty // 2)),
                "SS_QTY":          ss_qty,
                "ROP_VAL":         rop_val,
                "LT_DAYS":         lt_days,
                "MOQ_QTY":         moq,
                "DOH_CNT":         round(oh_qty / max(1, random.randint(50, 500)), 1),
                "DOS_CNT":         round((oh_qty + random.randint(0, 3000)) / max(1, random.randint(50, 500)), 1),
                "INV_STS_CD":      random.choices(["OK", "LOW", "CRIT", "EXCESS"],
                                                  weights=[60, 20, 10, 10])[0],
                "LAST_GR_DT":      (date.today() - timedelta(days=random.randint(0, 30))).isoformat(),
                "LAST_GI_DT":      (date.today() - timedelta(days=random.randint(0, 7))).isoformat(),
                "EOQ_QTY":         random.randint(500, 5000),
            })
    path = OUT / "cpg_inventory_snapshot.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"  ✓ {path.name}  ({len(rows)} rows)")

# ─── 4. Trade Promotions ──────────────────────────────────────────────────────

def write_promotions():
    rows = []
    active_skus = [s for s in skus if s["ACTV_FLG"] == "Y"][:50]
    for i in range(180):
        sku  = random.choice(active_skus)
        base = random.randint(1000, 20000)
        lift = random.uniform(1.1, 2.8)
        inc  = int(base * (lift - 1))
        disc = round(random.uniform(0.05, 0.35), 2)
        rev  = round(base * lift * sku["BASE_PRC_USD"] * (1 - disc), 2)
        cogs = round(rev * random.uniform(0.55, 0.70), 2)
        rows.append({
            "PRMO_ID":          f"PRMO{i+1001:05d}",
            "SKU_CD":           sku["SKU_CD"],
            "BRAND_NM":         sku["BRAND_NM"],
            "CAT_NM":           sku["CAT_NM"],
            "CHNL_CD":          random.choice(CHANNELS),
            "REG_NM":           random.choice(REGIONS),
            "PRMO_TYP_CD":      random.choice(["TPR", "DISP", "FEAT", "COMBO", "BOGOF"]),
            "PRMO_START_DT":    (date.today() - timedelta(days=random.randint(7, 365))).isoformat(),
            "PRMO_END_DT":      (date.today() - timedelta(days=random.randint(0, 6))).isoformat(),
            "DSCNT_PCT":        disc,
            "BASE_SO_QTY":      base,
            "INCRMNTL_SO_QTY":  inc,
            "TOT_SO_QTY":       base + inc,
            "LIFT_FCTR":        round(lift, 3),
            "REV_AMT_USD":      rev,
            "COGS_AMT_USD":     cogs,
            "GP_AMT_USD":       round(rev - cogs, 2),
            "GM_PCT":           round((rev - cogs) / max(rev, 0.01), 4),
            "TRADE_SPEND_AMT":  round(inc * sku["BASE_PRC_USD"] * disc, 2),
            "ROI_VAL":          round((rev - cogs) / max(1, round(inc * sku["BASE_PRC_USD"] * disc, 2)), 3),
            "PRMO_STS_CD":      random.choices(["CMPLTD", "ACTV", "PNDNG", "CNCLD"],
                                               weights=[70, 10, 15, 5])[0],
            "APRVD_FLG":        random.choices(["Y", "N"], weights=[90, 10])[0],
        })
    path = OUT / "cpg_trade_promotions.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"  ✓ {path.name}  ({len(rows)} rows)")

# ─── 5. Vendor Scorecard ──────────────────────────────────────────────────────

def write_vendor_scorecard():
    rows = []
    end   = date.today()
    start = end - timedelta(weeks=12)
    for vid, vnm in VENDORS.items():
        for wk in range(12):
            wk_dt = start + timedelta(weeks=wk)
            rows.append({
                "VNDOR_ID":         vid,
                "VNDOR_NM":         vnm,
                "WK_START_DT":      wk_dt.isoformat(),
                "PO_CNT":           random.randint(5, 80),
                "PO_LINE_CNT":      random.randint(20, 300),
                "RCVD_QTY":         random.randint(1000, 50000),
                "RJCTD_QTY":        random.randint(0, 500),
                "OTD_PCT":          round(random.uniform(0.72, 0.99), 4),
                "OTIF_PCT":         round(random.uniform(0.68, 0.97), 4),
                "FILL_RATE_PCT":    round(random.uniform(0.80, 0.99), 4),
                "DEFCT_RATE_PCT":   round(random.uniform(0.001, 0.04), 5),
                "LT_ACTV_DAYS":     random.randint(3, 28),
                "LT_AGRD_DAYS":     random.randint(5, 21),
                "LT_DELTA_DAYS":    random.randint(-5, 14),
                "COST_VAR_PCT":     round(random.gauss(0.01, 0.05), 4),
                "VNDOR_STS_CD":     random.choices(["APRVD", "PNDNG", "SUSP"],
                                                   weights=[88, 9, 3])[0],
                "CRTCL_MATL_FLG":   random.choices(["Y", "N"], weights=[30, 70])[0],
                "ALTN_VNDOR_AVAIL_FLG": random.choices(["Y", "N"], weights=[55, 45])[0],
            })
    path = OUT / "cpg_vendor_scorecard.csv"
    with open(path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
        w.writeheader()
        w.writerows(rows)
    print(f"  ✓ {path.name}  ({len(rows)} rows)")

# ─── 6. Product Catalog (unstructured) ────────────────────────────────────────

def write_product_catalog():
    text = """
REFRESHCO BEVERAGES & SNACKS — OFFICIAL PRODUCT CATALOG 2026
=============================================================

RefreshCo is a leading consumer packaged goods company headquartered in Chicago, Illinois.
Founded in 1987, the company manufactures and distributes carbonated soft drinks, energy drinks,
ready-to-drink juices, salty snacks, and sweet snacks across the United States and Canada.

──────────────────────────────────────────────
CARBONATED SOFT DRINKS
──────────────────────────────────────────────

RefreshCo Cola — 355mL Can, 500mL Bottle, 2L Bottle
The flagship product of RefreshCo. A classic blend of caramel coloring, phosphoric acid,
and natural cola flavor. Available in regular and diet formulations. Manufactured at our
Chicago and Dallas plants. The 2L format is particularly strong in grocery and mass
merchandise channels. Cola accounts for approximately 38% of total CSD revenue.

RefreshCo Lemon-Lime — 355mL Can, 500mL Bottle
A crisp, citrus-forward carbonated beverage. The lemon-lime SKU is RefreshCo's
second largest CSD by volume. Strongly preferred in the Southeast and Midwest regions.
A new sugar-free variant was introduced in Q1 2025.

RefreshCo Orange Burst — 355mL Can
A 100% naturally-flavored orange carbonated soft drink. Higher sugar content than
the cola line. Primarily targets the convenience store and drug store channels.
Orange Burst has seen 14% year-over-year volume growth in 2025.

RefreshCo Root Beer — 355mL Can, 2L Bottle
A traditional American root beer style with vanilla and anise notes. Seasonal peaks
in summer (Memorial Day to Labor Day). Root Beer is managed as a value SKU with
lower promotional spend than cola and lemon-lime.

RefreshCo Ginger Ale — 500mL Bottle
Premium positioning. Targets adult consumers. Ginger Ale has the highest average
selling price per unit in the CSD portfolio at $1.89 retail.

──────────────────────────────────────────────
ENERGY DRINKS — ZingEnergy Brand
──────────────────────────────────────────────

ZingEnergy Original Surge — 355mL Can, 500mL Bottle
The original ZingEnergy formula with 160mg caffeine per 500mL. Contains B-vitamins,
taurine, and natural guarana extract. ZingEnergy is the fastest-growing brand in
the RefreshCo portfolio. Year-over-year revenue growth for ZingEnergy reached 27%
in fiscal year 2025. Primarily distributed through convenience stores and ecommerce.

ZingEnergy Sugar-Free Surge — 355mL Can
Zero-sugar formulation using sucralose and acesulfame-K. Targets health-conscious
consumers aged 25–45. Sugar-Free Surge accounts for 41% of ZingEnergy volume in
the ecommerce channel.

ZingEnergy Citrus Blast — 355mL Can
Lemon and lime flavor with added electrolytes. Positioned as a sports performance
variant. Club store channel is the primary distribution point for Citrus Blast,
sold in 12-pack cases.

ZingEnergy Berry Rush — 500mL Bottle
A mixed berry flavor launched in 2024. Still in the distribution-building phase.
Target ACV (All Commodity Volume) distribution is 65% by end of 2026. Berry Rush
requires cold-chain distribution due to a natural fruit extract component.

──────────────────────────────────────────────
SALTY SNACKS — CrunchBite Brand
──────────────────────────────────────────────

CrunchBite Classic Potato Chips — 28g Bag, 56g Bag, 200g Bag
The core salty snack SKU. Kettle-cooked style chips made with sunflower oil.
CrunchBite Potato Chips are manufactured exclusively at the Atlanta plant.
The 200g bag is the primary format in club stores and grocery. Potato Chips
are RefreshCo's highest-volume snack SKU by unit count.

CrunchBite Tortilla Chips — 56g Bag, 200g Bag
Restaurant-style tortilla chips. Available in Original, Nacho Cheese, and
Salsa Verde flavor variants. Tortilla Chips benefit from strong co-promotion
with dips and salsas in grocery accounts.

CrunchBite Cheese Puffs — 56g Bag, 100g Bag
Air-puffed corn snack with cheddar cheese coating. Particularly popular in
convenience stores. Cheese Puffs have the highest gross margin in the snacks
category at 52%.

CrunchBite Popcorn Butter — 28g Bag, 100g Bag
Ready-to-eat microwave-quality butter popcorn in a resealable bag. Sourced from
non-GMO corn. Demand is highly seasonal with peaks in Q4 (holiday movie season)
and during major sporting events.

CrunchBite Pretzels — 100g Bag
Classic twisted pretzels and pretzel sticks. Lower velocity SKU with very stable
demand. Pretzels have below-average promotional lift sensitivity.

──────────────────────────────────────────────
SWEET SNACKS — SweetWave & NatureNosh Brands
──────────────────────────────────────────────

SweetWave Chocolate Chunk Cookies — 200g Bag
Soft-baked chocolate chunk cookies. Highest absolute revenue per unit in the
sweet snacks segment. Manufactured at the Los Angeles plant. SweetWave Cookies
have a 12-week shelf life from manufacture date, creating inventory velocity
requirements.

NatureNosh Granola Bars Honey — 6-pack Box
All-natural granola bars with whole oats, honey, and almonds. NatureNosh is
positioned as a premium, better-for-you brand. Primary channel is natural/specialty
grocery, followed by ecommerce. Growing at 19% year-over-year.

NatureNosh Oat Crackers — 200g Bag
Whole-grain oat crackers with sea salt. Short ingredient list (7 ingredients).
The Oat Crackers SKU commands the highest retail price per gram in the cracker
sub-category.

SweetWave Fruit Chews — 56g Bag
Chewy fruit-flavored candy squares. Strong in convenience store and drug store.
Fruit Chews have the highest repeat purchase rate of any sweet snack SKU.

──────────────────────────────────────────────
RTD JUICE — RefreshCo Premium Juice Line
──────────────────────────────────────────────

RefreshCo Orange Mango Blend — 1L Bottle
Cold-pressed orange and mango juice blend. Requires refrigerated supply chain
(cold-chain). Shelf life is 18 days from production. The Orange Mango Blend
targets health-focused consumers in the grocery and club store channels.

RefreshCo Apple Cranberry — 1L Bottle
Apple base with cranberry concentrate. No artificial colors or flavors. Currently
distributed in the Northeast and Midwest regions only.

RefreshCo Green Detox — 500mL Bottle
Spinach, cucumber, green apple, and ginger cold-pressed juice. The Green Detox SKU
is the newest product launch (January 2026) and is still building distribution.
Premium price point at $4.99 retail.
""".strip()
    (OUT / "product_catalog.txt").write_text(text)
    print(f"  ✓ product_catalog.txt")

# ─── 7. Market Research Report (unstructured) ─────────────────────────────────

def write_market_research():
    text = """
REFRESHCO INTERNAL MARKET RESEARCH REPORT — Q1 2026
Category Dynamics and Consumer Trend Analysis

PREPARED BY: RefreshCo Consumer Insights & Analytics Team
DATE: March 15, 2026
CONFIDENTIALITY: Internal Use Only

EXECUTIVE SUMMARY
─────────────────
The U.S. beverage and snack market totaled $312 billion in retail sales in 2025,
growing 4.2% year-over-year. RefreshCo holds a 6.8% share of the combined beverage
and salty snack market, up from 6.3% in 2024. The company's growth was led by the
ZingEnergy brand (+27%) and the NatureNosh better-for-you snack line (+19%).
Carbonated soft drinks as a category contracted by 1.3% in volume but grew 2.1%
in value, driven by premiumization and price increases.

CONSUMER TRENDS — BEVERAGES
───────────────────────────
1. Health & Wellness Migration
   Approximately 34% of consumers surveyed report actively reducing sugar intake,
   up from 28% in 2024. This is the primary tailwind for ZingEnergy Sugar-Free Surge
   and the headwind for full-sugar CSD SKUs. However, permissive indulgence occasions
   remain strong, with 61% of consumers indicating they still purchase regular-sugar
   beverages at least weekly.

2. Energy Drink Premiumization
   The energy drink segment is bifurcating. Premium energy drinks (priced above $2.50
   per 355mL can) grew 31% while value segment energy drinks declined 4%. ZingEnergy
   is positioned in the premium tier and well-positioned to capture this growth.
   Key purchase drivers in order: energy benefit, taste, sugar content, brand, price.

3. RTD Juice Decline in Traditional Formats
   Traditional 100% orange juice declined 8% in volume. However, cold-pressed and
   premium juice blends grew 22%. RefreshCo's Orange Mango Blend and Green Detox
   are correctly positioned to capture the premiumization shift in juice.

4. Ecommerce Acceleration
   Online grocery penetration for beverages reached 18% in 2025, up from 14% in 2024.
   The ecommerce channel favors multi-packs and subscription formats. ZingEnergy has
   the strongest ecommerce presence in RefreshCo's portfolio, with 22% of its volume
   sold online.

CONSUMER TRENDS — SNACKS
─────────────────────────
1. Better-For-You Snacks Growth
   The better-for-you snack segment grew 16% in 2025. Key attributes consumers seek:
   fewer ingredients (clean label), whole grains, non-GMO certification, lower sodium.
   NatureNosh directly addresses these attributes and should be the growth investment
   priority in snacks.

2. Salty Snack Resilience
   Core salty snacks (potato chips, tortilla chips) showed resilience despite inflation.
   Private label share in potato chips reached 19%, suggesting price sensitivity.
   CrunchBite's kettle-cooked positioning differentiates from private label and supports
   premium pricing. Tortilla chips outperformed potato chips in the multicultural consumer
   segment (Hispanic index: 138).

3. Impulse Purchase Recovery
   Convenience store traffic increased 6% in 2025 after pandemic-era declines. This
   benefits high-impulse SKUs: CrunchBite Cheese Puffs, SweetWave Fruit Chews, and
   ZingEnergy Original Surge. Planogram presence in the first 3 feet from the checkout
   is the single largest predictor of impulse purchase incidence.

CHANNEL PERFORMANCE ANALYSIS
──────────────────────────────
Grocery remains the largest channel at 41% of RefreshCo revenue, but is growing slower
than ecommerce (+3% vs +24%). Convenience stores represent 22% of revenue with above-
average margins due to single-serve format mix. Club stores are critical for ZingEnergy
and CrunchBite large-format SKUs. Drug store channel shows stable performance for CSD
and sweet snacks.

COMPETITIVE LANDSCAPE
──────────────────────
RefreshCo faces competition from three main categories of players:
- Global giants (two competitors with >30% market share each in CSD)
- Energy drink specialists (multiple brands competing directly with ZingEnergy)
- Better-for-you specialists (over 200 brands competing with NatureNosh)

In the energy drink segment, ZingEnergy's key competitive advantage is its taste profile
and mid-premium price positioning ($2.29 vs $2.69 for the market leader). In salty snacks,
CrunchBite's kettle-cooked differentiation justifies a 15-20% price premium over standard
potato chips.

DEMAND FORECAST ASSUMPTIONS — 2026
────────────────────────────────────
Full Year 2026 category growth assumptions used in demand planning:
  - Carbonated Soft Drinks: -1.5% volume, +1.8% value
  - Energy Drinks: +22% volume, +26% value
  - RTD Juice: -3% traditional, +20% premium cold-pressed
  - Salty Snacks: +3.5% volume, +5.8% value
  - Sweet Snacks: +2.1% volume, +4.2% value

RefreshCo volume targets by brand:
  - RefreshCo CSD: flat volume, defend share
  - ZingEnergy: +25% volume target, ACV expansion to 78%
  - CrunchBite: +8% volume, grocery/club focus
  - SweetWave: +4% volume
  - NatureNosh: +22% volume, distribution expansion priority
""".strip()
    (OUT / "market_research_report.txt").write_text(text)
    print(f"  ✓ market_research_report.txt")

# ─── 8. Category Playbook (unstructured) ──────────────────────────────────────

def write_category_playbook():
    text = """
REFRESHCO CATEGORY MANAGEMENT PLAYBOOK 2026
Sales & Category Development Team

PURPOSE
────────
This playbook defines RefreshCo's category management principles, planogram
standards, assortment recommendations, and shelf space guidelines for key
retail channels. Category captaincy is held by RefreshCo in the energy drink
sub-category at 14 key national grocery retailers.

CARBONATED SOFT DRINKS — SHELF STRATEGY
─────────────────────────────────────────
Recommended facings by SKU tier:
  Tier 1 (Cola, Lemon-Lime): minimum 4 facings in 355mL can, 3 facings in 2L
  Tier 2 (Orange Burst, Root Beer): 2 facings in 355mL can
  Tier 3 (Ginger Ale): 1 facing, positioned in premium adjacency

The 355mL can format drives the highest velocity and must occupy eye-level shelf
positions (shelf heights 48"–60"). The 2L bottle should be positioned on the
bottom shelf near category entry for value shoppers.

Seasonal inventory buildups are required for Cola and Lemon-Lime in the
4-week period before Memorial Day, July 4th, and Labor Day. Recommended
safety stock increase: +40% above normal safety stock levels during holiday
pre-build periods.

ENERGY DRINKS — PLANOGRAM & DISTRIBUTION
──────────────────────────────────────────
ZingEnergy Original Surge must be distributed in all channels. Recommended
minimum shelf standards:
  Grocery:          4 facings, cold vault preferred
  Convenience:      6 facings in cold vault (door 1–3), 2 facings ambient
  Club:             12-count case only, end-cap display
  Drug:             2 facings ambient
  Ecommerce:        12-count and 24-count case listings required

ZingEnergy Sugar-Free Surge should be merchandised adjacent to Original Surge.
Recommend a "Better Choice" shelf talker at the Sugar-Free facing.

ZingEnergy Berry Rush is in distribution build phase. Target for 2026:
  - Gain distribution in 1,200 new convenience store doors per quarter
  - Secure grocery authorization at 8 new regional chains by Q3 2026
  - Club store authorization at 2 national club retailers by Q2 2026

SALTY SNACKS — ASSORTMENT OPTIMIZATION
────────────────────────────────────────
Category assortment recommendation by channel:

  Grocery (large format):
    Must-stock: Potato Chips 200g, Tortilla Chips 200g, Cheese Puffs 100g
    Recommended: Popcorn Butter 100g, Pretzels 100g
    Opportunity: NatureNosh Oat Crackers (cross-category in health aisle)

  Convenience Store:
    Must-stock: Potato Chips 28g, Tortilla Chips 56g, Cheese Puffs 56g
    Recommended: Fruit Chews 56g (register counter display)
    DO NOT stock: 200g formats (low velocity in conv. format)

  Club Store:
    Must-stock: Potato Chips 200g, Tortilla Chips 200g (Club exclusive bundle)
    Recommended: Mixed variety packs (Chips + Puffs + Pretzels 6-count)

TRADE PROMOTION GUIDELINES (SUMMARY)
──────────────────────────────────────
Maximum promotional frequency per SKU:
  - Tier 1 CSD SKUs: maximum 6 promotional periods per year
  - Energy drinks: maximum 4 promotional periods per year
  - Snacks: maximum 8 promotional periods per year (higher velocity)

Minimum ROI threshold for promotion approval: 1.2x
Approved promotion types: TPR (Temporary Price Reduction), Feature Ad,
  Display (DISP), Combo Multi-Pack, BOGOF (Buy One Get One Free).
BOGOF promotions require VP Sales approval for all SKUs.

Promotional lift benchmarks by SKU type:
  - Cola 355mL (TPR -15%): expected lift 1.6x–2.0x
  - Energy drink (Feature Ad): expected lift 2.2x–3.1x
  - Chips 200g (Feature + Display): expected lift 2.8x–3.5x
  - Cookies (BOGOF): expected lift 3.0x–4.2x

DEMAND PLANNING INTEGRATION
─────────────────────────────
All approved promotions must be entered in the trade promotion management system
at least 6 weeks before start date. The demand planning team uses the PRMO_FLG
indicator in the weekly demand file to adjust unconstrained forecasts. The
ADJSTD_DMND_QTY_WK and ADJSTD_DMND_QTY_WK4_FCST columns are the primary inputs
to production scheduling at all four manufacturing plants (PLNT_CHI, PLNT_DAL,
PLNT_ATL, PLNT_LAX).

Forecast accuracy KPIs:
  - MAPE (Mean Absolute Percentage Error) target: < 12% at SKU/week level
  - BIAS target: between -3% and +3% (systematic over/under-forecast)
  - Review cycle: weekly on Tuesdays for rolling 13-week horizon
""".strip()
    (OUT / "category_playbook.txt").write_text(text)
    print(f"  ✓ category_playbook.txt")

# ─── 9. Trade Promotion Guidelines (unstructured) ─────────────────────────────

def write_promo_guidelines():
    text = """
REFRESHCO TRADE PROMOTION POLICY & GUIDELINES — FY2026
Finance & Revenue Management Department

1. OVERVIEW
────────────
RefreshCo's trade promotion spending represents approximately 18% of gross revenue.
Effective trade promotion management is critical to maintaining retail relationships,
driving volume, and achieving profitable growth. This document establishes the policies,
approval thresholds, and post-event analysis requirements for all promotional activity.

2. PROMOTION TYPES AND CODES
──────────────────────────────
The following promotion types are recognized in the trade promotion management system:

  TPR   — Temporary Price Reduction: shelf price reduction funded by RefreshCo
  FEAT  — Feature Advertisement: inclusion in retailer weekly circular or digital ad
  DISP  — Display: off-shelf display (end-cap, shipper, floor stand)
  COMBO — Multi-product bundle deal (e.g., Chips + Dip)
  BOGOF — Buy One Get One Free (or at reduced price)

Promotions can be combined (e.g., TPR + FEAT + DISP = "Full Program"). Full programs
generate the highest lift but also the highest trade spend. ROI must be evaluated
for each program type separately.

3. APPROVAL LEVELS
───────────────────
  Trade spend ≤ $10,000:     Account Manager approval
  Trade spend $10,001–$50,000: Regional Sales Director approval
  Trade spend $50,001–$200,000: VP Sales approval
  Trade spend > $200,000:    Chief Revenue Officer approval

All BOGOF promotions: VP Sales or higher regardless of trade spend amount.
All promotions involving SKUs with GM < 30% require Finance co-approval.

4. FINANCIAL HURDLES
─────────────────────
Every promotion must pass financial screening before submission for approval:

  Minimum ROI (Return on Investment): 1.20x
  Formula: ROI = Incremental Gross Profit / Trade Spend
    where Incremental Gross Profit = (Incremental Units × Gross Profit Per Unit)
    and Trade Spend = Discount Funded by RefreshCo × Units Sold on Promotion

  Payback period: incremental volume must recover trade spend within 8 weeks
  post-promotion. Volume borrowed from future weeks (forward buying by retailers)
  counts against the promotion ROI calculation.

5. FORECASTING REQUIREMENTS
────────────────────────────
Before a promotion is approved, the demand planning team must provide:
  (a) Baseline demand (HIST_AVG_QTY_4WK from the weekly demand file)
  (b) Incremental volume forecast (INCRMNTL_SO_QTY in promotion record)
  (c) Post-promotion demand trough estimate (weeks of depressed demand following
      promotional period — typically 2–4 weeks for TPR promotions)
  (d) Adjusted demand forecast for the promotional week (ADJSTD_DMND_QTY_WK)

The ADJSTD_DMND_QTY_WK4_FCST column must be updated to reflect any approved
promotion landing within the 4-week forward-looking forecast window.

6. POST-EVENT ANALYSIS (PEA)
─────────────────────────────
Post-event analysis is mandatory for all promotions with trade spend > $25,000.
PEA must be completed within 4 weeks of promotion end date. PEA template includes:

  Metric              Target              Actual    Variance
  ───────────────────────────────────────────────────────────
  Lift Factor         Per benchmark       LIFT_FCTR   YOY_DELTA_PCT
  Incremental Units   Forecast INCRMNTL   Actual      Variance %
  ROI                 ≥ 1.20x             ROI_VAL     Pass/Fail
  GM%                 ≥ 25%               GM_PCT      Pass/Fail
  OTIF (supply)       ≥ 95%               OTIF_PCT    Pass/Fail

When a promotion fails ROI or GM% thresholds in PEA, the account team must
present a corrective action plan to the Revenue Management team within 2 weeks.

7. VENDOR SUPPLY READINESS
───────────────────────────
Before approving a promotion, supply chain must confirm:
  - Sufficient inventory (OH_STK_QTY + OPEN_PO_QTY) to cover TOT_SO_QTY
  - Vendor OTIF_PCT ≥ 90% in the prior 4-week period (from vendor scorecard)
  - No active material risk flags for primary packaging vendors

If the primary vendor (VNDOR_ID) has OTIF_PCT < 90% or CRTCL_MATL_FLG = Y,
supply chain may place the promotion on hold pending vendor corrective action.

8. SKU LIFECYCLE AND PROMOTION ELIGIBILITY
────────────────────────────────────────────
New items (NEW_ITM_FLG = Y in demand file) are eligible for distribution-building
promotions (display, feature) but not TPR in the first 16 weeks after launch.
Promotions on new items do not count against the maximum annual promotion frequency.

Inactive SKUs (ACTV_FLG = N) are not eligible for any promotional activity.

The PRMO_STS_CD field tracks promotion status: PNDNG (awaiting approval),
APRVD (approved), ACTV (currently running), CMPLTD (finished), CNCLD (cancelled).
""".strip()
    (OUT / "trade_promotion_guidelines.txt").write_text(text)
    print(f"  ✓ trade_promotion_guidelines.txt")

# ─── Run all ──────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import math
    print(f"\nGenerating RefreshCo CPG synthetic dataset → {OUT}/\n")
    write_sku_master()
    write_weekly_demand()
    write_inventory()
    write_promotions()
    write_vendor_scorecard()
    write_product_catalog()
    write_market_research()
    write_category_playbook()
    write_promo_guidelines()
    print(f"\nDone. Files in {OUT}/")
    print("\nFile listing:")
    for f in sorted(OUT.iterdir()):
        size_kb = f.stat().st_size // 1024
        print(f"  {f.name:45s}  {size_kb:6d} KB")
