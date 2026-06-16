// Run in Railway console: node seedBreeder.js
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

// ── Feature catalog ─────────────────────────────────────────────────────────
const FEATURE_CATALOG = [
  // Animals
  { key:"animals.view",            name:"View Animals",               group:"animals",    sort:1 },
  { key:"animals.create",          name:"Add Animals",                group:"animals",    sort:2 },
  { key:"animals.edit",            name:"Edit Animals",               group:"animals",    sort:3 },
  { key:"animals.delete",          name:"Delete Animals",             group:"animals",    sort:4 },
  { key:"animals.photos",          name:"Animal Photos",              group:"animals",    sort:5 },
  { key:"animals.documents",       name:"Animal Documents",           group:"animals",    sort:6 },
  { key:"animals.notes",           name:"Animal Notes",               group:"animals",    sort:7 },
  { key:"animals.health_logs",     name:"Health Logs",                group:"animals",    sort:8 },
  { key:"animals.feeding_logs",    name:"Feeding Logs",               group:"animals",    sort:9 },
  { key:"animals.weight_logs",     name:"Weight Logs",                group:"animals",    sort:10 },
  { key:"animals.shedding_logs",   name:"Shedding Logs",              group:"animals",    sort:11 },
  // Breeding
  { key:"breeding.pairings",                  name:"Pairings",                    group:"breeding", sort:1 },
  { key:"breeding.lock_tracking",             name:"Lock Tracking",               group:"breeding", sort:2 },
  { key:"breeding.ovulation_tracking",        name:"Ovulation Tracking",          group:"breeding", sort:3 },
  { key:"breeding.egg_tracking",              name:"Egg Tracking",                group:"breeding", sort:4 },
  { key:"breeding.clutches",                  name:"Clutches",                    group:"breeding", sort:5 },
  { key:"breeding.hatchlings",                name:"Hatchlings",                  group:"breeding", sort:6 },
  { key:"breeding.calendar",                  name:"Breeding Calendar",           group:"breeding", sort:7 },
  { key:"breeding.multi_generation_planner",  name:"Multi-Gen Planner",           group:"breeding", sort:8 },
  { key:"breeding.advisor",                   name:"Breeding Advisor",            group:"breeding", sort:9 },
  { key:"breeding.pairing_recommendations",   name:"Pairing Recommendations",     group:"breeding", sort:10 },
  // Genetics
  { key:"genetics.basic_calculator",          name:"Basic Genetics Calculator",   group:"genetics", sort:1 },
  { key:"genetics.advanced_calculator",       name:"Advanced Calculator",         group:"genetics", sort:2 },
  { key:"genetics.het_probability",           name:"Het Probability",             group:"genetics", sort:3 },
  { key:"genetics.bel_helper",                name:"BEL Helper",                  group:"genetics", sort:4 },
  { key:"genetics.multi_generation_planner",  name:"Multi-Gen Genetics Planner",  group:"genetics", sort:5 },
  { key:"genetics.aliases",                   name:"Morph Aliases",               group:"genetics", sort:6 },
  { key:"genetics.morph_id",                  name:"Morph ID",                    group:"genetics", sort:7 },
  { key:"genetics.visual_comparison",         name:"Visual Comparison",           group:"genetics", sort:8 },
  // Spaces
  { key:"spaces.rooms",            name:"Rooms",                      group:"spaces",     sort:1 },
  { key:"spaces.racks",            name:"Racks",                      group:"spaces",     sort:2 },
  { key:"spaces.terrariums",       name:"Terrariums",                 group:"spaces",     sort:3 },
  { key:"spaces.tub_visualizer",   name:"Tub Visualizer",             group:"spaces",     sort:4 },
  { key:"spaces.rack_occupancy",   name:"Rack Occupancy",             group:"spaces",     sort:5 },
  { key:"spaces.cleaning_schedules",name:"Cleaning Schedules",        group:"spaces",     sort:6 },
  { key:"spaces.water_schedules",  name:"Water Schedules",            group:"spaces",     sort:7 },
  { key:"spaces.capacity_planner", name:"Capacity Planner",           group:"spaces",     sort:8 },
  // QR / Labels
  { key:"qr.generate",             name:"Generate QR Codes",          group:"qr",         sort:1 },
  { key:"qr.pdf_export",           name:"PDF QR Export",              group:"qr",         sort:2 },
  { key:"qr.custom_labels",        name:"Custom Labels",              group:"qr",         sort:3 },
  { key:"qr.batch_export",         name:"Batch Export",               group:"qr",         sort:4 },
  { key:"qr.shed_label_packs",     name:"Shed Label Packs",           group:"qr",         sort:5 },
  { key:"qr.shipping_labels",      name:"Shipping Labels",            group:"qr",         sort:6 },
  { key:"qr.rack_labels",          name:"Rack Labels",                group:"qr",         sort:7 },
  { key:"qr.tub_labels",           name:"Tub Labels",                 group:"qr",         sort:8 },
  // Communication
  { key:"communication.telegram",             name:"Telegram Integration",        group:"communication", sort:1 },
  { key:"communication.telegram_updates",     name:"Telegram Updates",            group:"communication", sort:2 },
  { key:"communication.telegram_confirmation",name:"Telegram Confirmations",      group:"communication", sort:3 },
  { key:"communication.inbox",                name:"Inbox",                       group:"communication", sort:4 },
  { key:"communication.command_rules",        name:"Command Rules",               group:"communication", sort:5 },
  { key:"communication.activity_log",         name:"Activity Log",                group:"communication", sort:6 },
  { key:"communication.ai_parser",            name:"AI Command Parser",           group:"communication", sort:7 },
  // Lab
  { key:"lab.orders",              name:"Lab Orders",                 group:"lab",        sort:1 },
  { key:"lab.labels",              name:"Lab Labels",                 group:"lab",        sort:2 },
  { key:"lab.status_tracking",     name:"Order Status Tracking",      group:"lab",        sort:3 },
  { key:"lab.results",             name:"View Test Results",          group:"lab",        sort:4 },
  { key:"lab.auto_update_genetics",name:"Auto-Update Genetics",       group:"lab",        sort:5 },
  { key:"lab.portal",              name:"Lab Portal Access",          group:"lab",        sort:6 },
  { key:"lab.catalog",             name:"Lab Catalog Management",     group:"lab",        sort:7 },
  { key:"lab.certificates",        name:"Test Certificates",          group:"lab",        sort:8 },
  // Sales
  { key:"sales.for_sale",          name:"Mark Animals For Sale",      group:"sales",      sort:1 },
  { key:"sales.price_animals",     name:"Price Animals",              group:"sales",      sort:2 },
  { key:"sales.reservations",      name:"Reservations",               group:"sales",      sort:3 },
  { key:"sales.buyer_records",     name:"Buyer Records",              group:"sales",      sort:4 },
  { key:"sales.history",           name:"Sales History",              group:"sales",      sort:5 },
  { key:"sales.certificates",      name:"Sales Certificates",         group:"sales",      sort:6 },
  { key:"sales.invoice_export",    name:"Invoice Export",             group:"sales",      sort:7 },
  { key:"sales.morphmarket_export",name:"MorphMarket Export",         group:"sales",      sort:8 },
  { key:"sales.public_catalog",    name:"Public Sales Catalog",       group:"sales",      sort:9 },
  // Marketplace
  { key:"marketplace.view",               name:"Browse Marketplace",         group:"marketplace", sort:1 },
  { key:"marketplace.favorite",           name:"Favorite Listings",          group:"marketplace", sort:2 },
  { key:"marketplace.contact_seller",     name:"Contact Sellers",            group:"marketplace", sort:3 },
  { key:"marketplace.create_listing",     name:"Create Listings",            group:"marketplace", sort:4 },
  { key:"marketplace.edit_listing",       name:"Edit Listings",              group:"marketplace", sort:5 },
  { key:"marketplace.store_page",         name:"Store Page",                 group:"marketplace", sort:6 },
  { key:"marketplace.featured_listing",   name:"Featured Listings",          group:"marketplace", sort:7 },
  { key:"marketplace.sales_flow",         name:"Sales Flow",                 group:"marketplace", sort:8 },
  { key:"marketplace.reviews",            name:"Marketplace Reviews",        group:"marketplace", sort:9 },
  { key:"marketplace.analytics",          name:"Marketplace Analytics",      group:"marketplace", sort:10 },
  // Mobile
  { key:"mobile.scan",             name:"Scan QR",                    group:"mobile",     sort:1 },
  { key:"mobile.profile",          name:"Mobile Profile",             group:"mobile",     sort:2 },
  { key:"mobile.quick_feed",       name:"Quick Feed",                 group:"mobile",     sort:3 },
  { key:"mobile.quick_weight",     name:"Quick Weight",               group:"mobile",     sort:4 },
  { key:"mobile.quick_shed",       name:"Quick Shed",                 group:"mobile",     sort:5 },
  { key:"mobile.quick_clean",      name:"Quick Clean",                group:"mobile",     sort:6 },
  { key:"mobile.quick_water",      name:"Quick Water",                group:"mobile",     sort:7 },
  { key:"mobile.notes",            name:"Mobile Notes",               group:"mobile",     sort:8 },
  { key:"mobile.photos",           name:"Mobile Photos",              group:"mobile",     sort:9 },
  { key:"mobile.tasks",            name:"Mobile Tasks",               group:"mobile",     sort:10 },
  { key:"mobile.rack_mode",        name:"Rack Mode",                  group:"mobile",     sort:11 },
  { key:"mobile.communication",    name:"Mobile Communication",       group:"mobile",     sort:12 },
  { key:"mobile.lab",              name:"Mobile Lab",                 group:"mobile",     sort:13 },
  { key:"mobile.sales",            name:"Mobile Sales",               group:"mobile",     sort:14 },
  { key:"mobile.offline_sync",     name:"Offline Sync",               group:"mobile",     sort:15 },
  { key:"mobile.team_workflow",    name:"Team Workflow",              group:"mobile",     sort:16 },
  // AI
  { key:"ai.breeding_advisor",     name:"AI Breeding Advisor",        group:"ai",         sort:1 },
  { key:"ai.animal_search",        name:"AI Animal Search",           group:"ai",         sort:2 },
  { key:"ai.command_parser",       name:"AI Command Parser",          group:"ai",         sort:3 },
  { key:"ai.reports",              name:"AI Reports",                 group:"ai",         sort:4 },
  { key:"ai.health_summary",       name:"AI Health Summary",          group:"ai",         sort:5 },
  { key:"ai.sales_writer",         name:"AI Sales Writer",            group:"ai",         sort:6 },
  { key:"ai.social_writer",        name:"AI Social Writer",           group:"ai",         sort:7 },
  // Team
  { key:"team.members",            name:"Team Members",               group:"team",       sort:1 },
  { key:"team.role_permissions",   name:"Role Permissions",           group:"team",       sort:2 },
  // Admin
  { key:"admin.users",             name:"Admin: Users",               group:"admin",      sort:1 },
  { key:"admin.tiers",             name:"Admin: Tiers",               group:"admin",      sort:2 },
  { key:"admin.payments",          name:"Admin: Payments",            group:"admin",      sort:3 },
  { key:"admin.overrides",         name:"Admin: Overrides",           group:"admin",      sort:4 },
  { key:"admin.activity_log",      name:"Admin: Activity Log",        group:"admin",      sort:5 },
  // Data
  { key:"data.csv_export",         name:"CSV Export",                 group:"data",       sort:1 },
  { key:"data.pdf_export",         name:"PDF Export",                 group:"data",       sort:2 },
  { key:"data.backup",             name:"Data Backup",                group:"data",       sort:3 },
  { key:"data.restore",            name:"Data Restore",               group:"data",       sort:4 },
  { key:"data.api_access",         name:"API Access",                 group:"data",       sort:5 },
  { key:"data.webhooks",           name:"Webhooks",                   group:"data",       sort:6 },
  { key:"data.integrations",       name:"Integrations",               group:"data",       sort:7 },
];

