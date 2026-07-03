import "dotenv/config";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = "admin@breedingplanner.dev";
  const password = "admin1234";
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { fullName: "BreedingPlanner Admin", role: "admin", isActive: true, passwordHash },
    create: { email, fullName: "BreedingPlanner Admin", role: "admin", isActive: true, passwordHash },
  });

  console.log(`Admin user ready: ${user.email} (id: ${user.id}, role: ${user.role})`);
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
