import "dotenv/config";
import Stripe from "stripe";

const stripeKey = process.env.STRIPE_SECRET_KEY;

if (!stripeKey || stripeKey.includes("your_stripe_key") || stripeKey === "sk_test_123") {
  console.error("Set STRIPE_SECRET_KEY to a real Stripe test or live secret key before running this script.");
  process.exit(1);
}

const stripe = new Stripe(stripeKey);

const plans = [
  {
    plan: "basic",
    productName: "MyTruckingLeads Starter",
    monthlyAmount: 7900,
    annualAmount: 79000
  },
  {
    plan: "pro",
    productName: "MyTruckingLeads Pro",
    monthlyAmount: 19900,
    annualAmount: 199000
  },
  {
    plan: "premium",
    productName: "MyTruckingLeads Agency Unlimited",
    monthlyAmount: 49900,
    annualAmount: 499000
  }
];

async function getOrCreateProduct(plan) {
  const products = await stripe.products.search({
    query: `metadata['mtl_plan']:'${plan.plan}'`,
    limit: 1
  });

  if (products.data[0]) return products.data[0];

  return stripe.products.create({
    name: plan.productName,
    description: "MyTruckingLeads trucking carrier intelligence subscription",
    metadata: {
      app: "mytruckingleads",
      mtl_plan: plan.plan
    }
  });
}

async function getOrCreatePrice({ product, plan, cycle, amount }) {
  const lookupKey = `mtl_${plan}_${cycle}_${amount}`;
  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    active: true,
    limit: 1
  });

  if (existing.data[0]) return existing.data[0];

  return stripe.prices.create({
    product: product.id,
    unit_amount: amount,
    currency: "usd",
    recurring: {
      interval: cycle === "annual" ? "year" : "month"
    },
    lookup_key: lookupKey,
    metadata: {
      app: "mytruckingleads",
      mtl_plan: plan,
      billing_cycle: cycle
    }
  });
}

const result = {};

for (const plan of plans) {
  const product = await getOrCreateProduct(plan);
  const monthly = await getOrCreatePrice({
    product,
    plan: plan.plan,
    cycle: "monthly",
    amount: plan.monthlyAmount
  });
  const annual = await getOrCreatePrice({
    product,
    plan: plan.plan,
    cycle: "annual",
    amount: plan.annualAmount
  });

  result[plan.plan] = {
    productId: product.id,
    monthlyPriceId: monthly.id,
    annualPriceId: annual.id
  };
}

console.log(JSON.stringify({
  mode: stripeKey.startsWith("sk_live_") ? "live" : "test",
  railwayVariables: {
    STRIPE_PRICE_BASIC_MONTHLY: result.basic.monthlyPriceId,
    STRIPE_PRICE_PRO_MONTHLY: result.pro.monthlyPriceId,
    STRIPE_PRICE_PREMIUM_MONTHLY: result.premium.monthlyPriceId,
    STRIPE_PRICE_BASIC_ANNUAL: result.basic.annualPriceId,
    STRIPE_PRICE_PRO_ANNUAL: result.pro.annualPriceId,
    STRIPE_PRICE_PREMIUM_ANNUAL: result.premium.annualPriceId
  },
  products: result
}, null, 2));