const ALL_KEYS = FEATURE_CATALOG.map(f => f.key);

// ── Tier definitions ─────────────────────────────────────────────────────────
const basicAnimal = ["animals.view","animals.create","animals.edit","animals.notes","animals.feeding_logs","animals.weight_logs","animals.shedding_logs","animals.health_logs","animals.photos"];
const breedingBasic = ["breeding.pairings","breeding.clutches","breeding.hatchlings","breeding.calendar","breeding.lock_tracking","breeding.ovulation_tracking","breeding.egg_tracking"];
const geneticsBasic = ["genetics.basic_calculator","genetics.het_probability","genetics.bel_helper","genetics.aliases"];
const qrBasic = ["qr.generate","qr.pdf_export","qr.custom_labels"];
const spaces = ["spaces.rooms","spaces.racks","spaces.terrariums","spaces.tub_visualizer","spaces.rack_occupancy"];
const mobileBasic = ["mobile.scan","mobile.profile","mobile.quick_feed","mobile.quick_weight","mobile.quick_shed","mobile.notes"];
const mobileHobbyPlus = [...mobileBasic,"mobile.quick_clean","mobile.quick_water","mobile.tasks","mobile.rack_mode","mobile.communication","mobile.offline_sync"];
const dataBasic = ["data.csv_export","data.pdf_export","data.backup"];
const allNonAdmin = ALL_KEYS.filter(k => !k.startsWith("admin."));
const labFeatures = [...ALL_KEYS.filter(k => k.startsWith("lab.")),"data.csv_export","data.pdf_export","team.members","mobile.scan","mobile.lab","mobile.offline_sync"];

