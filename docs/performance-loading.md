# Loading & caching conventions

Every module must render fast and progressively — never block the whole
page on the slowest thing it needs. This doc is the standard to follow
for every new page and endpoint from here on.

## Why this exists

The Products page (and others) used to feel frozen on open: the first
request after a cold backend instance took 7–14 seconds (Supabase RPCs
recomputing revenue/reorder/margin stats across ~121K orders from
scratch), and the whole page — all tabs, all ~280 product cards and
photos — waited on that one response before showing anything.

Two separate problems, two separate fixes:

1. **Backend: expensive endpoints recomputed on every cache miss,
   blocking the caller.** Fixed with a shared stale-while-revalidate
   cache (see below) — only the very first request after a cold start
   pays the full compute cost; every request after that gets an
   instant response while the data refreshes in the background.
2. **Frontend: pages rendered nothing until 100% of the data (and every
   product photo) was ready, then mounted everything at once.** Fixed
   by rendering the shell and skeletons immediately, then paginating
   what actually hits the DOM.

## Backend: use `SWRCache` for any endpoint over ~500ms

`backend/app/services/cache.py` provides `SWRCache`. Every router that
recomputes something expensive (Supabase RPCs, cross-table joins, large
aggregations) should use it instead of a bespoke `_cache: dict` + manual
TTL check:

```python
from ..services.cache import SWRCache

_cache: SWRCache[MyResponse] = SWRCache(ttl=60)

async def _build_my_thing(sb) -> MyResponse:
    ...  # the actual expensive work
    return result

@router.get("")
async def get_my_thing(sb=Depends(get_supabase), response: Response = None):
    data = await _cache.get("default", lambda: _build_my_thing(sb))
    if response:
        response.headers["Cache-Control"] = "s-maxage=60, stale-while-revalidate=30"
    return data
```

Rules of thumb:
- **`ttl` is a "freshness" target, not a hard latency budget.** Once
  populated, a key is never recomputed synchronously on the request
  path again — refreshes happen in a background `asyncio.create_task`.
  Only the first-ever call for a key (nothing cached yet, e.g. right
  after a cold start) blocks.
- **Key by whatever varies the response** (e.g. `period_days`, `sku`) —
  `SWRCache` supports multiple keys per instance.
- **Parallelize the I/O feeding the builder.** If a builder makes
  several independent Supabase table/RPC calls, dispatch them together
  via `asyncio.gather` (see `_build_product_intelligence` in
  `products.py` for the pattern) instead of awaiting them one at a
  time — this cuts the one-time cold-start cost roughly in proportion
  to how much was serialized before.
- Routers already migrated: `products.py`, `overview.py`, `stock.py`,
  `marketing.py`. `social.py` / `social_kpis.py` still use an older
  plain-TTL cache — migrate them to `SWRCache` next time you touch
  those files.
- The AI-report caches in `social.py` (`_ai_cache`, Claude-backed,
  explicit `?refresh=true` invalidation) are intentionally different —
  don't force those onto `SWRCache`, which has no eviction API.

## Frontend: never gate the whole page on the slowest data

- **Show the page shell immediately.** Header, tabs, and filters render
  before data arrives; only the data-dependent region shows a skeleton
  (`skeleton-shine` class in `index.css`) while loading. Don't return
  `null` or blank from a page while `loading` is true.
- **Any list that can grow past ~30–50 items (especially with images)
  renders in batches, not all at once.** See `Products.tsx`:
  `CATALOG_BATCH_SIZE`, `visibleProducts` (a `.slice()` of the filtered
  array), and the `IntersectionObserver`-driven sentinel + "Load more"
  fallback button. Copy this pattern for any future grid/table of
  photos or heavy cards. Client-side filters/sort still run over the
  *full* fetched array — only what's mounted into the DOM is capped.
- **Images**: always set `loading="lazy"` and `decoding="async"`, and
  reserve the image's box size up front (fixed height/aspect ratio) so
  nothing shifts. Show a `skeleton-shine` placeholder behind the `<img>`
  until its own `onLoad` fires — one slow photo should never block the
  rest of the card, let alone the rest of the grid. See `ProductImage`
  in `Products.tsx`.
- **One fetch per page is fine** — this app doesn't use React Query/SWR
  on the frontend (no such dependency yet). The fix for "slow" is
  almost always the backend response time (see `SWRCache` above) and
  bounding what renders, not re-architecting data fetching.

## Checklist for a new module/page

- [ ] Backend endpoint wraps its expensive work in `SWRCache` if it can
      take >500ms on a cold cache.
- [ ] Independent Supabase calls inside the builder run via
      `asyncio.gather`, not sequential `await`s.
- [ ] Page renders its shell + skeletons immediately; data-only regions
      show loading state, not the whole page.
- [ ] Any grid/list of more than ~50 items (or anything rendering
      images) mounts in batches with infinite scroll / load-more, not
      all at once.
- [ ] Images are lazy, async-decoded, fixed-size, and have their own
      per-item loading placeholder.
