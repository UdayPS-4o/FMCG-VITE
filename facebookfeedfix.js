/* =====================================================================
 * FIX: feed publishes 0 items — getEnrichedProducts() has no image_url
 * =====================================================================
 *
 * DIAGNOSIS
 *   /api/app/facebook-feed/status  -> 486 in cache, 485 "no image_url"
 *   /api/app/products?codes=MK007  -> image_url IS present
 *
 *   => image_url is attached somewhere in the /api/app/products handler
 *      AFTER getEnrichedProducts() returns. The feed reads the cache
 *      before that step runs, so every item looks image-less.
 *
 * ---------------------------------------------------------------------
 * OPTION A — preferred, if you can find the image step (fastest, no HTTP)
 * ---------------------------------------------------------------------
 * Open server/routes/app/index.js, find the GET /products handler, and
 * look for what runs between getEnrichedProducts() and res.json(). It
 * will be something like attachImages(...) / withImages(...) / a
 * productImages map lookup. Call that same thing in the feed builder:
 *
 *     let products = await getEnrichedProducts();
 *     products = await attachImages(products);   // <-- the missing step
 *
 * Add the debug endpoint at the bottom of this file first if you're not
 * sure which step it is — it prints the actual object shape.
 *
 * ---------------------------------------------------------------------
 * OPTION B — guaranteed to work, drop-in (use this if short on time)
 * ---------------------------------------------------------------------
 * Have the feed read your own public products endpoint, which we have
 * already verified returns image_url AND stock. Replace the data-loading
 * lines at the top of your feed builder with loadProductsForFeed() below.
 *
 * Do NOT use ?codes= for this — that response omits `stock`, which would
 * break quantity_to_sell_on_facebook. The plain paginated route is right.
 * ===================================================================== */

const FEED_SELF_BASE =
  process.env.FEED_SELF_BASE || 'https://server.ekta-enterprises.com';

async function loadProductsForFeed() {
  const [pRes, bRes] = await Promise.all([
    fetch(`${FEED_SELF_BASE}/api/app/products?limit=100000&page=1`),
    fetch(`${FEED_SELF_BASE}/api/app/brands`),
  ]);

  if (!pRes.ok) throw new Error(`products -> HTTP ${pRes.status}`);

  const products = (await pRes.json()).data || [];
  const brandsRaw = bRes.ok ? await bRes.json() : [];
  const brands = Array.isArray(brandsRaw) ? brandsRaw : brandsRaw.data || [];

  // Fail loudly instead of silently publishing an empty catalogue.
  // A feed that returns 0 items can make Meta mark your whole
  // catalogue out of stock on the next scheduled crawl.
  const withImages = products.filter((p) => p.image_url).length;
  if (products.length && withImages === 0) {
    throw new Error(
      'refusing to build: 0 of ' + products.length + ' products have image_url',
    );
  }

  return {
    products,
    brandMap: Object.fromEntries(brands.map((b) => [b.brand_code, b.brand_desc])),
  };
}

/* ---------------------------------------------------------------------
 * Guard to add to the CSV/XML routes as well — never serve an empty feed
 * ------------------------------------------------------------------- */
function assertNotEmpty(rows) {
  if (!rows.length) {
    const err = new Error('feed built 0 items — refusing to serve');
    err.statusCode = 503;
    throw err;
  }
  return rows;
}

/* ---------------------------------------------------------------------
 * Debug endpoint — tells you exactly what the cache looks like.
 * Mount it, hit it once, then delete it.
 * ------------------------------------------------------------------- */
// router.get('/facebook-feed/debug', async (req, res) => {
//   const cached = await getEnrichedProducts();
//   const viaHttp = await loadProductsForFeed();
//   res.json({
//     cache: {
//       count: cached.length,
//       keys: Object.keys(cached[0] || {}),
//       withImageUrl: cached.filter((p) => p.image_url).length,
//       sample: cached.find((p) => p.CODE === 'MK007') || cached[0],
//     },
//     http: {
//       count: viaHttp.products.length,
//       keys: Object.keys(viaHttp.products[0] || {}),
//       withImageUrl: viaHttp.products.filter((p) => p.image_url).length,
//       sample: viaHttp.products.find((p) => p.CODE === 'MK007'),
//     },
//   });
// });

module.exports = { loadProductsForFeed, assertNotEmpty };