const TIERS = [
  { key:"free", name:"Free", desc:"Basic records for small collections.", monthly:0, yearly:0, trial:0, sort:1,
    features:[...basicAnimal.filter(k=>k!=="animals.delete"&&k!=="animals.documents"),...mobileBasic,"marketplace.view","marketplace.favorite"],
    limits:{"animals.create":20} },
  { key:"hobby", name:"Hobby", desc:"Animal management, basic breeding, basic genetics, and QR export.", monthly:9, yearly:90, trial:14, sort:2,
    features:[...basicAnimal,...breedingBasic,...geneticsBasic,...qrBasic,...mobileBasic,...dataBasic,"marketplace.view","marketplace.favorite","marketplace.contact_seller","marketplace.create_listing","marketplace.edit_listing"],
    limits:{"animals.create":100,"qr.pdf_export":25,"marketplace.create_listing":5} },
  { key:"hobby_plus", name:"Hobby Plus", desc:"More capacity, spaces, communication basics, and limited AI.", monthly:15, yearly:150, trial:14, sort:3,
    features:[...basicAnimal,...breedingBasic,...geneticsBasic,...qrBasic,...spaces,...mobileHobbyPlus,"communication.inbox","communication.activity_log","ai.breeding_advisor",...dataBasic,"marketplace.view","marketplace.favorite","marketplace.contact_seller","marketplace.create_listing","marketplace.edit_listing","marketplace.store_page"],
    limits:{"animals.create":250,"qr.pdf_export":100,"ai.breeding_advisor":25,"marketplace.create_listing":15} },
  { key:"breeder", name:"Breeder", desc:"Advanced breeding, full genetics, Telegram, shed testing, and sales tools.", monthly:29, yearly:290, trial:14, sort:4, recommended:true,
    features:allNonAdmin.filter(k=>k!=="data.api_access"&&k!=="data.webhooks"),
    limits:{"animals.create":500,"qr.pdf_export":500,"communication.telegram_updates":500,"ai.breeding_advisor":100,"lab.orders":50,"sales.morphmarket_export":50,"marketplace.create_listing":50} },
  { key:"professional_breeder", name:"Professional Breeder", desc:"Full app access, AI advisor, MorphMarket export, teams, and priority support.", monthly:59, yearly:590, trial:14, sort:5,
    features:allNonAdmin, limits:{} },
  { key:"lab_partner", name:"Lab / Testing Partner", desc:"Lab portal, catalog management, order scanning, result upload, and certificates.", monthly:99, yearly:990, trial:30, sort:6,
    features:labFeatures,
    limits:{"lab.orders":1000,"team.members":10} },
  { key:"enterprise", name:"Enterprise / Custom", desc:"Custom features, team access, API access, white label options, and direct support.", monthly:0, yearly:0, trial:0, sort:7,
    features:ALL_KEYS, limits:{} },
];

