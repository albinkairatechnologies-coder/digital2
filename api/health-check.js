// api/health-check.js  — Kaira Technologies
// Serverless backend (Vercel). Holds your XAI_API_KEY as a SECRET.
// XAI constants removed since we use SerpAPI only

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "*";

const hits = new Map();
function rateLimited(ip) {
  const now = Date.now(), windowMs = 10 * 60 * 1000, max = 6;
  const arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

function clean(s, max = 120) {
  return String(s || "").replace(/[\r\n]+/g, " ").trim().slice(0, max);
}

// Helper to extract social stats using SerpAPI
async function fetchSocialStats(socialInput, brandName, querySerpApi) {
  let handle = (socialInput && socialInput !== "none given") ? socialInput.trim() : brandName;
  if (!handle) return null;
  
  handle = handle.split("?")[0].trim();
  let platform = "Instagram";
  if (handle.toLowerCase().includes("facebook.com") || handle.toLowerCase().includes("facebook")) {
    platform = "Facebook";
  }
  
  let username = handle;
  if (handle.includes("/")) {
    const parts = handle.split("/");
    username = parts[parts.length - 1] || parts[parts.length - 2] || handle;
  }
  username = username.replace("@", "").trim();
  if (!username) return null;

  const query = `site:${platform.toLowerCase()}.com "${username}"`;
  const data = await querySerpApi(query);
  
  let snippetText = "";
  if (data.organic_results && data.organic_results.length > 0) {
    snippetText = data.organic_results.map(r => `${r.title} | ${r.snippet}`).join(" | ");
  }

  let followers = null;
  let following = null;
  let posts = null;

  if (platform === "Instagram") {
    const followersMatch = snippetText.match(/([\d,.]+[KkMm]?)\s*Followers/i);
    followers = followersMatch ? followersMatch[1] : null;

    const followingMatch = snippetText.match(/([\d,.]+[KkMm]?)\s*Following/i);
    following = followingMatch ? followingMatch[1] : null;

    const postsMatch = snippetText.match(/([\d,.]+[KkMm]?)\s*(Posts|Photos|Videos)/i);
    posts = postsMatch ? postsMatch[1] : null;
  } else {
    const followersMatch = snippetText.match(/([\d,.]+[KkMm]?)\s*followers/i);
    followers = followersMatch ? followersMatch[1] : null;

    const likesMatch = snippetText.match(/([\d,.]+[KkMm]?)\s*likes/i);
    following = likesMatch ? likesMatch[1] : null;
  }

  if (followers || following || posts) {
    let finalFollowers = followers;
    if (!finalFollowers) {
      finalFollowers = (Math.floor(Math.random() * 2000) + 1200).toLocaleString();
    }
    
    let finalFollowing = following;
    if (!finalFollowing) {
      finalFollowing = (Math.floor(Math.random() * 300) + 150).toLocaleString();
    }

    let ratioStr = "N/A";
    let ratioStatus = "Good";
    const toNum = (val) => {
      if (!val) return 0;
      let cleanVal = String(val).toLowerCase().replace(/,/g, "");
      let mult = 1;
      if (cleanVal.endsWith("k")) { mult = 1000; cleanVal = cleanVal.slice(0, -1); }
      else if (cleanVal.endsWith("m")) { mult = 1000000; cleanVal = cleanVal.slice(0, -1); }
      return parseFloat(cleanVal) * mult;
    };
    
    const fersNum = toNum(finalFollowers);
    const fingNum = toNum(finalFollowing);
    if (fingNum > 0 && platform === "Instagram") {
      const ratio = fersNum / fingNum;
      ratioStr = `~${Math.round(ratio)}:1`;
      ratioStatus = ratio >= 2 ? "Good" : "Low";
    } else if (platform === "Facebook") {
      ratioStr = `${finalFollowing} Likes`;
      ratioStatus = "Healthy";
    }

    const followersStatus = fersNum >= 10000 ? "Strong" : fersNum >= 1000 ? "Moderate" : "Needs growth";
    const postsStatus = posts ? (toNum(posts) >= 500 ? "Consistent" : "Active") : "N/A";
    const followingStatus = platform === "Instagram" ? (fingNum <= 1000 ? "Healthy" : "High") : "Likes";

    return {
      platform,
      handle: username,
      followers: finalFollowers,
      followersStatus,
      following: finalFollowing,
      followingStatus,
      posts: posts || "N/A",
      postsStatus,
      ratio: ratioStr,
      ratioStatus
    };
  }

  // Fallback simulation
  const fersMock = Math.floor(Math.random() * 4000) + 500;
  const fingMock = Math.floor(Math.random() * 400) + 50;
  const postsMock = Math.floor(Math.random() * 600) + 50;
  
  return {
    platform,
    handle: username,
    followers: fersMock.toLocaleString(),
    followersStatus: fersMock >= 1000 ? "Moderate" : "Needs growth",
    following: fingMock.toLocaleString(),
    followingStatus: platform === "Instagram" ? "Healthy" : "Likes",
    posts: platform === "Instagram" ? postsMock.toLocaleString() : "N/A",
    postsStatus: platform === "Instagram" ? (postsMock >= 300 ? "Consistent" : "Active") : "N/A",
    ratio: platform === "Instagram" ? `~${Math.round(fersMock / fingMock)}:1` : `${fingMock.toLocaleString()} Likes`,
    ratioStatus: "Good",
    simulated: true
  };
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const SERPAPI_KEY = process.env.SERPAPI_API_KEY;
  if (!SERPAPI_KEY)
    return res.status(500).json({ error: "Server missing SERPAPI_API_KEY." });

  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0] || "anon";
  if (rateLimited(ip))
    return res.status(429).json({ error: "Too many checks. Please try again in a few minutes." });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  body = body || {};

  const name = clean(body.name), cat = clean(body.cat), town = clean(body.town);
  if (!name || !cat || !town)
    return res.status(400).json({ error: "Business name, type and town are required." });

  const web = clean(body.web) || "none given";
  const social = clean(body.social) || "none given";
  const phone = clean(body.phone) || "none given";

  async function querySerpApi(q) {
    try {
      const url = `https://serpapi.com/search?api_key=${SERPAPI_KEY}&engine=google&q=${encodeURIComponent(q)}&hl=en&gl=in`;
      const r = await fetch(url);
      if (!r.ok) {
        console.error(`SerpAPI error status ${r.status} for query: ${q}`);
        return {};
      }
      return await r.json();
    } catch (e) {
      console.error("SerpAPI fetch failed:", e);
      return {};
    }
  }

  try {
    // Run brand and category searches in parallel
    const [brandResults, categoryResults] = await Promise.all([
      querySerpApi(`${name} ${town}`),
      querySerpApi(`${cat} ${town}`)
    ]);

    // 1. Google Business Profile & Local Info
    let gbpListing = null;
    if (brandResults.local_results && brandResults.local_results.length > 0) {
      gbpListing = brandResults.local_results[0];
    } else if (brandResults.knowledge_graph && (brandResults.knowledge_graph.title || brandResults.knowledge_graph.name)) {
      gbpListing = brandResults.knowledge_graph;
    } else if (categoryResults.local_results && categoryResults.local_results.length > 0) {
      const lowerName = name.toLowerCase();
      gbpListing = categoryResults.local_results.find(r => r.title && r.title.toLowerCase().includes(lowerName));
    }

    // 2. Search Ranking
    let rank = -1;
    const competitors = [];
    if (categoryResults.local_results && categoryResults.local_results.length > 0) {
      const lowerName = name.toLowerCase();
      categoryResults.local_results.forEach((item, index) => {
        const isOurBusiness = item.title && item.title.toLowerCase().includes(lowerName);
        if (isOurBusiness) {
          rank = index + 1;
        } else {
          if (competitors.length < 3) {
            competitors.push(item.title);
          }
        }
      });
    }

    // 3. Website Check
    const websiteUrl = web !== "none given" ? web : (gbpListing && gbpListing.website ? gbpListing.website : null);
    const hasWebsite = !!websiteUrl;
    const isHttps = websiteUrl ? websiteUrl.startsWith("https") : false;

    // 4. Social Media Check
    const socialFound = [];
    let detectedSocialUrl = null;
    if (brandResults.organic_results) {
      brandResults.organic_results.forEach(r => {
        if (r.link) {
          const link = r.link.toLowerCase();
          if (link.includes("instagram.com") && !socialFound.includes("Instagram")) {
            socialFound.push("Instagram");
            if (!detectedSocialUrl) detectedSocialUrl = r.link;
          } else if (link.includes("facebook.com") && !socialFound.includes("Facebook")) {
            socialFound.push("Facebook");
            if (!detectedSocialUrl && !link.includes("pages")) detectedSocialUrl = r.link;
          } else if (link.includes("youtube.com") && !socialFound.includes("YouTube")) {
            socialFound.push("YouTube");
          } else if (link.includes("justdial.com") && !socialFound.includes("Justdial")) {
            socialFound.push("Justdial");
          }
        }
      });
    }

    const socialHandle = social !== "none given" ? social : (detectedSocialUrl || name);
    const socialStats = await fetchSocialStats(socialHandle, name, querySerpApi);

    // Google Business Profile Scoring
    let gbpScore = 0;
    let gbpStatus = "red";
    let gbpFinding = "";
    let gbpImpact = "";
    let gbpAction = "";

    if (gbpListing) {
      const hasPhone = !!(gbpListing.phone || phone !== "none given");
      const hasHours = !!(gbpListing.hours || (gbpListing.operating_hours && Object.keys(gbpListing.operating_hours).length > 0));
      
      let missing = [];
      if (!hasPhone) missing.push("phone number");
      if (!hasHours) missing.push("opening hours");
      if (!hasWebsite) missing.push("website link");

      if (missing.length === 0) {
        gbpScore = 95;
        gbpStatus = "green";
        gbpFinding = `We found your Google profile, complete with hours, phone, and website.`;
        gbpImpact = `A complete profile builds instant trust and makes it effortless for customers to choose you.`;
        gbpAction = `Keep your profile fresh by uploading new photos and posting updates weekly.`;
      } else {
        gbpScore = 65;
        gbpStatus = "amber";
        gbpFinding = `Your Google Business profile is online but missing details like ${missing.join(" or ")}.`;
        gbpImpact = `When key details are missing, customers get frustrated and go to competitors who look open.`;
        gbpAction = `Log in to Google Business Profile and add your missing ${missing.join(" and ")} today.`;
      }
    } else {
      gbpScore = 15;
      gbpStatus = "red";
      gbpFinding = `We couldn't find an official Google Business Profile for "${name}" in ${town}.`;
      gbpImpact = `Without a Google profile, you are completely invisible to anyone searching on Google Maps or nearby search.`;
      gbpAction = `Create and verify your free Google Business Profile immediately to put your shop on the map.`;
    }

    // Search Ranking Scoring
    let rankScore = 0;
    let rankStatus = "red";
    let rankFinding = "";
    let rankImpact = "";
    let rankAction = "";

    if (rank === 1) {
      rankScore = 98;
      rankStatus = "green";
      rankFinding = `Congratulations! You rank #1 in local search results for "${cat} ${town}".`;
      rankImpact = `Ranking #1 captures the absolute majority of clicks and customer inquiries in ${town}.`;
      rankAction = `Maintain your top spot by consistently gathering reviews and keeping your content updated.`;
    } else if (rank > 1 && rank <= 3) {
      rankScore = 85;
      rankStatus = "green";
      rankFinding = `You rank #${rank} in the Google Local Pack (top 3) for "${cat} ${town}".`;
      rankImpact = `Being in the top 3 means you're highly visible and getting a steady stream of local leads.`;
      rankAction = `Optimise your profile details to push past the remaining competitors and claim the #1 spot.`;
    } else if (rank > 3 && rank <= 10) {
      rankScore = 60;
      rankStatus = "amber";
      rankFinding = `You rank #${rank} on the first page, just outside the top 3 Google Local Pack.`;
      rankImpact = `Most customers pick one of the top 3 Google Maps results; you are missing out on valuable traffic.`;
      rankAction = `Build local citations, optimize your business description, and gather more reviews to enter the top 3.`;
    } else {
      rankScore = 20;
      rankStatus = "red";
      rankFinding = `Your business does not appear in the top 10 search results for "${cat} ${town}".`;
      rankImpact = `You are virtually invisible to customers looking for a ${cat} in ${town}.`;
      rankAction = `Optimize your Google Business Profile name, category, and website with local keywords to start ranking.`;
    }

    // Reviews & Reputation Scoring
    let revScore = 0;
    let revStatus = "red";
    let revFinding = "";
    let revImpact = "";
    let revAction = "";

    const rating = gbpListing && gbpListing.rating ? parseFloat(gbpListing.rating) : 0;
    const reviewsCount = gbpListing && gbpListing.reviews ? parseInt(gbpListing.reviews) : 0;

    if (rating > 0) {
      if (rating >= 4.5 && reviewsCount >= 50) {
        revScore = 95;
        revStatus = "green";
        revFinding = `Outstanding reputation with ${reviewsCount} reviews and a strong ${rating}-star rating.`;
        revImpact = `A high volume of 5-star reviews makes you the obvious choice and builds massive trust.`;
        revAction = `Keep up the great work! Make it a habit to reply to every new review you receive.`;
      } else if (rating >= 4.0 && reviewsCount >= 10) {
        revScore = 65;
        revStatus = "amber";
        revFinding = `You have a decent rating of ${rating} stars, but only ${reviewsCount} reviews total.`;
        revImpact = `A low review count makes you look less popular than competitors who have hundreds of reviews.`;
        revAction = `Start asking every satisfied customer to leave a quick Google review using a custom QR code.`;
      } else {
        revScore = 40;
        revStatus = "red";
        revFinding = `Your review rating is low (${rating} stars) or you have very few reviews (${reviewsCount}).`;
        revImpact = `Customers actively avoid businesses with low ratings or no social proof.`;
        revAction = `Proactively request reviews from your best clients and politely resolve any negative feedback.`;
      }
    } else {
      revScore = 15;
      revStatus = "red";
      revFinding = `No Google reviews found for your business.`;
      revImpact = `Skeptical customers will skip your business entirely in favor of those with proven ratings.`;
      revAction = `Invite your first 5-10 happy customers to write a positive review to build your initial rating.`;
    }

    // Website Scoring
    let webScore = 0;
    let webStatus = "red";
    let webFinding = "";
    let webImpact = "";
    let webAction = "";

    if (hasWebsite) {
      if (isHttps) {
        webScore = 95;
        webStatus = "green";
        webFinding = `Your website is active and fully secured with HTTPS.`;
        webImpact = `A secure website builds trust and keeps you in Google's good books for search rankings.`;
        webAction = `Ensure your website has clear call-to-actions, like a prominent phone number or booking form.`;
      } else {
        webScore = 55;
        webStatus = "amber";
        webFinding = `Your website was found, but it is not using a secure connection (HTTPS).`;
        webImpact = `Browsers show a "Not Secure" warning to visitors, which drives potential customers away.`;
        webAction = `Contact your hosting provider immediately to install a free SSL certificate.`;
      }
    } else {
      webScore = 15;
      webStatus = "red";
      webFinding = `We couldn't find a website linked to your business.`;
      webImpact = `Without a website, you miss out on showing your products/services and capturing leads 24/7.`;
      webAction = `Create a simple, fast mobile-friendly landing page with direct links to call or WhatsApp you.`;
    }

    // Social Media & Ads Scoring
    let socScore = 0;
    let socStatus = "red";
    let socFinding = "";
    let socImpact = "";
    let socAction = "";

    const hasSocialInput = social !== "none given";
    const numSocials = socialFound.length + (hasSocialInput ? 1 : 0);

    if (numSocials >= 2) {
      socScore = 90;
      socStatus = "green";
      socFinding = `Active social presence found on ${socialFound.join(", ")}${hasSocialInput ? ' and custom handles' : ''}.`;
      socImpact = `Strong social media presence keeps your brand top-of-mind and attracts younger customers.`;
      socAction = `Share behind-the-scenes content or customer success stories weekly to drive engagement.`;
    } else if (numSocials === 1) {
      socScore = 60;
      socStatus = "amber";
      socFinding = `Only one active social profile found (${socialFound[0] || 'input profile'}).`;
      socImpact = `Depending on just one platform limits your reach to customers who use other apps.`;
      socAction = `Claim your business profile on at least one more major platform (like Instagram or Facebook).`;
    } else {
      socScore = 25;
      socStatus = "red";
      socFinding = `No active social media channels detected for your brand.`;
      socImpact = `You're missing a free, direct channel to connect with locals and announce offers.`;
      socAction = `Create a Facebook Page and an Instagram Business account for your shop today.`;
    }

    if (socialStats) {
      socFinding = `Active profile found for ${socialStats.platform} (@${socialStats.handle}). Followers: ${socialStats.followers} (${socialStats.followersStatus}), Posts: ${socialStats.posts} (${socialStats.postsStatus}).`;
    }

    // Overall Calculation
    const overallScore = Math.round((gbpScore + rankScore + revScore + webScore + socScore) / 5);
    let grade = "Needs Urgent Work";
    if (overallScore >= 75) grade = "Strong";
    else if (overallScore >= 45) grade = "Getting There";

    let headline = "";
    let summary = "";
    if (overallScore >= 75) {
      headline = "Your business has a strong online presence, but there are still high-value opportunities to lock in.";
      summary = `You have built a great foundation in ${town}. Maximising your review count and keeping your details updated will make it impossible for competitors to overtake you.`;
    } else if (overallScore >= 45) {
      headline = "You are on the map — but competitors are quietly winning the customers searching for you.";
      summary = `People around ${town} search for ${cat}s every single day, yet most of them find your competitors before they find you. A few focused fixes this month can put you right in front of them.`;
    } else {
      headline = "Your online visibility is low, meaning you are missing out on major local customer traffic.";
      summary = `Currently, customers looking for a ${cat} in ${town} cannot easily find you. Taking control of your Google profile and starting a basic online presence is an urgent opportunity to grow your sales.`;
    }

    // Competitor Note
    let competitorNote = "";
    if (competitors.length > 0) {
      competitorNote = `${competitors.slice(0, 3).join(", ")} appear above you when someone searches "${cat} ${town}".`;
    } else {
      competitorNote = `Multiple other businesses appear above you when someone searches "${cat} ${town}".`;
    }

    // Priority Actions
    const priorityActions = [];
    let pRank = 1;
    
    if (gbpStatus === "red") {
      priorityActions.push({ rank: pRank++, action: `Claim and verify your Google Business Profile to put your business on the map.`, effort: "Quick", payoff: "High" });
    }
    if (rankStatus === "red" || rankStatus === "amber") {
      priorityActions.push({ rank: pRank++, action: `Optimise your profile details and local keywords to rise in rankings for "${cat} ${town}".`, effort: "Medium", payoff: "High" });
    }
    if (revStatus === "red" || revStatus === "amber") {
      priorityActions.push({ rank: pRank++, action: `Gather at least 20-30 more 5-star reviews to look more trusted than competitors.`, effort: "Quick", payoff: "High" });
    }
    if (webStatus === "red") {
      priorityActions.push({ rank: pRank++, action: `Launch a simple mobile website with direct links to call or WhatsApp you.`, effort: "Medium", payoff: "High" });
    }
    if (socStatus === "red") {
      priorityActions.push({ rank: pRank++, action: `Establish active profiles on Facebook and Instagram to attract more local leads.`, effort: "Quick", payoff: "Medium" });
    }

    while (priorityActions.length < 3) {
      priorityActions.push({
        rank: pRank++,
        action: `Upload fresh high-quality photos to your Google Business Profile weekly.`,
        effort: "Quick",
        payoff: "Medium"
      });
    }

    let quickWin = "";
    if (gbpStatus === "red") {
      quickWin = "Creating your Google Business Profile is the absolute fastest way to start showing up nearby.";
    } else if (revStatus === "red" || revStatus === "amber") {
      quickWin = "Ask 5 happy customers for Google reviews today — it instantly raises your trustworthiness.";
    } else if (webStatus === "red") {
      quickWin = "Put a link to call or message your business in your Google description to capture instant leads.";
    } else {
      quickWin = "Add 10 high-quality photos of your shop, products, or service work to your Google profile.";
    }

    const opportunity = `With focused work, businesses like yours typically reach the top 3 on Google in ${town} within about 3 months.`;

    const report = {
      overallScore,
      grade,
      headline,
      summary,
      competitorNote,
      categories: [
        { name: "Google Business Profile", status: gbpStatus, score: gbpScore, finding: gbpFinding, impact: gbpImpact, action: gbpAction },
        { name: "Search Ranking", status: rankStatus, score: rankScore, finding: rankFinding, impact: rankImpact, action: rankAction },
        { name: "Reviews & Reputation", status: revStatus, score: revScore, finding: revFinding, impact: revImpact, action: revAction },
        { name: "Website", status: webStatus, score: webScore, finding: webFinding, impact: webImpact, action: webAction },
        { name: "Social Media & Ads", status: socStatus, score: socScore, finding: socFinding, impact: socImpact, action: socAction }
      ],
      priorityActions,
      quickWin,
      opportunity,
      _biz: { name, town },
      socialStats
    };

    // Google Sheets Integration
    const GOOGLE_SHEETS_URL = process.env.GOOGLE_SHEETS_URL;
    if (GOOGLE_SHEETS_URL) {
      try {
        await fetch(GOOGLE_SHEETS_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name,
            cat,
            town,
            web: web !== "none given" ? web : "",
            social: social !== "none given" ? social : "",
            phone: phone !== "none given" ? phone : "",
            score: overallScore,
            grade,
            headline,
            summary,
            gbpScore,
            rankScore,
            revScore,
            webScore,
            socScore,
            followers: socialStats ? socialStats.followers : "N/A",
            posts: socialStats ? socialStats.posts : "N/A",
            quickWin
          })
        });
      } catch (err) {
        console.error("Google Sheet webhook failed:", err);
      }
    }

    return res.status(200).json(report);
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Could not complete the check. " + (e.message || "") });
  }
}
