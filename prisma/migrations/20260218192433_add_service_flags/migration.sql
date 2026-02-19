-- AlterTable
ALTER TABLE "Document" ADD COLUMN "translatedText" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "totalAmount" REAL NOT NULL,
    "requiresNotarization" BOOLEAN NOT NULL DEFAULT false,
    "requiresHardCopy" BOOLEAN NOT NULL DEFAULT false,
    "urgency" TEXT NOT NULL DEFAULT 'normal',
    "uspsTracking" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentProvider" TEXT NOT NULL DEFAULT 'STRIPE',
    "deliveryUrl" TEXT,
    "metadata" TEXT,
    "paymentMethod" TEXT,
    "hasTranslation" BOOLEAN NOT NULL DEFAULT true,
    "hasNotary" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("createdAt", "deliveryUrl", "id", "metadata", "paymentProvider", "requiresHardCopy", "requiresNotarization", "status", "totalAmount", "urgency", "userId", "uspsTracking") SELECT "createdAt", "deliveryUrl", "id", "metadata", "paymentProvider", "requiresHardCopy", "requiresNotarization", "status", "totalAmount", "urgency", "userId", "uspsTracking" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