// Pre-computed bcrypt hash of "demo1234" (cost 10)
const DEMO_HASH = "$2b$10$K7L4OJ5xsAq1a3b6Y2uJOeHLrWpMn8vYtXAGBZ0VqT5bJe6Zs7Yya";

async function main() {
  // 1. Seed FeatureCatalog (required by TierFeature FK)
  for (const f of FEATURE_CATALOG) {
    await prisma.featureCatalog.upsert({
      where: { featureKey: f.key },
      update: { featureName: f.name, featureGroup: f.group, sortOrder: f.sort },
      create: { featureKey: f.key, featureName: f.name, featureGroup: f.group, sortOrder: f.sort },
    });
  }
  console.log(`FeatureCatalog: ${FEATURE_CATALOG.length} entries`);

  // 2. Upsert users
  const [adminUser, breederUser, labUser] = await Promise.all([
    prisma.user.upsert({
      where: { email: "admin@proherper.dev" },
      update: {},
      create: { email:"admin@proherper.dev", fullName:"ProHerper Admin", passwordHash:DEMO_HASH, role:"admin", emailVerified:true, subscriptionPlan:"enterprise", subscriptionStatus:"active", subscriptionPaymentStatus:"paid" },
    }),
    prisma.user.upsert({
      where: { email: "breeder@proherper.dev" },
      update: {},
      create: { email:"breeder@proherper.dev", fullName:"Demo Breeder", passwordHash:DEMO_HASH, role:"breeder", emailVerified:true, subscriptionPlan:"breeder", subscriptionStatus:"active", subscriptionPaymentStatus:"paid", subscriptionStartedAt:new Date("2026-01-01"), subscriptionRenewalAt:new Date("2027-01-01") },
    }),
    prisma.user.upsert({
      where: { email: "lab@proherper.dev" },
      update: {},
      create: { email:"lab@proherper.dev", fullName:"ProHerper Lab", passwordHash:DEMO_HASH, role:"lab", emailVerified:true, subscriptionPlan:"lab_partner", subscriptionStatus:"active", subscriptionPaymentStatus:"paid" },
    }),
  ]);
  console.log("Users: admin@, breeder@, lab@ proherper.dev");

  // 3. Seed tiers + tier features
  for (const tier of TIERS) {
    const saved = await prisma.subscriptionTier.upsert({
      where: { key: tier.key },
      update: { name:tier.name, shortDescription:tier.desc, longDescription:tier.desc, monthlyPrice:tier.monthly, yearlyPrice:tier.yearly, trialDays:tier.trial, isActive:true, isRecommended:!!tier.recommended, sortOrder:tier.sort },
      create: { key:tier.key, name:tier.name, shortDescription:tier.desc, longDescription:tier.desc, monthlyPrice:tier.monthly, yearlyPrice:tier.yearly, trialDays:tier.trial, isActive:true, isPublic:true, isRecommended:!!tier.recommended, sortOrder:tier.sort },
    });
    for (const fk of ALL_KEYS) {
      await prisma.tierFeature.upsert({
        where: { tierId_featureKey: { tierId: saved.id, featureKey: fk } },
        update: { enabled: tier.features.includes(fk), limitValue: tier.limits[fk] ?? null },
        create: { tierId: saved.id, featureKey: fk, enabled: tier.features.includes(fk), limitValue: tier.limits[fk] ?? null },
      });
    }
    console.log(`Tier: ${tier.name} (${tier.features.length}/${ALL_KEYS.length} features enabled)`);
  }

  // 4. Assign subscriptions
  const tierAssignments = [
    { user: adminUser, tierKey: "enterprise" },
    { user: breederUser, tierKey: "breeder" },
    { user: labUser, tierKey: "lab_partner" },
  ];
  for (const { user, tierKey } of tierAssignments) {
    const tier = await prisma.subscriptionTier.findUnique({ where: { key: tierKey } });
    if (!tier) continue;
    const existing = await prisma.userSubscription.findFirst({ where: { userId: user.id, tierId: tier.id } });
    if (!existing) {
      await prisma.userSubscription.create({
        data: { userId:user.id, tierId:tier.id, status:"active", paymentStatus:"paid", startedAt:new Date("2026-01-01"), renewsAt:new Date("2027-01-01"), paymentProvider:"manual", internalNote:"Seeded demo." },
      });
    }
    console.log(`Subscription: ${user.email} → ${tier.name}`);
  }

  console.log("\n✓ Done. Demo credentials (all passwords: demo1234):");
  console.log("  breeder@proherper.dev  – Breeder tier (500 animals, full features)");
  console.log("  lab@proherper.dev      – Lab Partner tier");
  console.log("  admin@proherper.dev    – Enterprise (all features)");
}

main().catch(console.error).finally(() => prisma.$disconnect());
