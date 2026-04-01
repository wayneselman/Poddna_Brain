import { getUncachableStripeClient } from "../server/stripeClient";

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  const existing = await stripe.products.search({ query: "name:'Creator Plan'" });
  if (existing.data.length > 0) {
    console.log("Creator Plan already exists:", existing.data[0].id);
    const prices = await stripe.prices.list({ product: existing.data[0].id, active: true });
    for (const p of prices.data) {
      console.log(`  Price: ${p.id} — $${(p.unit_amount || 0) / 100}/${p.recurring?.interval}`);
    }
    return;
  }

  const product = await stripe.products.create({
    name: "Creator Plan",
    description: "Unlimited clip downloads, full episode intelligence, narrative maps, entity detection, and pattern tracking.",
    metadata: {
      tier: "creator",
      features: "unlimited_clips,full_intelligence,narrative_maps,entity_detection,pattern_tracking",
    },
  });
  console.log("Created product:", product.id);

  const monthlyPrice = await stripe.prices.create({
    product: product.id,
    unit_amount: 2900,
    currency: "usd",
    recurring: { interval: "month" },
    metadata: { plan: "creator_monthly" },
  });
  console.log("Created monthly price:", monthlyPrice.id, "— $29/mo");
}

seedProducts().then(() => {
  console.log("Done.");
  process.exit(0);
}).catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
