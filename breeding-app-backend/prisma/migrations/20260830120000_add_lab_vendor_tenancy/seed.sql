-- Pre-migration state for verify.sql: one vendor laboratory, the global catalog
-- and pricing it sold against, and an order placed through it. Deliberately the
-- shape every current deployment is actually in.
INSERT INTO "User" ("id", "email", "fullName", "role", "passwordHash", "isActive", "createdAt", "updatedAt")
VALUES
  ('user_seed_lab', 'lab@seed.test', 'Seed Lab Owner', 'lab', 'x', true, NOW(), NOW()),
  ('user_seed_breeder', 'breeder@seed.test', 'Seed Breeder', 'breeder', 'x', true, NOW(), NOW());

INSERT INTO "organizations" ("id", "name", "kind", "status", "created_at", "updated_at")
VALUES ('org_seed_lab', 'Seed Laboratory', 'lab_vendor', 'active', NOW(), NOW());

INSERT INTO "memberships" ("id", "user_id", "organization_id", "role", "created_at", "updated_at")
VALUES ('mbr_seed_lab', 'user_seed_lab', 'org_seed_lab', 'owner', NOW(), NOW());

INSERT INTO "LabAccount" (
  "id", "userId", "organization_id", "labName", "status",
  "permissionsJson", "availableTestsJson", "pricingJson", "createdAt", "updatedAt"
) VALUES (
  'lab_seed', 'user_seed_lab', 'org_seed_lab', 'Seed Laboratory', 'approved',
  '{}', '[]', '{}', NOW(), NOW()
);

INSERT INTO "ShedTestCatalog" (
  "id", "name", "category", "pricingType", "priceCents", "currency",
  "active", "visibleInBreederApp", "sortOrder", "createdAt", "updatedAt"
) VALUES
  ('morph_albino', 'Albino', 'morph', 'morph', 4500, 'EUR', true, true, 1, NOW(), NOW()),
  ('sex_determination', 'Sex Determination', 'sex-determination', 'sex', 2500, 'EUR', true, true, 2, NOW(), NOW());

INSERT INTO "PricingConfig" (
  "id", "currency",
  "morphTier1to9FirstTest", "morphTier1to9AdditionalTest",
  "morphTier10to49FirstTest", "morphTier10to49AdditionalTest",
  "morphTier50PlusFirstTest", "morphTier50PlusAdditionalTest",
  "sexTier1to9", "sexTier10to49", "sexTier50Plus",
  "isActive", "createdAt", "updatedAt"
) VALUES (
  'pricing_global', 'EUR', 45, 30, 40, 25, 35, 20, 25, 20, 15, true, NOW(), NOW()
);

INSERT INTO "ShedTestOrder" (
  "id", "orderNumber", "breederId", "totalAnimals", "pricingTier",
  "totalPrice", "currency", "priceSnapshotJson", "status", "paymentStatus",
  "createdAt", "updatedAt"
) VALUES (
  'order_seed', '01AA00001', 'user_seed_breeder', 1, 'tier_1_9',
  70.00, 'EUR', '{}', 'completed', 'paid', NOW(), NOW()
);

INSERT INTO "ShedTestOrderAnimal" (
  "id", "orderId", "animalId", "animalName",
  "morphBaseCost", "additionalMorphCost", "sexCost", "total", "createdAt", "updatedAt"
) VALUES (
  'order_animal_seed', 'order_seed', 'snake-1', 'Athena', 45.00, 0.00, 25.00, 70.00, NOW(), NOW()
);

INSERT INTO "ShedTestOrderAnimalTest" (
  "id", "orderAnimalId", "testId", "testNameSnapshot", "pricingTypeSnapshot", "priceApplied", "createdAt"
) VALUES
  ('line_seed_1', 'order_animal_seed', 'morph_albino', 'Albino', 'morph', 45.00, NOW()),
  ('line_seed_2', 'order_animal_seed', 'sex_determination', 'Sex Determination', 'sex', 25.00, NOW());
