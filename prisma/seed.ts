import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const categories = [
  // Income
  { name: "Salary/Wages", icon: "💰", colour: "#10B981", parentName: null, group: "Income", sortOrder: 1 },
  { name: "Government Benefits", icon: "🏛️", colour: "#10B981", parentName: null, group: "Income", sortOrder: 2 },
  { name: "Other Income", icon: "💵", colour: "#10B981", parentName: null, group: "Income", sortOrder: 3 },

  // Essential Spending
  { name: "Groceries", icon: "🛒", colour: "#3B82F6", parentName: null, group: "Essential", sortOrder: 10 },
  { name: "Rent/Mortgage", icon: "🏠", colour: "#8B5CF6", parentName: null, group: "Essential", sortOrder: 11 },
  { name: "Utilities", icon: "💡", colour: "#F59E0B", parentName: null, group: "Essential", sortOrder: 12 },
  { name: "Insurance", icon: "🛡️", colour: "#6366F1", parentName: null, group: "Essential", sortOrder: 13 },
  { name: "Health/Medical", icon: "🏥", colour: "#EC4899", parentName: null, group: "Essential", sortOrder: 14 },
  { name: "Transport/Fuel", icon: "⛽", colour: "#F97316", parentName: null, group: "Essential", sortOrder: 15 },
  { name: "Phone/Internet", icon: "📱", colour: "#14B8A6", parentName: null, group: "Essential", sortOrder: 16 },
  { name: "Childcare/Education", icon: "📚", colour: "#A855F7", parentName: null, group: "Essential", sortOrder: 17 },

  // Discretionary Spending
  { name: "Dining Out/Takeaway", icon: "🍔", colour: "#EF4444", parentName: null, group: "Discretionary", sortOrder: 20 },
  { name: "Entertainment/Streaming", icon: "🎬", colour: "#8B5CF6", parentName: null, group: "Discretionary", sortOrder: 21 },
  { name: "Shopping/Clothing", icon: "🛍️", colour: "#EC4899", parentName: null, group: "Discretionary", sortOrder: 22 },
  { name: "Hobbies", icon: "🎮", colour: "#14B8A6", parentName: null, group: "Discretionary", sortOrder: 23 },
  { name: "Personal Care", icon: "💇", colour: "#F472B6", parentName: null, group: "Discretionary", sortOrder: 24 },
  { name: "Gifts", icon: "🎁", colour: "#FB923C", parentName: null, group: "Discretionary", sortOrder: 25 },

  // Financial
  { name: "Savings Transfer", icon: "🏦", colour: "#6B7280", parentName: null, group: "Financial", sortOrder: 30 },
  { name: "Loan Repayment", icon: "🏠", colour: "#6B7280", parentName: null, group: "Financial", sortOrder: 31 },
  { name: "Personal Loan Repayment", icon: "📋", colour: "#6B7280", parentName: null, group: "Financial", sortOrder: 32 },
  { name: "Investment", icon: "📈", colour: "#10B981", parentName: null, group: "Financial", sortOrder: 33 },
  { name: "Fees/Charges", icon: "💳", colour: "#EF4444", parentName: null, group: "Financial", sortOrder: 34 },

  // Other
  { name: "Uncategorised", icon: "❓", colour: "#6B7280", parentName: null, group: "Other", sortOrder: 99 },
];

async function main() {
  console.log("Seeding database...");

  // Create categories
  for (const cat of categories) {
    await prisma.category.upsert({
      where: { name: cat.name },
      update: {
        icon: cat.icon,
        colour: cat.colour,
        sortOrder: cat.sortOrder,
        isSystem: true,
      },
      create: {
        name: cat.name,
        icon: cat.icon,
        colour: cat.colour,
        sortOrder: cat.sortOrder,
        isSystem: true,
      },
    });
  }
  console.log(`Seeded ${categories.length} categories`);

  // Create default admin user
  const passwordHash = await bcrypt.hash("admin123", 12);
  await prisma.user.upsert({
    where: { email: "admin@family.local" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@family.local",
      passwordHash,
      role: "admin",
    },
  });
  console.log("Seeded admin user (admin@family.local / admin123)");

  console.log("Seeding complete!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
