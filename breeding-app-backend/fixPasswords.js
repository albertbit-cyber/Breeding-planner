const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const hash = await bcrypt.hash("demo1234", 12);
  const result = await prisma.user.updateMany({
    where: { email: { in: ["admin@proherper.dev", "breeder@proherper.dev", "lab@proherper.dev"] } },
    data: { passwordHash: hash },
  });
  console.log("Updated", result.count, "users with correct bcrypt hash (cost 12).");
  console.log("Hash:", hash);
}
main().catch(console.error).finally(() => prisma.$disconnect());
