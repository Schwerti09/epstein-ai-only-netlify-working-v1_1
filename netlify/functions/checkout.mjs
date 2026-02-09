import Stripe from "stripe";

function json(statusCode, body){
  return {
    statusCode,
    headers:{
      "content-type":"application/json; charset=utf-8",
      "access-control-allow-origin":"*",
      "cache-control":"no-store",
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event.httpMethod !== "POST") return json(405, { error:"Method not allowed" });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const priceMonthly = process.env.STRIPE_PRICE_ID_MONTHLY;

  if (!stripeKey || !priceMonthly){
    return json(400, { error:"Stripe nicht konfiguriert: STRIPE_SECRET_KEY oder STRIPE_PRICE_ID_MONTHLY fehlt." });
  }

  const origin = event.headers?.origin || process.env.SITE_URL || "";
  try{
    const stripe = new Stripe(stripeKey, { apiVersion: "2024-06-20" });
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceMonthly, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/?success=1#pricing`,
      cancel_url: `${origin}/?canceled=1#pricing`,
    });
    return json(200, { url: session.url });
  }catch(e){
    return json(500, { error:"Stripe Checkout Fehler" });
  }
};
